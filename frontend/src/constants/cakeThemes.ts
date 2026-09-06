/**
 * Тематические наборы «Тортов» под профили.
 *
 * 🔴 УСТРОЙСТВО ПОВТОРЯЕТ `pairThemes.ts` НАМЕРЕННО. Там уже решена ровно эта
 * задача: девять наборов, тринадцать профилей, дефолт для незнакомого профиля.
 * Своя вторая механика тем означала бы два места, где профиль превращается в
 * картинки, и они разъедутся при первом же новом профиле.
 *
 * ⚠️ ЦВЕТ — ОБЯЗАТЕЛЬНЫЙ, СПРАЙТ — НЕТ. Клин рисуется вектором и читается по
 * цвету; спрайт начинки садится ПОВЕРХ и только украшает. Поэтому игра
 * полностью играбельна без единой картинки, а лист начинок можно добавлять
 * темами по одной, не ломая ничего.
 */
import { ImageSourcePropType } from 'react-native';

/**
 * Сколько видов начинки бывает на столе максимум. Совпадает с потолком видов в
 * `core/level.ts` — палитра обязана покрывать потолок, иначе два вида получат
 * один цвет и станут неразличимы.
 */
export const CAKE_FLAVORS = 11;

export interface CakeTheme {
  /** Цвета клиньев по видам начинки. Длина ≥ CAKE_FLAVORS. */
  colors: string[];
  /**
   * Тарелки темы — 8 вариантов, чтобы стол из двадцати не выглядел обоями.
   * Рисуются ПОД клиньями: тарелка это блюдо, а не начинка.
   */
  plates: ImageSourcePropType[];
}

/**
 * 🔴 ПАЛИТРЫ РАЗВЕДЕНЫ ПО СВЕТЛОТЕ, А НЕ ТОЛЬКО ПО ТОНУ. Одиннадцать клиньев на
 * тарелке диаметром 62–80 точек различаются периферийным зрением, и два близких
 * по светлоте тона там сливаются даже при разном оттенке. Внутри каждой темы
 * соседние по списку цвета намеренно скачут светлотой.
 */
const СЛАДКАЯ = ['#ef4444', '#f59e0b', '#fde047', '#84cc16', '#10b981', '#22d3ee', '#3b82f6', '#a78bfa', '#ec4899', '#f97316', '#78350f'];
const ШАХМАТЫ = ['#3f2b1d', '#d9c7a3', '#8b5e34', '#f5f0e6', '#5c4033', '#c8a951', '#2b1b12', '#e8ddc4', '#a67c52', '#7b6544', '#1c1209'];
const БИО     = ['#06b6d4', '#0ea5e9', '#67e8f9', '#14b8a6', '#a7f3d0', '#3b82f6', '#22d3ee', '#0891b2', '#5eead4', '#7dd3fc', '#0e7490'];
const БИЗНЕС  = ['#1e3a8a', '#c8a951', '#3b82f6', '#e5e7eb', '#0f172a', '#f59e0b', '#60a5fa', '#94a3b8', '#b45309', '#1d4ed8', '#334155'];
const АВТО    = ['#ef4444', '#111827', '#f3f4f6', '#f59e0b', '#374151', '#dc2626', '#9ca3af', '#fbbf24', '#1f2937', '#e5e7eb', '#7f1d1d'];
const УЧЁБА   = ['#14b8a6', '#f59e0b', '#ffffff', '#0ea5e9', '#84cc16', '#f472b6', '#facc15', '#2dd4bf', '#a3e635', '#38bdf8', '#0f766e'];
const ГЕО     = ['#2563eb', '#22c55e', '#fde047', '#ea580c', '#0ea5e9', '#a3e635', '#f97316', '#1d4ed8', '#4ade80', '#fbbf24', '#134e4a'];
const УЮТ     = ['#ec4899', '#fbcfe8', '#a855f7', '#fde68a', '#f472b6', '#c4b5fd', '#fed7aa', '#e879f9', '#fef3c7', '#d8b4fe', '#9d174d'];
const МОЗГ    = ['#7f7fd5', '#e0e7ff', '#8b5cf6', '#c7d2fe', '#4f46e5', '#a5b4fc', '#312e81', '#ddd6fe', '#6366f1', '#eef2ff', '#1e1b4b'];


