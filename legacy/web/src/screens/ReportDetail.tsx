import { useMemo, useState } from "react";
import { api, ApiError } from "../lib/api";
import { useApp } from "../lib/context";
import { applyRecorte } from "../lib/recorte";
import { firstRow, useQuery } from "../lib/useQuery";
import { bucketLabel, delta, formatCell, formatValue, toCsv } from "../lib/format";
import { previousRange, trendGranularity } from "../lib/period";
import { go, href } from "../lib/router";
import type { QuerySpec } from "../lib/types";
import { DataTable } from "../components/DataTable";
import { BarChart, LineChart } from "../components/Charts";
import { Empty, ErrorState, Kpi, Loading } from "../components/ui";
import { IconDownload, IconEdit, IconLeft, IconTrash } from "../components/icons";

const EXTREMES = new Set(["min", "max"]);

export function ReportDetail(props: { id: string }) {
  const app = useApp();
  const report = app.reports.find((r) => r.id === props.id);
  const ds = report ? app.dataset(report.spec.dataset) : undefined;
  const [tab, setTab] = useState<"table" | "chart">(report && (report.visualization === "bar" || report.visualization === "line") ? "chart" : "table");
  const granularity = trendGranularity(app.recorte.range);

  const specs = useMemo(() => {
    if (!report || !ds) return null;
    const { recorte } = app;
    const main = applyRecorte(report.spec, ds, recorte, report.usesPeriod);
    const aggregatable = report.spec.measures.filter((m) => !EXTREMES.has(ds.measures.find((x) => x.name === m)?.kind ?? ""));
    const kpi = (range: [string, string]): QuerySpec =>
      applyRecorte(
        { dataset: report.spec.dataset, measures: report.kpis.measures, filters: report.kpis.filters ?? report.spec.filters, timeDimension: report.spec.timeDimension },
        ds,
        { ...recorte, range },
        report.usesPeriod,
      );
    return {
      main,
      kpi: kpi(recorte.range),
      kpiPrev: report.usesPeriod ? kpi(previousRange(recorte.range)) : null,
      totals:
        report.spec.dimensions?.length && aggregatable.length
          ? applyRecorte({ dataset: report.spec.dataset, measures: aggregatable, filters: report.spec.filters, timeDimension: report.spec.timeDimension }, ds, recorte, report.usesPeriod)
          : null,
      trend: report.trend && report.usesPeriod
        ? applyRecorte({ dataset: report.spec.dataset, measures: [report.trend.measure], filters: report.spec.filters,
            timeDimension: { dimension: report.spec.timeDimension?.dimension ?? ds.defaultTimeDimension!, granularity } }, ds, recorte, true)
        : null,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [report, ds, JSON.stringify(app.recorte), granularity]);

  const main = useQuery(specs?.main ?? null);
  const kpi = useQuery(specs?.kpi ?? null);
  const kpiPrev = useQuery(specs?.kpiPrev ?? null);
  const totals = useQuery(specs?.totals ?? null);
  const trend = useQuery(specs?.trend ?? null);

  if (!report || !ds) {
    return (
      <div className="card">
        <Empty title="Relatório não encontrado">
          Ele pode ter sido excluído. <a href={href({ name: "library" })}>Voltar para a biblioteca</a>
        </Empty>
      </div>
    );
  }

  const K = firstRow(kpi);
  const KP = firstRow(kpiPrev);
  const measureMeta = (m: string) => ds.measures.find((x) => x.name === m);

  function exportCsv() {
    if (!main.data) return;
    const csv = toCsv(main.data.data, main.data.columns, main.data.annotation, app.maskPii);
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `${report!.name.normalize("NFD").replace(/[^\w\s-]/g, "").trim().replace(/\s+/g, "-").toLowerCase()}_${app.recorte.range[0]}_${app.recorte.range[1]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    app.toast("CSV exportado");
  }

  async function remove() {
    if (!window.confirm(`Excluir o relatório “${report!.name}”? Isso não pode ser desfeito.`)) return;
    try {
      await api.deleteReport(report!.id);
      await app.reloadReports();
      app.toast("Relatório excluído");
      go({ name: "library" });
    } catch (e) {
      app.toast((e as ApiError).message);
    }
  }

  const firstDim = report.spec.dimensions?.[0];
  // Mesma medida da ordenação do relatório (o que ele destaca); senão, a primeira somável.
  const orderKey = report.spec.order?.[0]?.[0];
  const barMeasure =
    orderKey && report.spec.measures.includes(orderKey) && !EXTREMES.has(measureMeta(orderKey)?.kind ?? "")
      ? orderKey
      : report.spec.measures.find((m) => !EXTREMES.has(measureMeta(m)?.kind ?? ""));
  const barPoints =
    main.data && firstDim && barMeasure
      ? [...main.data.data]
          .sort((a, b) => Number(b[barMeasure] ?? 0) - Number(a[barMeasure] ?? 0))
          .slice(0, 12)
          .map((r) => ({ label: formatCell(r[firstDim], main.data!.annotation[firstDim], app.maskPii), value: Number(r[barMeasure] ?? 0) }))
      : [];

  return (
    <div className="stack">
      <section className="card card-pad">
        <div className="card-head" style={{ flexWrap: "wrap" }}>
          <a className="btn" href={href({ name: "library" })} aria-label="Voltar para a biblioteca" style={{ padding: 9 }}>
            <IconLeft size={15} />
          </a>
          <div style={{ flex: 1, minWidth: 240 }}>
            <h2 className="card-title" style={{ fontSize: 19 }}>{report.name}</h2>
            <p className="card-sub">{report.description}</p>
          </div>
          <div className="btn-row">
            {app.session.canManage && !report.system && (
              <button type="button" className="btn danger" onClick={remove}><IconTrash size={15} /> Excluir</button>
            )}
            {app.session.canManage && (
              <button type="button" className="btn" onClick={() => go({ name: "builder", id: report.id })}>
                <IconEdit size={15} /> {report.system ? "Duplicar no construtor" : "Editar no construtor"}
              </button>
            )}
            <button type="button" className="btn primary" onClick={exportCsv} disabled={!main.data?.data.length}>
              <IconDownload size={15} /> Exportar CSV
            </button>
          </div>
        </div>
        <div className="grid-4">
          {report.kpis.measures.map((m) => {
            const meta = measureMeta(m);
            return (
              <Kpi key={m} flat label={meta?.title ?? m} value={kpi.loading ? null : formatValue(K?.[m] ?? 0, meta?.format ?? null, true)}
                delta={K && KP ? delta(m, meta?.format ?? null, K[m], KP[m]) : null} />
            );
          })}
        </div>
        {kpi.error && <ErrorState error={kpi.error} />}
      </section>

      <section className="card">
        <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "14px 20px", flexWrap: "wrap" }}>
          <div className="seg" role="tablist" aria-label="Visualização">
            <button type="button" role="tab" aria-selected={tab === "table"} className={tab === "table" ? "on" : ""} onClick={() => setTab("table")}>Tabela</button>
            <button type="button" role="tab" aria-selected={tab === "chart"} className={tab === "chart" ? "on" : ""} onClick={() => setTab("chart")}>Gráfico</button>
          </div>
          <span className="card-sub" style={{ margin: 0 }}>
            {main.data ? `${main.data.meta.rowCount.toLocaleString("pt-BR")} linhas` : "Carregando…"}
            {!report.usesPeriod && " · sem recorte de período"}
          </span>
        </div>
        {main.data?.meta.truncated && (
          <div className="notice" style={{ margin: "0 20px 14px" }}>
            O resultado passou do limite e foi cortado. Reduza o período ou use o construtor para agrupar menos.
          </div>
        )}
        {main.loading ? <Loading rows={8} /> : main.error ? <ErrorState error={main.error} /> : !main.data?.data.length ? (
          <Empty title="Sem dados no recorte">Troque o período ou o contrato para ver resultados.</Empty>
        ) : tab === "table" ? (
          <DataTable result={main.data} maskPii={app.maskPii}
            totals={main.data.data.length > 1 ? firstRow(totals) : null} />
        ) : (
          <div style={{ padding: "4px 20px 20px", display: "flex", flexDirection: "column", gap: 24 }}>
            {barPoints.length > 0 && barMeasure && (
              <div>
                <h3 className="card-title" style={{ fontSize: 14 }}>{measureMeta(barMeasure)?.title} por {main.data.annotation[firstDim!]?.title.toLowerCase()}</h3>
                <BarChart label={`${measureMeta(barMeasure)?.title}`} format={measureMeta(barMeasure)?.format ?? null} points={barPoints} />
              </div>
            )}
            {report.trend && specs?.trend && (
              <div>
                <h3 className="card-title" style={{ fontSize: 14 }}>
                  {measureMeta(report.trend.measure)?.title} por {granularity === "day" ? "dia" : granularity === "week" ? "semana" : "mês"}
                </h3>
                {trend.loading ? <Loading rows={5} /> : trend.data?.data.length ? (
                  <LineChart label={`Evolução de ${measureMeta(report.trend.measure)?.title}`} format={measureMeta(report.trend.measure)?.format ?? null}
                    points={trend.data.data.map((r) => {
                      const key = trend.data!.columns.find((c) => c.endsWith(`__${granularity}`))!;
                      return { label: bucketLabel(r[key], granularity), value: Number(r[report.trend!.measure] ?? 0) };
                    })} />
                ) : <Empty title="Sem série no período" />}
              </div>
            )}
            {!barPoints.length && !report.trend && <Empty title="Este relatório não tem gráfico">Use a tabela.</Empty>}
          </div>
        )}
      </section>
    </div>
  );
}
