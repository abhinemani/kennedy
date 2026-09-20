// The strip plot from the prototype: every peer is a dot, the respondent is the marked one.
// Drawn server-side as plain SVG so it costs no JavaScript and prints.

const W = 560;
const H = 84;
const PAD = 16;

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

  return (
    <figure style={{ margin: "14px 0 0" }}>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        width="100%"
        role="img"
        aria-label={caption}
        style={{ display: "block", height: "auto" }}
      >
        <line x1={PAD} y1={44} x2={W - PAD} y2={44} stroke="var(--line)" strokeWidth={1} />
        {peers.map((p, i) => (
          <circle key={`${p}-${i}`} cx={x(p)} cy={44} r={5} fill="var(--peer)" opacity={0.75} />
        ))}
        <circle cx={x(value)} cy={44} r={8} fill="var(--mark)" />
        <text x={x(value)} y={26} fontSize={13} fontWeight={600} textAnchor="middle" fill="var(--ink)">
          You
        </text>
        <text x={PAD} y={70} fontSize={11} fill="var(--muted)">
          0
        </text>
        <text x={W - PAD} y={70} fontSize={11} textAnchor="end" fill="var(--muted)">
          {Math.round(max).toLocaleString("en-US")} {unitLabel}
        </text>
      </svg>
      <figcaption className="hint" style={{ marginTop: 6 }}>
        {caption}
      </figcaption>
    </figure>
  );
}
