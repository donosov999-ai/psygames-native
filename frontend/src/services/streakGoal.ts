/* psygames-streak-goal · VER 1 · 07.09.2026 */
/**
 * ЦЕЛЬ — СКОЛЬКО ДНЕЙ ПОДРЯД. ВЫБИРАЕТСЯ ОДНИМ ТАПОМ.
 *
 * 🔴 ЗАЧЕМ. До сих пор единственное, что называлось целью, — карточка со
 * СВОБОДНЫМ ТЕКСТОМ («ради чего сегодня», `dailyGoal.ts`). Денис 07.09.2026:
 * «она строчкой, которую не каждый откроет, и каждый поймёт, что туда писать».
 * Ввод текста — барьер; тап — нет. Образец взят у Duolingo: одно окно, три
 * варианта, ноль клавиатуры.
 *
 * ⚠️ ЭТО НЕ ЗАМЕНА КАРТОЧКИ «ЗАЧЕМ СЕГОДНЯ». Они отвечают на разные вопросы:
 * та — «ради чего сегодня», эта — «насколько всерьёз». Слово «Цель» решением
 * Дениса отдано этой, та переименована в «Зачем сегодня»; её замысел (описан в
 * шапке `dailyGoal.ts`) остаётся верным и не тронут.
 *
 * 🔴 ЧЕГО ЗДЕСЬ НЕТ — ОБЕЩАНИЙ. У Duolingo над выбором написано «ваши шансы
 * пройти курс вырастут в 2 раза». У нас такого замера НЕТ ни в каком виде, и
 * выдуманная цифра на первом экране обесценивает всё, что стоит рядом. Решение
 * Дениса: ничего не обещать, просто назвать цель. Поэтому в этом файле нет ни
 * одной строки-обещания, а гейт следит, чтобы она не завелась.
 *
 * ⚠️ ДНИ, А НЕ «РАЗЫ В НЕДЕЛЮ». Разы держать легче, но вся инфраструктура уже
 * считает ДНИ: `streakFromDays` (earn.ts), щит серии, четыре достижения,
 * календарь серии, ×2 от трёх дней подряд. Второй счётчик рядом с работающим —
 * та самая копия, которая расходится молча. Мягкость даёт щит: он прощает
 * пропуск, и это дешевле новой сущности.
 */
import { DAY_GOAL_REWARD, dayKey } from '@/src/services/earn';

/** Три варианта обязательства. Ровно те, что видит человек. */
export const GOAL_DAYS = [7, 14, 30] as const;
export type GoalDays = (typeof GOAL_DAYS)[number];

export interface StreakGoal {
  days: GoalDays;
  /** Календарный день начала (`dayKey`). */
  startedAt: string;
  /** Календарный день, когда окно показывали последний раз. */
  askedAt: string;
  /**
   * 🔴 День, когда цель БЫЛА достигнута. Без этого поля достижение теряется.
   *
   * Найдено контрпробой 07.09.2026, а не рассуждением. Человек отходил семь
   * дней подряд — цель взята. Если он не открыл приложение в тот же день и
   * серия оборвалась, `streak` уже 0, и вычисление «достигнута ли» по ТЕКУЩЕЙ
   * серии даёт «нет». Он получил бы «ты сорвался» вместо «ты дошёл», а награду
   * не увидел бы никогда.
   * Поэтому достижение ФИКСИРУЕТСЯ, а не вычисляется каждый раз заново.
   */
  reachedAt: string | null;
}

/**
 * 🔴 НЕ РЕЖЕ РАЗА В НЕДЕЛЮ — прямое требование Дениса 07.09.2026.
 * Даже если человек взял 30 дней, окно приходит раз в неделю: цель, о которой
 * месяц не вспоминали, перестаёт быть целью и становится записью в хранилище.
 */
export const ASK_EVERY_DAYS = 7;

/** Почему окно показывается. Наружу — чтобы питомец сказал уместное, а не общее. */
export type AskReason = 'first' | 'broken' | 'reached' | 'weekly';

