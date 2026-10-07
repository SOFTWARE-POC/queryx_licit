import { validateQuerySpec } from "./validation";

describe("validateQuerySpec", () => {
  it("aceita uma spec completa e devolve cópia só com campos conhecidos", () => {
    const body = {
      dataset: "service_orders",
      measures: ["order_count"],
      dimensions: ["status"],
      timeDimension: { dimension: "date_init", granularity: "week", range: ["2026-09-01", "2026-09-30"] },
      filters: [{ dimension: "status", operator: "equals", values: ["PENDENTE"] }],
      order: [["order_count", "desc"]],
      limit: 10,
    };
    const { errors, spec } = validateQuerySpec(body);
    expect(errors).toEqual([]);
    expect(spec).toEqual(body);
    expect(spec).not.toBe(body);
  });

  it.each([
    [{ measures: ["x"] }, "'dataset'"],
    [{ dataset: "x", measures: [] }, "'measures'"],
    [{ dataset: "x", measures: ["a", "a"] }, "repetidos"],
    [{ dataset: "x", measures: ["$where"] }, "'measures'"],
    [{ dataset: "x", measures: ["a"], company: "outra" }, "desconhecido"],
    [{ dataset: "x", measures: ["a"], filters: [{ dimension: "s", operator: "$regex" }] }, "operator"],
    [{ dataset: "x", measures: ["a"], filters: [{ dimension: "s", operator: "equals", values: [{ $gt: "" }] }] }, "values"],
    [{ dataset: "x", measures: ["a"], timeDimension: { dimension: "d", range: ["ontem", "hoje"] } }, "range"],
    [{ dataset: "x", measures: ["a"], order: [["a", "sideways"]] }, "'order'"],
    [{ dataset: "x", measures: ["a"], limit: 1.5 }, "'limit'"],
  ])("rejeita %j", (body, fragment) => {
    const { errors, spec } = validateQuerySpec(body);
    expect(spec).toBeUndefined();
    expect(errors.join(" ")).toContain(fragment);
  });
});
