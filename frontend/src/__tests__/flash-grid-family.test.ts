/**
 * СЕМЕЙСТВО «СЕТКА СО ВСПЫШКОЙ» ЖИВЁТ НА ОДНОЙ КЛЕТКЕ.
 *
 * 🔴 ЗАЧЕМ. Четыре игры — «Матрица памяти», N-back, «Блоки Корси»,
 * «Пространственный размах» — рисовали клетку каждая по-своему, и каждая
 * одинаково плохо: плоский прямоугольник, `borderWidth: 2`, смена
 * `backgroundColor` вместо загорания. Денис 30.08.2026: «скучная и не
 * красивая», «по сути близнецы».
 *
 * Теперь клетка одна (`FlashCell`), и питомец в шапке — тоже общий слот
 * `GameShell`. Гейт стоит потому, что пятая игра семейства, дописанная по
 * образцу соседней, вернёт плоский прямоугольник обратно — ровно так уже
 * возвращались пружины до появления `settle` в `motion.ts`.
 *
 * ⚠️ Проверяется ИСХОДНИК, а не поведение: собрать RN-экран в jsdom дороже,
 * чем вся правка. Зато проверка ловит именно тот способ сломать, который
 * реально случается: «нарисую клетку сам, тут же всего три строки».
 */
declare const __dirname: string;
declare function require(m: string): any;

const fs = require('fs');
const path = require('path');
const G = (n: string) => fs.readFileSync(path.join(__dirname, '..', '..', 'app', 'games', n), 'utf8');

/** Игры семейства: сетка одинаковых клеток + вспышка. */
const FAMILY = ['memory-matrix.tsx', 'n-back.tsx', 'corsi.tsx', 'spatial-span.tsx'];

describe('семейство «сетка со вспышкой»', () => {
  it('есть что проверять: все четыре файла на месте', () => {
    for (const f of FAMILY) expect(G(f).length).toBeGreaterThan(1000);
  });

  it('🔴 все четыре рисуют клетку общим FlashCell', () => {
    for (const f of FAMILY) {
      expect(`${f}: ${G(f).includes('<FlashCell')}`).toBe(`${f}: true`);
      expect(`${f}: ${G(f).includes("from '@/src/components/juice'")}`).toBe(`${f}: true`);
    }
  });

  it('🔴 ни одна не рисует клетку своими руками поверх общей', () => {
    // Признак самодельной клетки: width+height от размера клетки прямо в style
    // вместе с backgroundColor — ровно так выглядели все четыре до правки.
    for (const f of FAMILY) {
      const src = G(f).replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
      const handmade = /width:\s*(cellSize|nbCell|block)\s*,\s*height:\s*\1\s*,[\s\S]{0,120}backgroundColor/.test(src);
      expect(`${f}: ${handmade}`).toBe(`${f}: false`);
    }
  });

  it('🔴 у всех четырёх питомец в шапке через слот каркаса', () => {
    for (const f of FAMILY) {
      expect(`${f}: ${/pet=\{petMood\}/.test(G(f))}`).toBe(`${f}: true`);
    }
  });

  it('🔴 каждая отвечает звуком на действие игрока', () => {
    for (const f of FAMILY) {
      expect(`${f}: ${/snd[A-Za-z]*\(/.test(G(f))}`).toBe(`${f}: true`);
    }
  });

  it('клетка знает про дальтонизм: у ответа есть форма, а не только цвет', () => {
    const cell = fs.readFileSync(
      path.join(__dirname, '..', 'components', 'juice', 'FlashCell.tsx'), 'utf8');
    for (const mark of ['markDot', 'markCrossBox', 'markRing']) {
      expect(`${mark}: ${cell.includes(mark)}`).toBe(`${mark}: true`);
    }
  });

  it('🔴 поле считается от ИЗМЕРЕННОЙ высоты, а не от зашитой константы', () => {
    /**
     * ⚠️ Проверяется НЕ отсутствие числа в файле. Первая редакция этого гейта
     * искала `height - 280` и краснела дважды невпопад: на собственном
     * комментарии «было: height - 280» и на законном запасном значении для
     * первого кадра, пока onLayout ещё не отдал высоту. Комментарии режем,
     * а проверяем то, что нужно на самом деле: размер клетки выводится из
     * измеренной высоты контейнера.
     */
    const strip = (t: string) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
    const mm = strip(G('memory-matrix.tsx'));
    expect(mm.includes('onLayout')).toBe(true);        // высоту меряем
    expect(mm.includes('setFieldH')).toBe(true);        // и запоминаем
    expect(/availH[\s\S]{0,200}cellSize/.test(mm)).toBe(true);   // из неё же считаем клетку
    // Потолок клетки поднят: старые 110 px и были «полем в четверть экрана».
    expect(/cellSize = Math\.min\([\s\S]{0,220}168/.test(mm)).toBe(true);
    // N-back: запас под шапку уменьшен, потолок поля поднят с 420.
    expect(/nbGridSide = Math\.min\([^)]*560\)/.test(strip(G('n-back.tsx')))).toBe(true);
  });

  it('питомец уважает настройку «показывать питомца» и щадящий режим', () => {
    const pet = fs.readFileSync(
      path.join(__dirname, '..', 'components', 'pet', 'GamePet.tsx'), 'utf8');
    expect(pet.includes('getPetVisible')).toBe(true);
    expect(pet.includes('useReducedMotion')).toBe(true);
    // На ошибке питомца не дёргаем — насмешка над игроком.
    expect(pet.includes("mood !== 'bad'")).toBe(true);
  });
});
