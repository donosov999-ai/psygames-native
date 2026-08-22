/* psygames-stop-is-not-a-verdict · VER 1 · 22.08.2026 */
/**
 * КНОПКА «СТОП» — НЕ ПРИГОВОР НИ В КАКУЮ СТОРОНУ.
 *
 * 🔴 ОДИН ПЕРЕКОС, ДВА РАЗНЫХ ЗНАКА.
 *
 * В тесте внимания партия длится девяносто секунд, а зачёт считался по
 * накопленному: дождался первой цели, тапнул, нажал «СТОП» — точность 1/1,
 * ложных тревог ноль, уровень взят за десять секунд. Замер: в 100 % прогонов.
 *
 * В «вероятностном выборе» ТА ЖЕ кнопка означала провал: человек, которому
 * позвонили на середине, получал минус к гистерезису, хотя не сделал ничего
 * неправильно.
 *
 * Правило теперь общее: оборванная партия уровень НЕ ДВИГАЕТ. Досчитать пробы
 * за человека нельзя, а гадать нечестно.
 */
import { MIN_TRIALS_FOR_LEVEL } from '@/app/games/cpt';

declare const __dirname: string;
declare function require(m: string): any;
const read = (rel: string): string => require('fs').readFileSync(
  require('path').join(__dirname, rel), 'utf8',
) as string;
const code = (src: string): string =>
  src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1');

describe('порог «партия сыграна»', () => {
  it('он есть и осмыслен', () => {
    // Заведомо больше «дождался первой цели и вышел», но меньше полной партии:
    // при медленном темпе за 90 секунд выходит около шестидесяти проб.
    expect(MIN_TRIALS_FOR_LEVEL).toBeGreaterThanOrEqual(20);
    expect(MIN_TRIALS_FOR_LEVEL).toBeLessThanOrEqual(60);
  });
});

describe('🔴 тест внимания: «СТОП» больше не даёт уровень', () => {
  const screen = code(read('../../app/games/cpt.tsx'));

  it('кнопка сообщает, что партию оборвали', () => {
    expect(screen).toMatch(/finish\(true\)/);
  });

  it('исход считается только при сыгранной партии', () => {
    expect(screen).toMatch(/const enough = !stoppedEarly && played >= MIN_TRIALS_FOR_LEVEL/);
    expect(screen).toMatch(/enough\s*\?\s*levelOutcome/);
  });

  it('при обрыве уровень не двигается НИ ВВЕРХ, НИ ВНИЗ', () => {
    expect(screen).toMatch(/raiseLevel: false, lowerLevel: false/);
  });
});

describe('🔴 вероятностный выбор: «СТОП» больше не провал', () => {
  const screen = code(read('../../app/games/prl.tsx'));

  it('кнопка сообщает, что партию оборвали', () => {
    expect(screen).toMatch(/finish\(true\)/);
  });

  it('понижение и повышение обусловлены сыгранной партией', () => {
    expect(screen).toMatch(/enoughTrials = !stoppedEarly && trialsRef\.current\.length >= MIN_TRIALS_FOR_LEVEL/);
    expect(screen).toMatch(/if \(!classic && enoughTrials\)/);
  });

  it('порог берётся ОБЩИЙ, а не заводится свой', () => {
    expect(screen).toMatch(/import \{ MIN_TRIALS_FOR_LEVEL \}/);
    expect(screen).not.toMatch(/const MIN_TRIALS_FOR_LEVEL/);
  });
});

describe('🔴 обе игры отвечают на обрыв ОДИНАКОВО', () => {
  const cpt = code(read('../../app/games/cpt.tsx'));
  const prl = code(read('../../app/games/prl.tsx'));

  it('обе принимают признак обрыва', () => {
    for (const [name, src] of [['внимание', cpt], ['выбор', prl]] as const) {
      expect(`${name}: ${/finish = async \(stoppedEarly = false\)/.test(src)}`).toBe(`${name}: true`);
    }
  });

  it('ни одна не решает судьбу уровня, не спросив про обрыв', () => {
    expect(cpt).toMatch(/stoppedEarly/);
    expect(prl).toMatch(/stoppedEarly/);
  });
});
