import type { GameResultData, GameSlug } from '../types';

export interface StoredRun {
  id: string;
  at: string;
  score: number;
  primary: string;
  errors?: number;
}

const runKey = (slug: GameSlug) => `psygames-mini:${slug}:runs`;

export function loadRuns(slug: GameSlug): StoredRun[] {
  try {
    return JSON.parse(localStorage.getItem(runKey(slug)) ?? '[]') as StoredRun[];
  } catch {
    return [];
  }
}

export function saveRun(slug: GameSlug, result: GameResultData): StoredRun[] {
  const next: StoredRun[] = [
    {
      id: globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`,
      at: new Date().toISOString(),
      score: result.score,
      primary: result.primary,
      errors: result.errors,
    },
    ...loadRuns(slug),
  ].slice(0, 50);
  localStorage.setItem(runKey(slug), JSON.stringify(next));
  return next;
}

export function currentStreak(slug: GameSlug): number {
  const days = new Set(loadRuns(slug).map((run) => run.at.slice(0, 10)));
  let streak = 0;
  const cursor = new Date();
  while (days.has(cursor.toISOString().slice(0, 10))) {
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

export function recordLocalEvent(name: string, payload: Record<string, unknown> = {}) {
  const key = 'psygames-mini:events';
  try {
    const events = JSON.parse(localStorage.getItem(key) ?? '[]') as unknown[];
    events.push({ name, payload, at: new Date().toISOString() });
    localStorage.setItem(key, JSON.stringify(events.slice(-500)));
  } catch {
    localStorage.setItem(key, JSON.stringify([{ name, payload, at: new Date().toISOString() }]));
  }
  window.dispatchEvent(new CustomEvent('psygames:analytics', { detail: { name, payload } }));
}
