import { useEffect, useState } from 'react';
import Sparkline from './Sparkline';
import type { HistoryTrends, CategoryTrend, SophisticationWeeklyPoint } from '../../../shared/history/trends';
import { SUBSCORE_KEYS, type SubscoreKey } from '../../../shared/grading/types';
import './HistoryView.css';

// Every key in SUBSCORE_KEYS must have a label here — TS enforces this Record
// covers all of them, so adding a subscore without a label fails to compile.
const SUBSCORE_LABELS: Record<SubscoreKey, string> = {
  syntactic_complexity: 'Syntax',
  verbal_range: 'Verbal range',
  lexical_sophistication: 'Lexicon',
  cohesion: 'Cohesion',
  ambition: 'Ambition',
};

function CategoryCard({ trend }: { trend: CategoryTrend }) {
  if (trend.weeks.length === 0) return null;

  const accuracyValues = trend.weeks.map((w) => Math.round((w.accuracy ?? 0) * 100));
  const exposureValues = trend.weeks.map((w) => w.exposure);
  const labels = trend.weeks.map((w) => w.weekStart);
  const latest = trend.weeks[trend.weeks.length - 1];

  return (
    <div className="history-card">
      <div className="history-card__header">
        <h4>{trend.category}</h4>
        {trend.avoidanceFlag && (
          <span className="history-badge history-badge--warning">
            ⚠ possible avoidance
          </span>
        )}
      </div>
      <div className="history-card__stats">
        <div className="history-stat">
          <div className="history-stat__value">{Math.round((latest.accuracy ?? 0) * 100)}%</div>
          <div className="history-stat__label">Accuracy</div>
          <Sparkline values={accuracyValues} labels={labels} color="var(--series-1)" />
        </div>
        <div className="history-stat">
          <div className="history-stat__value">{latest.exposure}</div>
          <div className="history-stat__label">Exposure (this week)</div>
          <Sparkline values={exposureValues} labels={labels} color="var(--series-1)" />
        </div>
      </div>
    </div>
  );
}

function SophisticationSection({ data }: { data: SophisticationWeeklyPoint[] }) {
  if (data.length === 0) return null;

  const labels = data.map((d) => d.weekStart);
  const overallValues = data.map((d) => Math.round(d.overall * 10) / 10);
  const latest = data[data.length - 1];

  return (
    <div className="history-card">
      <div className="history-card__header">
        <h4>Sophistication</h4>
      </div>
      <div className="history-stat">
        <div className="history-stat__value">{latest.overall.toFixed(1)}/10</div>
        <div className="history-stat__label">Overall</div>
        <Sparkline values={overallValues} labels={labels} color="var(--series-1)" />
      </div>
      <div className="history-subscores">
        {SUBSCORE_KEYS.map((key) => {
          const values = data.map((d) => Math.round(d.subscores[key] * 10) / 10);
          return (
            <div className="history-substat" key={key}>
              <div className="history-substat__label">{SUBSCORE_LABELS[key]}</div>
              <Sparkline values={values} labels={labels} color="var(--series-1)" height={24} width={80} />
            </div>
          );
        })}
      </div>
    </div>
  );
}

function HistoryView() {
  const [trends, setTrends] = useState<HistoryTrends | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');

  useEffect(() => {
    fetch('/api/history')
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? 'Failed to load history');
        setTrends(data as HistoryTrends);
        setStatus('ready');
      })
      .catch((err) => {
        console.error(err);
        setStatus('error');
      });
  }, []);

  if (status === 'loading') return <p>Loading history…</p>;
  if (status === 'error' || !trends) return <p role="alert">Could not load history.</p>;

  return (
    <div className="history-view">
      {trends.categories.length === 0 && trends.sophistication.length === 0 && (
        <p>Not enough entries yet to show trends — keep writing!</p>
      )}
      {trends.categories.map((trend) => (
        <CategoryCard key={trend.category} trend={trend} />
      ))}
      <SophisticationSection data={trends.sophistication} />
    </div>
  );
}

export default HistoryView;
