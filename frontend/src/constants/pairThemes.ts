// Тематические наборы спрайтов под профили.
// Один набор (12 объектов) питает СРАЗУ две игры: «Парные картинки» и «Найди отличия».
// Все наборы содержат РОВНО 12 спрайтов — это инвариант (см. SPRITE_COUNT ниже),
// на нём держится логика обеих игр (макс. 12 пар / индексация сцены).
//
// Сгенерировано Nano Banana 2 + хромакей-вырезка (магента/зелёный фон → прозрачный PNG).
// Стиль каждого набора подобран под характер профиля (см. PROFILE_PAIR_THEME).

export const SPRITE_COUNT = 12;

// Зверята (исходный набор) — дети и бесплатный профиль
const ANIMALS = [
  require('../../assets/images/pairs/pair0.webp'),
  require('../../assets/images/pairs/pair1.webp'),
  require('../../assets/images/pairs/pair2.webp'),
  require('../../assets/images/pairs/pair3.webp'),
  require('../../assets/images/pairs/pair4.webp'),
  require('../../assets/images/pairs/pair5.webp'),
  require('../../assets/images/pairs/pair6.webp'),
  require('../../assets/images/pairs/pair7.webp'),
  require('../../assets/images/pairs/pair8.webp'),
  require('../../assets/images/pairs/pair9.webp'),
  require('../../assets/images/pairs/pair10.webp'),
  require('../../assets/images/pairs/pair11.webp'),
];

// Шахматы (дерево+мрамор+золото) — профиль «Шахматист»
const CHESS = [
  require('../../assets/images/pairs_chess/c0.webp'),
  require('../../assets/images/pairs_chess/c1.webp'),
  require('../../assets/images/pairs_chess/c2.webp'),
  require('../../assets/images/pairs_chess/c3.webp'),
  require('../../assets/images/pairs_chess/c4.webp'),
  require('../../assets/images/pairs_chess/c5.webp'),
  require('../../assets/images/pairs_chess/c6.webp'),
  require('../../assets/images/pairs_chess/c7.webp'),
  require('../../assets/images/pairs_chess/c8.webp'),
  require('../../assets/images/pairs_chess/c9.webp'),
  require('../../assets/images/pairs_chess/c10.webp'),
  require('../../assets/images/pairs_chess/c11.webp'),
];

// Биохакинг (циан/синий футуризм) — профили NZT-48 и Владелец
const BIO = [
  require('../../assets/images/pairs_bio/c0.webp'),
  require('../../assets/images/pairs_bio/c1.webp'),
  require('../../assets/images/pairs_bio/c2.webp'),
  require('../../assets/images/pairs_bio/c3.webp'),
  require('../../assets/images/pairs_bio/c4.webp'),
  require('../../assets/images/pairs_bio/c5.webp'),
  require('../../assets/images/pairs_bio/c6.webp'),
  require('../../assets/images/pairs_bio/c7.webp'),
  require('../../assets/images/pairs_bio/c8.webp'),
  require('../../assets/images/pairs_bio/c9.webp'),
  require('../../assets/images/pairs_bio/c10.webp'),
  require('../../assets/images/pairs_bio/c11.webp'),
];

// Бизнес (корпоративный синий+золото) — профиль «Предприниматели»
const BIZ = [
  require('../../assets/images/pairs_biz/c0.webp'),
  require('../../assets/images/pairs_biz/c1.webp'),
  require('../../assets/images/pairs_biz/c2.webp'),
  require('../../assets/images/pairs_biz/c3.webp'),
  require('../../assets/images/pairs_biz/c4.webp'),
  require('../../assets/images/pairs_biz/c5.webp'),
  require('../../assets/images/pairs_biz/c6.webp'),
  require('../../assets/images/pairs_biz/c7.webp'),
  require('../../assets/images/pairs_biz/c8.webp'),
  require('../../assets/images/pairs_biz/c9.webp'),
  require('../../assets/images/pairs_biz/c10.webp'),
  require('../../assets/images/pairs_biz/c11.webp'),
];

// Транспорт (динамика, красный/хром) — профиль «Реакция ПРО / водители»
const CAR = [
  require('../../assets/images/pairs_car/c0.webp'),
  require('../../assets/images/pairs_car/c1.webp'),
  require('../../assets/images/pairs_car/c2.webp'),
  require('../../assets/images/pairs_car/c3.webp'),
  require('../../assets/images/pairs_car/c4.webp'),
  require('../../assets/images/pairs_car/c5.webp'),
  require('../../assets/images/pairs_car/c6.webp'),
  require('../../assets/images/pairs_car/c7.webp'),
  require('../../assets/images/pairs_car/c8.webp'),
  require('../../assets/images/pairs_car/c9.webp'),
  require('../../assets/images/pairs_car/c10.webp'),
  require('../../assets/images/pairs_car/c11.webp'),
];

