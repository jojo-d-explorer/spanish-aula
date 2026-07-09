import { useEffect, useState } from 'react';
import App from './App';

// TEMPORARY access-code gate — NOT Phase 6 auth (PRD §11, parked). Wraps the
// whole app; only renders <App /> once /api/auth-check confirms a valid
// session cookie. See src/shared/auth/accessGate.ts for the server-side
// half and why this exists.
function AccessGate() {
  const [status, setStatus] = useState<'checking' | 'authorized' | 'unauthorized'>('checking');
  const [code, setCode] = useState('');
  const [submitStatus, setSubmitStatus] = useState<'idle' | 'submitting' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    fetch('/api/auth-check')
      .then((res) => setStatus(res.ok ? 'authorized' : 'unauthorized'))
      .catch(() => setStatus('unauthorized'));
  }, []);

  async function handleSubmit() {
    if (!code.trim()) return;
    setSubmitStatus('submitting');
    setErrorMessage('');
    try {
      const res = await fetch('/api/auth-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: code.trim() }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? 'Incorrect access code.');
      }
      setStatus('authorized');
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Something went wrong.');
      setSubmitStatus('error');
    }
  }

  if (status === 'checking') return null;
  if (status === 'authorized') return <App />;

  return (
    <div className="app">
      <header>
        <h1>Aula</h1>
      </header>
      <p>Enter access code</p>
      <input
        type="password"
        value={code}
        onChange={(e) => setCode(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
        autoFocus
      />{' '}
      <button onClick={handleSubmit} disabled={submitStatus === 'submitting' || !code.trim()}>
        {submitStatus === 'submitting' ? 'Checking…' : 'Submit'}
      </button>
      {submitStatus === 'error' && <p role="alert">{errorMessage}</p>}
    </div>
  );
}

export default AccessGate;
