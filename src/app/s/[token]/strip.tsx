// The strip plot from the prototype: every peer is a dot, the respondent is the marked one,
// and the middle half of peers is shaded so "about the same" has a visible meaning.
// Drawn server-side as plain SVG so it costs no JavaScript and prints.

const W = 560;
const H = 112;
const Y = 62;
const PAD = 16;

function quantile(sorted: number[], p: number): number {
  const i = (sorted.length - 1) * p;
  const lo = Math.floor(i), hi = Math.ceil(i);
  return sorted[lo]! + (sorted[hi]! - sorted[lo]!) * (i - lo);
}

export function StripPlot({
  value,
  peers,
  unitLabel,
  caption,
}: {
  value: number;
  peers: number[];
  unitLabel: string;
  caption: string;
}) {
  const all = [...peers, value];
  const max = Math.max(...all) * 1.1 || 1;
  const x = (v: number) => PAD + (Math.min(v, max) / max) * (W - PAD * 2);
  const sorted = [...peers].sort((a, b) => a - b);
  const band = sorted.length >= 4 ? { lo: quantile(sorted, 0.25), hi: quantile(sorted, 0.75), mid: quantile(sorted, 0.5) } : null;

  return (
    <figure style={{ margin: "18px 0 0" }}>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        width="100%"
        role="img"
        aria-label={caption}
        style={{ display: "block", height: "auto" }}
      >
        {band ? (
          <rect x={x(band.lo)} y={Y - 14} width={Math.max(2, x(band.hi) - x(band.lo))} height={28} rx={4} fill="var(--tint)" />
        ) : null}
        <line x1={PAD} y1={Y} x2={W - PAD} y2={Y} stroke="var(--line)" strokeWidth={1} />
        {band ? <line x1={x(band.mid)} y1={Y - 14} x2={x(band.mid)} y2={Y + 14} stroke="var(--peer)" strokeWidth={1.5} /> : null}
        {peers.map((p, i) => (
          <circle key={`${p}-${i}`} cx={x(p)} cy={Y} r={5.5} fill="var(--peer)" opacity={0.7} />
        ))}
        <circle cx={x(value)} cy={Y} r={9} fill="var(--mark)" stroke="var(--surface)" strokeWidth={2} />
        <text x={x(value)} y={Y - 22} fontSize={14} fontWeight={600} textAnchor={x(value) > W - 60 ? "end" : x(value) < 60 ? "start" : "middle"} fill="var(--ink)">
          You
        </text>
        <text x={PAD} y={H - 10} fontSize={12} fill="var(--muted)">
          0
        </text>
        {band && x(band.mid) > 70 && x(band.mid) < W - 110 ? (
          <text x={x(band.mid)} y={H - 10} fontSize={12} textAnchor="middle" fill="var(--muted)">
            typical
          </text>
        ) : null}
        <text x={W - PAD} y={H - 10} fontSize={12} textAnchor="end" fill="var(--muted)">
          {Math.round(max).toLocaleString("en-US")} {unitLabel}
        </text>
      </svg>
      <figcaption className="hint" style={{ marginTop: 6 }}>
        {caption}
      </figcaption>
    </figure>
  );
}
