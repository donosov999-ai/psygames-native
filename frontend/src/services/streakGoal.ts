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
import AsyncStorage from '@react-native-async-storage/async-storage';
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
  /**
   * 🔴 ДЕНЬ ПОСЛЕДНЕГО ПОКАЗА ОКНА — ОТДЕЛЬНО ОТ `goal.askedAt`, и это не дубль.
   *
   * `goal.askedAt` живёт ВНУТРИ цели и отвечает за недельный ритм. Но два самых
   * частых повода — «цели ещё нет» и «серия оборвалась» — наступают, когда цели
   * либо нет вовсе, либо её `askedAt` до повода не касается. Их ничто не
   * ограничивало, а `useFocusEffect` на главной перечитывает повод при КАЖДОМ
   * возврате — из игры, из настроек, из магазина. Человек, закрывший окно,
   * получал его снова через десять секунд, и так весь день.
   *
   * Поймано разбором вызова, а не пробой: пробы гоняли чистую функцию, где
   * «каждый возврат на главную» не воспроизводится в принципе. Отсюда и правило:
   * потолок частоты живёт В ЯДРЕ, а не в экране, иначе следующий экран заведёт
   * его заново или забудет.
   */
  lastAskedAt?: string | null;
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
  /*
   * 🔴 ПОТОЛОК: ОДИН ПОКАЗ В СУТКИ, БЕЗ ИСКЛЮЧЕНИЙ ДЛЯ ХОРОШИХ ПОВОДОВ.
   *
   * Соблазн был пропустить сюда `reached` — момент радостный, чего его копить.
   * Но человек может закрыть и радостное окно, а `reachedAt` остаётся стоять, и
   * тогда «Дошёл! Ставим следующую?» возвращалось бы при каждом заходе на
   * главную до тех пор, пока он не выберет. Исключение из правила про
   * назойливость само становится назойливостью — поэтому правило одно на все
   * четыре повода.
   *
   * ⚠️ Это ПОТОЛОК, а не замена `ASK_EVERY_DAYS`. Тот — ПОЛ: «не реже раза в
   * неделю» (требование Дениса). Здесь — «не чаще раза в сутки». Границы разные
   * и обе нужны: без пола цель забывается, без потолка приложение выпрашивает.
   */
  if (i.lastAskedAt === today) return null;
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

// ── хранение ─────────────────────────────────────────────────────────────────

/**
 * ⚠️ КЛЮЧ С ПРОФИЛЕМ, как у дневной цели. Профили в приложении переключаются, и
 * общий ключ показал бы цель одного человека другому — на этом уже обжигались
 * (`dayGoalKey` в dailyGoal.ts заведён по той же причине).
 */
const GOAL_PREFIX = 'psygames_streak_goal_';

export function streakGoalKey(profileId: string): string { return GOAL_PREFIX + profileId; }

/**
 * Отдельный ключ «когда окно показывали» — он нужен и тогда, когда цели ещё нет,
 * то есть ровно в том случае, где хранить эту дату внутри цели негде.
 */
const ASKED_PREFIX = 'psygames_streak_goal_asked_';

export function goalAskedKey(profileId: string): string { return ASKED_PREFIX + profileId; }

/** День последнего показа окна (`dayKey`) или null, если ни разу не показывали. */
export async function loadGoalAskedAt(profileId: string): Promise<string | null> {
  try { return await AsyncStorage.getItem(goalAskedKey(profileId)); } catch { return null; }
}

/** Отметить показ. Зовётся и при выборе, и при «Не сейчас» — окно всё равно было. */
export async function saveGoalAskedAt(profileId: string, now: Date = new Date()): Promise<void> {
  try { await AsyncStorage.setItem(goalAskedKey(profileId), dayKey(now)); } catch {}
}

/**
 * 🔴 ОДНА ФУНКЦИЯ НА ОБА ИСХОДА ОКНА — И «ВЫБРАЛ», И «НЕ СЕЙЧАС».
 *
 * Отметок две: недельный ритм внутри цели (`askedAt`) и суточный потолок
 * снаружи (отдельный ключ). Держать их в паре обязано ядро, а не экран: пока
 * это были два вызова в двух обработчиках, забыть один было делом одной правки —
 * и именно так дефект и выглядел до 07.09.2026, когда снаружи не отмечалось
 * ничего и окно возвращалось при каждом заходе на главную.
 *
 * Возвращает обновлённую цель (или null, если цели ещё нет) — экрану остаётся
 * положить её в состояние.
 */
export async function rememberAsked(
  profileId: string, goal: StreakGoal | null, now: Date = new Date(),
): Promise<StreakGoal | null> {
  await saveGoalAskedAt(profileId, now);
  if (!goal) return null;
  const next = markAsked(goal, now);
  await saveStreakGoal(profileId, next);
  return next;
}

/** Цель профиля или null. Битую запись отдаём как «цели нет», а не роняем экран. */
export async function loadStreakGoal(profileId: string): Promise<StreakGoal | null> {
  try {
    const raw = await AsyncStorage.getItem(streakGoalKey(profileId));
    if (!raw) return null;
    const rec = JSON.parse(raw) as StreakGoal;
    if (!rec || typeof rec.days !== 'number' || typeof rec.startedAt !== 'string') return null;
    // `reachedAt` появилось позже первой редакции: у ранних записей его нет, и
    // без этой строки они читались бы как «поле потеряно», а не «ещё не дошёл».
    return { ...rec, reachedAt: rec.reachedAt ?? null };
  } catch { return null; }
}

export async function saveStreakGoal(profileId: string, goal: StreakGoal): Promise<void> {
  try { await AsyncStorage.setItem(streakGoalKey(profileId), JSON.stringify(goal)); } catch {}
}