/** Сколько календарных дней прошло между двумя `dayKey`. */
export function daysBetween(from: string, to: string): number {
  const parse = (k: string) => {
    const [y, m, d] = k.split('-').map(Number);
    return new Date(y, m - 1, d).getTime();
  };
  const ms = parse(to) - parse(from);
  return Math.round(ms / 86400000);
}

export interface AskInput {
  goal: StreakGoal | null;
  /** Текущая серия из `streakFromDays`. */
  streak: number;
  now?: Date;
}

/**
 * Пора ли показать окно и почему. Чистая функция: её и проверяет гейт.
 *
 * 🔴 ПОРЯДОК ЗДЕСЬ ЗНАЧИМ — но не там, где я сначала подумал. Сравнение
 * `streak >= days` и `streak === 0` взаимоисключающи (days ≥ 7), и их порядок
 * не решает ничего; контрпроба это и показала, не покраснев на перестановке.
 * Значим порядок ЗАФИКСИРОВАННОГО достижения: `reachedAt` проверяется первым,
 * иначе человек, дошедший до срока и не открывший приложение в тот день,
 * получит «сорвался» вместо «дошёл». Разбор — у поля `reachedAt`.
 */
export function askReason(i: AskInput): AskReason | null {
  const now = i.now ?? new Date();
  const today = dayKey(now);
  if (!i.goal) return 'first';
  if (i.goal.reachedAt) return 'reached';
  if (i.streak >= i.goal.days) return 'reached';
  if (i.streak === 0) return 'broken';
  if (daysBetween(i.goal.askedAt, today) >= ASK_EVERY_DAYS) return 'weekly';
  return null;
}

/**
 * Заметить достижение и запомнить его. Зовётся при каждом заходе, до `askReason`.
 * Повторный вызов ничего не меняет: день достижения ставится один раз.
 */
export function noticeReached(goal: StreakGoal, streak: number, now: Date = new Date()): StreakGoal {
  if (goal.reachedAt || streak < goal.days) return goal;
  return { ...goal, reachedAt: dayKey(now) };
}

export interface GoalProgress {
  /** Дней пройдено в счёт цели (не больше самой цели). */
  done: number;
  left: number;
  reached: boolean;
}

export function goalProgress(goal: StreakGoal | null, streak: number): GoalProgress | null {
  if (!goal) return null;
  const done = Math.min(streak, goal.days);
  return { done, left: Math.max(0, goal.days - done), reached: streak >= goal.days };
}

export interface GoalReward {
  tokens: number;
  /** Щит серии прощает один пропуск. Он уже есть: abilities.ts, `streak_shield`. */
  shield: boolean;
}

/**
 * НАГРАДА ЗА ДОСТИГНУТУЮ ЦЕЛЬ. Решение Дениса: щит серии + токены лестницей.
 *
 * 🔴 ЧИСЛО ПРИВЯЗАНО К КОНСТАНТЕ ЭКОНОМИКИ, А НЕ НАПИСАНО ЛИТЕРАЛОМ — по той же
 * причине, что и `DAY_GOAL_REWARD` (разбор в шапке earn.ts): литерал переживёт
 * правку экономики МОЛЧА и однажды сделает отметку выгоднее игры.
 *
 * Масштаб проверен по тому же разбору: обычный день ≈ 320 ⭐ за 10 партий. За
 * тридцать дней человек зарабатывает порядка 9600 ⭐, а цель даёт 750 — около
 * 8 %, ровно как дневная цель составляет 8–14 % дня. То есть сыграть
 * по-прежнему выгоднее, чем дойти до срока.
 */
export function goalReward(days: GoalDays, base: number = DAY_GOAL_REWARD): GoalReward {
  return { tokens: days * base, shield: true };
}

/** Новая цель начинается сегодня и сегодня же считается спрошенной. */
export function startGoal(days: GoalDays, now: Date = new Date()): StreakGoal {
  const today = dayKey(now);
  return { days, startedAt: today, askedAt: today, reachedAt: null };
}

/**
 * Отметить, что окно показали. Цель при этом НЕ перезапускается: человек мог
 * закрыть окно, ничего не выбрав, и его серия от этого не должна пострадать.
 */
export function markAsked(goal: StreakGoal, now: Date = new Date()): StreakGoal {
  return { ...goal, askedAt: dayKey(now) };
}
