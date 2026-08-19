/* psygames-daily-goal · VER 1 · 20.08.2026 */
/**
 * ЦЕЛЬ ДНЯ — ПРИЧИНА ОТКРЫТЬ ПРИЛОЖЕНИЕ, НАПИСАННАЯ САМИМ ЧЕЛОВЕКОМ.
 *
 * 🔴 ЧЕГО ЗДЕСЬ НЕТ И НЕ БУДЕТ — ГЕНЕРАТОРА ЦИТАТ. «Каждый день — новый шанс» на
 * первом экране не мотивирует, а обесценивает всё, что стоит рядом: это слова
 * постороннего, сказанные никому. Карточка не сочиняет ни строчки. Единственный
 * текст, который она показывает про человека, — тот, который он сам написал.
 *
 * ЧТО ВМЕСТО. Утром (точнее — при первом заходе за сутки) карточка спрашивает,
 * ради чего сегодняшняя тренировка. Одна строка своими словами. Дальше весь день
 * она эту строку показывает и рядом честный факт — сколько партий сыграно к ней
 * сегодня. Вечером спрашивает, как вышло, и запоминает ответ.
 *
 * ⚠️ ПРОПУСК — ОБЫЧНЫЙ ХОД, А НЕ ПРОВАЛ. Экран, который каждый день требует что-то
 * написать, закрывают целиком — вместе со всем остальным, что на нём было. Поэтому
 * «Не сейчас» стоит прямо в первом же состоянии, одним нажатием, и закрытая карточка
 * не возвращается СЕГОДНЯ ЖЕ и не занимает места (компонент рисует null, а не пустую
 * рамку). Завтра она спросит снова — но именно завтра.
 *
 * ⚠️ СУТКИ — КАЛЕНДАРНЫЕ И МЕСТНЫЕ, тот же день, что у вызова дня и у блока
 * «Сегодня» (`dayKey` ниже совпадает по смыслу с daily-challenge.ts и earn.ts).
 * Отсюда следствие, которое стоит знать: в 00:30 начинаются новые сутки, вчерашняя
 * цель уже не показывается, и карточка спросит новую. Тянуть цель «до сна» значило
 * бы завести второй календарь в приложении, где сутки уже определены трижды.
 *
 * ⚠️ ЦЕЛЬ ЖИВЁТ РОВНО СУТКИ И ПРОВЕРЯЕТСЯ ПРИ ЧТЕНИИ, а не при записи. Уборка «в
 * полночь всё стереть» требует, чтобы приложение в этот момент было открыто, — на
 * Android оно живёт в WebView и остаётся смонтированным сутками. Поэтому чтение
 * сверяет дату записи с сегодняшней и молча отдаёт null: вчерашняя строка не
 * протечёт в новый день, даже если её никто не стирал.
 *
 * ⚠️ ХРАНИЛИЩЕ — ПОПРОФИЛЬНОЕ. Устройство семейное: на нём Денис, Валя и Алекс.
 * Цель одного не должна показываться другому — ни как своя, ни как чужая. Ключ
 * несёт id профиля, и это единственное, что отделяет одну цель от другой.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { slotForHour } from '@/src/services/warmup';

/** Одна строка. Длиннее не поместится на карточке, а обрезать на экране — врать. */
export const DAY_GOAL_MAX_LEN = 90;

/**
 * Примеры формулировок — КЛЮЧИ СЛОВАРЯ, а не готовые цели.
 *
 * ⚠️ ОНИ НЕ НАЖИМАЮТСЯ. Соблазн сделать пример кнопкой, подставляющей текст в поле,
 * велик и вреден: подставленная строка — наша, а не его, и вся затея (человек сам
 * называет свою причину) превращается в выбор из трёх наших вариантов. Примеры стоят
 * подписью под полем и показывают ЖАНР — короткая бытовая причина, а не «тренировать
 * память». Проверяется гейтом: у узлов примеров нет onPress.
 */
export const DAY_GOAL_EXAMPLE_KEYS = [
  'dayGoalExample1',
  'dayGoalExample2',
  'dayGoalExample3',
] as const;

export type GoalOutcome = 'done' | 'not_today';

export interface DailyGoal {
  /** То, что написал человек. Никогда не наше. */
  text: string;
  /** Календарный день, за который она задана (`dayKey`). */
  date: string;
  createdAt: string;
  /** Вечерний итог. null — ещё не спрашивали либо не ответил. */
  outcome: GoalOutcome | null;
  outcomeAt?: string;
}

/**
 * Что показывать карточке:
 *   hidden — сегодня закрыта человеком. Ничего, ноль места.
 *   ask    — цели на сегодня нет: приглашение назвать её.
 *   active — цель есть, день идёт: строка + сколько партий к ней сегодня.
 *   review — цель есть, вечер: тот же текст + вопрос «как вышло».
 *   closed — итог отмечен: строка + нейтральная пометка.
 */
export type DayGoalCardState = 'hidden' | 'ask' | 'active' | 'review' | 'closed';

const GOAL_PREFIX = 'psygames_day_goal_';
const DISMISS_PREFIX = 'psygames_day_goal_dismissed_';

export function dayGoalKey(profileId: string): string { return GOAL_PREFIX + profileId; }
export function dayGoalDismissKey(profileId: string): string { return DISMISS_PREFIX + profileId; }

/** Календарный день по местному времени — как в daily-challenge.ts. */
export function dayKey(date: Date = new Date()): string {
  return `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`;
}

