/* psygames-profile-art-gate · VER 1 · 26.08.2026 */
/**
 * АССЕТЫ ПРОФИЛЯ: ЗНАЧОК, ВОРДМАРК, ФОН — ЕСТЬ ЛИ ФАЙЛ И ЕСТЬ ЛИ ПРОЗРАЧНОСТЬ.
 *
 * 🔴 ЗАЧЕМ ЗАВЕДЁН. Дефект нашёл Денис ГЛАЗАМИ 26.08.2026: «углы острые остались
 * у иконок, скруглённые нарисованы, а вырезано ровно». Значки резались из общей
 * сетки прямоугольниками, поэтому в углах оставался кусок серой подложки, а
 * `borderRadius` в коде его не убирал — он обрезает по своему радиусу, и
 * несовпадение двух скруглений читается как грязный угол.
 * Проверки на эти ассеты не было НИ ОДНОЙ: `grep profileBadge src/__tests__` и
 * `grep assets/images/profiles src/__tests__` 26.08 не дали ничего.
 *
 * ⚠️ ПРОЗРАЧНОСТЬ ПРОВЕРЯЕТСЯ ПО БАЙТАМ ФАЙЛА, А НЕ ПО КАРТИНКЕ. Разбирать webp
 * в тестах нечем (декодера в зависимостях нет), поэтому читается заголовок
 * контейнера RIFF: у webp с альфой либо есть чанк `ALPH` (lossy+alpha), либо
 * формат `VP8L` (lossless, альфа встроена). Непрозрачный `VP8 ` без `ALPH` —
 * ровно тот случай, когда углы будут квадратными.
 *
 * ⚠️ ФОНЫ НАРОЧНО БЕЗ АЛЬФЫ. Они лежат сплошной подложкой на всю ширину, дырок
 * в них быть не должно, поэтому у них проверяется только наличие файла и вес.
 */
declare const __dirname: string;
declare function require(id: string): any;
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const read = (rel: string): string => fs.readFileSync(path.join(ROOT, rel), 'utf8');

/** Идентификаторы профилей, перечисленные в карте (ключи объекта до `require`). */
function idsIn(src: string, marker: string): string[] {
  const body = src.slice(src.indexOf(marker));
  return [...body.matchAll(/^\s{2}([a-z0-9_]+):\s*require\(/gm)].map((m) => m[1]);
}

/** Есть ли в webp альфа-канал: чанк ALPH или формат VP8L. */
function webpHasAlpha(file: string): boolean {
  const buf = fs.readFileSync(file);
  const head = buf.subarray(0, Math.min(buf.length, 64)).toString('latin1');
  return head.includes('ALPH') || head.includes('VP8L');
}

describe('ассеты профиля', () => {
  const badgeSrc = read('src/constants/profileBadges.ts');
  const bgSrc = read('src/constants/profileBackgrounds.ts');

  it('есть что проверять — карты не пустые', () => {
    expect(idsIn(badgeSrc, 'PROFILE_BADGES').length).toBeGreaterThanOrEqual(12);
    expect(idsIn(bgSrc, 'PROFILE_BACKGROUNDS').length).toBeGreaterThanOrEqual(9);
  });

  it('🔴 каждый значок из карты лежит на диске', () => {
    const missing: string[] = [];
    for (const id of idsIn(badgeSrc, 'PROFILE_BADGES')) {
      const f = path.join(ROOT, 'assets/images/profiles', `${id}.webp`);
      if (!fs.existsSync(f)) missing.push(id);
    }
    expect(missing).toEqual([]);
  });

  it('🔴 у КАЖДОГО значка есть альфа — иначе углы выйдут квадратными', () => {
    // Именно этот дефект Денис и увидел. Без альфы скругление в коде обрезает
    // картинку по своему радиусу, а нарисованный угол остаётся рядом видимым.
    const opaque: string[] = [];
    for (const id of idsIn(badgeSrc, 'PROFILE_BADGES')) {
      const f = path.join(ROOT, 'assets/images/profiles', `${id}.webp`);
      if (fs.existsSync(f) && !webpHasAlpha(f)) opaque.push(id);
    }
    expect(opaque).toEqual([]);
  });

  it('🔴 проверка живая: она умеет отличить непрозрачный файл от прозрачного', () => {
    // Без этого «альфа у всех» могло бы означать «функция всегда возвращает true».
    // Фоны намеренно БЕЗ альфы — на них проверка обязана сказать «нет».
    const ids = idsIn(bgSrc, 'PROFILE_BACKGROUNDS');
    const withAlpha = ids.filter((id) => {
      const f = path.join(ROOT, 'assets/images/profile-bg', `${id}.webp`);
      return fs.existsSync(f) && webpHasAlpha(f);
    });
    expect(withAlpha).toEqual([]);
  });

  it('🔴 каждый фон лежит на диске и не раздут — приложение офлайновое', () => {
    // Каждый килобайт едет в .apk. Порог с запасом к нынешним 140 КБ на девять.
    const missing: string[] = [];
    let total = 0;
    for (const id of idsIn(bgSrc, 'PROFILE_BACKGROUNDS')) {
      const f = path.join(ROOT, 'assets/images/profile-bg', `${id}.webp`);
      if (!fs.existsSync(f)) { missing.push(id); continue; }
      total += fs.statSync(f).size;
    }
    expect(missing).toEqual([]);
    expect(Math.round(total / 1024)).toBeLessThan(400);
  });

  it('🔴 у вордмарка каждого профиля прописано, какая нужна плашка', () => {
    // Таблица собрана просмотром; забыть новый профиль легко, и тогда он молча
    // получит светлую плашку — для неона это чёрная клякса.
    const logoSrc = read('src/constants/profileLogos.ts');
    expect(logoSrc).toContain('PLATE_DARK');
    expect(logoSrc).toContain('logoPlateFor');
    const dark = logoSrc.slice(logoSrc.indexOf('PLATE_DARK'), logoSrc.indexOf('logoPlateFor'));
    for (const id of ['nzt48', 'chess', 'kids', 'vasilyeva']) expect(dark).toContain(`'${id}'`);
  });
});
