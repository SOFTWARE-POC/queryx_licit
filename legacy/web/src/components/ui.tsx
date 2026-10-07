import { useEffect, useRef, useState, type ReactNode } from "react";
import { IconChevron } from "./icons";

/** Menu suspenso: fecha com Esc e clique fora; foco volta ao botão. */
export function Dropdown(props: {
  label: ReactNode;
  icon?: ReactNode;
  active?: boolean;
  disabled?: boolean;
  title?: string;
  children: (close: () => void) => ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const btn = useRef<HTMLButtonElement>(null);
  const close = () => {
    setOpen(false);
    btn.current?.focus();
  };

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className="menu-wrap" ref={ref}>
      <button ref={btn} type="button" className={`chip${props.active ? " active" : ""}`} aria-expanded={open}
        aria-haspopup="menu" disabled={props.disabled} title={props.title} onClick={() => setOpen((o) => !o)}>
        {props.icon}
        {props.label}
        <IconChevron size={14} />
      </button>
      {open && <div className="menu" role="menu">{props.children(close)}</div>}
    </div>
  );
}

export function MenuItem(props: { active?: boolean; onSelect: () => void; children: ReactNode }) {
  return (
    <button type="button" role="menuitemradio" aria-checked={props.active} className={`menu-item${props.active ? " active" : ""}`}
      onClick={props.onSelect}>
      <span className="dot" />
      {props.children}
    </button>
  );
}

export function Kpi(props: {
  label: string;
  value: string | null;
  icon?: ReactNode;
  delta?: { text: string; tone: string } | null;
  sub?: ReactNode;
  flat?: boolean;
}) {
  return (
    <div className={`card kpi${props.flat ? " flat" : ""}`}>
      <div className="kpi-label">
        {props.icon && <span className="kpi-icon">{props.icon}</span>}
        {props.label}
      </div>
      <div className="kpi-value">
        {props.value === null ? (
          <span className="skeleton" style={{ width: 110, height: 28 }} />
        ) : (
          <span className="num">{props.value}</span>
        )}
        {props.delta && <span className={`delta ${props.delta.tone}`} title="Em relação ao período anterior">{props.delta.text}</span>}
      </div>
      {props.sub && <div className="kpi-sub">{props.sub}</div>}
    </div>
  );
}

export function Switch(props: { on: boolean }) {
  return <span className={`switch${props.on ? " on" : ""}`} aria-hidden="true" />;
}

export function Loading(props: { rows?: number }) {
  return (
    <div style={{ padding: 20, display: "flex", flexDirection: "column", gap: 10 }} aria-busy="true" aria-label="Carregando">
      {Array.from({ length: props.rows ?? 5 }, (_, i) => (
        <span key={i} className="skeleton" style={{ height: 18, width: `${90 - i * 7}%` }} />
      ))}
    </div>
  );
}

export function ErrorState(props: { error: { message: string; details?: string[] }; title?: string }) {
  return (
    <div className="state error" role="alert">
      <h3>{props.title ?? "Não foi possível carregar"}</h3>
      {props.error.message}
      {props.error.details?.map((d) => <div key={d}>{d}</div>)}
    </div>
  );
}

export function Empty(props: { title: string; children?: ReactNode }) {
  return (
    <div className="state">
      <h3>{props.title}</h3>
      {props.children}
    </div>
  );
}
