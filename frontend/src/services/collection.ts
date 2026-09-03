/* psygames-collection · VER 1 · 03.09.2026 */
/**
 * СУНДУК И КОЛЛЕКЦИЯ — ДОЛГАЯ ЦЕЛЬ, ВИДИМАЯ ВСЕГДА (задача 6e564484, шаг 3).
 *
 * 🔴 ЗАЧЕМ. У нас мета-слой богаче эталона по составу — лиги, ранги, титулы,
 * рамки, магазин на 36 позиций, календарь серии, — и при этом ни одна из этих
 * вещей не отвечает на вопрос «к чему я иду». Ранг вырастет — это не предмет.
 * У эталона ответ предметный: сундук ⭐446/2000 открывается в витрину 0/12
 * фигурок, и двенадцать силуэтов на полках заполняются по одному.
 *
 * 🔴 СЧИТАЕМ ЗАРАБОТАННОЕ ЗА ВСЁ ВРЕМЯ, А НЕ ОСТАТОК НА СЧЕТУ. Это главное
 * решение здесь, и его легко испортить «упрощением». Если сундук смотрит на
 * баланс, то любая покупка в магазине двигает долгую цель НАЗАД: игрок наказан
 * за то, что пользуется валютой, и цель перестаёт быть целью. Заработанное
 * только растёт — тратить можно свободно, коллекция не страдает.
 *
 * ⚠️ ВТОРОЙ ИСТОЧНИК ПРАВДЫ ЗАВЕДЁН НАРОЧНО, и вот почему это не противоречит
 * правилу из `earn.ts` («квота считается по журналу, а не отдельным счётчиком»).
 * Журнал начислений подрезается: подробности живут два дня, метки дней — 60.
 * Заработанное за всё время из него не восстановить в принципе. Счётчик здесь —
 * не копия журнала, а величина, которой в журнале нет.
 *
 * ⚠️ У КОГО УЖЕ ЕСТЬ ЗВЁЗДЫ — счётчик не начинается с нуля. При первом чтении он
 * поднимается до текущего баланса: если на счету 900, значит заработано было по
 * меньшей мере 900. Иначе игрок с большим стажем увидел бы «⭐0/150» и решил, что
 * его прогресс потеряли.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getTokens } from '@/src/services/tokens';

const KEY = 'psygames_earned_total_v1';

export interface Figure {
  /** Ключ фигурки: он же ключ словаря `figure<Ключ>` и имя в витрине. */
  key: string;
  /** Сколько звёзд надо заработать ЗА ВСЁ ВРЕМЯ, чтобы силуэт стал фигуркой. */
  at: number;
  /** Значок-заглушка до появления рисованных фигурок. */
  face: string;
}

/**
 * Двенадцать ступеней. Первая нарочно дешёвая (≈ один заход): цель обязана
 * доказать себя в первый же вечер, иначе она читается как декорация. Дальше шаг
 * растёт РОВНО, около ×1,37 и никогда круче ×1,5 — иначе к середине витрина
 * встаёт, и собранные фигурки перестают предсказывать следующую.
 *
 * ⚠️ Первый набор порогов (150·400·800·1400…) это правило нарушал на втором и
 * третьем шаге (×1,67 и ×1,6), и поймала это проба, а не глаз. Правились ДАННЫЕ,
 * а не проба: ослабить условие было бы способом не увидеть провал.
 *
 * 📍 Масштаб взят от экономики, а не с потолка: партия даёт до 50 звёзд
 * (`TOKEN_DELTA_CAP`), с множителем до 100; заход из пяти партий — 150–250.
 * Значит первая фигурка — один вечер, последняя — примерно сотня заходов.
 */