/**
 * Приведение введённого к пригодному для показа — И ПРОВЕРКА, ЧТО ЭТО ВООБЩЕ ТЕКСТ.
 *
 * 🔴 Пустой ввод целью не становится. Пробел, перевод строки, табуляция и невидимые
 * символы (их приносит вставка из мессенджера) — это не «короткая цель», это
 * отсутствие цели: карточка потом весь день показывала бы пустую строку под
 * заголовком «Сегодня ты хотел». Возвращаем null, и вызывающий не пишет ничего.
 *
 * Переводы строк схлопываются в пробел намеренно: карточка — одна строка, и текст,
 * разложенный на три, ломает раскладку главного экрана.
 */
export function normalizeGoalText(raw: string): string | null {
  if (typeof raw !== 'string') return null;
  const flat = raw
    .replace(/[\u0000-\u001f\u007f]/g, ' ')                      // управляющие + переводы строк
    .replace(/[\u00a0\u1680\u180e\u2000-\u200f\u2028\u2029\u202f\u205f\u3000\ufeff]/g, ' ')  // неразрывные и нулевой ширины
    .replace(/\s+/g, ' ')
    .trim();
  if (!flat) return null;
  return flat.length > DAY_GOAL_MAX_LEN ? flat.slice(0, DAY_GOAL_MAX_LEN).trim() : flat;
}

/**
 * Вечер ли сейчас — по той же границе, что у зарядки и рекомендаций (18:00).
 * Своей границы не заводим: два разных «вечера» в одном приложении разъедутся.
 */
export function isGoalReviewTime(now: Date = new Date()): boolean {
  return slotForHour(now.getHours()) === 'evening';
}

/**
 * Чистая часть: по данным решает, что показать. Отдельно от хранилища — чтобы
 * состояния проверялись прогоном, а не глазами на живом экране.
 */
export function resolveGoalCard(input: {
  goal: DailyGoal | null;
  dismissedOn: string | null;
  now?: Date;
}): DayGoalCardState {
  const now = input.now ?? new Date();
  const today = dayKey(now);
  if (input.dismissedOn === today) return 'hidden';
  const goal = input.goal && input.goal.date === today ? input.goal : null;
  if (!goal) return 'ask';
  if (goal.outcome) return 'closed';
  return isGoalReviewTime(now) ? 'review' : 'active';
}

/** Сегодняшняя цель или null. Вчерашняя не отдаётся никогда — см. шапку. */
export async function loadDailyGoal(profileId: string, now: Date = new Date()): Promise<DailyGoal | null> {
  try {
    const raw = await AsyncStorage.getItem(dayGoalKey(profileId));
    if (!raw) return null;
    const rec = JSON.parse(raw) as DailyGoal;
    if (!rec || typeof rec.text !== 'string' || rec.date !== dayKey(now)) return null;
    return { ...rec, outcome: rec.outcome ?? null };
  } catch { return null; }
}

/**
 * Записать цель на сегодня. Пустой ввод НЕ ПИШЕТСЯ ВООБЩЕ (не «пустая цель» и не
 * «цель-пробел») и возвращает null — карточка остаётся в состоянии приглашения.
 */
export async function saveDailyGoal(profileId: string, raw: string, now: Date = new Date()): Promise<DailyGoal | null> {
  const text = normalizeGoalText(raw);
  if (!text) return null;
  const rec: DailyGoal = { text, date: dayKey(now), createdAt: now.toISOString(), outcome: null };
  try {
    await AsyncStorage.setItem(dayGoalKey(profileId), JSON.stringify(rec));
    // Цель поставили — значит карточку сегодня уже не «закрывали»: иначе она
    // исчезла бы сразу после сохранения, и человек не увидел бы того, что написал.
    await AsyncStorage.removeItem(dayGoalDismissKey(profileId));
  } catch {}
  return rec;
}

/**
 * Вечерний итог. Отмечается ТОЛЬКО у сегодняшней цели: вчерашняя не должна
 * закрываться задним числом — вчера уже прошло, и отметка о нём ничего не меняет.
 */
export async function markGoalOutcome(
  profileId: string, outcome: GoalOutcome, now: Date = new Date(),
): Promise<DailyGoal | null> {
  const goal = await loadDailyGoal(profileId, now);
  if (!goal) return null;
  const next: DailyGoal = { ...goal, outcome, outcomeAt: now.toISOString() };
  try { await AsyncStorage.setItem(dayGoalKey(profileId), JSON.stringify(next)); } catch {}
  return next;
}

/** Закрыть карточку на сегодня. Саму цель не трогаем: закрыт показ, а не замысел. */
export async function dismissGoalCard(profileId: string, now: Date = new Date()): Promise<void> {
  try { await AsyncStorage.setItem(dayGoalDismissKey(profileId), dayKey(now)); } catch {}
}

/** День, в который карточку закрыли, или null. */
export async function loadGoalDismissedOn(profileId: string): Promise<string | null> {
  try { return await AsyncStorage.getItem(dayGoalDismissKey(profileId)); } catch { return null; }
}

export interface GoalCardData {
  state: DayGoalCardState;
  goal: DailyGoal | null;
}

/**
 * Одно чтение для экрана: состояние карточки + сама цель (или null, если её нет).
 * Экран не считает состояние сам — иначе правило «сутки» пришлось бы держать в двух
 * местах, и второе неминуемо отстало бы от первого.
 */
export async function loadGoalCard(profileId: string, now: Date = new Date()): Promise<GoalCardData> {
  const [goal, dismissedOn] = await Promise.all([
    loadDailyGoal(profileId, now),
    loadGoalDismissedOn(profileId),
  ]);
  return { state: resolveGoalCard({ goal, dismissedOn, now }), goal };
}
