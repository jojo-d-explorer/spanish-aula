import { useEffect, useState } from 'react';
import Sparkline from './Sparkline';
import type { HistoryTrends, CategoryTrend, SophisticationWeeklyPoint } from '../../../shared/history/trends';
import type { UptakeCategoryTrend } from '../../../shared/history/uptakeTrends';
import { SUBSCORE_KEYS } from '../../../shared/grading/types';
import { SUBSCORE_LABELS, formatCategoryLabel } from '../../../shared/grading/categoryLabels';
import './HistoryView.css';

interface HistoryResponse extends HistoryTrends {
  uptake: UptakeCategoryTrend[];
}

function CategoryCard({ trend }: { trend: CategoryTrend }) {
  if (trend.weeks.length === 0) return null;

  const accuracyValues = trend.weeks.map((w) => Math.round((w.accuracy ?? 0) * 100));
  const exposureValues = trend.weeks.map((w) => w.exposure);
  const labels = trend.weeks.map((w) => w.weekStart);

  return (
    <div className="history-card">
      <div className="history-card__header">
        <h4>{trend.category}</h4>
        {trend.escalationFlag && (
          <span className="history-badge history-badge--critical">🚩 needs a micro-lesson</span>
        )}
        {trend.avoidanceFlag && (
          <span className="history-badge history-badge--warning">⚠ possible avoidance</span>
        )}
      </div>
      <div className="history-card__stats">
        <div className="history-stat">
          <div className="history-stat__value">{Math.round((trend.current.accuracy ?? 0) * 100)}%</div>
          <div className="history-stat__label">Accuracy (last 14 days)</div>
          <Sparkline values={accuracyValues} labels={labels} color="var(--series-1)" />
        </div>
        <div className="history-stat">
          <div className="history-stat__value">{trend.current.exposure}</div>
          <div className="history-stat__label">Exposure (last 14 days)</div>
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

// PRD §9.8 — its own family of series, kept visually separate from
// accuracy/exposure above (never blended into those cards or their flags).
function UptakeSection({ data }: { data: UptakeCategoryTrend[] }) {
  if (data.length === 0) return null;

  return (
    <div>
      <h3 className="history-section-title">Uptake on revisions</h3>
      {data.map((trend) => (
        <div className="history-card" key={trend.category}>
          <div className="history-card__header">
            <h4>{formatCategoryLabel(trend.category)}</h4>
            {trend.avoidanceRate >= 0.34 && (
              <span className="history-badge history-badge--warning">⚠ high avoidance</span>
            )}
          </div>
          <div className="history-card__stats">
            <div className="history-stat">
              <div className="history-stat__value">{Math.round(trend.uptakeRate * 100)}%</div>
              <div className="history-stat__label">Uptake rate ({trend.fixed}/{trend.denominator} fixed)</div>
            </div>
            <div className="history-stat">
              <div className="history-stat__value">{Math.round(trend.avoidanceRate * 100)}%</div>
              <div className="history-stat__label">Avoidance-on-revision ({trend.avoided}/{trend.denominator})</div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function HistoryView() {
  const [trends, setTrends] = useState<HistoryResponse | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');

  useEffect(() => {
    fetch('/api/history')
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? 'Failed to load history');
        setTrends(data as HistoryResponse);
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
      <UptakeSection data={trends.uptake} />
    </div>
  );
}

export default HistoryView;
