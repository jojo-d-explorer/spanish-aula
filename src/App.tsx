import { useCallback, useState } from 'react';
import WritingTab from './features/writing/WritingTab';
import LessonsTab from './features/lessons/LessonsTab';
import WorkbookTab from './features/workbook/WorkbookTab';
import FlashcardsTab from './features/flashcards/FlashcardsTab';
import WordBankCapture from './features/word-bank/WordBankCapture';
import type { ErrorCategory } from './shared/grading/types';
import './App.css';

function App() {
  const [activeTab, setActiveTab] = useState<'writing' | 'lessons' | 'workbook' | 'flashcards'>('writing');
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
        <button
          className={`tab ${activeTab === 'flashcards' ? 'tab--active' : ''}`}
          type="button"
          aria-current={activeTab === 'flashcards' ? 'page' : undefined}
          onClick={() => setActiveTab('flashcards')}
        >
          Flashcards
        </button>
      </nav>
      <main>
        {/* All four tabs stay mounted at all times — display:none on the
            inactive ones, not conditional mounting — so switching tabs
            never wipes in-progress state (a half-answered Workbook
            session, a half-typed Lessons request, an in-progress Writing
            entry). Tradeoff: every tab's mount-time fetch fires together
            on first load instead of lazily per-visit; a non-issue at this
            app's scale. WordBankCapture (below) already followed this
            always-mounted pattern. */}
        <div style={{ display: activeTab === 'writing' ? 'block' : 'none' }}>
          <WritingTab onPracticeCategory={handlePracticeCategory} />
        </div>
        <div style={{ display: activeTab === 'lessons' ? 'block' : 'none' }}>
          <LessonsTab onPracticeCategory={handlePracticeCategory} />
        </div>
        <div style={{ display: activeTab === 'workbook' ? 'block' : 'none' }}>
          <WorkbookTab seed={workbookSeed} onSeedConsumed={clearWorkbookSeed} />
        </div>
        <div style={{ display: activeTab === 'flashcards' ? 'block' : 'none' }}>
          <FlashcardsTab />
        </div>
      </main>
      <WordBankCapture sourceTab={activeTab} />
    </div>
  );
}

export default App;
