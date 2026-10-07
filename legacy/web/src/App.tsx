import { useCallback, useEffect, useMemo, useState } from "react";
import { api, ApiError, SESSION_EXPIRED } from "./lib/api";
import { setTimezone } from "./lib/format";
import { defaultPeriod, type Period } from "./lib/period";
import { Ctx, type AppCtx } from "./lib/context";
import { supportsContract } from "./lib/recorte";
import { useRoute, go } from "./lib/router";
import type { CatalogDataset, ReportDefinition, Session } from "./lib/types";
import { FilterBar, Sidebar, Topbar } from "./components/Shell";
import { ErrorState, Loading } from "./components/ui";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { Login } from "./screens/Login";
import { Overview } from "./screens/Overview";
import { Library } from "./screens/Library";
import { ReportDetail } from "./screens/ReportDetail";
import { Builder } from "./screens/Builder";

type Boot = { status: "loading" } | { status: "anon"; notice?: string } | { status: "ready"; session: Session };

export function App() {
  const [boot, setBoot] = useState<Boot>({ status: "loading" });

  useEffect(() => {
    api.session()
      .then((session) => setBoot({ status: "ready", session }))
      .catch(() => setBoot({ status: "anon" }));
    const expired = () => setBoot({ status: "anon", notice: "Sua sessão terminou. Entre de novo para continuar." });
    window.addEventListener(SESSION_EXPIRED, expired);
    return () => window.removeEventListener(SESSION_EXPIRED, expired);
  }, []);

  if (boot.status === "loading") return <div className="login" aria-busy="true" />;
  if (boot.status === "anon") return <Login notice={boot.notice} onLogin={(session) => setBoot({ status: "ready", session })} />;
  return <Workspace session={boot.session} onLogout={() => setBoot({ status: "anon" })} />;
}

function Workspace(props: { session: Session; onLogout: () => void }) {
  const route = useRoute();
  const [catalog, setCatalog] = useState<CatalogDataset[] | null>(null);
  const [reports, setReports] = useState<ReportDefinition[]>([]);
  const [loadError, setLoadError] = useState<ApiError | null>(null);
  const [contracts, setContracts] = useState<Array<{ id: string; label: string }>>([]);
  const [period, setPeriod] = useState<Period>(defaultPeriod);
  const [contractId, setContractId] = useState<string | null>(null);
  const [mini, setMini] = useState(false);
  const [maskPii, setMaskPii] = useState(false);
  const [search, setSearch] = useState("");
  const [toastMsg, setToastMsg] = useState("");
  const [updatedAt, setUpdatedAt] = useState(new Date());

  setTimezone(props.session.timezone);

  const reloadReports = useCallback(async () => setReports(await api.reports()), []);

  useEffect(() => {
    Promise.all([api.meta(), api.reports()])
      .then(([meta, reps]) => {
        setCatalog(meta.datasets);
        setReports(reps);
      })
      .catch((e: ApiError) => setLoadError(e));
    api
      .query({ dataset: "contracts", dimensions: ["contract_id", "contract_number"], measures: ["contract_count"], order: [["contract_number", "asc"]], limit: 500 })
      .then((r) => setContracts(r.data.map((row) => ({ id: String(row.contract_id), label: String(row.contract_number ?? "Sem número") }))))
      .catch(() => setContracts([]));
  }, []);

  useEffect(() => setUpdatedAt(new Date()), [period, contractId, route]);

  const toast = useCallback((msg: string) => {
    setToastMsg(msg);
    window.setTimeout(() => setToastMsg(""), 2800);
  }, []);

  const ctx: AppCtx | null = useMemo(
    () =>
      catalog && {
        session: props.session,
        catalog,
        reports,
        reloadReports,
        recorte: { range: period.range, contractId },
        maskPii,
        search,
        toast,
        dataset: (name: string) => catalog.find((d) => d.name === name),
      },
    [catalog, reports, reloadReports, period, contractId, maskPii, search, toast, props.session],
  );

  const current = route.name === "report" ? reports.find((r) => r.id === route.id) : undefined;
  const heading =
    route.name === "overview" ? { crumb: "Painel", title: "Visão geral da operação" }
    : route.name === "library" ? { crumb: "Biblioteca", title: "Relatórios disponíveis" }
    : route.name === "builder" ? { crumb: route.id ? "Editando" : "Novo relatório", title: "Construtor de relatórios" }
    : { crumb: current?.category ?? "Relatório", title: current?.name ?? "Relatório" };

  // Aviso quando o contrato escolhido não se aplica ao relatório aberto.
  const contractHint =
    contractId && route.name === "report" && current && ctx && !supportsContract(ctx.dataset(current.spec.dataset))
      ? "O recorte por contrato não se aplica a este relatório."
      : null;

  async function logout() {
    await api.logout().catch(() => undefined);
    props.onLogout();
  }

  return (
    <div className="app">
      <Sidebar route={route} session={props.session} reportCount={reports.length} mini={mini} onToggle={() => setMini(!mini)}
        maskPii={maskPii} onMask={() => setMaskPii(!maskPii)} onLogout={logout} />
      <div className="main">
        <Topbar {...heading} search={search} onSearch={(v) => { setSearch(v); if (v && route.name !== "library") go({ name: "library" }); }} />
        {route.name !== "library" && (
          <FilterBar period={period} onPeriod={setPeriod} contracts={contracts} contractId={contractId} onContract={setContractId}
            contractHint={contractHint} updatedAt={updatedAt} />
        )}
        <main className="content" id="conteudo">
          {loadError ? (
            <div className="card"><ErrorState error={loadError} /></div>
          ) : !ctx ? (
            <div className="card"><Loading /></div>
          ) : (
            <Ctx.Provider value={ctx}>
              <ErrorBoundary resetKey={window.location.hash}>
                {route.name === "overview" && <Overview />}
                {route.name === "library" && <Library />}
                {route.name === "report" && <ReportDetail key={route.id} id={route.id} />}
                {route.name === "builder" && <Builder key={route.id ?? "novo"} id={route.id} />}
              </ErrorBoundary>
            </Ctx.Provider>
          )}
        </main>
      </div>
      {toastMsg && <div className="toast" role="status">{toastMsg}</div>}
    </div>
  );
}
