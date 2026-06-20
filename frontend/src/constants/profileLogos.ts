// Лого-вордмарк «PsyGames» под профиль — 9 вариантов из одной картинки (assets/images/logos/).
// «Пока в каждом режиме свой» — каждый профиль показывает свой стиль надписи на главном экране.
// Прозрачный фон (фон вычищен chroma-key при нарезке). Разные пропорции → показывать в боксе resizeMode=contain.
const LOGOS = [
  require('../../assets/images/logos/logo0.png'), // 0 фиолет-баблы
  require('../../assets/images/logos/logo1.png'), // 1 неон
  require('../../assets/images/logos/logo2.png'), // 2 золото-сериф
  require('../../assets/images/logos/logo3.png'), // 3 радуга-конфета
  require('../../assets/images/logos/logo4.png'), // 4 тех-градиент
  require('../../assets/images/logos/logo5.png'), // 5 гейминг-щит
  require('../../assets/images/logos/logo6.png'), // 6 мозг + надпись (бренд)
  require('../../assets/images/logos/logo7.png'), // 7 минимал
  require('../../assets/images/logos/logo8.png'), // 8 хром
];

// Профиль → индекс варианта (можно повторять; дефолт = 6 «мозг», бренд).
const PROFILE_LOGO: Record<string, number> = {
  odv999: 6, nzt48: 1, chess: 2, kids: 3, students: 4, drivers: 5,
  women: 0, vasilyeva: 3, execs: 7, seniors: 8, polyglot: 4, free: 6,
};

export function logoForProfile(id?: string) {
  return LOGOS[PROFILE_LOGO[id ?? ''] ?? 6];
}
export const LOGO_VARIANTS = LOGOS;
