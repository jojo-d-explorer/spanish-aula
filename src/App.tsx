import WritingTab from './features/writing/WritingTab';
import './App.css';

function App() {
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
        <WritingTab />
      </main>
    </div>
  );
}

export default App;
