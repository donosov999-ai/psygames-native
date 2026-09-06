/**
 * ОТВЕТ НА ДЕЙСТВИЕ: ЗВУК, ВСПЫШКА, ДРОЖАНИЕ, ОТМЕНА.
 *
 * 🔴 ЗАЧЕМ. До этого отказ в ходе был виден ТОЛЬКО по тому, что ничего не
 * произошло, — а это неотличимо от «не нажалось». Человек жмёт второй раз, и
 * второе нажатие часто делает уже другое. Сбор тройки тоже происходил молча:
 * товары исчезали, и откуда именно — приходилось догадываться.
 *
 * Здесь стерегутся не украшения, а три правила, каждое из которых уже ломалось
 * в этом проекте:
 *   · тихий вечер НЕ ПЕРЕЗАПИСЫВАЕТ настройку человека;
 *   · у всего, что двигается, есть ветка «мгновенно» (щадящий режим);
 *   · отмена возвращает ВСЁ состояние, но НЕ возвращает потраченное
 *     перемешивание — иначе выходит бесконечная перетасовка в обход лимита.
 */
declare const __dirname: string;
declare function require(m: string): any;
const { readFileSync } = require('fs');
const { join } = require('path');
import { soundOn, setCalmHush, calmHushNow, setSoundEnabled, getSoundEnabled } from '@/src/services/feedback';
// Лист без React: 14 мс против 3298 мс у экрана (замер 06.09.2026).
import { normHistoryStep } from '@/src/games/goods-sort/core/level';

const SRC = readFileSync(join(__dirname, '../../app/games/goods-sort.tsx'), 'utf8') as string;
/** Комментарии режем: гейт не должен ловить собственные объяснения. */
const CODE = SRC.split('\n').filter((l: string) => !l.trim().startsWith('*') && !l.trim().startsWith('//') && !l.trim().startsWith('/*')).join('\n');

describe('тихий вечер', () => {
  afterEach(() => setCalmHush(false));

  it('пока идёт спокойный шаг — звука нет', () => {
    setCalmHush(false);
    expect(soundOn()).toBe(true);
    setCalmHush(true);
    expect(calmHushNow()).toBe(true);
    expect(soundOn()).toBe(false);
  });

  /**
   * 🔴 ГЛАВНОЕ. Соблазн был звать `setSoundEnabled(false)` — и это перезаписало
   * бы выбор человека: он включил звук, наутро тот молчит, и виноватых нет.
   */
  it('настройка человека не трогается', async () => {
    await setSoundEnabled(true);
    setCalmHush(true);
    expect(soundOn()).toBe(false);              // звучать не будет
    expect(await getSoundEnabled()).toBe(true); // но настройка цела
    setCalmHush(false);
    expect(soundOn()).toBe(true);               // и вернулась сама
  });

  it('выключенный человеком звук тихий режим не включает обратно', async () => {
    await setSoundEnabled(false);
    setCalmHush(false);
    expect(soundOn()).toBe(false);
    await setSoundEnabled(true);
  });

  it('экран сортировки действительно включает тихий режим', () => {
    expect(CODE).toMatch(/useCalmHush\(isCalm\)/);
  });
});

