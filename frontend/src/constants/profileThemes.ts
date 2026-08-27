/* psygames-profile-themes · VER 1 · 28.08.2026 */
/**
 * ТЕМАТИЧЕСКИЙ АРТ ПРОФИЛЕЙ — потребительская сторона движка тем (c4fc6173).
 *
 * Картинки НЕ считаются на устройстве: они предобработаны НА СБОРКЕ
 * (scripts/build-profile-art.mjs) из одного базового арта рецептами
 * src/games/pause/core/imageEffects.ts. Какая тема у какого профиля — единственный
 * источник src/constants/profileThemes.json (его же читает скрипт и сверяет гейт
 * profile-themes.test.ts).
 *
 * Первый потребитель — подложка карты уровней (LevelProgressMap): один и тот же
 * луг с тропинкой у каждого профиля выглядит по-своему (шахматы — графит,
 * дети — витраж, НЗТ-48 — рентген, …).
 *
 * ⚠️ require-карта перечислена руками, потому что метро не умеет динамический
 * require по строке. Полноту (каждый профиль из json имеет строку здесь и файл
 * на диске) сторожит гейт — руками ничего сверять не надо.
 */
import spec from './profileThemes.json';

export const PROFILE_THEME_SPEC: Record<string, { effect: string; why: string }> = spec.themes;

const THEME_ART: Record<string, number> = {
  odv999: require('../../assets/images/level-map-themes/odv999.webp'),
  chess: require('../../assets/images/level-map-themes/chess.webp'),
  kids: require('../../assets/images/level-map-themes/kids.webp'),
  vasilyeva: require('../../assets/images/level-map-themes/vasilyeva.webp'),
  nzt48: require('../../assets/images/level-map-themes/nzt48.webp'),
  free: require('../../assets/images/level-map-themes/free.webp'),
  drivers: require('../../assets/images/level-map-themes/drivers.webp'),
  seniors: require('../../assets/images/level-map-themes/seniors.webp'),
  execs: require('../../assets/images/level-map-themes/execs.webp'),
  students: require('../../assets/images/level-map-themes/students.webp'),
  women: require('../../assets/images/level-map-themes/women.webp'),
};

/** Арт темы профиля; неизвестный или служебный профиль получает нейтральный free. */
export function themeArtFor(profileId: string | undefined | null): number {
  return THEME_ART[profileId ?? ''] ?? THEME_ART.free;
}
