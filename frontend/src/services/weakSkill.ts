/* psygames-weak-skill · VER 1 · 04.09.2026 */
/**
 * СЛАБОЕ МЕСТО ПО ЕЖЕДНЕВНОЙ ЗАРЯДКЕ — ЗАПАСНОЙ ИСТОЧНИК ДЛЯ СОВЕТА.
 *
 * 🔴 ЗАЧЕМ, ЕСЛИ `weakestDomainGame` УЖЕ ЕСТЬ. Тот считает по ОЦЕНКЕ — формальному
 * тесту с z-баллами, который проходят раз в три месяца, и молчит, пока оценки нет
 * или пока просадка мельче −0,5 z. То есть основание «здесь пока слабее всего» в
 * блоке «рекомендуем сегодня» почти всегда не участвует.
 *
 * Разбор зарядки (`warmupBreakdown`) считается ПОСЛЕ КАЖДОЙ зарядки и отвечает на
 * тот же вопрос по свежим данным. Он не заменяет оценку — у неё нормы и z-баллы, —
 * а подставляется, когда ей сказать нечего.
 *
 * ⚠️ ТРИ УСЛОВИЯ, БЕЗ КОТОРЫХ СОВЕТ СТАНОВИТСЯ ВРАНЬЁМ.
 *  1. СВЕЖЕСТЬ. Просадка недельной давности — не сегодняшнее слабое место.
 *     Запись протухает, и лучше промолчать, чем советовать по старому.
 *  2. ПОРОГ. Разбор уже отсекает колебания меньше 8% — сюда попадает только то,
 *     что он назвал провалом. Своего порога здесь нет и быть не должно: два
 *     порога в двух местах разъезжаются.
 *  3. РАЗРЕШЕНО ПРОФИЛЮ. Совет играть в закрытое профилю упражнение — это совет
 *     упереться в стену.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { GAMES } from '@/src/constants/games';
import type { Разбор } from '@/src/services/warmupBreakdown';

const КЛЮЧ = 'psygames_weak_skill_v1';
/** Сколько дней запись считается свежей. */
export const СВЕЖЕСТЬ_ДНЕЙ = 7;

export interface СлабоеМесто {
  skillKey: string;
  /** Отклонение в процентах, отрицательное. */
  delta: number;
  /** Когда снято, YYYY-MM-DD. */
  date: string;
}

function ключДня(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Запомнить слабое место из разбора зарядки. Нет провала — стираем прошлую запись. */
export async function saveWeakSkill(разбор: Разбор, now: Date = new Date()): Promise<void> {
  try {
    if (!разбор.худший) { await AsyncStorage.removeItem(КЛЮЧ); return; }
    const запись: СлабоеМесто = {
      skillKey: разбор.худший.skillKey,
      delta: разбор.худший.delta,
      date: ключДня(now),
    };
    await AsyncStorage.setItem(КЛЮЧ, JSON.stringify(запись));
  } catch { /* хранилище недоступно — совет просто не появится */ }
}

/** Прочитать, если запись свежая. Протухшую стираем, чтобы не советовать по старому. */
export async function loadWeakSkill(now: Date = new Date()): Promise<СлабоеМесто | null> {
  try {
    const raw = await AsyncStorage.getItem(КЛЮЧ);
    if (!raw) return null;
    const з = JSON.parse(raw) as СлабоеМесто;
    if (!з?.skillKey || !з?.date) return null;
    const дней = Math.floor((now.getTime() - new Date(`${з.date}T00:00:00`).getTime()) / 86400000);
    if (!Number.isFinite(дней) || дней < 0 || дней > СВЕЖЕСТЬ_ДНЕЙ) {
      await AsyncStorage.removeItem(КЛЮЧ);
      return null;
    }
    return з;
  } catch { return null; }
}

/**
 * Какое упражнение назвать по слабому месту.
 *
 * @param разрешено какие игры открыты профилю (id)
 * @param сыгранныеСегодня чтобы не советовать то, что уже сделано
 */
export function gameForWeakSkill(
  место: СлабоеМесто | null,
  разрешено: ReadonlySet<string>,
  сыгранныеСегодня: ReadonlySet<string> = new Set(),
): string | null {
  if (!место) return null;
  const кандидаты = GAMES.filter((g) => g.skillKey === место.skillKey
    && !g.sandbox
    && !g.hub                        // советуем упражнение, а не меню — см. recommend.ts
    && разрешено.has(g.id)
    && !сыгранныеСегодня.has(g.id));
  if (!кандидаты.length) return null;
  // Ровно один и всегда один и тот же при том же входе: совет не должен прыгать
  // между кадрами. Порядок каталога — стабильный ключ.
  return кандидаты[0]!.id;
}
