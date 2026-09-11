/* psygames-puzzle-clip-keeps-earlier-paint · VER 1 · 11.09.2026 */
/**
 * ОБРЕЗКА РАЗБИРАЕТСЯ, А НЕ ВЫБРАСЫВАЕТСЯ — ИНАЧЕ ПОЗДНЯЯ ПЕРЕРИСОВКА СЪЕДАЕТ РАННЮЮ.
 *
 * 📍 Найдено 11.09.2026 на контактном листе всех сорока: в «Мостах» кружки островов
 * стояли ПУСТЫЕ. Число мостов движок рисует — в примитивах оно есть:
 *     C 24 24 14 1 1      круг острова
 *     C 24 24 11 0 0      белая середина
 *     T 24 24 16 257 1 2  ЧИСЛО «2»
 * — но дальше он перерисовывает тот же остров под другой обрезкой, и без неё второй
 * белый круг ложится на всю клетку и закрашивает цифру. Число в «Мостах» — это вся
 * головоломка: без него играть не во что.
 *
 * В разборе стояло прямым текстом «K/U — обрезка: на нашем рисовании не сказываются,
 * пропускаем». Замер 11.09.2026 по всем сорока: обрезкой пользуются ДВАДЦАТЬ ЧЕТЫРЕ
 * движка, у «Раскраски карты» 300 обрезок на 1252 примитива.
 */
declare const __dirname: string;
// eslint-disable-next-line @typescript-eslint/no-require-imports
const fs = require('fs');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const path = require('path');

describe('обрезка примитивов', () => {
  it('🔴 разбор НЕ выбрасывает K/U — он их называет', () => {
    const play = fs.readFileSync(
      path.resolve(__dirname, '../games/tatham-bridge/play.ts'), 'utf8') as string;
    expect(play).toMatch(/case 'K':[^\n]*обрезка/);
    expect(play).toMatch(/case 'U':[^\n]*снять/);
  });

  /**
   * ⚠️ Эта проба РИСУЕТ холст, а не читает исходник: выше две проверки по тексту
   * файла, и они ловят только «слово на месте». Здесь подаётся ровно тот порядок
   * примитивов, на котором ломались «Мосты», и спрашивается результат.
   */
  it('🔴 поздняя перерисовка в обрезке НЕ съедает цифру, нарисованную раньше', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const React = require('react');
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const TestRenderer = require('react-test-renderer');
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const PuzzleCanvas = require('../components/PuzzleCanvas').default;

    // Порядок из «Мостов»: остров с числом, затем ТОТ ЖЕ остров под обрезкой.
    const партия = {
      ширина: 48, высота: 48, статус: 0, ход: null, подорвался: false,
      палитра: ['rgb(255,255,255)', 'rgb(0,0,0)'],
      примитивы: [
        { вид: 'круг', x: 24, y: 24, r: 14, заливка: 1, контур: 1 },
        { вид: 'круг', x: 24, y: 24, r: 11, заливка: 0, контур: 0 },
        { вид: 'текст', x: 24, y: 24, размер: 16, выравнивание: 257, цвет: 1, текст: '7' },
        { вид: 'обрезка', x: 0, y: 12, ш: 12, в: 24 },
        { вид: 'круг', x: 24, y: 24, r: 11, заливка: 0, контур: 0 },
        { вид: 'снять' },
      ],
    };
    let r: any;
    TestRenderer.act(() => {
      r = TestRenderer.create(React.createElement(PuzzleCanvas, {
        партия, ширина: 200, фон: '#fff', onЖест: () => {},
      }));
    });
    const дерево = JSON.stringify(r.toJSON());
    // Цифра на месте…
    expect(дерево).toContain('"7"');
    // …и повторный круг заперт в группе с обрезкой, а не лежит поверх всей доски.
    expect(дерево).toMatch(/clipPath/);
    r.unmount();
  });

  /**
   * ⚠️ ВЕРТИКАЛЬ ТЕКСТА ЛЕЖИТ В ТОМ ЖЕ ЧИСЛЕ, И ЧИТАЛАСЬ НЕ ВСЯ. `ALIGN_VCENTRE` —
   * бит `0x100`; замер 11.09.2026: почти весь текст коллекции приходит с
   * выравниванием 257 (0x101). Читали два младших бита, поэтому цифра ставилась
   * базовой линией на середину клетки — то есть заметно выше центра.
   */
  it('🔴 холст читает бит вертикального выравнивания, а не только горизонтальный', () => {
    const canvas = fs.readFileSync(
      path.resolve(__dirname, '../components/PuzzleCanvas.tsx'), 'utf8') as string;
    expect(canvas).toContain('0x100');
    expect(canvas).toMatch(/посередине \? п\.размер \* 0\.35 : 0/);
  });
});
