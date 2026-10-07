import { useEffect, useRef, useState } from "react";
import { formatValue } from "../lib/format";
import type { ValueFormat } from "../lib/types";

export interface Point {
  label: string;
  value: number;
}

const H = 260;

/** Largura real do container: o viewBox acompanha, então o texto não escala. */
function useWidth(): [React.RefObject<HTMLDivElement>, number] {
  const ref = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(720);
  useEffect(() => {
    if (!ref.current) return;
    const ro = new ResizeObserver(([e]) => setW(Math.max(280, Math.round(e.contentRect.width))));
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);
  return [ref, w];
}
const PAD = { top: 16, right: 12, bottom: 30, left: 64 };

function ticks(max: number): number[] {
  if (max <= 0) return [0];
  const raw = max / 4;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? raw;
  const out: number[] = [];
  for (let v = 0; v <= max + step * 0.001; v += step) out.push(v);
  if (out[out.length - 1] < max) out.push(out[out.length - 1] + step);
  return out;
}

/** Série temporal: linha com área. */
export function LineChart(props: { points: Point[]; format: ValueFormat | null; label: string }) {
  const [ref, W] = useWidth();
  const { points, format } = props;
  const yTicks = ticks(Math.max(...points.map((p) => p.value), 0));
  const top = yTicks[yTicks.length - 1] || 1;
  const iw = W - PAD.left - PAD.right;
  const ih = H - PAD.top - PAD.bottom;
  const x = (i: number) => PAD.left + (points.length > 1 ? (i / (points.length - 1)) * iw : iw / 2);
  const y = (v: number) => PAD.top + ih - (v / top) * ih;
  const line = points.map((p, i) => `${x(i).toFixed(1)},${y(p.value).toFixed(1)}`).join(" ");
  const every = Math.ceil(points.length / Math.max(2, Math.floor(W / 90)));

  return (
    <div ref={ref}>
    <svg className="chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={props.label}>
      <defs>
        <linearGradient id="area" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="#2F5FA6" stopOpacity="0.18" />
          <stop offset="1" stopColor="#2F5FA6" stopOpacity="0" />
        </linearGradient>
      </defs>
      {yTicks.map((t) => (
        <g key={t}>
          <line x1={PAD.left} x2={W - PAD.right} y1={y(t)} y2={y(t)} stroke="#EDF1F5" />
          <text x={PAD.left - 8} y={y(t) + 4} textAnchor="end">{formatValue(t, format, true)}</text>
        </g>
      ))}
      {points.length > 1 && (
        <polygon points={`${x(0)},${y(0)} ${line} ${x(points.length - 1)},${y(0)}`} fill="url(#area)" />
      )}
      <polyline points={line} fill="none" stroke="#2F5FA6" strokeWidth={2.5} strokeLinejoin="round" />
      {points.map((p, i) => (
        <g key={i}>
          <circle cx={x(i)} cy={y(p.value)} r={points.length > 40 ? 0 : 3} fill="#2F5FA6">
            <title>{`${p.label}: ${formatValue(p.value, format)}`}</title>
          </circle>
          {i % every === 0 && (
            <text x={x(i)} y={H - 8} textAnchor="middle">{p.label}</text>
          )}
        </g>
      ))}
    </svg>
    </div>
  );
}

/** Barras verticais — a primeira (maior) em destaque. */
export function BarChart(props: { points: Point[]; format: ValueFormat | null; label: string }) {
  const { points, format } = props;
  // Muitos itens ou nomes longos: barras horizontais leem melhor.
  if (points.length > 7 || points.some((p) => p.label.length > 16)) {
    return (
      <HBars rows={points.map((p, i) => ({ label: p.label, value: p.value, valueText: formatValue(p.value, format), tone: undefined, strong: i === 0 }))} />
    );
  }
  return <VBars points={points} format={format} label={props.label} />;
}

function VBars(props: { points: Point[]; format: ValueFormat | null; label: string }) {
  const [ref, W] = useWidth();
  const { points, format } = props;
  const yTicks = ticks(Math.max(...points.map((p) => p.value), 0));
  const top = yTicks[yTicks.length - 1] || 1;
  const iw = W - PAD.left - PAD.right;
  const ih = H - PAD.top - PAD.bottom;
  const slot = iw / Math.max(points.length, 1);
  const bw = Math.min(56, slot * 0.62);
  const y = (v: number) => PAD.top + ih - (v / top) * ih;
  const short = (s: string) => (s.length > 16 ? `${s.slice(0, 15)}…` : s);

  return (
    <div ref={ref}>
    <svg className="chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={props.label}>
      {yTicks.map((t) => (
        <g key={t}>
          <line x1={PAD.left} x2={W - PAD.right} y1={y(t)} y2={y(t)} stroke="#EDF1F5" />
          <text x={PAD.left - 8} y={y(t) + 4} textAnchor="end">{formatValue(t, format, true)}</text>
        </g>
      ))}
      {points.map((p, i) => {
        const cx = PAD.left + slot * i + slot / 2;
        return (
          <g key={i}>
            <rect x={cx - bw / 2} y={y(Math.max(p.value, 0))} width={bw} height={Math.max(ih - (y(Math.max(p.value, 0)) - PAD.top), 1)}
              rx={5} fill={i === 0 ? "#2F5FA6" : "#B9CFEC"}>
              <title>{`${p.label}: ${formatValue(p.value, format)}`}</title>
            </rect>
            <text x={cx} y={H - 8} textAnchor="middle">{short(p.label)}</text>
          </g>
        );
      })}
    </svg>
    </div>
  );
}

/** Barras horizontais em lista (ranking). */
export function HBars(props: {
  rows: Array<{ label: string; value: number; valueText: string; sub?: string; tone?: "warn" | "bad"; strong?: boolean }>;
}) {
  const max = Math.max(...props.rows.map((r) => r.value), 1);
  return (
    <div className="hbar">
      {props.rows.map((r, i) => (
        <div key={i} className="hbar-row">
          <span className="hbar-label" title={r.label}>{r.label}</span>
          <span className="hbar-value">{r.valueText}</span>
          <span className="hbar-track">
            <span className="hbar-fill" style={{
              display: "block",
              width: `${Math.max((r.value / max) * 100, r.value > 0 ? 2 : 0)}%`,
              background: r.tone === "bad" ? "var(--bad)" : r.tone === "warn" ? "var(--warn)" : r.strong === false ? "var(--primary-line)" : undefined,
            }} />
          </span>
          {r.sub && <span className="hbar-sub">{r.sub}</span>}
        </div>
      ))}
    </div>
  );
}
