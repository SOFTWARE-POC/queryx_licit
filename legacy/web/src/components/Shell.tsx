import { useMemo, type ReactNode } from "react";
import type { Session } from "../lib/types";
import { PERIOD_OPTIONS, periodLabel, presetRange, type Period } from "../lib/period";
import { href, type Route } from "../lib/router";
import { Dropdown, MenuItem, Switch } from "./ui";
import { IconBriefcase, IconBuilder, IconCalendar, IconChart, IconGrid, IconLeft, IconLogout, IconReports, IconRight, IconSearch } from "./icons";

const initials = (name: string) =>
  name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]).join("").toUpperCase() || "?";

export function Sidebar(props: {
  route: Route;
  session: Session;
  reportCount: number;
  mini: boolean;
  onToggle: () => void;
  maskPii: boolean;
  onMask: () => void;
  onLogout: () => void;
}) {
  const r = props.route.name;
  const item = (to: Route, active: boolean, icon: ReactNode, label: string, count?: number) => (
    <a href={href(to)} className={`nav-item${active ? " active" : ""}`} aria-current={active ? "page" : undefined} title={label}>
      {icon}
      <span className="label">{label}</span>
      {count !== undefined && <span className="count">{count}</span>}
    </a>
  );

  return (
    <aside className={`sidebar${props.mini ? " mini" : ""}`} aria-label="Navegação">
      <div className="brand">
        <span className="brand-mark"><IconChart size={18} color="#fff" strokeWidth={2.2} /></span>
        <span className="brand-text" style={{ flex: 1, minWidth: 0 }}>
          <span className="brand-name">LICITA<b>+</b></span>
          <span className="brand-sub">Relatórios</span>
        </span>
        <button type="button" className="icon-btn" onClick={props.onToggle} aria-label={props.mini ? "Expandir menu" : "Recolher menu"}>
          {props.mini ? <IconRight size={14} /> : <IconLeft size={14} />}
        </button>
      </div>
      <nav className="nav">
        {item({ name: "overview" }, r === "overview", <IconGrid />, "Visão geral")}
        {item({ name: "library" }, r === "library" || r === "report", <IconReports />, "Relatórios", props.reportCount)}
        {item({ name: "builder", id: null }, r === "builder", <IconBuilder />, "Construtor")}
      </nav>
      <div className="side-foot">
        <button type="button" className="side-toggle" onClick={props.onMask} aria-pressed={props.maskPii}
          title="Troca nomes de pessoas por iniciais nas telas e exportações (LGPD)">
          <Switch on={props.maskPii} />
          <span className="side-toggle-label">Ocultar nomes</span>
        </button>
        <div className="user">
          <span className="avatar" aria-hidden="true">{initials(props.session.name)}</span>
          <span className="user-text">
            <span className="user-name">{props.session.name}</span>
            <span className="user-sub">{props.session.company.name}</span>
          </span>
          <button type="button" className="icon-btn" onClick={props.onLogout} aria-label="Sair" title="Sair">
            <IconLogout size={14} />
          </button>
        </div>
      </div>
    </aside>
  );
}

export function Topbar(props: { crumb: string; title: string; search: string; onSearch: (v: string) => void }) {
  return (
    <header className="topbar">
      <div style={{ minWidth: 0 }}>
        <div className="crumb">Relatórios <IconRight size={11} /> <strong>{props.crumb}</strong></div>
        <h1 className="page-title">{props.title}</h1>
      </div>
      <label className="search">
        <IconSearch size={15} />
        <span className="visually-hidden">Buscar relatório</span>
        <input type="search" placeholder="Buscar relatório" value={props.search} onChange={(e) => props.onSearch(e.target.value)} />
      </label>
    </header>
  );
}

export function FilterBar(props: {
  period: Period;
  onPeriod: (p: Period) => void;
  contracts: Array<{ id: string; label: string }>;
  contractId: string | null;
  onContract: (id: string | null) => void;
  contractHint?: string | null;
  updatedAt: Date;
}) {
  const contract = useMemo(() => props.contracts.find((c) => c.id === props.contractId), [props.contracts, props.contractId]);
  const filtered = props.contractId !== null || props.period.key !== "month";

  return (
    <div className="filterbar">
      <span className="filterbar-label">Recorte</span>
      <Dropdown icon={<IconBriefcase size={15} />} label={contract?.label ?? "Todos os contratos"} active={Boolean(contract)}
        title={props.contractHint ?? undefined}>
        {(close) => (
          <>
            <MenuItem active={!props.contractId} onSelect={() => { props.onContract(null); close(); }}>Todos os contratos</MenuItem>
            {props.contracts.map((c) => (
              <MenuItem key={c.id} active={c.id === props.contractId} onSelect={() => { props.onContract(c.id); close(); }}>
                {c.label}
              </MenuItem>
            ))}
            {!props.contracts.length && <div className="drop-empty">Nenhum contrato cadastrado.</div>}
          </>
        )}
      </Dropdown>
      <Dropdown icon={<IconCalendar size={15} />} label={periodLabel(props.period)} active={props.period.key !== "month"}>
        {(close) => (
          <>
            {PERIOD_OPTIONS.filter((o) => o.key !== "custom").map((o) => (
              <MenuItem key={o.key} active={props.period.key === o.key}
                onSelect={() => { props.onPeriod({ key: o.key, range: presetRange(o.key as Exclude<Period["key"], "custom">) }); close(); }}>
                {o.label}
              </MenuItem>
            ))}
            <div className="menu-dates">
              <label>De<input type="date" value={props.period.range[0]} max={props.period.range[1]}
                onChange={(e) => e.target.value && props.onPeriod({ key: "custom", range: [e.target.value, props.period.range[1]] })} /></label>
              <label>Até<input type="date" value={props.period.range[1]} min={props.period.range[0]}
                onChange={(e) => e.target.value && props.onPeriod({ key: "custom", range: [props.period.range[0], e.target.value] })} /></label>
            </div>
          </>
        )}
      </Dropdown>
      {filtered && (
        <button type="button" className="link-btn" onClick={() => { props.onContract(null); props.onPeriod({ key: "month", range: presetRange("month") }); }}>
          Limpar filtros
        </button>
      )}
      {props.contractHint && <span className="filter-note">{props.contractHint}</span>}
      {!props.contractHint && (
        <span className="filter-note">
          Consulta ao vivo · <b>{props.updatedAt.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</b>
        </span>
      )}
    </div>
  );
}