/**
 * 🔴 ТАРЕЛКИ — ЭТО ТО МЕСТО, ГДЕ КАРТИНКА ВООБЩЕ ВИДНА.
 *
 * Первым замыслом были спрайты начинки поверх клина. Замер отменил: сектор при
 * пяти столбцах 15,5 точки, спрайт 0,7 от него — **10,8 точки**, при четырёх
 * 13,9. Оба ниже пола читаемости 15, который стоит на самом секторе. Тарелка же
 * 59–104 точки и видна на любом столе, поэтому рисуется она.
 *
 * Лист заказан у kie одной генерацией: 9 рядов (тем) × 8 столбцов (вариантов
 * оправы) = 72 клетки, сетка выше правила ≥7×8, клетка 464×512 px, 18 кредитов.
 * Нарезан ПО СОДЕРЖИМОМУ (деление поровну дало 30 ложных порезов из 72, снятие
 * сетки по провалам фона — 1: реальный шаг 451–468 по X при номинале 464).
 * Фон снят скиллом `bg-cutout` моделью `birefnet-general`: 72 из 72, ноль
 * провалов. Свой цветовой ключ этого не мог — одна тарелка нарисована В ЦВЕТЕ
 * КЛЮЧА, и ключ выедал её насквозь; семантической модели цвет безразличен.
 */
const ТАРЕЛКИ_СЛАДКАЯ = [
  require('../../assets/images/cake_plates/sweet/p0.webp'),
  require('../../assets/images/cake_plates/sweet/p1.webp'),
  require('../../assets/images/cake_plates/sweet/p2.webp'),
  require('../../assets/images/cake_plates/sweet/p3.webp'),
  require('../../assets/images/cake_plates/sweet/p4.webp'),
  require('../../assets/images/cake_plates/sweet/p5.webp'),
  require('../../assets/images/cake_plates/sweet/p6.webp'),
  require('../../assets/images/cake_plates/sweet/p7.webp'),
];
const ТАРЕЛКИ_ШАХМАТЫ = [
  require('../../assets/images/cake_plates/chess/p0.webp'),
  require('../../assets/images/cake_plates/chess/p1.webp'),
  require('../../assets/images/cake_plates/chess/p2.webp'),
  require('../../assets/images/cake_plates/chess/p3.webp'),
  require('../../assets/images/cake_plates/chess/p4.webp'),
  require('../../assets/images/cake_plates/chess/p5.webp'),
  require('../../assets/images/cake_plates/chess/p6.webp'),
  require('../../assets/images/cake_plates/chess/p7.webp'),
];
const ТАРЕЛКИ_БИО = [
  require('../../assets/images/cake_plates/bio/p0.webp'),
  require('../../assets/images/cake_plates/bio/p1.webp'),
  require('../../assets/images/cake_plates/bio/p2.webp'),
  require('../../assets/images/cake_plates/bio/p3.webp'),
  require('../../assets/images/cake_plates/bio/p4.webp'),
  require('../../assets/images/cake_plates/bio/p5.webp'),
  require('../../assets/images/cake_plates/bio/p6.webp'),
  require('../../assets/images/cake_plates/bio/p7.webp'),
];
const ТАРЕЛКИ_БИЗНЕС = [
  require('../../assets/images/cake_plates/biz/p0.webp'),
  require('../../assets/images/cake_plates/biz/p1.webp'),
  require('../../assets/images/cake_plates/biz/p2.webp'),
  require('../../assets/images/cake_plates/biz/p3.webp'),
  require('../../assets/images/cake_plates/biz/p4.webp'),
  require('../../assets/images/cake_plates/biz/p5.webp'),
  require('../../assets/images/cake_plates/biz/p6.webp'),
  require('../../assets/images/cake_plates/biz/p7.webp'),
];
const ТАРЕЛКИ_АВТО = [
  require('../../assets/images/cake_plates/car/p0.webp'),
  require('../../assets/images/cake_plates/car/p1.webp'),
  require('../../assets/images/cake_plates/car/p2.webp'),
  require('../../assets/images/cake_plates/car/p3.webp'),
  require('../../assets/images/cake_plates/car/p4.webp'),
  require('../../assets/images/cake_plates/car/p5.webp'),
  require('../../assets/images/cake_plates/car/p6.webp'),
  require('../../assets/images/cake_plates/car/p7.webp'),
];
const ТАРЕЛКИ_УЧЁБА = [
  require('../../assets/images/cake_plates/edu/p0.webp'),
  require('../../assets/images/cake_plates/edu/p1.webp'),
  require('../../assets/images/cake_plates/edu/p2.webp'),
  require('../../assets/images/cake_plates/edu/p3.webp'),
  require('../../assets/images/cake_plates/edu/p4.webp'),
  require('../../assets/images/cake_plates/edu/p5.webp'),
  require('../../assets/images/cake_plates/edu/p6.webp'),
  require('../../assets/images/cake_plates/edu/p7.webp'),
];
const ТАРЕЛКИ_ГЕО = [
  require('../../assets/images/cake_plates/geo/p0.webp'),
  require('../../assets/images/cake_plates/geo/p1.webp'),
  require('../../assets/images/cake_plates/geo/p2.webp'),
  require('../../assets/images/cake_plates/geo/p3.webp'),
  require('../../assets/images/cake_plates/geo/p4.webp'),
  require('../../assets/images/cake_plates/geo/p5.webp'),
  require('../../assets/images/cake_plates/geo/p6.webp'),
  require('../../assets/images/cake_plates/geo/p7.webp'),
];
const ТАРЕЛКИ_УЮТ = [
  require('../../assets/images/cake_plates/coz/p0.webp'),
  require('../../assets/images/cake_plates/coz/p1.webp'),
  require('../../assets/images/cake_plates/coz/p2.webp'),
  require('../../assets/images/cake_plates/coz/p3.webp'),
  require('../../assets/images/cake_plates/coz/p4.webp'),
  require('../../assets/images/cake_plates/coz/p5.webp'),
  require('../../assets/images/cake_plates/coz/p6.webp'),
  require('../../assets/images/cake_plates/coz/p7.webp'),
];
const ТАРЕЛКИ_МОЗГ = [
  require('../../assets/images/cake_plates/brain/p0.webp'),
  require('../../assets/images/cake_plates/brain/p1.webp'),
  require('../../assets/images/cake_plates/brain/p2.webp'),
  require('../../assets/images/cake_plates/brain/p3.webp'),
  require('../../assets/images/cake_plates/brain/p4.webp'),
  require('../../assets/images/cake_plates/brain/p5.webp'),
  require('../../assets/images/cake_plates/brain/p6.webp'),
  require('../../assets/images/cake_plates/brain/p7.webp'),
];

