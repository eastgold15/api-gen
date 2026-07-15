export function calcPage(page: number, limit: number) {
  return (page - 1) * limit;
}

export type PageOpt = { page?: number; limit?: number };
