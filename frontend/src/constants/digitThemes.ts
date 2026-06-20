// Рисованные цифры под СТИЛЬ профиля (Nano Banana 2, нарезка из картинок-сеток).
//  rainbow — радуга-конфета (дети/free/студенты)   pastel — мягкие роз/лаванда (женщины/50+/Васильева)
//  neon — техно-голубой неон (NZT/владелец/водители) elegant — навы+золото сериф (шахматы/бизнес/полиглот)
//  candy — исходный конфетный (дефолт-фолбэк)
// rainbow/pastel/neon — из ОДНОЙ картинки (3 ряда × 9), elegant/candy — отдельные 3×3.
const CANDY: any[] = [
  null,
  require('../../assets/images/digits/d1.png'), require('../../assets/images/digits/d2.png'), require('../../assets/images/digits/d3.png'),
  require('../../assets/images/digits/d4.png'), require('../../assets/images/digits/d5.png'), require('../../assets/images/digits/d6.png'),
  require('../../assets/images/digits/d7.png'), require('../../assets/images/digits/d8.png'), require('../../assets/images/digits/d9.png'),
];
const ELEGANT: any[] = [
  null,
  require('../../assets/images/digits_elegant/d1.png'), require('../../assets/images/digits_elegant/d2.png'), require('../../assets/images/digits_elegant/d3.png'),
  require('../../assets/images/digits_elegant/d4.png'), require('../../assets/images/digits_elegant/d5.png'), require('../../assets/images/digits_elegant/d6.png'),
  require('../../assets/images/digits_elegant/d7.png'), require('../../assets/images/digits_elegant/d8.png'), require('../../assets/images/digits_elegant/d9.png'),
];
const NEON: any[] = [
  null,
  require('../../assets/images/digits_neon/d1.png'), require('../../assets/images/digits_neon/d2.png'), require('../../assets/images/digits_neon/d3.png'),
  require('../../assets/images/digits_neon/d4.png'), require('../../assets/images/digits_neon/d5.png'), require('../../assets/images/digits_neon/d6.png'),
  require('../../assets/images/digits_neon/d7.png'), require('../../assets/images/digits_neon/d8.png'), require('../../assets/images/digits_neon/d9.png'),
];
const PASTEL: any[] = [
  null,
  require('../../assets/images/digits_pastel/d1.png'), require('../../assets/images/digits_pastel/d2.png'), require('../../assets/images/digits_pastel/d3.png'),
  require('../../assets/images/digits_pastel/d4.png'), require('../../assets/images/digits_pastel/d5.png'), require('../../assets/images/digits_pastel/d6.png'),
  require('../../assets/images/digits_pastel/d7.png'), require('../../assets/images/digits_pastel/d8.png'), require('../../assets/images/digits_pastel/d9.png'),
];
const RAINBOW: any[] = [
  null,
  require('../../assets/images/digits_rainbow/d1.png'), require('../../assets/images/digits_rainbow/d2.png'), require('../../assets/images/digits_rainbow/d3.png'),
  require('../../assets/images/digits_rainbow/d4.png'), require('../../assets/images/digits_rainbow/d5.png'), require('../../assets/images/digits_rainbow/d6.png'),
  require('../../assets/images/digits_rainbow/d7.png'), require('../../assets/images/digits_rainbow/d8.png'), require('../../assets/images/digits_rainbow/d9.png'),
];

type DigitStyle = 'candy' | 'elegant' | 'neon' | 'pastel' | 'rainbow';
const SETS: Record<DigitStyle, any[]> = { candy: CANDY, elegant: ELEGANT, neon: NEON, pastel: PASTEL, rainbow: RAINBOW };

const PROFILE_DIGIT_STYLE: Record<string, DigitStyle> = {
  kids: 'rainbow', free: 'rainbow', students: 'rainbow',
  women: 'pastel', vasilyeva: 'pastel', seniors: 'pastel',
  nzt48: 'neon', odv999: 'neon', drivers: 'neon',
  chess: 'elegant', execs: 'elegant', polyglot: 'elegant',
};

/** Набор из 9 рисованных цифр (индекс = цифра 1..9) под активный профиль. Дефолт — конфетные. */
export function digitsForProfile(profileId?: string): any[] {
  const style = (profileId && PROFILE_DIGIT_STYLE[profileId]) || 'candy';
  return SETS[style];
}
