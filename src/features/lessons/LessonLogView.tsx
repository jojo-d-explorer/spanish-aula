import { useEffect, useState } from 'react';
import type { LessonLogEntry } from '../../shared/lessons/types';

interface LessonLogViewProps {
  onOpenThread: (lessonId: string) => void;
}

function categoryKey(lesson: LessonLogEntry): string {
  return lesson.topicCategory ?? lesson.topicFreeform ?? 'other';
}

function LessonLogView({ onOpenThread }: LessonLogViewProps) {
  const [lessons, setLessons] = useState<LessonLogEntry[]>([]);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');

  useEffect(() => {
    fetch('/api/lessons')
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? 'Failed to load lessons');
        setLessons(data.lessons as LessonLogEntry[]);
        setStatus('ready');
      })
      .catch((err) => {
        console.error(err);
        setStatus('error');
      });
  }, []);

  if (status === 'loading') return <p>Loading past lessons…</p>;
  if (status === 'error') return <p role="alert">Could not load past lessons.</p>;
  if (lessons.length === 0) return <p>No lessons yet — ask for one above.</p>;

  const tally = lessons.reduce<Record<string, number>>((acc, lesson) => {
    const key = categoryKey(lesson);
    acc[key] = (acc[key] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <div className="lesson-log">
      <div className="lesson-log__tally">
        <h4>By topic</h4>
        <ul>
          {Object.entries(tally).map(([key, count]) => (
            <li key={key}>
              {key}: {count}
            </li>
          ))}
        </ul>
      </div>

      <ul className="lesson-log__list">
        {lessons.map((lesson) => (
          <li key={lesson.id}>
            <button className="lesson-log__row" onClick={() => onOpenThread(lesson.id)}>
              <span>{categoryKey(lesson)}</span>
              <span className="lesson-log__row-meta">
                {lesson.deleLevelAtCreation} · {new Date(lesson.createdAt).toLocaleDateString()}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default LessonLogView;
