/* psygames-goal-pet-lines · VER 1 · 07.09.2026 */
/**
 * ЧТО ГОВОРИТ ПИТОМЕЦ В ОКНЕ ЦЕЛИ.
 *
 * 🔴 ЗАЧЕМ ОТДЕЛЬНЫЙ ФАЙЛ, А НЕ НОВЫЙ КОНТЕКСТ В `petLines.ts`. Там `Pack` —
 * строгий `Record<Ctx, PetLine[]>` на двенадцать языков: новый контекст
 * потребовал бы правки всех двенадцати пакетов в файле на 895 строк, который
 * ведёт другой раздел. Голос питомца при этом остаётся один: тип реплики
 * берётся оттуда же (`PetLine`), тон и эмодзи — те же.
 *
 * ⚠️ ПИТОМЕЦ ГОВОРИТ РАЗНОЕ НА РАЗНЫЕ ПОВОДЫ. Требование Дениса 07.09.2026:
 * «питомец должен общаться с пользователем». Одна фраза на все четыре случая —
 * это не общение, а табличка: человеку, который ДОШЁЛ до срока, и человеку,
 * который сорвался, нельзя говорить одно и то же.
 *
 * 🔴 ЧЕГО ЗДЕСЬ НЕТ — ОБЕЩАНИЙ И УПРЁКОВ. Решение Дениса: над выбором ничего не
 * обещать (у Duolingo там «шансы вырастут в 2 раза», у нас такого замера нет).
 * И отдельно: `broken` — не «ты подвёл», а «начнём заново». Серия рвётся у всех,
 * и приложение, которое за это стыдит, закрывают вместе со всем остальным.
 *
 * ⚠️ ПОКА ru/en. Остальные десять языков падают на en — так же, как это делает
 * `translateFor` для обычных подписей. Транскреация — за каналом «Тексты и
 * переводы»; подстрочник здесь хуже английского, потому что это живая речь.
 */
import type { PetLine } from '@/src/services/petLines';
import type { AskReason } from '@/src/services/streakGoal';

/** Облик питомца в окне — под настроение повода. */
export type GoalPetState = 'wave' | 'point' | 'cheer' | 'sad';

export interface GoalPetLine extends PetLine {
  state: GoalPetState;
}

const LINES: Record<string, Record<AskReason, GoalPetLine>> = {
  ru: {
    first: { text: 'Давай договоримся, сколько дней подряд?', state: 'wave' },
    weekly: { text: 'Неделя прошла. Подтвердим цель?', state: 'point' },
    reached: { text: 'Дошёл! Ставим следующую? 🎉', state: 'cheer' },
    broken: { text: 'Серия оборвалась. Начнём заново — с какого числа?', state: 'sad' },
  },
  en: {
    first: { text: 'Let us agree — how many days in a row?', state: 'wave' },
    weekly: { text: 'A week has passed. Confirm the goal?', state: 'point' },
    reached: { text: 'You made it! Set the next one? 🎉', state: 'cheer' },
    broken: { text: 'The streak broke. Start over — how many days?', state: 'sad' },
  },
};

/** Реплика на повод. Неизвестный язык и незаполненный — на английский. */
export function pickGoalLine(language: string, reason: AskReason): GoalPetLine {
  return (LINES[language] ?? LINES.en)[reason] ?? LINES.en[reason];
}

/** Языки, для которых реплики написаны своими словами (остальные видят en). */
export function goalLineLanguages(): string[] {
  return Object.keys(LINES).sort();
}
