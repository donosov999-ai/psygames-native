/**
 * 🔴 ГДЕ ЕСТЬ КАРТИНКИ — ОНИ РАЗНЫЕ ПОД РАЗНЫЕ ПРОФИЛИ.
 *
 * Требование Дениса 06.09.2026: «надо везде, где есть картинки, делать их
 * красивыми и разными под разные профили». Требование легко объявить и не
 * выполнить: игра рисует одни и те же спрайты всем, и снаружи это незаметно.
 *
 * ЗАМЕР 06.09.2026: из 95 игр картинки есть у СЕМИ. У четырёх они уже разведены
 * по профилям (`pairThemes`, `digitThemes`), а сортировка товаров была пятой и
 * единственной, где 44 спрайта одни и те же на все тринадцать профилей: ребёнок
 * и предприниматель открывали игру с одинаковым «Миксом».
 *
 * ⚠️ Список игр СЧИТАЕТСЯ, а не пишется руками: новая игра с картинками попадёт
 * под проверку сама. Исключения — поимённо и с причиной; молча выпасть нельзя.
 */
import { goodSetForProfile, GOOD_SETS_KEYS } from '@/app/games/goods-sort';
import { cakeThemeNameForProfile } from '@/src/constants/cakeThemes';

declare const __dirname: string;
declare function require(id: string): any;
const fs = require('fs');
const path = require('path');
const ИГРЫ = path.join(__dirname, '../../app/games');

const ПРОФИЛИ = ['odv999', 'chess', 'kids', 'vasilyeva', 'nzt48', 'free',
  'drivers', 'seniors', 'execs', 'students', 'women', 'polyglot'];

/**
 * Игры, которым разведение по профилям НЕ требуется, — поимённо и с причиной.
 * Пустая причина запрещена: «исключение без объяснения» через месяц читается
 * как «тут почему-то нельзя», и его никто не снимает.
 */
const ИСКЛЮЧЕНИЯ: Record<string, string> = {
  rmet: 'фотографии глаз — материал теста Baron-Cohen, менять их под профиль значит менять сам тест',
  'water-sort': 'зона другой сессии; переливалка на цветах, спрайт один служебный',
};

function игрыСКартинками(): string[] {
  const out: string[] = [];
  for (const f of fs.readdirSync(ИГРЫ).filter((x: string) => x.endsWith('.tsx'))) {
    const src = fs.readFileSync(path.join(ИГРЫ, f), 'utf8') as string;
    const свои = /require\('\.\.\/\.\.\/assets\/images\//.test(src);
    const темы = /from '@\/src\/constants\/\w*[Tt]hemes?'/.test(src);
    if (свои || темы) out.push(f.replace(/\.tsx$/, ''));
  }
  return out.sort();
}

describe('картинки разведены по профилям', () => {
  const сКартинками = игрыСКартинками();

  it('есть что проверять — игры с картинками найдены счётом, а не списком', () => {
    expect(сКартинками.length).toBeGreaterThanOrEqual(6);
    expect(сКартинками.length).toBeLessThan(20);
    expect(сКартинками).toContain('goods-sort');
    expect(сКартинками).toContain('cake-sort');
  });

  /**
   * 🔴 ГЛАВНОЕ: у каждой игры с картинками есть механизм разведения — свой
   * модуль тем или функция от профиля. Исключение допустимо, но названо.
   */
  it('🔴 у каждой игры с картинками есть разведение по профилю или названное исключение', () => {
    const молча: string[] = [];
    for (const игра of сКартинками) {
      if (игра in ИСКЛЮЧЕНИЯ) continue;
      const src = fs.readFileSync(path.join(ИГРЫ, `${игра}.tsx`), 'utf8') as string;
      const темы = /from '@\/src\/constants\/\w*[Tt]hemes?'/.test(src);
      const поПрофилю = /ForProfile\(/.test(src);
      if (!темы && !поПрофилю) молча.push(`${игра}: картинки есть, разведения по профилю нет`);
    }
    expect(молча).toEqual([]);
  });

  it('исключения названы поимённо и с причиной, а не пустой строкой', () => {
    for (const [игра, причина] of Object.entries(ИСКЛЮЧЕНИЯ)) {
      expect(сКартинками).toContain(игра);
      expect(причина.length).toBeGreaterThan(30);
    }
  });

  /**
   * 🔴 И РАЗВЕДЕНИЕ НЕ ДОЛЖНО БЫТЬ ФИКТИВНЫМ. Функция от профиля, отдающая
   * всем одно и то же, проходит проверку выше и не делает ничего.
   */
  it('🔴 сортировка товаров правда открывается разными наборами у разных профилей', () => {
    // ⚠️ Меряем на уровне, где наборы УЖЕ открыты: до порога игра честно даёт
    // всем «Микс», и разведение там не видно по построению, а не по недосмотру.
    const наборы = new Set(ПРОФИЛИ.map((p) => goodSetForProfile(p, 60)));
    expect(наборы.size).toBeGreaterThanOrEqual(4);
    for (const п of ПРОФИЛИ) expect(GOOD_SETS_KEYS).toContain(goodSetForProfile(п, 60));
    // Профили с заведомо разным характером не должны стартовать с одного набора.
    expect(goodSetForProfile('kids', 60)).not.toBe(goodSetForProfile('execs', 60));
    // Незнакомый профиль получает существующий набор, а не пустоту.
    expect(GOOD_SETS_KEYS).toContain(goodSetForProfile(undefined, 1));
    expect(GOOD_SETS_KEYS).toContain(goodSetForProfile('такого-нет', 60));
  });

  it('🔴 «Молочное» никому не ставится стартовым — это набор для выбора, а не для старта', () => {
    // Перцептивно трудный набор: девять белых бутылок, разница в этикетке.
    const наСтарте = ПРОФИЛИ.flatMap((p) => [1, 12, 30, 60].map((L) => goodSetForProfile(p, L)));
    expect(наСтарте).not.toContain('dairy');
  });

  it('🔴 торты тоже разводятся, и разными наборами', () => {
    const темы = new Set(ПРОФИЛИ.map(cakeThemeNameForProfile));
    expect(темы.size).toBeGreaterThanOrEqual(8);
  });
});
