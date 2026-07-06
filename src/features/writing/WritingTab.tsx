import { useState } from 'react';
import { generateWritingPrompt, type WritingPrompt } from '../../shared/prompts/writingPrompt';

// Hardcoded until a settings/profile UI exists to change them.
const DIALECT = 'mx';
const DELE_LEVEL = 'A2';

function WritingTab() {
  const [prompt, setPrompt] = useState<WritingPrompt | null>(null);

  return (
    <section>
      <h2>Writing</h2>
      <button onClick={() => setPrompt(generateWritingPrompt(DIALECT, DELE_LEVEL))}>
        Generate prompt
      </button>
      {prompt && (
        <p>
          <strong>Prompt:</strong> {prompt.text}
        </p>
      )}
      {!prompt && <p>Tap the button for a DELE-calibrated writing prompt.</p>}
    </section>
  );
}

export default WritingTab;
