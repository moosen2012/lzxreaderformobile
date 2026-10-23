/**
 * 带并发上限的批量异步执行。
 * 目录导入之前是 for + await 串行读文件，200 个文件要排队一个个读；
 * 改成小并发池可以明显缩短导入等待时间，同时不至于把 IO 打满。
 */
export async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  worker: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  if (items.length === 0) return [];

  const results: R[] = new Array(items.length);
  let cursor = 0;

  const run = async () => {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await worker(items[index], index);
    }
  };

  const runners = Array.from({ length: Math.min(Math.max(1, limit), items.length) }, run);
  await Promise.all(runners);

  return results;
}
