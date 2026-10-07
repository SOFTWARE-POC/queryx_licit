import { AppError } from "../../common/errors";
import { compile, DatasetLookup } from "../../analytics/domain/engine/compile";
import { QueryError } from "../../analytics/domain/types";
import { validateQuerySpec } from "../../analytics/domain/validation";
import { NewReport } from "../domain/report-repository.port";
import { REPORT_CATEGORIES, ReportCategory, VISUALIZATIONS, Visualization } from "../domain/report-definition";

const DRY_RUN_CTX = { tenantId: "000000000000000000000000", userId: "000000000000000000000000" };

/**
 * Valida o corpo de criação/edição de um relatório personalizado e devolve a
 * definição limpa. A spec é compilada contra o catálogo (sem rodar) — relatório
 * salvo sempre executa. Período e fuso são descartados: vêm do recorte na hora.
 */
export function validateReportInput(
  body: unknown,
  catalog: DatasetLookup,
  author: { id: string; name: string },
): Omit<NewReport, "code"> & { code: string } {
  const b = (typeof body === "object" && body !== null ? body : {}) as Record<string, unknown>;
  const errors: string[] = [];

  const name = typeof b.name === "string" ? b.name.trim() : "";
  if (name.length < 2 || name.length > 80) errors.push("O nome precisa ter entre 2 e 80 caracteres.");

  const category = b.category as ReportCategory;
  if (!REPORT_CATEGORIES.includes(category)) errors.push(`Categoria deve ser uma de: ${REPORT_CATEGORIES.join(", ")}.`);

  const visualization = b.visualization as Visualization;
  if (!VISUALIZATIONS.includes(visualization)) errors.push(`Visualização deve ser uma de: ${VISUALIZATIONS.join(", ")}.`);

  const description = typeof b.description === "string" ? b.description.trim() : "";
  if (description.length > 240) errors.push("A descrição aceita até 240 caracteres.");

  const { errors: specErrors, spec } = validateQuerySpec(b.spec);
  errors.push(...specErrors.map((e) => `spec: ${e}`));

  if (errors.length || !spec) throw new AppError("invalid", "Relatório inválido.", errors);

  const { timezone: _tz, timeDimension, ...rest } = spec;
  const saved = {
    ...rest,
    ...(timeDimension
      ? {
          timeDimension: {
            dimension: timeDimension.dimension,
            ...(timeDimension.granularity ? { granularity: timeDimension.granularity } : {}),
          },
        }
      : {}),
  };

  try {
    compile(saved, DRY_RUN_CTX, catalog, { defaultTimezone: "UTC" });
  } catch (error) {
    if (error instanceof QueryError) {
      throw new AppError("invalid", error.message, error.available ? [`Disponíveis: ${error.available.join(", ")}`] : undefined);
    }
    throw error;
  }

  const dataset = catalog.get(saved.dataset)!;
  const usesPeriod = Boolean(dataset.defaultTimeDimension);
  const code = (name.normalize("NFD").replace(/[^A-Za-z]/g, "").slice(0, 2) || "RP").toUpperCase();

  return {
    code,
    name,
    category,
    description: description || `${dataset.title}: ${saved.measures.map((m) => dataset.measures[m].title.toLowerCase()).join(", ")}.`,
    visualization,
    spec: saved,
    kpis: { measures: saved.measures.filter((m) => dataset.measures[m].kind !== "min" && dataset.measures[m].kind !== "max").slice(0, 4) },
    trend: usesPeriod ? { measure: saved.measures[0] } : null,
    usesPeriod,
    createdBy: author,
  };
}
