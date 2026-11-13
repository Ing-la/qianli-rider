export interface BestEntry {
  score: number;
  time: number;
  date: string;
}

const KEY = 'qianli_best_v1';

export function loadBests(): BestEntry[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((e): e is BestEntry => typeof e?.score === 'number' && typeof e?.time === 'number')
      .slice(0, 5);
  } catch {
    return [];
  }
}

export function saveBest(entry: BestEntry): BestEntry[] {
  const list = loadBests();
  list.push(entry);
  list.sort((a, b) => b.score - a.score);
  const top = list.slice(0, 5);
  try {
    localStorage.setItem(KEY, JSON.stringify(top));
  } catch {
    /* storage may be disabled */
  }
  return top;
}

export function bestScore(): number {
  const list = loadBests();
  return list.length ? list[0].score : 0;
}
