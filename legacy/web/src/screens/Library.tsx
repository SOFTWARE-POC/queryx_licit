import { useState } from "react";
import { useApp } from "../lib/context";
import { CATEGORIES } from "../lib/types";
import { go, href } from "../lib/router";
import { Empty } from "../components/ui";
import { IconPlus, IconRight } from "../components/icons";

type Tab = "Todos" | (typeof CATEGORIES)[number] | "Personalizados";

const normalize = (s: string) => s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();

export function Library() {
  const app = useApp();
  const [tab, setTab] = useState<Tab>("Todos");
  const term = normalize(app.search.trim());

  const list = app.reports.filter(
    (r) =>
      (tab === "Todos" || (tab === "Personalizados" ? !r.system : r.category === tab)) &&
      (!term || normalize(`${r.name} ${r.description}`).includes(term)),
  );

  return (
    <div className="stack">
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        {(["Todos", ...CATEGORIES, "Personalizados"] as Tab[]).map((t) => (
          <button key={t} type="button" className={`chip${tab === t ? " dark" : ""}`} aria-pressed={tab === t} onClick={() => setTab(t)}>
            {t}
          </button>
        ))}
        {app.session.canManage && (
          <button type="button" className="btn primary" style={{ marginLeft: "auto" }} onClick={() => go({ name: "builder", id: null })}>
            <IconPlus size={15} /> Novo relatório
          </button>
        )}
      </div>

      {list.length ? (
        <div className="lib-grid">
          {list.map((r) => (
            <a key={r.id} href={href({ name: "report", id: r.id })} className="lib-card">
              <span style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <span className={`lib-code ${r.category}`}>{r.code}</span>
                {!r.system && <span className="badge good">Personalizado</span>}
              </span>
              <h2 className="lib-name">{r.name}</h2>
              <p className="lib-desc">{r.description}</p>
              <span className="lib-foot">
                <span>{r.system ? r.category : `Por ${r.createdBy?.name ?? "sua equipe"}`}</span>
                <b style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>Abrir <IconRight size={13} /></b>
              </span>
            </a>
          ))}
        </div>
      ) : (
        <div className="card">
          <Empty title={term ? "Nenhum relatório encontrado" : "Nenhum relatório nesta categoria"}>
            {term
              ? `Nada corresponde a “${app.search}”. Tente outro termo.`
              : tab === "Personalizados"
                ? app.session.canManage
                  ? "Monte o primeiro no construtor e salve na biblioteca."
                  : "Quando alguém da sua empresa salvar um relatório, ele aparece aqui."
                : null}
          </Empty>
        </div>
      )}
    </div>
  );
}
