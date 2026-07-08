import { SupabaseClient } from '@supabase/supabase-js'

type QueryBuilder = ReturnType<SupabaseClient['from']> extends infer T
  ? T extends { select: (...args: any[]) => any }
    ? any
    : never
  : never

/**
 * Fetches all rows from a Supabase query builder, bypassing the 1000-row
 * default PostgREST cap by looping through pages until a page returns < 1000
 * rows. The query builder should NOT have .range() applied — this helper adds
 * it on each iteration.
 */
export async function fetchAllRows<T = any>(
  buildQuery: () => any,
): Promise<T[]> {
  const PAGE_SIZE = 1000
  let offset = 0
  const all: T[] = []

  while (true) {
    const { data, error } = await buildQuery().range(offset, offset + PAGE_SIZE - 1)
    if (error) throw error
    if (!data || data.length === 0) break
    all.push(...(data as T[]))
    if (data.length < PAGE_SIZE) break
    offset += PAGE_SIZE
  }

  return all
}
