/* psygames-pet-screen · VER 1 · 20.10.2026 */
/**
 * ПРАВИЛА ЭКРАНА «ПИТОМЕЦ» — ОТДЕЛЬНО ОТ РАЗМЕТКИ (задача d6a60b02, вариант Б).
 *
 * Вынесено из `app/pet.tsx` без изменений: цвета и порядок шкал, совет по слабой шкале, полоса роста,
 * русское склонение «тренировка». Их же выгружает проба натива (`flutter-pet-asset-fresh.test.ts`),
 * а модель на Dart (`lib/shell/pet_model.dart`) повторяет функции — одна копия данных на двух.
 */
import { GAMES } from '@/src/constants/games';
import { isGameAllowed } from '@/src/constants/profiles';
import { CATEGORY_TO_SKILL, type PetStats } from '@/src/services/pet';

/** Цвета шкал — 1:1 с сайта (.pet-skill-memory и т.д.) */
export const SKILL_COLORS: Record<keyof PetStats['skills'], string> = {
  memory: '#8a68f5',
  attention: '#25b989',
  logic: '#e55fa2',
  speed: '#4a91ed',
};
export const SKILL_ORDER: (keyof PetStats['skills'])[] = ['memory', 'attention', 'logic', 'speed'];

/** Русские формы «N тренировок» (1 тренировка / 2 тренировки / 5 тренировок). */
/** Три формы «тренировка» по-русски — данными: их выгружает проба натива, Dart выбирает по тому же правилу. */
export const RU_TRAININGS = ['тренировка', 'тренировки', 'тренировок'] as const;

export function ruTrainings(n: number): string {
  const m10 = n % 10, m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return RU_TRAININGS[0];
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return RU_TRAININGS[1];
  return RU_TRAININGS[2];
}

/** Совет по самой отстающей шкале: игра из её категории, доступная профилю (см. разметку). */
export function petAdvice(stats: PetStats | null, profile: Parameters<typeof isGameAllowed>[0]) {
  if (!stats) return null;
  const weakest = SKILL_ORDER.reduce((a, b) => (stats.skills[a] <= stats.skills[b] ? a : b));
  if (stats.skills[weakest] >= 100) return null;   // всё на максимуме — советовать нечего
  const pool = GAMES.filter((g) => CATEGORY_TO_SKILL[g.category] === weakest && isGameAllowed(profile, g.id));
  if (!pool.length) return null;
  return { weakest, pick: pool[stats.total % pool.length] };   // без случайности: совет стабилен в пределах сессии
}

/** Полоса роста: доля и остаток до следующей стадии, на последней — до следующего уровня. */
export function petGrowth(total: number) {
  const nextStageAt = total < 10 ? 10 : total < 30 ? 30 : null;
  const prevStageAt = total < 10 ? 0 : total < 30 ? 10 : 30;
  const target = nextStageAt ?? (Math.floor(total / 5) + 1) * 5;
  const base = nextStageAt ? prevStageAt : Math.floor(total / 5) * 5;
  const left = Math.max(0, target - total);
  const frac = Math.max(0, Math.min(1, (total - base) / Math.max(1, target - base)));
  return { nextStageAt, left, frac };
}

