/**
 * ПОДСКАЗКА ПОКАЗЫВАЕТ ХОД, КОТОРЫЙ ПРОДВИГАЕТ.
 *
 * 🔴 ЗАЧЕМ ГЕЙТ. Подсказку зовут, когда человек застрял и не видит, что делать.
 * Показать ему ЛЮБОЙ законный ход — значит ответить не на тот вопрос: законных
 * ходов на доске десятки, и «вот сюда можно положить» ничего не сдвигает.
 * Подсказка, которая врёт, хуже её отсутствия: человек делает показанный ход и
 * застревает глубже, а доверия к кнопке больше нет.
 *
 * Функция настоящая, из экрана. Гейт, который читает исходник вместо того,
 * чтобы гонять код, здесь бесполезен: проверять надо ВЫБОР хода.
 */
import { findHint } from '@/app/games/goods-sort';

const all = () => true;

describe('поиск подсказки', () => {
  it('есть что проверять — иначе тест зелен вслепую', () => {
    expect(typeof findHint).toBe('function');
  });

  /** 🔴 Главное: если тройка собирается — показываем именно её, а не что попало. */
  it('собирающийся ход выбирается вперёд любого другого', () => {
    // В нише 1 лежат две единицы, в нише 0 сверху тоже единица → тройка.
    const cells = [[9, 1], [1, 1], [], [7]];
    const h = findHint(cells, all);
    expect(h).toEqual({ fromCell: 0, fromIdx: 1, toCell: 1 });
  });

  /**
   * Тройки нет — готовим её: сводим второй такой же к одинокому.
   *
   * ⚠️ Пустая ниша стоит РАНЬШЕ парной. Первая редакция теста ставила их
   * наоборот, и «первый попавшийся ход» случайно совпадал с нужным — мутация
   * «не сводить пары» проходила мимо гейта. Порядок здесь и есть проверка.
   */
  it('без тройки сводит пару, а не бросает товар в первую пустую', () => {
    const cells = [[5], [], [5], []];   // ниша 1 пустая и идёт ПЕРЕД парной ниша 2
    const h = findHint(cells, all);
    expect(h).toBeTruthy();
    expect(h!.toCell).toBe(2);
  });

  it('берётся только верхний товар — нижние не достать', () => {
    const cells = [[3, 4], [4, 4], []];
    const h = findHint(cells, all);
    expect(h!.fromIdx).toBe(cells[h!.fromCell].length - 1);
  });

  it('в полную нишу не советует', () => {
    const cells = [[2], [1, 1, 1], []];
    const h = findHint(cells, all, 3);
    expect(h!.toCell).not.toBe(1);
  });

  it('в саму себя не советует', () => {
    const cells = [[6], []];
    const h = findHint(cells, all);
    expect(h!.fromCell).not.toBe(h!.toCell);
  });

  /** Препятствия — не декорация: из запертой ниши не взять и в неё не положить. */
  it('запертые ниши обходит с обеих сторон', () => {
    const cells = [[8], [8], []];
    const usable = (i: number) => i !== 1;          // ниша 1 заперта
    const h = findHint(cells, usable);
    expect(h).toBeTruthy();
    expect(h!.fromCell).not.toBe(1);
    expect(h!.toCell).not.toBe(1);
  });

  it('на доске без единого законного хода честно молчит', () => {
    expect(findHint([[1], [2]], (i) => i === 0)).toBeNull();   // некуда положить
    expect(findHint([[], []], all)).toBeNull();                 // нечего брать
  });
});

describe('цена подсказки', () => {
  const src = require('fs').readFileSync(
    require('path').join(__dirname, '../../app/games/goods-sort.tsx'), 'utf8') as string;
  const code = src.split('\n').filter((l: string) => !l.trim().startsWith('*') && !l.trim().startsWith('//')).join('\n');

  /** Дай их вдоволь — и на вопрос «что делать» отвечает игра, а не человек. */
  it('подсказок счётное число за уровень, и меньше, чем перемешиваний', () => {
    const hints = Number((code.match(/const HINTS_PER_LEVEL = (\d+)/) || [])[1]);
    const shuf = Number((code.match(/const SHUFFLES_PER_LEVEL = (\d+)/) || [])[1]);
    expect(hints).toBeGreaterThanOrEqual(1);
    expect(hints).toBeLessThanOrEqual(shuf);
  });

  it('счётчик расходуется и обновляется на новом уровне', () => {
    expect(code).toMatch(/setHints\(\(n\) => n - 1\)/);
    expect(code).toMatch(/setHints\(HINTS_PER_LEVEL\)/);
  });

  /** Висящая подсказка перестаёт быть подсказкой и становится разметкой. */
  it('подсказка гаснет сама и на первом же ходе', () => {
    expect(code).toMatch(/setTimeout\(\(\) => setHint\(null\), \d+\)/);
    // Гаснет и на ходе: ищем именно внутри обработчика хода, а не где угодно.
    const move = code.slice(code.indexOf('const moveItem'), code.indexOf('const undoMove'));
    expect(move).toMatch(/setHint\(null\)/);
  });

  it('кончились — кнопка не работает', () => {
    expect(code).toMatch(/if \(hints <= 0[^)]*\)/);
    expect(code).toMatch(/disabled=\{hints <= 0\}/);
  });
});
