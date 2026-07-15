export function sortBuilder(field: string, order: "asc" | "desc" = "asc") {
  return { field, order };
}

export type SortRule = { field: string; order: "asc" | "desc" };
