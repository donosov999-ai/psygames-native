/* psygames-praise-lines · VER 1 · 07.09.2026 */
/**
 * ЗА ЧТО ПИТОМЕЦ ХВАЛИТ МЕЖДУ УРОВНЯМИ.
 *
 * 🔴 ГЛАВНОЕ ЗДЕСЬ — ЧТО ФУНКЦИЯ ВОЗВРАЩАЕТ `null`. Похвала за каждый пройденный
 * уровень обесценивается за один вечер и превращается в шум: человек перестаёт
 * её читать раньше, чем доберётся до настоящего достижения. Решение Дениса
 * 07.09.2026 — хвалить ТОЛЬКО за настоящее, за продвижение к цели и за
 * возвращение после перерыва; за рядовой проход молчать.
 *
 * ⚠️ ЗАСТАВКА МЕЖДУ УРОВНЯМИ УЖЕ ЕСТЬ (`LevelInterlude`, заказ Дениса 19.08) —
 * там картинка, звёзды и переход питомца на следующий уровень. Питомец в ней
 * МОЛЧАЛ. Здесь появляются только слова; ничего рисовать заново не нужно.
 *
 * ⚠️ ОТДЕЛЬНЫЙ ФАЙЛ, а не новый контекст в `petLines.ts`: там `Pack` — строгий
 * `Record<Ctx, PetLine[]>` на двенадцать языков, и новый контекст потребовал бы
 * правки всех двенадцати пакетов в чужом файле на 895 строк. Тем же приёмом
 * сделаны реплики окна цели (`goalPetLines.ts`).
 *
 * ⚠️ Пока ru/en, остальные падают на en — как и подписи вообще. Транскреация за
 * каналом «Тексты и переводы»: подстрочник у живой речи хуже английского.
 */
import type { PetLine } from '@/src/services/petLines';
import type { GoalPetState } from '@/src/services/goalPetLines';

/** Повод похвалить. Порядок объявления = порядок приоритета в `pickPraise`. */
export type PraiseReason =
  /** Личный рекорд — самое редкое и самое ценное. */
  | 'record'
  /** Вернулся после перерыва: момент, когда человек чаще всего уходит навсегда. */
  | 'comeback'
  /** Продвижение к поставленной цели — связывает партию с обещанием. */
  | 'goal'
  /** Три звезды. */
  | 'stars'
  /** Быстрее, чем в прошлый раз в этой же игре. */
  | 'faster'
  /** Прошёл без единой ошибки. */
  | 'clean';

export interface PraiseLine extends PetLine {
  reason: PraiseReason;
  state: GoalPetState;
}

/** Сколько дней тишины считаем «перерывом». */
export const COMEBACK_DAYS = 3;

const LINES: Record<string, Record<PraiseReason, string>> = {
  ru: {
    record: 'Личный рекорд! 🏆',
    comeback: 'Тебя не было — и сразу так 💜',
    goal: '{n}-й день из {m}',
    stars: 'Три звезды ⭐',
    faster: 'Быстрее, чем в прошлый раз ⚡',
    clean: 'Ни одной ошибки',
  },
  en: {
    record: 'Personal best! 🏆',
    comeback: 'You were away — and straight to this 💜',
    goal: 'Day {n} of {m}',
    stars: 'Three stars ⭐',
    faster: 'Faster than last time ⚡',
    clean: 'Not a single mistake',
  },
};

const STATES: Record<PraiseReason, GoalPetState> = {
  record: 'cheer',
  comeback: 'wave',
  goal: 'point',
  stars: 'cheer',
  faster: 'cheer',
  clean: 'point',
};

export interface PraiseInput {
  /** Звёзд за уровень, 1–3. */
  stars?: number;
  /**
   * 🔴 ЧИСЛО ОШИБОК, А НЕ ФЛАГ «ПРОШЁЛ».
   *
   * Первая редакция брала `passed` — а это ОБЫЧНЫЙ успешный проход любого
   * уровня (`LevelCleared`: «passed: false → баннер „почти, ещё раз“»). То есть
   * похвала выпадала бы на КАЖДЫЙ пройденный уровень — ровно то, что решением
   * Дениса запрещено. Поймал до проб, читая соседний компонент.
   * Игра, которая ошибок не считает, поле не передаёт — и повода не возникает.
   */
  errors?: number;
  /** Быстрее ли, чем прошлый заход в эту же игру. */
  fasterThanLast?: boolean;
  /** Побит личный рекорд этой игры. */
  isRecord?: boolean;
  /** Дней тишины перед этим заходом; null — считать нечего. */
  daysAway?: number | null;
  /** Прогресс к цели: сколько дней пройдено из скольких. */
  goalDone?: number | null;
  goalTotal?: number | null;
}

/**
 * Одна фраза за раз — не список. При совпадении поводов берётся ПЕРВЫЙ по
 * порядку: рекорд → возвращение → цель → звёзды → быстрее → без ошибок. Показывать
 * всё сразу значит не сказать ничего: глаз читает первую строку и уходит.
 */
export function praiseReason(i: PraiseInput): PraiseReason | null {
  if (i.isRecord) return 'record';
  if ((i.daysAway ?? 0) >= COMEBACK_DAYS) return 'comeback';
  if (i.goalDone != null && i.goalTotal != null && i.goalDone > 0 && i.goalDone < i.goalTotal) return 'goal';
  if ((i.stars ?? 0) >= 3) return 'stars';
  if (i.fasterThanLast === true) return 'faster';
  if (i.errors === 0) return 'clean';
  return null;
}

export function pickPraise(language: string, i: PraiseInput): PraiseLine | null {
  const reason = praiseReason(i);
  if (!reason) return null;
  const pack = LINES[language] ?? LINES.en;
  let text = pack[reason] ?? LINES.en[reason];
  if (reason === 'goal') {
    text = text.replace('{n}', String(i.goalDone)).replace('{m}', String(i.goalTotal));
  }
  return { text, reason, state: STATES[reason] };
}

/** Языки, для которых похвала написана своими словами (остальные видят en). */
export function praiseLanguages(): string[] {
  return Object.keys(LINES).sort();
}
