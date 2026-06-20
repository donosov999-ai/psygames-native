// Рисованные цифры под СТИЛЬ профиля (Nano Banana 2, нарезка из одной 3×3-картинки).
//  • candy   — мультяшно-конфетные (дети / женщины / студенты / релакс / free)
//  • elegant — навы+золото сериф (шахматы / бизнес / NZT / владелец / полиглот / водители)
const CANDY: any[] = [
  null,
  require('../../assets/images/digits/d1.png'),
  require('../../assets/images/digits/d2.png'),
  require('../../assets/images/digits/d3.png'),
  require('../../assets/images/digits/d4.png'),
  require('../../assets/images/digits/d5.png'),
  require('../../assets/images/digits/d6.png'),
  require('../../assets/images/digits/d7.png'),
  require('../../assets/images/digits/d8.png'),
  require('../../assets/images/digits/d9.png'),
];
const ELEGANT: any[] = [
  null,
  require('../../assets/images/digits_elegant/d1.png'),
  require('../../assets/images/digits_elegant/d2.png'),
  require('../../assets/images/digits_elegant/d3.png'),
  require('../../assets/images/digits_elegant/d4.png'),
  require('../../assets/images/digits_elegant/d5.png'),
  require('../../assets/images/digits_elegant/d6.png'),
  require('../../assets/images/digits_elegant/d7.png'),
  require('../../assets/images/digits_elegant/d8.png'),
  require('../../assets/images/digits_elegant/d9.png'),
];

const PROFILE_DIGIT_STYLE: Record<string, 'candy' | 'elegant'> = {
  kids: 'candy', free: 'candy', women: 'candy', students: 'candy', vasilyeva: 'candy', seniors: 'candy',
  chess: 'elegant', execs: 'elegant', nzt48: 'elegant', odv999: 'elegant', polyglot: 'elegant', drivers: 'elegant',
};

/** Набор из 9 рисованных цифр (индекс = цифра 1..9) под активный профиль. Дефолт — конфетные. */
export function digitsForProfile(profileId?: string): any[] {
  const style = (profileId && PROFILE_DIGIT_STYLE[profileId]) || 'candy';
  return style === 'elegant' ? ELEGANT : CANDY;
}