export const CAKE_THEMES = {
  sweet: { colors: СЛАДКАЯ, plates: ТАРЕЛКИ_СЛАДКАЯ },
  chess: { colors: ШАХМАТЫ, plates: ТАРЕЛКИ_ШАХМАТЫ },
  bio: { colors: БИО, plates: ТАРЕЛКИ_БИО },
  biz: { colors: БИЗНЕС, plates: ТАРЕЛКИ_БИЗНЕС },
  car: { colors: АВТО, plates: ТАРЕЛКИ_АВТО },
  edu: { colors: УЧЁБА, plates: ТАРЕЛКИ_УЧЁБА },
  geo: { colors: ГЕО, plates: ТАРЕЛКИ_ГЕО },
  coz: { colors: УЮТ, plates: ТАРЕЛКИ_УЮТ },
  brain: { colors: МОЗГ, plates: ТАРЕЛКИ_МОЗГ },
} as const satisfies Record<string, CakeTheme>;

export type CakeThemeName = keyof typeof CAKE_THEMES;

/**
 * Профиль → набор. Соответствие взято ОДИН В ОДИН из `pairThemes.ts`: если у
 * профиля «Шахматист» парные картинки в дереве и мраморе, торты у него не
 * должны быть конфетными. Профиль без записи получает `sweet` — он же дефолт
 * для детей и бесплатного, самый нейтральный.
 */
const PROFILE_CAKE_THEME: Record<string, CakeThemeName> = {
  kids: 'sweet',
  free: 'sweet',
  chess: 'chess',
  nzt48: 'brain',
  odv999: 'bio',
  execs: 'biz',
  drivers: 'car',
  students: 'edu',
  vasilyeva: 'edu',
  polyglot: 'geo',
  women: 'coz',
  seniors: 'coz',
};

/** Набор под активный профиль. Дефолт — конфетный. */
export function cakeThemeForProfile(profileId?: string): CakeTheme {
  const name = (profileId && PROFILE_CAKE_THEME[profileId]) || 'sweet';
  return CAKE_THEMES[name];
}

/** Имя набора под профиль — нужно гейту, чтобы проверить разведение по профилям. */
export function cakeThemeNameForProfile(profileId?: string): CakeThemeName {
  return (profileId && PROFILE_CAKE_THEME[profileId]) || 'sweet';
}
