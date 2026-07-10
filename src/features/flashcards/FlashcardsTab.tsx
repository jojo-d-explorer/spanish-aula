import { useEffect, useState } from 'react';
import type { SettingsResponse } from '../../shared/settings/types';
import FlashcardGenerate from './FlashcardGenerate';
import FlashcardBrowse from './FlashcardBrowse';
import './Flashcards.css';

function FlashcardsTab() {
  const [settings, setSettings] = useState<SettingsResponse | null>(null);
  const [settingsError, setSettingsError] = useState('');
  const [view, setView] = useState<'generate' | 'browse'>('generate');

  useEffect(() => {
    fetch('/api/settings')
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? 'Failed to load settings');
        setSettings(data as SettingsResponse);
      })
      .catch((err) => {
        console.error('Failed to load settings', err);
        setSettingsError('Could not load your level settings — try reloading the page.');
      });
  }, []);

  function handleGenerated() {
    setView('browse');
  }

  return (
    <section className="flashcards-tab">
      <h2>Flashcards</h2>
      <div style={{ marginBottom: 16 }}>
        <button onClick={() => setView('generate')} disabled={view === 'generate'}>
          Generate
        </button>{' '}
        <button onClick={() => setView('browse')} disabled={view === 'browse'}>
          Browse &amp; export
        </button>
      </div>

      {settingsError && <p role="alert">{settingsError}</p>}

      {view === 'generate' && settings && (
        <FlashcardGenerate dialect={settings.dialect} deleLevel={settings.deleLevel} onGenerated={handleGenerated} />
      )}
      {view === 'browse' && <FlashcardBrowse />}
    </section>
  );
}

export default FlashcardsTab;
