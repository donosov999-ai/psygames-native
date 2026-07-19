// Лого-вордмарк «PsyGames» под профиль — 9 вариантов из одной картинки (assets/images/logos/).
// «Пока в каждом режиме свой» — каждый профиль показывает свой стиль надписи на главном экране.
// Прозрачный фон (фон вычищен chroma-key при нарезке). Разные пропорции → показывать в боксе resizeMode=contain.
const LOGOS = [
  require('../../assets/images/logos/logo0.webp'),  // 0 фиолет-баблы
  require('../../assets/images/logos/logo1.webp'),  // 1 неон
  require('../../assets/images/logos/logo2.webp'),  // 2 золото-сериф
  require('../../assets/images/logos/logo3.webp'),  // 3 радуга-конфета
  require('../../assets/images/logos/logo4.webp'),  // 4 тех-градиент
  require('../../assets/images/logos/logo5.webp'),  // 5 гейминг-щит
  require('../../assets/images/logos/logo6.webp'),  // 6 мозг + надпись (бренд)
  require('../../assets/images/logos/logo7.webp'),  // 7 минимал
  require('../../assets/images/logos/logo8.webp'),  // 8 хром
  require('../../assets/images/logos/logo9.webp'),  // 9 teal + лотос-волна (спокойный, 50+)
  require('../../assets/images/logos/logo10.webp'), // 10 глобус-речь мультиколор (языки)
  require('../../assets/images/logos/logo11.webp'), // 11 зелёный + подарок (free, приветливый)
];

// Профиль → индекс варианта. v1.124.0: сгенерены 3 новых лого (9/10/11) →
// теперь у ВСЕХ 12 профилей СВОЙ уникальный вордмарк (индексы 0-11 без повторов).
// Было: seniors=vasilyeva=8, polyglot=students=4, free=odv999=6 делили лого.
const PROFILE_LOGO: Record<string, number> = {
  odv999: 6, nzt48: 1, chess: 2, kids: 3, students: 4, drivers: 5,
  women: 0, vasilyeva: 8, execs: 7, seniors: 9, polyglot: 10, free: 11,
};

export function logoForProfile(id?: string) {
  return LOGOS[PROFILE_LOGO[id ?? ''] ?? 6];
}
export const LOGO_VARIANTS = LOGOS;
