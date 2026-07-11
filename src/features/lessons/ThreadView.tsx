import { useEffect, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import type { LessonLogEntry, LessonMessage } from '../../shared/lessons/types';
import type { ErrorCategory } from '../../shared/grading/types';
import { autoGrowTextarea } from '../../shared/ui/autoGrow';

interface ThreadViewProps {
  lessonId: string;
  onPracticeCategory: (category: ErrorCategory) => void;
}

function topicLabel(lesson: Pick<LessonLogEntry, 'topicCategory' | 'topicFreeform'>) {
  return lesson.topicCategory ?? lesson.topicFreeform ?? 'Lesson';
}

function ThreadView({ lessonId, onPracticeCategory }: ThreadViewProps) {
  const [lesson, setLesson] = useState<LessonLogEntry | null>(null);
  const [messages, setMessages] = useState<LessonMessage[]>([]);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [replyText, setReplyText] = useState('');
  const [replyStatus, setReplyStatus] = useState<'idle' | 'sending' | 'error'>('idle');
  const [replyError, setReplyError] = useState('');

  useEffect(() => {
    setStatus('loading');
    fetch(`/api/lesson-thread?id=${encodeURIComponent(lessonId)}`)
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? 'Failed to load lesson');
        setLesson(data.lesson as LessonLogEntry);
        setMessages(data.messages as LessonMessage[]);
        setStatus('ready');
      })
      .catch((err) => {
        console.error(err);
        setStatus('error');
      });
  }, [lessonId]);

  async function handleReply() {
    if (!replyText.trim()) return;
    setReplyStatus('sending');
    setReplyError('');
    try {
      const res = await fetch(`/api/lesson-thread?id=${encodeURIComponent(lessonId)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: replyText.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Failed to send reply');
      setMessages((prev) => [
        ...prev,
        data.userMessage as LessonMessage,
        ...(data.assistantMessage ? [data.assistantMessage as LessonMessage] : []),
      ]);
      if (data.persistError) setReplyError(data.persistError);
      setReplyText('');
      setReplyStatus('idle');
    } catch (err) {
      console.error(err);
      setReplyError(err instanceof Error ? err.message : 'Something went wrong.');
      setReplyStatus('error');
    }
  }

  if (status === 'loading') return <p>Loading lesson…</p>;
  if (status === 'error' || !lesson) return <p role="alert">Could not load this lesson.</p>;

  return (
    <div className="lesson-thread">
      <div className="lesson-thread__header">
        <h3>{topicLabel(lesson)}</h3>
        <span className="lesson-thread__meta">
          {lesson.deleLevelAtCreation} · {new Date(lesson.createdAt).toLocaleDateString()}
        </span>
      </div>

      <div className="lesson-thread__messages">
        {messages.map((message) => (
          <div key={message.id} className={`lesson-msg lesson-msg--${message.role}`}>
            <ReactMarkdown>{message.content}</ReactMarkdown>
          </div>
        ))}
      </div>

      <textarea
        value={replyText}
        onChange={(e) => setReplyText(e.target.value)}
        onInput={(e) => autoGrowTextarea(e.currentTarget)}
        rows={2}
        style={{ width: '100%', overflow: 'hidden', resize: 'none' }}
        placeholder="Responde o haz otra pregunta…"
      />
      <button onClick={handleReply} disabled={replyStatus === 'sending' || !replyText.trim()}>
        {replyStatus === 'sending' ? 'Sending…' : 'Send'}
      </button>
      {replyStatus === 'error' && <p role="alert">{replyError}</p>}

      {lesson.topicCategory ? (
        <button onClick={() => onPracticeCategory(lesson.topicCategory!)}>
          Want to practice this further? Open a Workbook session →
        </button>
      ) : (
        <p className="lesson-workbook-stub">This lesson's topic isn't tied to a drillable category yet.</p>
      )}
    </div>
  );
}

export default ThreadView;
