import type { WarmupSlot } from '@/src/services/warmup';

/**
 * ГРАДИЕНТЫ БОЛЬШИХ КАРТОЧЕК ГЛАВНОЙ — отдельным модулем, чтобы их же выгружала проба натива
 * (`flutter-home-asset-fresh.test.ts`, задача d6a60b02): готовые цвета текста на них Dart берёт из
 * выгрузки, а не считает второй копией цветовой математики.
 */

/** Палитра кнопки «Зарядка» по времени суток — совпадает с экраном выбора. */
export const SLOT_TINT: Record<WarmupSlot, [string, string]> = {
  morning: ['#f7b733', '#fc4a1a'],
  day:     ['#43cea2', '#185a9d'],
  evening: ['#7b4397', '#dc2430'],
  night:   ['#2c3e50', '#4ca1af'],
};

/** Карточка практики дня («Релаксация»). */
export const HERO_EYE: [string, string] = ['#43cea2', '#185a9d'];

/** Сколько игр показывает блок «Сегодня». Больше — и он выдавливает рекомендации. */
export const TODAY_ROWS_MAX = 3;

/** Плашка под вордмарком профиля (`logoPlateFor` в `profileLogos.ts`): тёмная или светлая. */
export const LOGO_PLATE_BG = { dark: '#12151AC7', light: '#FFFFFFD1' } as const;
