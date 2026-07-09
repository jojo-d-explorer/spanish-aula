import { useCallback, useState } from 'react';
import WritingTab from './features/writing/WritingTab';
import LessonsTab from './features/lessons/LessonsTab';
import WorkbookTab from './features/workbook/WorkbookTab';
import WordBankCapture from './features/word-bank/WordBankCapture';
import type { ErrorCategory } from './shared/grading/types';
import './App.css';

function App() {
  const [activeTab, setActiveTab] = useState<'writing' | 'lessons' | 'workbook'>('writing');
  // The single deliberate exception to "sub-view state stays local" — scoped
  // only to the cross-tab deep-link target, never any of Workbook's own view
  // state (Writing/Lessons/Workbook each still own their internal sub-views).
  const [workbookSeed, setWorkbookSeed] = useState<{ category: ErrorCategory } | null>(null);

  function handlePracticeCategory(category: ErrorCategory) {
    setWorkbookSeed({ category });
    setActiveTab('workbook');
  }

  const clearWorkbookSeed = useCallback(() => setWorkbookSeed(null), []);

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
        <button
          className={`tab ${activeTab === 'workbook' ? 'tab--active' : ''}`}
          type="button"
          aria-current={activeTab === 'workbook' ? 'page' : undefined}
          onClick={() => setActiveTab('workbook')}
        >
          Workbook
        </button>
      </nav>
      <main>
        {activeTab === 'writing' && <WritingTab onPracticeCategory={handlePracticeCategory} />}
        {activeTab === 'lessons' && <LessonsTab onPracticeCategory={handlePracticeCategory} />}
        {activeTab === 'workbook' && <WorkbookTab seed={workbookSeed} onSeedConsumed={clearWorkbookSeed} />}
      </main>
      <WordBankCapture sourceTab={activeTab} />
    </div>
  );
}

export default App;
