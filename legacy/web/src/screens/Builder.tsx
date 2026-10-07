import { useMemo, useState } from "react";
import { api, ApiError } from "../lib/api";
import { useApp } from "../lib/context";
import { applyRecorte } from "../lib/recorte";
import { firstRow, useQuery } from "../lib/useQuery";
import { bucketLabel, formatCell, formatValue } from "../lib/format";
import { trendGranularity } from "../lib/period";
import { go } from "../lib/router";
import { CATEGORIES, type Category, type Granularity, type QuerySpec, type Visualization } from "../lib/types";
import { DataTable } from "../components/DataTable";
import { BarChart, LineChart } from "../components/Charts";
import { Empty, ErrorState, Kpi, Loading, Switch } from "../components/ui";
import { IconCheck } from "../components/icons";

const VIZ: Array<[Visualization, string]> = [["table", "Tabela"], ["bar", "Barras"], ["line", "Linha no tempo"], ["kpi", "Indicadores"]];
const GRAN: Array<[Granularity, string]> = [["day", "Dia"], ["week", "Semana"], ["month", "Mês"], ["quarter", "Trimestre"]];
const EXTREMES = new Set(["min", "max"]);

export function Builder(props: { id: string | null }) {
  const app = useApp();
  const source = props.id ? app.reports.find((r) => r.id === props.id) : undefined;
  const editing = source && !source.system ? source : undefined;

  const [dataset, setDataset] = useState(source?.spec.dataset ?? "work_days");
  const [dims, setDims] = useState<string[]>(source?.spec.dimensions ?? ["employee"]);
  const [mets, setMets] = useState<string[]>(source?.spec.measures ?? ["worked_hours", "days_worked"]);
  const [viz, setViz] = useState<Visualization>(source?.visualization ?? "table");
  const [gran, setGran] = useState<Granularity>(source?.spec.timeDimension?.granularity ?? trendGranularity(app.recorte.range));
  const [sortDesc, setSortDesc] = useState(source ? Boolean(source.spec.order?.[0]?.[1] === "desc") : true);
  const [showTotals, setShowTotals] = useState(true);
  const [name, setName] = useState(source ? (source.system ? `Cópia de ${source.name}` : source.name) : "Novo relatório");
  const [category, setCategory] = useState<Category>(source?.category ?? "Pessoas");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<ApiError | null>(null);

  const ds = app.dataset(dataset);
  const hasTime = Boolean(ds?.defaultTimeDimension);
  const groupDims = viz === "kpi" || viz === "line" ? [] : dims;

  function pickDataset(next: string) {
    const d = app.dataset(next);
    setDataset(next);
    setDims([]);
    setMets(d ? [d.measures[0].name] : []);
    if (!d?.defaultTimeDimension && viz === "line") setViz("table");
  }

  /** Spec salva (sem período — ele vem do recorte ao abrir o relatório). */
  const saved = useMemo(() => {
    if (!ds || !mets.length) return null;
    const sortable = mets.find((m) => !EXTREMES.has(ds.measures.find((x) => x.name === m)?.kind ?? ""));
    const spec: QuerySpec = {
      dataset,
      measures: mets,
      ...(groupDims.length ? { dimensions: groupDims } : {}),
      ...(hasTime ? { timeDimension: { dimension: ds.defaultTimeDimension!, ...(viz === "line" ? { granularity: gran } : {}) } } : {}),
      ...(sortDesc && sortable && viz !== "line" ? { order: [[sortable, "desc"]] as Array<[string, "asc" | "desc"]> }
        : groupDims.length ? { order: [[groupDims[0], "asc"]] as Array<[string, "asc" | "desc"]> } : {}),
    };
    return spec;
  }, [ds, dataset, mets, groupDims.join(), hasTime, viz, gran, sortDesc]);

  const previewSpec = saved ? { ...applyRecorte(saved as never, ds, app.recorte, hasTime), limit: 1000 } : null;
  const totalsSpec =
    saved && showTotals && groupDims.length && viz === "table"
      ? applyRecorte({ dataset, measures: mets.filter((m) => !EXTREMES.has(ds?.measures.find((x) => x.name === m)?.kind ?? "")),
          timeDimension: saved.timeDimension } as never, ds, app.recorte, hasTime)
      : null;
  const preview = useQuery(previewSpec, 350);
  const totals = useQuery(totalsSpec?.measures.length ? totalsSpec : null, 350);

  async function save() {
    if (!saved) return;
    setSaving(true);
    setSaveError(null);
    const body = { name, category, visualization: viz, spec: saved };
    try {
      const report = editing ? await api.updateReport(editing.id, body) : await api.createReport(body);
      await app.reloadReports();
      app.toast(editing ? "Relatório atualizado" : "Relatório salvo na biblioteca");
      go({ name: "report", id: report.id });
    } catch (e) {
      setSaveError(e as ApiError);
    } finally {
      setSaving(false);
    }
  }

  const title = (m: string) => ds?.measures.find((x) => x.name === m)?.title ?? m;
  const dimTitle = (d: string) => ds?.dimensions.find((x) => x.name === d)?.title ?? d;
  const code = (name.normalize("NFD").replace(/[^A-Za-z]/g, "").slice(0, 2) || "RP").toUpperCase();
  const firstMeasure = mets[0];
  const rows = preview.data?.data ?? [];

  return (
    <div className="stack">
      <section className="card card-pad" style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
        <span className={`lib-code ${category}`}>{code}</span>
        <div style={{ flex: 1, minWidth: 220 }}>
          <label className="visually-hidden" htmlFor="nome">Nome do relatório</label>
          <input id="nome" className="name-input" value={name} maxLength={80} onChange={(e) => setName(e.target.value)} />
          <div className="card-sub" style={{ margin: 0 }}>
            {editing ? "Editando relatório salvo" : source?.system ? `Cópia de um relatório do sistema` : "Rascunho não salvo"} · fonte: {ds?.title}
          </div>
        </div>
        <div className="btn-row" role="radiogroup" aria-label="Categoria">
          {CATEGORIES.map((c) => (
            <button key={c} type="button" role="radio" aria-checked={category === c} className={`chip${category === c ? " active" : ""}`} onClick={() => setCategory(c)}>{c}</button>
          ))}
        </div>
        <div className="btn-row">
          <button type="button" className="btn" onClick={() => (source ? go({ name: "report", id: source.id }) : go({ name: "library" }))}>Descartar</button>
          <button type="button" className="btn primary" onClick={save} disabled={!app.session.canManage || !saved || saving || name.trim().length < 2}
            title={app.session.canManage ? undefined : "Seu perfil não tem a permissão report:manage"}>
            <IconCheck size={15} /> {saving ? "Salvando…" : editing ? "Salvar alterações" : "Salvar relatório"}
          </button>
        </div>
        {saveError && <div className="form-error" style={{ flexBasis: "100%" }} role="alert">{saveError.message} {saveError.details?.join(" ")}</div>}
      </section>

      <div className="builder">
        <aside className="card card-pad" aria-label="Campos disponíveis">
          <label className="panel-label" htmlFor="fonte">Fonte de dados</label>
          <select id="fonte" className="select" value={dataset} onChange={(e) => pickDataset(e.target.value)} style={{ marginBottom: 6 }}>
            {app.catalog.map((d) => <option key={d.name} value={d.name}>{d.title}</option>)}
          </select>
          <p className="card-sub" style={{ margin: "0 0 16px" }}>{ds?.description}</p>

          <p className="panel-label">Agrupar por</p>
          <div className="field-list">
            {ds?.dimensions.filter((d) => d.type !== "id").map((d) => {
              const on = dims.includes(d.name);
              return (
                <button key={d.name} type="button" className={`field${on ? " on" : ""}`} aria-pressed={on}
                  onClick={() => setDims(on ? dims.filter((x) => x !== d.name) : [...dims, d.name].slice(0, 6))}>
                  <span className="field-tag" aria-hidden="true">D</span>{d.title}
                </button>
              );
            })}
          </div>
          <p className="panel-label">Medidas</p>
          <div className="field-list">
            {ds?.measures.map((m) => {
              const on = mets.includes(m.name);
              return (
                <button key={m.name} type="button" className={`field${on ? " on" : ""}`} aria-pressed={on} title={m.description ?? undefined}
                  onClick={() => setMets(on ? mets.filter((x) => x !== m.name) : [...mets, m.name].slice(0, 8))}>
                  <span className="field-tag m" aria-hidden="true">M</span>{m.title}
                </button>
              );
            })}
          </div>
        </aside>

        <section className="card" aria-label="Prévia">
          <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "14px 18px", flexWrap: "wrap" }}>
            <div className="seg" role="radiogroup" aria-label="Visualização">
              {VIZ.map(([v, label]) => (
                <button key={v} type="button" role="radio" aria-checked={viz === v} className={viz === v ? "on" : ""}
                  disabled={v === "line" && !hasTime} title={v === "line" && !hasTime ? "Esta fonte não tem dimensão de tempo" : undefined}
                  onClick={() => setViz(v)}>{label}</button>
              ))}
            </div>
            <span className="live">Prévia ao vivo</span>
            <span className="card-sub" style={{ margin: 0 }}>
              {preview.data ? `${preview.data.meta.rowCount.toLocaleString("pt-BR")} ${viz === "line" ? "pontos" : groupDims.length ? "grupos" : "resultado"}` : ""}
            </span>
          </div>
          {!mets.length ? (
            <Empty title="Escolha ao menos uma medida">Clique numa medida à esquerda para começar.</Empty>
          ) : preview.loading && !preview.data ? <Loading rows={7} /> : preview.error ? <ErrorState error={preview.error} /> : !rows.length ? (
            <Empty title="Sem dados no recorte">Troque o período ou o contrato no topo.</Empty>
          ) : viz === "table" ? (
            <DataTable result={preview.data!} maskPii={app.maskPii} dense totals={showTotals && rows.length > 1 ? firstRow(totals) : null} />
          ) : viz === "bar" ? (
            groupDims.length ? (
              <div style={{ padding: "0 18px 18px" }}>
                <BarChart label={title(firstMeasure)} format={preview.data!.annotation[firstMeasure]?.format ?? null}
                  points={rows.slice(0, 12).map((r) => ({ label: formatCell(r[groupDims[0]], preview.data!.annotation[groupDims[0]], app.maskPii), value: Number(r[firstMeasure] ?? 0) }))} />
              </div>
            ) : <Empty title="Escolha um agrupamento">Barras comparam grupos: adicione uma dimensão em “Agrupar por”.</Empty>
          ) : viz === "line" ? (
            <div style={{ padding: "0 18px 18px" }}>
              <LineChart label={title(firstMeasure)} format={preview.data!.annotation[firstMeasure]?.format ?? null}
                points={rows.map((r) => ({ label: bucketLabel(r[`${ds!.defaultTimeDimension}__${gran}`], gran), value: Number(r[firstMeasure] ?? 0) }))} />
            </div>
          ) : (
            <div className="grid-4" style={{ padding: "0 18px 18px" }}>
              {mets.map((m) => (
                <Kpi key={m} flat label={title(m)} value={formatValue(rows[0]?.[m], preview.data!.annotation[m]?.format ?? null, true)} />
              ))}
            </div>
          )}
        </section>

        <aside className="stack">
          <div className="card card-pad">
            <p className="panel-label">Agrupado por</p>
            <div className="drop dims">
              {viz === "kpi" || viz === "line" ? (
                <span className="drop-empty">{viz === "kpi" ? "Indicadores mostram o total, sem agrupar." : "A linha agrupa pelo tempo."}</span>
              ) : dims.length ? dims.map((d) => (
                <span key={d} className="pill">{dimTitle(d)}<button type="button" aria-label={`Remover ${dimTitle(d)}`} onClick={() => setDims(dims.filter((x) => x !== d))}>×</button></span>
              )) : <span className="drop-empty">Sem agrupamento: uma linha com o total.</span>}
            </div>
            <p className="panel-label">Valores</p>
            <div className="drop mets">
              {mets.length ? mets.map((m) => (
                <span key={m} className="pill m">{title(m)}<button type="button" aria-label={`Remover ${title(m)}`} onClick={() => setMets(mets.filter((x) => x !== m))}>×</button></span>
              )) : <span className="drop-empty">Nenhuma medida.</span>}
            </div>
            {viz === "line" && (
              <>
                <label className="panel-label" htmlFor="gran">Agrupar o tempo por</label>
                <select id="gran" className="select" value={gran} onChange={(e) => setGran(e.target.value as Granularity)} style={{ marginBottom: 12 }}>
                  {GRAN.map(([g, l]) => <option key={g} value={g}>{l}</option>)}
                </select>
              </>
            )}
            <button type="button" className="toggle-row" aria-pressed={sortDesc} onClick={() => setSortDesc(!sortDesc)}>
              Maior valor primeiro <Switch on={sortDesc} />
            </button>
            <button type="button" className="toggle-row" aria-pressed={showTotals} onClick={() => setShowTotals(!showTotals)}>
              Linha de totais <Switch on={showTotals} />
            </button>
          </div>
          <div className="card card-pad" style={{ background: "var(--nav)", borderColor: "var(--nav)", color: "#fff" }}>
            <p style={{ margin: "0 0 6px", fontWeight: 800 }}>Como o período funciona</p>
            <p style={{ margin: 0, color: "#A8B6C9", fontSize: 13, lineHeight: 1.5 }}>
              {hasTime
                ? "O relatório salvo não guarda datas: ao abrir, ele usa o período e o contrato escolhidos no topo."
                : "Esta fonte não tem data, então o relatório sempre mostra a situação atual."}
            </p>
          </div>
        </aside>
      </div>
    </div>
  );
}
