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
  require('../../assets/images/pairs/pair0.png'),
  require('../../assets/images/pairs/pair1.png'),
  require('../../assets/images/pairs/pair2.png'),
  require('../../assets/images/pairs/pair3.png'),
  require('../../assets/images/pairs/pair4.png'),
  require('../../assets/images/pairs/pair5.png'),
  require('../../assets/images/pairs/pair6.png'),
  require('../../assets/images/pairs/pair7.png'),
  require('../../assets/images/pairs/pair8.png'),
  require('../../assets/images/pairs/pair9.png'),
  require('../../assets/images/pairs/pair10.png'),
  require('../../assets/images/pairs/pair11.png'),
];

// Шахматы (дерево+мрамор+золото) — профиль «Шахматист»
const CHESS = [
  require('../../assets/images/pairs_chess/c0.png'),
  require('../../assets/images/pairs_chess/c1.png'),
  require('../../assets/images/pairs_chess/c2.png'),
  require('../../assets/images/pairs_chess/c3.png'),
  require('../../assets/images/pairs_chess/c4.png'),
  require('../../assets/images/pairs_chess/c5.png'),
  require('../../assets/images/pairs_chess/c6.png'),
  require('../../assets/images/pairs_chess/c7.png'),
  require('../../assets/images/pairs_chess/c8.png'),
  require('../../assets/images/pairs_chess/c9.png'),
  require('../../assets/images/pairs_chess/c10.png'),
  require('../../assets/images/pairs_chess/c11.png'),
];

// Биохакинг (циан/синий футуризм) — профили NZT-48 и Владелец
const BIO = [
  require('../../assets/images/pairs_bio/c0.png'),
  require('../../assets/images/pairs_bio/c1.png'),
  require('../../assets/images/pairs_bio/c2.png'),
  require('../../assets/images/pairs_bio/c3.png'),
  require('../../assets/images/pairs_bio/c4.png'),
  require('../../assets/images/pairs_bio/c5.png'),
  require('../../assets/images/pairs_bio/c6.png'),
  require('../../assets/images/pairs_bio/c7.png'),
  require('../../assets/images/pairs_bio/c8.png'),
  require('../../assets/images/pairs_bio/c9.png'),
  require('../../assets/images/pairs_bio/c10.png'),
  require('../../assets/images/pairs_bio/c11.png'),
];

// Бизнес (корпоративный синий+золото) — профиль «Предприниматели»
const BIZ = [
  require('../../assets/images/pairs_biz/c0.png'),
  require('../../assets/images/pairs_biz/c1.png'),
  require('../../assets/images/pairs_biz/c2.png'),
  require('../../assets/images/pairs_biz/c3.png'),
  require('../../assets/images/pairs_biz/c4.png'),
  require('../../assets/images/pairs_biz/c5.png'),
  require('../../assets/images/pairs_biz/c6.png'),
  require('../../assets/images/pairs_biz/c7.png'),
  require('../../assets/images/pairs_biz/c8.png'),
  require('../../assets/images/pairs_biz/c9.png'),
  require('../../assets/images/pairs_biz/c10.png'),
  require('../../assets/images/pairs_biz/c11.png'),
];

// Транспорт (динамика, красный/хром) — профиль «Реакция ПРО / водители»
const CAR = [
  require('../../assets/images/pairs_car/c0.png'),
  require('../../assets/images/pairs_car/c1.png'),
  require('../../assets/images/pairs_car/c2.png'),
  require('../../assets/images/pairs_car/c3.png'),
  require('../../assets/images/pairs_car/c4.png'),
  require('../../assets/images/pairs_car/c5.png'),
  require('../../assets/images/pairs_car/c6.png'),
  require('../../assets/images/pairs_car/c7.png'),
  require('../../assets/images/pairs_car/c8.png'),
  require('../../assets/images/pairs_car/c9.png'),
  require('../../assets/images/pairs_car/c10.png'),
  require('../../assets/images/pairs_car/c11.png'),
];

// Учёба (бумага/дерево, тил+оранж) — профили «Студенты» и «Скорочтение»
const EDU = [
  require('../../assets/images/pairs_edu/c0.png'),
  require('../../assets/images/pairs_edu/c1.png'),
  require('../../assets/images/pairs_edu/c2.png'),
  require('../../assets/images/pairs_edu/c3.png'),
  require('../../assets/images/pairs_edu/c4.png'),
  require('../../assets/images/pairs_edu/c5.png'),
  require('../../assets/images/pairs_edu/c6.png'),
  require('../../assets/images/pairs_edu/c7.png'),
  require('../../assets/images/pairs_edu/c8.png'),
  require('../../assets/images/pairs_edu/c9.png'),
  require('../../assets/images/pairs_edu/c10.png'),
  require('../../assets/images/pairs_edu/c11.png'),
];

// Мир / путешествия (небо+песок) — профиль «Полиглот»
const GEO = [
  require('../../assets/images/pairs_geo/c0.png'),
  require('../../assets/images/pairs_geo/c1.png'),
  require('../../assets/images/pairs_geo/c2.png'),
  require('../../assets/images/pairs_geo/c3.png'),
  require('../../assets/images/pairs_geo/c4.png'),
  require('../../assets/images/pairs_geo/c5.png'),
  require('../../assets/images/pairs_geo/c6.png'),
  require('../../assets/images/pairs_geo/c7.png'),
  require('../../assets/images/pairs_geo/c8.png'),
  require('../../assets/images/pairs_geo/c9.png'),
  require('../../assets/images/pairs_geo/c10.png'),
  require('../../assets/images/pairs_geo/c11.png'),
];

// Уют / природа (пастель) — профили «Микро-релакс» и «50+»
const COZ = [
  require('../../assets/images/pairs_coz/c0.png'),
  require('../../assets/images/pairs_coz/c1.png'),
  require('../../assets/images/pairs_coz/c2.png'),
  require('../../assets/images/pairs_coz/c3.png'),
  require('../../assets/images/pairs_coz/c4.png'),
  require('../../assets/images/pairs_coz/c5.png'),
  require('../../assets/images/pairs_coz/c6.png'),
  require('../../assets/images/pairs_coz/c7.png'),
  require('../../assets/images/pairs_coz/c8.png'),
  require('../../assets/images/pairs_coz/c9.png'),
  require('../../assets/images/pairs_coz/c10.png'),
  require('../../assets/images/pairs_coz/c11.png'),
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
