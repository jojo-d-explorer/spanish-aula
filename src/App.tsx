import { useState } from 'react';
import WritingTab from './features/writing/WritingTab';
import WordBankCapture from './features/word-bank/WordBankCapture';
import './App.css';

function App() {
  const [view, setView] = useState<'write' | 'history'>('write');

  return (
    <div className="app">
      <header>
        <h1>Aula</h1>
      </header>
      <nav className="tabs">
        <button className="tab tab--active" type="button" aria-current="page">
          Writing
        </button>
      </nav>
      <main>
        <WritingTab view={view} onViewChange={setView} />
      </main>
      <WordBankCapture sourceTab={view} />
    </div>
  );
}

export default App;
