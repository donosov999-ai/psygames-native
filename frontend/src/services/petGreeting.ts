/* psygames-pet-greeting · VER 1 · 07.09.2026 */
/**
 * ВСТРЕЧА ПРИ ЗАХОДЕ: ПИТОМЕЦ ЗДОРОВАЕТСЯ ЦИФРОЙ ИЗ ЕГО ЖЕ ДАННЫХ.
 *
 * 🔴 ЗАЧЕМ. Питомец на главной говорит по таймеру 20-40 с (`WalkingPet`,
 * SPEECH_MIN) — то есть в момент прихода МОЛЧИТ, а заговаривает, когда человек
 * уже листает. Момент открытия — единственный, когда он смотрит на экран и
 * ничего ещё не делает; ровно там Duolingo и ставит свою сову. Занимаем его.
 *
 * 🔴 ГОВОРИТ ТОЛЬКО ЦИФРОЙ. «Привет, рад тебя видеть» — это шум, который читают
 * два раза и перестают замечать. Здесь каждая реплика несёт число из журнала:
 * длина серии и остаток до цели. Нет числа — нет реплики, `greetKind` вернёт
 * `null` и питомец промолчит. Тот же приём, что в `praiseLines` и `goalSuggest`:
 * молчание дешевле выдуманной бодрости.
 *
 * 🔴 КОГДА ГОВОРИТ ОКНО ЦЕЛИ — ПИТОМЕЦ МОЛЧИТ. Окно и питомец живут на одном
 * экране (`app/index.tsx` и глобальный оверлей `WalkingPet`), и оба обращаются к
 * человеку словами. Два голоса разом — это не разговор, а гвалт; у окна повод
 * сильнее, оно и говорит. Поэтому `ask` — первый вход функции.
 *
 * ⚠️ НЕ ЧАЩЕ РАЗА В СУТКИ — отметка в хранилище, ключ с профилем. Вторая встреча
 * за день это уже не встреча.
 *
 * ⚠️ СКЛОНЕНИЕ ОБОЙДЕНО, А НЕ РЕШЕНО. Серия — любое число от 1 до 29, и «4 дня»
 * против «5 дней» здесь не отработать без помощника склонения. Поэтому в тексте
 * стоит «дн.» — сокращение, одинаковое для всех чисел; ровно так же написана
 * подпись `goalSuggest_best_streak` в словаре. Английский обходится без
 * существительного вовсе.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { dayKey } from '@/src/services/earn';
import type { PetLine } from '@/src/services/petLines';
import type { GoalPetState } from '@/src/services/goalPetLines';
import type { AskReason, GoalProgress } from '@/src/services/streakGoal';

/** Повод поздороваться. Ровно три: больше поводов — больше шума. */
export type GreetKind =
  /** До цели остался один день — самый сильный факт, какой у нас есть. */
  | 'one_left'
  /** Серия жива, но сегодняшний день ещё не отмечен. */
  | 'go_today'
  /** Сегодня уже сыграно, цель впереди — просто отчёт о положении дел. */
  | 'on_track';

export interface GreetLine extends PetLine {
  kind: GreetKind;
  state: GoalPetState;
}

export interface GreetInput {
  /** Повод показать окно цели. Не `null` — говорит окно, питомец молчит. */
  ask: AskReason | null;
  /** Прогресс к цели (`goalProgress`). `null` — цели нет, числа нет. */
  progress: GoalProgress | null;
  /** Отмечен ли сегодняшний день в журнале (`loadDayMarks`). */
  playedToday: boolean;
}

/**
 * Есть ли повод поздороваться и какой.
 *
 * ⚠️ ЧЕСТНО О ПРОВЕРКАХ. Живая здесь одна — `ask`: она срабатывает на реальном
 * случае `weekly`, когда всё остальное разрешает говорить. Остальные три
 * (`progress`, `left <= 0`, `done <= 0`) при согласованном вызове недостижимы:
 * `askReason` вернула бы `first` или `reached` и питомец промолчал бы раньше.
 * Они стоят страховкой от бессмысленного пузыря («до цели 0», «серия 0»), а не
 * правилом поведения — и проба на них это контрпроба, а не замер.
 */
export function greetKind(i: GreetInput): GreetKind | null {
  if (i.ask !== null) return null;
  const p = i.progress;
  if (!p) return null;
  if (p.left <= 0) return null;
  if (p.done <= 0) return null;
  if (p.left === 1) return 'one_left';
  return i.playedToday ? 'on_track' : 'go_today';
}

const LINES: Record<string, Record<GreetKind, { text: string; state: GoalPetState }>> = {
  ru: {
    one_left: { text: 'Остался один день до цели 🔥', state: 'cheer' },
    // «Одна партия — и день засчитан» — это ЗАМЕР, а не бодрость: день
    // отмечается любой партией, даже нулевой (`recordRound`, earn.ts:339).
    go_today: { text: 'Серия {s} дн. Одна партия — и день засчитан', state: 'point' },
    on_track: { text: 'Серия {s} дн., до цели {l} 💜', state: 'wave' },
  },
  en: {
    one_left: { text: 'One day left to your goal 🔥', state: 'cheer' },
    go_today: { text: 'Streak {s}. One game marks today', state: 'point' },
    on_track: { text: 'Streak {s}, {l} to go 💜', state: 'wave' },
  },
};

/** Реплика встречи или `null`, если повода нет. Незнакомый язык — на английский. */
export function pickGreeting(language: string, i: GreetInput): GreetLine | null {
  const kind = greetKind(i);
  if (!kind || !i.progress) return null;
  const pack = LINES[language] ?? LINES.en;
  const src = pack[kind] ?? LINES.en[kind];
  const text = src.text
    .replace('{s}', String(i.progress.done))
    .replace('{l}', String(i.progress.left));
  return { text, kind, state: src.state };
}

/** Языки, для которых встреча написана своими словами (остальные видят en). */
export function greetLanguages(): string[] {
  return Object.keys(LINES).sort();
}

// ── отметка «сегодня уже здоровались» ────────────────────────────────────────

/** Ключ с профилем — как у цели: чужую встречу человек видеть не должен. */
const GREET_PREFIX = 'psygames_pet_greeted_';

export function greetedKey(profileId: string): string { return GREET_PREFIX + profileId; }

/** День последней встречи (`dayKey`) или null. */
export async function loadGreetedDay(profileId: string): Promise<string | null> {
  try { return await AsyncStorage.getItem(greetedKey(profileId)); } catch { return null; }
}

export async function markGreeted(profileId: string, now: Date = new Date()): Promise<void> {
  try { await AsyncStorage.setItem(greetedKey(profileId), dayKey(now)); } catch {}
}

/** Здоровались ли уже сегодня. Пустая отметка — «ещё нет», а не «неизвестно». */
export function greetedToday(saved: string | null, now: Date = new Date()): boolean {
  return saved != null && saved === dayKey(now);
}