describe('ответ на действие', () => {
  it('обычный ход и сбор тройки звучат по-разному', () => {
    expect(CODE).toMatch(/sndPlace\(\)/);                 // просто переложил
    expect(CODE).toMatch(/sndMatch\(\)/);                 // одна тройка
    expect(CODE).toMatch(/sndCombo\(clearedNow\)/);       // цепочка
  });

  /** Отказ обязан ощущаться, иначе он неотличим от «не нажалось». */
  it('отказ отзывается тычком, звуком и дрожанием', () => {
    const reject = CODE.slice(CODE.indexOf('if (!canPlaceInto(fromCell, toCell))'));
    const body = reject.slice(0, reject.indexOf('const ns ='));
    expect(body).toMatch(/hapticTap\(\)/);
    expect(body).toMatch(/sndWrong\(\)/);
    expect(body).toMatch(/shakeNiche\(/);
  });

  it('вспышка показывает те ниши, которые очистились', () => {
    expect(CODE).toMatch(/clearedCells\.push\(i\)/);
    expect(CODE).toMatch(/flashNiches\(clearedCells\)/);
  });

  /**
   * Требование щадящего режима, общее на приложение: у всего, что двигается,
   * есть ветка «мгновенно». Тряска — худший вид движения для вестибулярной
   * чувствительности, её там просто нет.
   */
  it('у вспышки и дрожания есть ветка щадящего режима', () => {
    const flash = CODE.slice(CODE.indexOf('const flashNiches'), CODE.indexOf('const shakeNiche'));
    const shake = CODE.slice(CODE.indexOf('const shakeNiche'));
    expect(flash).toMatch(/if \(reduced\)/);
    expect(shake.slice(0, 400)).toMatch(/if \(reduced\) return;/);
    expect(CODE).toMatch(/useReducedMotion\(\)/);
  });
});

describe('отмена хода', () => {
  /**
   * 🔴 СНИМОК ПРОВЕРЯЕТСЯ ИСПОЛНЕНИЕМ, А НЕ ЧТЕНИЕМ ОБЪЯВЛЕНИЯ ТИПА.
   *
   * Прежняя редакция вырезала из экрана текст `interface Snapshot { … }` и
   * искала в нём имена полей. 06.09.2026 объявление уехало в лист `core/level`
   * — откат не изменился ничем, а гейт покраснел; вырежи кто-нибудь границу
   * среза иначе, и он бы вместо этого молча позеленел на пустой строке.
   *
   * Меряем через `normHistoryStep` — ту самую функцию, которой лента отмены
   * читает свой шаг. Что она вернула, то отмена и восстановит.
   */
  const шагЛенты = (доп: Record<string, unknown> = {}) => normHistoryStep({
    cells: [[1, 1], [2], [], []],
    obstacles: [{ kind: 'locked', turns: 2 }, null, null, null],
    covered: ['0:0'],
    frozen: { row: 1, type: 2 },
    moves: 7, score: 250, cleared: 3,
    ...доп,
  }, 4, 2);

  it('снимок возвращает и доску, и препятствия, и числа', () => {
    const s = шагЛенты();
    expect(s).not.toBeNull();
    const потеряно = ['cells', 'obstacles', 'covered', 'frozen', 'moves', 'score', 'cleared']
      .filter((f) => (s as unknown as Record<string, unknown>)[f] === undefined);
    expect(потеряно).toEqual([]);
    // И это НЕ пустые заглушки: числа и состояние вернулись теми же.
    expect(s!.moves).toBe(7);
    expect(s!.score).toBe(250);
    expect(s!.cleared).toBe(3);
    expect(s!.covered).toEqual(['0:0']);
    expect(s!.frozen).toEqual({ row: 1, type: 2 });
    expect(s!.obstacles[0]).toMatchObject({ kind: 'locked' });
    expect(s!.cells).toEqual([[1, 1], [2], [], []]);
  });

  /**
   * 🔴 А ВОТ ПЕРЕМЕШИВАНИЯ В СНИМКЕ БЫТЬ НЕ ДОЛЖНО. Верни его отмена — и выйдет
   * «перемешал, не понравилось, отменил, перемешал заново»: бесконечная
   * перетасовка в обход трёх попыток за уровень. Отмена честна там, где
   * возвращает ровно то, что было, и нечестна там, где даёт НОВЫЙ расклад.
   */
  it('потраченное перемешивание отмена не возвращает', () => {
    // Подаём `shuffles` в шаг ленты НАРОЧНО: если поле переживёт разбор, значит
    // отмена вернёт потраченную перетасовку и три попытки за уровень обойдутся.
    const s = шагЛенты({ shuffles: 3 }) as unknown as Record<string, unknown> | null;
    expect(s).not.toBeNull();
    expect(s!.shuffles).toBeUndefined();
  });

  it('снимок кладётся до хода и до перемешивания', () => {
    const pushes = CODE.match(/history\.push\(/g) || [];
    expect(pushes.length).toBeGreaterThanOrEqual(2);
  });

  it('лента чистится на новом уровне — чужая доска в неё не годится', () => {
    expect(CODE).toMatch(/history\.reset\(\)/);
  });

  it('кнопка гаснет, когда откатывать нечего', () => {
    expect(CODE).toMatch(/disabled=\{!history\.canUndo\}/);
  });
});

/**
 * ПОЛЁТ ТОВАРА ПРИ ПЕРЕКЛАДЫВАНИИ.
 *
 * 🔴 ЗАЧЕМ. Доска менялась мгновенно: товар пропадал в одной нише и возникал в
 * другой. Прочитать ход глазом было нельзя — особенно ЧУЖОЙ ход, то есть тот,
 * что случился после подсказки или отмены. Мгновенная смена читается как сбой
 * отрисовки, а не как «я это сделал».
 */
describe('полёт товара', () => {
  const code = SRC.split('\n').filter((l: string) => !l.trim().startsWith('*') && !l.trim().startsWith('//') && !l.trim().startsWith('/*')).join('\n');

  it('ход запускает полёт', () => {
    const move = code.slice(code.indexOf('const moveItem'), code.indexOf('const undoMove'));
    expect(move).toMatch(/flyItem\(item,/);
  });

  /** Иначе на экране два одинаковых товара сразу — как было бы и у перетаскивания без `inHand`. */
  it('настоящий товар спрятан, пока летит копия', () => {
    expect(code).toMatch(/const arriving = fly\?\.toCell === i && s === cell\.length - 1/);
    expect(code).toMatch(/arriving && \{ opacity: 0 \}/);
  });

  /** Проезд по экрану — ровно то движение, от которого отказываются в щадящем режиме. */
  it('в щадящем режиме полёта нет вовсе', () => {
    const fn = code.slice(code.indexOf('const flyItem'), code.indexOf('const nicheAt') > 0 ? code.indexOf('const nicheAt') : undefined);
    expect(fn.slice(0, 300)).toMatch(/if \(reduced\) return;/);
  });

  /** Долгий полёт превращает быструю игру в ожидание: ход должен читаться, а не тормозить. */
  it('полёт короткий — не дольше четверти секунды', () => {
    const ms = Number((code.match(/toValue: 1, duration: (\d+), easing: Easing\.out\(Easing\.quad\), useNativeDriver: true \}\)\n\s+\.start\(\(\) => setFly/) || [])[1]);
    expect(ms).toBeGreaterThanOrEqual(80);
    expect(ms).toBeLessThanOrEqual(250);
  });
});
