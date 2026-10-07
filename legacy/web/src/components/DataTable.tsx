import { useEffect, useState } from "react";
import { formatCell } from "../lib/format";
import type { QueryResult } from "../lib/types";

const PAGE = 12;

/** Tabela genérica: colunas, títulos e formatos vêm da anotação da API. */
export function DataTable(props: {
  result: QueryResult;
  maskPii: boolean;
  totals?: Record<string, unknown> | null;
  dense?: boolean;
  pageSize?: number;
}) {
  const { result, maskPii, totals } = props;
  const size = props.pageSize ?? PAGE;
  const [page, setPage] = useState(1);
  const pages = Math.max(1, Math.ceil(result.data.length / size));
  useEffect(() => setPage(1), [result]);
  const rows = result.data.slice((page - 1) * size, page * size);
  const isNum = (c: string) => result.annotation[c]?.type !== "string";

  return (
    <>
      <div className="table-wrap">
        <table className={`data${props.dense ? " dense" : ""}`}>
          <thead>
            <tr>
              {result.columns.map((c) => (
                <th key={c} scope="col" className={isNum(c) ? "right" : undefined}>
                  {result.annotation[c]?.title ?? c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={i}>
                {result.columns.map((c, j) => (
                  <td key={c} className={[j === 0 ? "first" : "", isNum(c) ? "right num" : ""].join(" ").trim() || undefined}>
                    {formatCell(row[c], result.annotation[c], maskPii)}
                  </td>
                ))}
              </tr>
            ))}
            {totals && (
              <tr className="total">
                {result.columns.map((c, j) => {
                  const col = result.annotation[c];
                  const isMeasure = c in totals;
                  return (
                    <td key={c} className={isNum(c) ? "right num" : undefined}>
                      {j === 0 ? "Total" : isMeasure ? formatCell(totals[c], col, maskPii) : ""}
                    </td>
                  );
                })}
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {pages > 1 && (
        <div className="table-foot">
          Página {page} de {pages} · {result.data.length.toLocaleString("pt-BR")} linhas
          <span className="end">
            <button type="button" className="btn" disabled={page === 1} onClick={() => setPage(page - 1)}>Anterior</button>
            <button type="button" className="btn" disabled={page === pages} onClick={() => setPage(page + 1)}>Próxima</button>
          </span>
        </div>
      )}
    </>
  );
}
