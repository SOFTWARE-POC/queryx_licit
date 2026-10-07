import { Lookup } from "../types";

/** Nome do usuário pelo id — 1:1, então o join roda depois do $group. */
export const userName = (localField: string, as: string): Lookup => ({
  from: "users",
  localField,
  foreignField: "_id",
  as,
  fields: ["name"],
  late: true,
});
