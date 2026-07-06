import { useState } from 'react';

const TEST_MESSAGE =
  'Hola. Please reply with one short, friendly sentence in Spanish about learning Spanish.';

function WritingTab() {
  const [reply, setReply] = useState<string | null>(null);
  const [status, setStatus] = useState<'idle' | 'loading' | 'error'>('idle');

  async function ping() {
    setStatus('loading');
    setReply(null);
    try {
      const res = await fetch('/api/hello', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: TEST_MESSAGE }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Request failed');
      setReply(data.reply);
      setStatus('idle');
    } catch (err) {
      console.error(err);
      setStatus('error');
    }
  }

  return (
    <section>
      <h2>Writing</h2>
      <p>Real writing practice arrives in Phase 1. For now, this proves the wiring works.</p>
      <button onClick={ping} disabled={status === 'loading'}>
        {status === 'loading' ? 'Asking Claude…' : 'Ping Claude (test)'}
      </button>
      {reply && (
        <p>
          <strong>Claude says:</strong> {reply}
        </p>
      )}
      {status === 'error' && <p role="alert">Something went wrong — check the console/logs.</p>}
    </section>
  );
}

export default WritingTab;
