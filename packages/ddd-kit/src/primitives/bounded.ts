export async function mapBounded<T, R>(
  items: readonly T[],
  limit: number,
  work: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = [];
  const queue = items.entries();

  const lane = async () => {
    for (const [index, item] of queue) results[index] = await work(item);
  };

  const lanes = await Promise.allSettled(
    Array.from({ length: Math.min(limit, items.length) }, lane),
  );
  const failed = lanes.find((settled) => settled.status === "rejected");
  if (failed) throw failed.reason;

  return results;
}
