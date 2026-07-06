# spanish-aula
A multi-prong tool for self-spanish study covering graded journaling, generated worksheets, and advanced flashcard development

## Environment variables

| Variable            | Where it's used                                    | Required |
|----------------------|----------------------------------------------------|----------|
| `ANTHROPIC_API_KEY`  | `/api` serverless functions only, never the browser | Yes      |

Local dev: copy your key into `.env.local` (gitignored, never committed):
```
ANTHROPIC_API_KEY=sk-ant-...
```
Production: set the same variable in the Vercel dashboard under
Project → Settings → Environment Variables.

## Commands

- `npm run dev` — local dev (frontend + `/api` functions together, via `vercel dev`)
- `npm run build` — production build
- `npm run deploy` — deploy to production (`vercel deploy --prod`)

## Weekly learning log

### Week of 2026-07-06
- Scaffolded the Vite + React + TS app and a Vercel serverless proxy to the
  Anthropic API; verified one live round trip end to end (browser → Vercel
  function → Claude → back), deployed and confirmed on phone.
