"""
Phase 4 read-path Anki ingest (PRD §10.5, CLAUDE.md "Anki ingest is READ-PATH
ONLY this phase"). Plain Python, no LLM. Parses an uploaded .colpkg export,
extracts weak items by FSRS stability/lapses/retrievability. Vercel routes
this file as a Python serverless function by its .py extension, alongside the
Node/TS functions elsewhere in /api.

Card generation, TSV/.apkg export, and master-list dedup are explicitly
Phase 5 (Flashcards) — not built here.
"""

import base64
import io
import json
import math
import sqlite3
import tempfile
import time
import zipfile
from http.server import BaseHTTPRequestHandler
from pathlib import Path

import zstandard

# Headroom under Vercel's ~4.5MB request body limit. Base64 inflates the raw
# file ~33%, so this caps the actual .colpkg at roughly 3.3MB -- comfortably
# above what a media-free export needs (typically well under 1MB for a few
# thousand cards). The upload UI should tell the learner to export without
# media from Anki.
MAX_BODY_BYTES = 4_400_000

# FSRS-6 default decay when a card's own cards.data lacks one (older,
# un-optimized cards). See research note in the Phase 4 plan.
DEFAULT_DECAY = -0.1542

# Proposed, tunable thresholds -- not pinned by the PRD.
WEAK_LAPSES_THRESHOLD = 4
WEAK_RETRIEVABILITY_THRESHOLD = 0.85


def compute_retrievability(stability, decay, days_elapsed):
    """FSRS power-law retrievability formula (not the naive 0.9^(t/S) approximation)."""
    if stability is None or stability <= 0:
        return None
    d = decay if decay else DEFAULT_DECAY
    factor = 0.9 ** (1 / d) - 1
    return (1 + factor * days_elapsed / stability) ** d


def get_deck_names(conn):
    try:
        rows = conn.execute("select id, name from decks").fetchall()
        return {row[0]: row[1] for row in rows}
    except sqlite3.OperationalError:
        # Legacy schema (v11) has no `decks` table -- decks live as a JSON
        # blob keyed by id in col.decks.
        row = conn.execute("select decks from col limit 1").fetchone()
        if not row or not row[0]:
            return {}
        decks_json = json.loads(row[0])
        return {int(did): info.get("name", "Unknown deck") for did, info in decks_json.items()}


def parse_colpkg(raw: bytes) -> list[dict]:
    with zipfile.ZipFile(io.BytesIO(raw)) as zf:
        names = set(zf.namelist())

        # Modern exports always ALSO contain a decoy near-empty
        # collection.anki2 for old-client compatibility -- check .anki21b
        # first, never grep loosely for "collection.anki2".
        if "collection.anki21b" in names:
            compressed = zf.read("collection.anki21b")
            decompressor = zstandard.ZstdDecompressor()
            with decompressor.stream_reader(io.BytesIO(compressed)) as reader:
                data = reader.read()
        elif "collection.anki21" in names:
            data = zf.read("collection.anki21")
        elif "collection.anki2" in names:
            data = zf.read("collection.anki2")
        else:
            raise ValueError("No recognizable Anki collection file found in this .colpkg.")

    with tempfile.TemporaryDirectory() as tmp:
        db_path = Path(tmp) / "collection.sqlite"
        db_path.write_bytes(data)
        conn = sqlite3.connect(f"file:{db_path}?mode=ro", uri=True)
        try:
            deck_names = get_deck_names(conn)
            rows = conn.execute(
                "select c.did, c.lapses, c.data, n.sfld "
                "from cards c join notes n on c.nid = n.id"
            ).fetchall()
        finally:
            conn.close()

    now = time.time()
    items = []
    for did, lapses, data_json, sfld in rows:
        try:
            card_data = json.loads(data_json) if data_json else {}
        except (json.JSONDecodeError, TypeError):
            card_data = {}

        stability = card_data.get("s")
        decay = card_data.get("decay")
        last_review_epoch = card_data.get("lrt")

        retrievability = None
        if stability is not None and last_review_epoch is not None:
            days_elapsed = (now - last_review_epoch) / 86400
            retrievability = compute_retrievability(stability, decay, days_elapsed)
            if retrievability is not None and math.isnan(retrievability):
                retrievability = None

        weak = lapses >= WEAK_LAPSES_THRESHOLD or (
            retrievability is not None and retrievability < WEAK_RETRIEVABILITY_THRESHOLD
        )

        items.append(
            {
                "noteText": sfld,
                "deckName": deck_names.get(did, "Unknown deck"),
                "lapses": lapses,
                "stability": stability,
                "retrievability": retrievability,
                "weak": weak,
            }
        )

    items.sort(key=lambda item: item["weak"], reverse=True)
    return items


class handler(BaseHTTPRequestHandler):
    def do_POST(self):
        content_length = int(self.headers.get("Content-Length", 0))

        if content_length > MAX_BODY_BYTES:
            self._send_json(
                413,
                {
                    "error": (
                        "That export is too large. In Anki, re-export this deck "
                        "without media (uncheck 'Include media') and try again."
                    )
                },
            )
            return

        try:
            raw_body = self.rfile.read(content_length)
            payload = json.loads(raw_body)
            data_b64 = payload.get("dataBase64", "")
            if "," in data_b64[:60]:
                # Strip a data: URL prefix if the client sent one.
                data_b64 = data_b64.split(",", 1)[1]
            raw = base64.b64decode(data_b64)
        except Exception as err:  # noqa: BLE001 -- surfaced as a 400, not a crash
            self._send_json(400, {"error": f"Could not read the uploaded file: {err}"})
            return

        try:
            items = parse_colpkg(raw)
        except Exception as err:  # noqa: BLE001 -- surfaced as a 500, not a crash
            self._send_json(500, {"error": f"Failed to parse .colpkg: {err}"})
            return

        self._send_json(200, {"items": items})

    def _send_json(self, status: int, body: dict):
        payload = json.dumps(body).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)
