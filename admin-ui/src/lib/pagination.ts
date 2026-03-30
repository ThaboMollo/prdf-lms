export type PaginationResult<T> = {
  page: number
  pageSize: number
  totalItems: number
  totalPages: number
  items: T[]
}

export function parsePageParam(value: string | null, defaultPage = 1): number {
  if (!value) return defaultPage
  const parsed = Number.parseInt(value, 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : defaultPage
}

export function paginateItems<T>(items: T[], page: number, pageSize: number): PaginationResult<T> {
  const totalItems = items.length
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize))
  const safePage = Math.min(Math.max(1, page), totalPages)
  const start = (safePage - 1) * pageSize
  const end = start + pageSize

  return {
    page: safePage,
    pageSize,
    totalItems,
    totalPages,
    items: items.slice(start, end)
  }
}
