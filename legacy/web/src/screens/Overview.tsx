import { useMemo } from "react";
import { useApp } from "../lib/context";
import { applyRecorte } from "../lib/recorte";
import { firstRow, useQuery } from "../lib/useQuery";
import { bucketLabel, delta, formatCell, formatValue } from "../lib/format";
import { previousRange, trendGranularity } from "../lib/period";
import { href } from "../lib/router";
import type { QuerySpec } from "../lib/types";
import { Kpi, ErrorState, Loading, Empty } from "../components/ui";
import { HBars, LineChart } from "../components/Charts";
import { IconAlert, IconCheck, IconClock, IconMoney, IconRight } from "../components/icons";


export function Overview() {
  const app = useApp();
  const { recorte } = app;
  const prev = { ...recorte, range: previousRange(recorte.range) };
  const q = (spec: QuerySpec, usesPeriod = true, r = recorte) => applyRecorte(spec, app.dataset(spec.dataset), r, usesPeriod);
  const granularity = trendGranularity(recorte.range);

  const specs = useMemo(() => {
    const wd: QuerySpec = { dataset: "work_days", measures: ["worked_hours", "employee_count", "avg_daily_hours", "overtime_days"] };
    const os: QuerySpec = { dataset: "service_orders", measures: ["concluded_count", "completion_rate", "overdue_count", "open_count", "order_count"] };
    return {
      wd: q(wd), wdPrev: q(wd, true, prev),
      os: q(os), osPrev: q(os, true, prev),
      ct: q({ dataset: "contracts", measures: ["active_count", "active_value", "expiring_count"] }, false),
      trend: q({ dataset: "work_days", measures: ["worked_hours"], timeDimension: { dimension: "day", granularity } }),
      sources: q({ dataset: "time_entries", dimensions: ["source"], measures: ["entry_count"], order: [["entry_count", "desc"]] }),
      byContract: q({ dataset: "service_orders", dimensions: ["contract"], measures: ["overdue_count", "open_count"], order: [["overdue_count", "desc"]], limit: 6 }),
      changes: q({ dataset: "time_entries", measures: ["changed_count"] }),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(recorte), granularity]);

  const wd = useQuery(specs.wd), wdPrev = useQuery(specs.wdPrev);
  const os = useQuery(specs.os), osPrev = useQuery(specs.osPrev);
  const ct = useQuery(specs.ct);
  const trend = useQuery(specs.trend);
  const sources = useQuery(specs.sources);
  const byContract = useQuery(specs.byContract);
  const changes = useQuery(specs.changes);

  const W = firstRow(wd), WP = firstRow(wdPrev), O = firstRow(os), OP = firstRow(osPrev), C = firstRow(ct);
  const v = (row: Record<string, unknown> | null, key: string, fmt: Parameters<typeof formatValue>[1], loading: boolean) =>
    loading ? null : formatValue(row?.[key] ?? 0, fmt, true);

  const exceptions = [
    { n: Number(firstRow(changes)?.changed_count ?? 0), text: "marcações de ponto ajustadas ou invalidadas", sub: "Confira autor e justificativa na auditoria", to: "sys-auditoria", tone: "warn" },
    { n: Number(W?.overtime_days ?? 0), text: "dias trabalhados acima da jornada", sub: "Veja quem acumulou horas extras", to: "sys-horas-extras", tone: "warn" },
    { n: Number(O?.overdue_count ?? 0), text: "ordens de serviço com prazo vencido", sub: "Em aberto e com a previsão já passada", to: "sys-os-contrato", tone: "bad" },
    { n: Number(C?.expiring_count ?? 0), text: "contratos ativos vencem em 90 dias", sub: "Prepare a renovação ou o aditivo", to: "sys-contratos", tone: "warn" },
  ].filter((e) => e.n > 0);
  const exceptionsLoading = changes.loading || wd.loading || os.loading || ct.loading;

  const sourceRows = sources.data?.data ?? [];
  const sourceTotal = sourceRows.reduce((a, r) => a + Number(r.entry_count ?? 0), 0);

  return (
    <div className="stack">
      <section className="grid-4" aria-label="Indicadores do período">
        <Kpi icon={<IconClock size={14} />} label="Horas trabalhadas" value={v(W, "worked_hours", "hours", wd.loading)}
          delta={W && WP ? delta("worked_hours", "hours", W.worked_hours, WP.worked_hours) : null}
          sub={W ? `${formatValue(W.employee_count, "integer")} funcionários · média de ${formatValue(W.avg_daily_hours ?? 0, "hours")} por dia` : " "} />
        <Kpi icon={<IconCheck size={14} />} label="OS concluídas" value={v(O, "concluded_count", "integer", os.loading)}
          delta={O && OP ? delta("concluded_count", "integer", O.concluded_count, OP.concluded_count) : null}
          sub={O ? `${formatValue(O.completion_rate ?? 0, "percent")} de ${formatValue(O.order_count, "integer")} ordens no período` : " "} />
        <Kpi icon={<IconAlert size={14} />} label="OS em atraso" value={v(O, "overdue_count", "integer", os.loading)}
          delta={O && OP ? delta("overdue_count", "integer", O.overdue_count, OP.overdue_count) : null}
          sub={O ? `${formatValue(O.open_count, "integer")} em aberto` : " "} />
        <Kpi icon={<IconMoney size={14} />} label="Contratos ativos" value={v(C, "active_value", "currency", ct.loading)}
          sub={C ? `${formatValue(C.active_count, "integer")} ativos · ${formatValue(C.expiring_count, "integer")} vencem em 90 dias` : " "} />
      </section>

      <section className="grid-main">
        <div className="card card-pad">
          <div className="card-head">
            <div>
              <h2 className="card-title">Horas trabalhadas</h2>
              <p className="card-sub">Por {granularity === "day" ? "dia" : granularity === "week" ? "semana" : "mês"}, pareando entradas e saídas do ponto</p>
            </div>
            <a className="end link-btn" href={href({ name: "report", id: "sys-frequencia" })}>Abrir relatório</a>
          </div>
          {trend.loading ? <Loading rows={6} /> : trend.error ? <ErrorState error={trend.error} /> : trend.data?.data.length ? (
            <LineChart label="Horas trabalhadas no período" format="hours"
              points={trend.data.data.map((r) => ({ label: bucketLabel(r[`day__${granularity}`], granularity), value: Number(r.worked_hours ?? 0) }))} />
          ) : <Empty title="Sem marcações no período">Nenhuma entrada e saída registrada no recorte escolhido.</Empty>}
        </div>

        <div className="card card-pad">
          <div className="card-head">
            <div>
              <h2 className="card-title">Origem das marcações</h2>
              <p className="card-sub">{sourceTotal ? `${formatValue(sourceTotal, "integer")} marcações no período` : "No período"}</p>
            </div>
          </div>
          {sources.loading ? <Loading rows={3} /> : sources.error ? <ErrorState error={sources.error} /> : sourceRows.length ? (
            <HBars rows={sourceRows.map((r) => {
              const n = Number(r.entry_count ?? 0);
              return {
                label: formatCell(r.source, sources.data!.annotation.source, false),
                value: n,
                valueText: `${formatValue(sourceTotal ? n / sourceTotal : 0, "percent")}`,
                sub: `${formatValue(n, "integer")} marcações`,
                tone: r.source === "MANUAL" ? "warn" : undefined,
              };
            })} />
          ) : <Empty title="Sem marcações no período" />}
        </div>
      </section>

      <section className="grid-2">
        <div className="card card-pad">
          <div className="card-head">
            <div>
              <h2 className="card-title">OS em atraso por contrato</h2>
              <p className="card-sub">Em aberto com o prazo vencido</p>
            </div>
            <a className="end link-btn" href={href({ name: "report", id: "sys-os-contrato" })}>Abrir relatório</a>
          </div>
          {byContract.loading ? <Loading rows={4} /> : byContract.error ? <ErrorState error={byContract.error} /> : (() => {
            const rows = (byContract.data?.data ?? []).filter((r) => Number(r.open_count) > 0);
            return rows.length ? (
              <HBars rows={rows.map((r) => ({
                label: String(r.contract ?? "Sem contrato"),
                value: Number(r.overdue_count ?? 0),
                valueText: `${formatValue(r.overdue_count, "integer")} de ${formatValue(r.open_count, "integer")}`,
                tone: Number(r.overdue_count) > 0 ? "bad" : undefined,
              }))} />
            ) : <Empty title="Nenhuma OS em aberto">Não há ordens pendentes ou em andamento no recorte.</Empty>;
          })()}
        </div>

        <div className="card card-pad">
          <div className="card-head">
            <div>
              <h2 className="card-title">Pontos de atenção</h2>
              <p className="card-sub">O que pede ação no período</p>
            </div>
            {!exceptionsLoading && exceptions.length > 0 && <span className="end badge bad">{exceptions.length} {exceptions.length === 1 ? "aberto" : "abertos"}</span>}
          </div>
          {exceptionsLoading ? <Loading rows={4} /> : exceptions.length ? (
            <div style={{ display: "flex", flexDirection: "column" }}>
              {exceptions.map((e) => (
                <a key={e.to} href={href({ name: "report", id: e.to })} className="field" style={{ padding: "12px 6px", alignItems: "flex-start" }}>
                  <span style={{ width: 8, height: 8, borderRadius: "50%", marginTop: 6, flex: "none", background: e.tone === "bad" ? "var(--bad)" : "var(--warn)" }} />
                  <span style={{ flex: 1 }}>
                    <span style={{ display: "block", fontWeight: 700, color: "var(--ink)" }}>
                      <span className="num">{formatValue(e.n, "integer")}</span> {e.text}
                    </span>
                    <span style={{ display: "block", fontSize: 12.5, color: "var(--muted)", marginTop: 2 }}>{e.sub}</span>
                  </span>
                  <IconRight size={14} />
                </a>
              ))}
            </div>
          ) : <Empty title="Nada pedindo ação">Sem ajustes de ponto, horas extras, atrasos ou vencimentos próximos no recorte.</Empty>}
        </div>
      </section>
    </div>
  );
}
