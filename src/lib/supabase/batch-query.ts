/**
 * Supabase .in() 쿼리는 ID가 많으면 URI too long 에러 발생.
 * 100개씩 배치로 나눠 조회 후 합침.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function batchIn<T = any>(
  queryFn: (ids: string[]) => PromiseLike<{ data: T[] | null; error: unknown }>,
  allIds: string[],
  batchSize = 100,
): Promise<T[]> {
  if (allIds.length === 0) return [];
  const results: T[] = [];
  for (let i = 0; i < allIds.length; i += batchSize) {
    const batch = allIds.slice(i, i + batchSize);
    const { data } = await queryFn(batch);
    if (data) results.push(...data);
  }
  return results;
}
