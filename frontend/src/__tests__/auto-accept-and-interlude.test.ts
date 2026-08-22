/* psygames-auto-accept-and-interlude · VER 1 · 22.08.2026 */
/**
 * ВЕРНЫЙ ОТВЕТ ПРИНИМАЕТСЯ САМ. И ЗАСТАВКА ЗАНИМАЕТ ВЕСЬ ЭКРАН.
 *
 * 🔴 ЛИШНЯЯ КНОПКА. Денис на живой партии: «надо чтобы когда правильно введено сам
 * принимал, это вообще частая ошибка — что ещё ждёт кнопку нажать проверку в разных
 * упражнениях». В «Числовых парах» человек складывает 10 и 5, видит зелёную
 * пятнадцать — и всё равно должен тянуться к «Проверить». Лишний шаг между «решил»
 * и «засчитано» читается как «игра не заметила», а на упражнении с секундомером он
 * ещё и попадает в замер.
 *
 * ⚠️ ГДЕ ЭТО ЗАКОННО, А ГДЕ НЕТ. Принимать само можно там, где ответ ОДНОЗНАЧЕН по
 * построению: сумма фишек сошлась с целью, набранное число равно ответу. Там, где
 * человек набирает слова по памяти («Пересказ», «Пары слов», OSPAN, «Размах чтения»),
 * автоприём сдал бы недописанное — кнопка там нужна и остаётся.
 *
 * ⚠️ И ТОЛЬКО ВЕРНОЕ. Неверное само не отвергается: человек мог не закончить набор,
 * и мгновенная ошибка отняла бы у него право доложить фишку или дописать цифру.
 *
 * 🔴 ЗАСТАВКА МЕЖДУ УРОВНЯМИ. Она рисовалась в обёртке с `alignItems: 'center'` и
 * отступом 20. Ребёнок без явной ширины при таком выравнивании СЖИМАЕТСЯ ПО
 * СОДЕРЖИМОМУ — пейзаж с питомцем выходил узкой полосой посреди экрана, сдвинутой
 * вбок, с рамкой по краю. Денис: «картинка съезжала вбок и рисовалась криво или
 * частично на экране».
 */
declare const __dirname: string;
declare function require(id: string): any;
const fs = require('fs');
const path = require('path');
const read = (rel: string): string => fs.readFileSync(path.resolve(__dirname, rel), 'utf8') as string;

const BONDS = read('../../app/games/number-bonds.tsx');
const SPRINT = read('../../app/games/math-sprint.tsx');
const CLEARED = read('../components/LevelCleared.tsx');

describe('верный ответ принимается сам', () => {
  it('🔴 «Числовые пары»: сумма сошлась — засчитывается без кнопки', () => {
    expect(BONDS).toMatch(/if \(picked\.length >= 2 && sumPicked === puzzle\.target\) validateRef\.current\(\)/);
  });

  it('🔴 «Счётный спринт»: набранное число равно ответу — засчитывается без кнопки', () => {
    expect(SPRINT).toMatch(/if \(parseInt\(userAnswer, 10\) === problem\.answer\) submitRef\.current\(\)/);
  });

  /**
   * ⚠️ ВСТРЕЧНАЯ СТОРОНА: неверное не отвергается само. Если бы автоприём звался на
   * любое изменение выбора, игра засчитывала бы ошибку на середине набора.
   */
  it('🔴 автоприём срабатывает только на совпадении, а не на любом ходе', () => {
    // Вырезаем ТЕЛО эффекта по его же условию, а не по соседним объявлениям:
    // порядок кусков в файле меняется, и срез по ним ловит пустоту.
    const bondsEffect = BONDS.slice(BONDS.indexOf('if (phase !== \'playing\' || feedback !== null || solvedRef.current) return;'));
    expect(bondsEffect.slice(0, 300)).toMatch(/sumPicked === puzzle\.target/);
    const sprintEffect = SPRINT.slice(SPRINT.indexOf('if (!problem || userAnswer === \'\' || feedback !== null) return;'));
    expect(sprintEffect.slice(0, 300)).toMatch(/=== problem\.answer/);
  });

  /** Кнопка остаётся: она для «я закончил, проверь», а не для «подтверди очевидное». */
  it('🔴 кнопка проверки не убрана', () => {
    expect(BONDS).toMatch(/t\('check'\)/);
    expect(SPRINT).toMatch(/t\('check'\)/);
  });

  /**
   * ⚠️ ТАМ, ГДЕ НАБИРАЮТ СЛОВА ПО ПАМЯТИ, АВТОПРИЁМА БЫТЬ НЕ ДОЛЖНО: он сдал бы
   * недописанное. Список закреплён, чтобы правку не «раскатали на всё подряд».
   */
  it('🔴 в упражнениях с набором текста автоприёма нет', () => {
    for (const name of ['word-pairs', 'ospan', 'reading-span', 'mnemonics']) {
      const src = read(`../../app/games/${name}.tsx`);
      expect(`${name}: ${/submitRef\.current\(\)|validateRef\.current\(\)/.test(src)}`).toBe(`${name}: false`);
    }
  });
});

describe('заставка между уровнями', () => {
  it('🔴 занимает весь экран, а не середину', () => {
    expect(CLEARED).toMatch(/interludeFull: \{ flex: 1, alignSelf: 'stretch', width: '100%' \}/);
    expect(CLEARED).toMatch(/style=\{\[styles\.interludeFull, \{ backgroundColor: colors\.background \}\]\}/);
  });

  /**
   * ⚠️ И ОБЁРТКА У НЕЁ СВОЯ. Прежняя `full` центрирует и держит отступ 20 — это
   * верно для карточки-баннера и неверно для полнокадровой заставки. Общая обёртка
   * на две разные задачи и была причиной.
   */
  it('🔴 заставка не делит обёртку с карточкой-баннером', () => {
    const branch = CLEARED.slice(CLEARED.indexOf("if (phase === 'interlude')"), CLEARED.indexOf('// ─── обычный баннер'));
    expect(branch).not.toMatch(/styles\.full\b/);
    // а сама `full` жива — карточке она по-прежнему нужна
    expect(CLEARED).toMatch(/full: \{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20 \}/);
  });
});