export const FIGURES: readonly Figure[] = [
  { key: 'Seed',      at: 150,   face: '🌱' },   // +150
  { key: 'Pebble',    at: 350,   face: '🪨' },   // +200  ×1,33
  { key: 'Shell',     at: 640,   face: '🐚' },   // +290  ×1,45
  { key: 'Feather',   at: 1020,  face: '🪶' },   // +380  ×1,31
  { key: 'Lantern',   at: 1550,  face: '🏮' },   // +530  ×1,39
  { key: 'Key',       at: 2270,  face: '🗝️' },   // +720  ×1,36
  { key: 'Compass',   at: 3260,  face: '🧭' },   // +990  ×1,38
  { key: 'Hourglass', at: 4620,  face: '⏳' },   // +1360 ×1,37
  { key: 'Crystal',   at: 6480,  face: '💎' },   // +1860 ×1,37
  { key: 'Owl',       at: 9030,  face: '🦉' },   // +2550 ×1,37
  { key: 'Moon',      at: 12500, face: '🌙' },   // +3470 ×1,36
  { key: 'Star',      at: 17300, face: '⭐' },   // +4800 ×1,38
] as const;

export interface ChestState {
  /** Заработано за всё время. */
  earned: number;
  /** Сколько фигурок уже собрано. */
  have: number;
  /** Следующая фигурка или `null`, если собраны все. */
  next: Figure | null;
  /** Сколько звёзд до следующей фигурки; `0`, когда собрано всё. */
  left: number;
  /** Заполненность текущей ступени, 0…1 — для полоски. */
  ratio: number;
}

/**
 * Состояние сундука по заработанному. Чистая функция: её проверяют без
 * хранилища, и она же считает то, что рисуется на экране.
 */
export function chestState(earned: number): ChestState {
  const e = Number.isFinite(earned) ? Math.max(0, Math.floor(earned)) : 0;
  const have = FIGURES.filter((f) => e >= f.at).length;
  const next = FIGURES[have] ?? null;
  if (!next) return { earned: e, have, next: null, left: 0, ratio: 1 };
  const с = have === 0 ? 0 : FIGURES[have - 1].at;   // низ текущей ступени
  const пройдено = e - с;
  const ширина = next.at - с;
  return {
    earned: e,
    have,
    next,
    left: next.at - e,
    ratio: ширина > 0 ? Math.min(1, Math.max(0, пройдено / ширина)) : 1,
  };
}

/** Открылась ли новая фигурка при переходе от `было` к `стало`. */
export function figureUnlocked(было: number, стало: number): Figure | null {
  const a = chestState(было).have;
  const b = chestState(стало).have;
  return b > a ? FIGURES[b - 1] : null;
}

type Хранилище = Record<string, number>;

async function читать(): Promise<Хранилище> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    const v = raw ? JSON.parse(raw) : {};
    return v && typeof v === 'object' ? v as Хранилище : {};
  } catch { return {}; }
}

/**
 * Заработано за всё время. При первом обращении поднимается до текущего баланса —
 * см. заголовок файла: стаж не должен обнуляться появлением этой величины.
 */
export async function earnedTotal(profileId: string): Promise<number> {
  if (!profileId) return 0;
  const все = await читать();
  const есть = все[profileId];
  if (typeof есть === 'number' && есть >= 0) return есть;
  const баланс = await getTokens(profileId).catch(() => 0);
  const старт = Math.max(0, Math.floor(баланс || 0));
  все[profileId] = старт;
  AsyncStorage.setItem(KEY, JSON.stringify(все)).catch(() => {});
  return старт;
}

/** Прибавить заработанное. Величина только растёт: отрицательное игнорируется. */
export async function addEarned(profileId: string, delta: number): Promise<number> {
  if (!profileId || !Number.isFinite(delta) || delta <= 0) return earnedTotal(profileId);
  const было = await earnedTotal(profileId);
  const все = await читать();
  const стало = было + Math.round(delta);
  все[profileId] = стало;
  AsyncStorage.setItem(KEY, JSON.stringify(все)).catch(() => {});
  return стало;
}
