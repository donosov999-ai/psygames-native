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
  /** Снимок — это и есть договор о том, что откатывается. */
  const snap = SRC.slice(SRC.indexOf('interface Snapshot {'), SRC.indexOf('/** Живая цель уровня'));

  it('снимок возвращает и доску, и препятствия, и числа', () => {
    for (const field of ['cells', 'obstacles', 'covered', 'frozen', 'moves', 'score', 'cleared']) {
      expect(snap).toMatch(new RegExp(`\\b${field}:`));
    }
  });

  /**
   * 🔴 А ВОТ ПЕРЕМЕШИВАНИЯ В СНИМКЕ БЫТЬ НЕ ДОЛЖНО. Верни его отмена — и выйдет
   * «перемешал, не понравилось, отменил, перемешал заново»: бесконечная
   * перетасовка в обход трёх попыток за уровень. Отмена честна там, где
   * возвращает ровно то, что было, и нечестна там, где даёт НОВЫЙ расклад.
   */
  it('потраченное перемешивание отмена не возвращает', () => {
    expect(snap).not.toMatch(/\bshuffles\b/);
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
