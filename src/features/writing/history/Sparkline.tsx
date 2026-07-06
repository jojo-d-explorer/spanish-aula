interface SparklineProps {
  values: number[];
  labels: string[];
  color: string;
  height?: number;
  width?: number;
}

// Thin single-hue trend line for small, sparse weekly series. Falls back to
// a single dot when there's only one data point — a line needs two.
function Sparkline({ values, labels, color, height = 32, width = 120 }: SparklineProps) {
  if (values.length === 0) return null;

  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const padding = 4;

  const points = values.map((v, i) => {
    const x = values.length > 1 ? padding + (i / (values.length - 1)) * (width - padding * 2) : width / 2;
    const y = height - padding - ((v - min) / range) * (height - padding * 2);
    return { x, y, label: labels[i], value: v };
  });

  if (points.length === 1) {
    const { x, y, label, value } = points[0];
    return (
      <svg width={width} height={height} role="img" aria-label={`${label}: ${value}`}>
        <circle cx={x} cy={y} r={4} fill={color}>
          <title>{`${label}: ${value}`}</title>
        </circle>
      </svg>
    );
  }

  const path = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x},${p.y}`).join(' ');
  const last = points[points.length - 1];

  return (
    <svg width={width} height={height} role="img" aria-label={`Trend: ${labels[0]} to ${labels[labels.length - 1]}`}>
      <path d={path} fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={last.x} cy={last.y} r={3} fill={color}>
        <title>{`${last.label}: ${last.value}`}</title>
      </circle>
    </svg>
  );
}

export default Sparkline;
