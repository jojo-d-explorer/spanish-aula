import { useState } from 'react';
import WritingTab from './features/writing/WritingTab';
import LessonsTab from './features/lessons/LessonsTab';
import WordBankCapture from './features/word-bank/WordBankCapture';
import './App.css';

function App() {
  const [activeTab, setActiveTab] = useState<'writing' | 'lessons'>('writing');

  return (
    <div className="app">
      <header>
        <h1>Aula</h1>
      </header>
      <nav className="tabs">
        <button
          className={`tab ${activeTab === 'writing' ? 'tab--active' : ''}`}
          type="button"
          aria-current={activeTab === 'writing' ? 'page' : undefined}
          onClick={() => setActiveTab('writing')}
        >
          Writing
        </button>
        <button
          className={`tab ${activeTab === 'lessons' ? 'tab--active' : ''}`}
          type="button"
          aria-current={activeTab === 'lessons' ? 'page' : undefined}
          onClick={() => setActiveTab('lessons')}
        >
          Lessons
        </button>
      </nav>
      <main>{activeTab === 'writing' ? <WritingTab /> : <LessonsTab />}</main>
      <WordBankCapture sourceTab={activeTab} />
    </div>
  );
}

export default App;
