export function formatDate(date: Date) {
  return date.toISOString();
}

export function parseId(id: string) {
  return parseInt(id, 10);
}

export type ApiResult<T> = { data: T; error?: string };