// Учёба (бумага/дерево, тил+оранж) — профили «Студенты» и «Скорочтение»
const EDU = [
  require('../../assets/images/pairs_edu/c0.webp'),
  require('../../assets/images/pairs_edu/c1.webp'),
  require('../../assets/images/pairs_edu/c2.webp'),
  require('../../assets/images/pairs_edu/c3.webp'),
  require('../../assets/images/pairs_edu/c4.webp'),
  require('../../assets/images/pairs_edu/c5.webp'),
  require('../../assets/images/pairs_edu/c6.webp'),
  require('../../assets/images/pairs_edu/c7.webp'),
  require('../../assets/images/pairs_edu/c8.webp'),
  require('../../assets/images/pairs_edu/c9.webp'),
  require('../../assets/images/pairs_edu/c10.webp'),
  require('../../assets/images/pairs_edu/c11.webp'),
];

// Мир / путешествия (небо+песок) — профиль «Полиглот»
const GEO = [
  require('../../assets/images/pairs_geo/c0.webp'),
  require('../../assets/images/pairs_geo/c1.webp'),
  require('../../assets/images/pairs_geo/c2.webp'),
  require('../../assets/images/pairs_geo/c3.webp'),
  require('../../assets/images/pairs_geo/c4.webp'),
  require('../../assets/images/pairs_geo/c5.webp'),
  require('../../assets/images/pairs_geo/c6.webp'),
  require('../../assets/images/pairs_geo/c7.webp'),
  require('../../assets/images/pairs_geo/c8.webp'),
  require('../../assets/images/pairs_geo/c9.webp'),
  require('../../assets/images/pairs_geo/c10.webp'),
  require('../../assets/images/pairs_geo/c11.webp'),
];

// Уют / природа (пастель) — профили «Микро-релакс» и «50+»
const COZ = [
  require('../../assets/images/pairs_coz/c0.webp'),
  require('../../assets/images/pairs_coz/c1.webp'),
  require('../../assets/images/pairs_coz/c2.webp'),
  require('../../assets/images/pairs_coz/c3.webp'),
  require('../../assets/images/pairs_coz/c4.webp'),
  require('../../assets/images/pairs_coz/c5.webp'),
  require('../../assets/images/pairs_coz/c6.webp'),
  require('../../assets/images/pairs_coz/c7.webp'),
  require('../../assets/images/pairs_coz/c8.webp'),
  require('../../assets/images/pairs_coz/c9.webp'),
  require('../../assets/images/pairs_coz/c10.webp'),
  require('../../assets/images/pairs_coz/c11.webp'),
];

export const PAIR_THEMES = {
  animals: ANIMALS,
  chess: CHESS,
  bio: BIO,
  biz: BIZ,
  car: CAR,
  edu: EDU,
  geo: GEO,
  coz: COZ,
} as const;

export type PairTheme = keyof typeof PAIR_THEMES;

// Профиль → тематический набор. Профили без записи получают «animals» (дефолт).
const PROFILE_PAIR_THEME: Record<string, PairTheme> = {
  kids: 'animals',
  free: 'animals',
  chess: 'chess',
  nzt48: 'bio',
  odv999: 'bio',
  execs: 'biz',
  drivers: 'car',
  students: 'edu',
  vasilyeva: 'edu',
  polyglot: 'geo',
  women: 'coz',
  seniors: 'coz',
};

/** Возвращает 12 спрайтов набора под активный профиль (дефолт — зверята). */
export function pairSpritesForProfile(profileId?: string) {
  const theme = (profileId && PROFILE_PAIR_THEME[profileId]) || 'animals';
  return PAIR_THEMES[theme];
}

// Рубашка закрытой карты — СВОЯ по теме: цвет + неброский мотив (не общее розовое сердечко).
export const PAIR_BACKS: Record<PairTheme, { color: string; icon: string }> = {
  animals: { color: '#34d399', icon: 'paw' },
  chess:   { color: '#7c5e3c', icon: 'trophy' },
  bio:     { color: '#06b6d4', icon: 'pulse' },
  biz:     { color: '#3b82f6', icon: 'briefcase' },
  car:     { color: '#ef4444', icon: 'car-sport' },
  edu:     { color: '#14b8a6', icon: 'school' },
  geo:     { color: '#2563eb', icon: 'earth' },
  coz:     { color: '#ec4899', icon: 'flower' },
};

/** Цвет+иконка рубашки карты под активный профиль (дефолт — зелёная «лапка»). */
export function pairBackForProfile(profileId?: string): { color: string; icon: string } {
  const theme = (profileId && PROFILE_PAIR_THEME[profileId]) || 'animals';
  return PAIR_BACKS[theme];
}
