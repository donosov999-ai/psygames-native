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
import { levelOutcome } from '@/src/services/levelOutcome';

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

  it('обрыв считается и передаётся в ОБЩЕЕ правило исхода', () => {
    expect(screen).toMatch(/const aborted = stoppedEarly \|\| played < MIN_TRIALS_FOR_LEVEL/);
    expect(screen).toMatch(/levelOutcome\(\{ isPreset, aborted,/);
  });

  /**
   * ⚠️ ПРАВИЛО ЖИВЁТ В ОБЩЕЙ ФУНКЦИИ, А НЕ В ЭКРАНЕ. Первая редакция этой
   * проверки искала ветку прямо в игре — и стоило вынести решение в
   * `levelOutcome`, как она покраснела на ПРАВИЛЬНОЙ правке. Хуже: вынесенное
   * правило она бы не заметила вовсе, если бы экран его обошёл.
   */
  it('при обрыве уровень не двигается — проверено вызовом', () => {
    const out = levelOutcome({ isPreset: false, cleared: true, aborted: true });
    expect(out.raiseLevel).toBe(false);
    expect(out.lowerLevel).toBe(false);
    const bad = levelOutcome({ isPreset: false, cleared: false, aborted: true });
    expect(bad.lowerLevel).toBe(false);
  });

  it('доигранная партия по-прежнему двигает уровень в обе стороны', () => {
    expect(levelOutcome({ isPreset: false, cleared: true }).raiseLevel).toBe(true);
    expect(levelOutcome({ isPreset: false, cleared: false }).lowerLevel).toBe(true);
  });
});

describe('🔴 вероятностный выбор: «СТОП» больше не провал', () => {
  const screen = code(read('../../app/games/prl.tsx'));

  it('кнопка сообщает, что партию оборвали', () => {
    expect(screen).toMatch(/finish\(true\)/);
  });

  it('понижение и повышение идут через ОБЩЕЕ правило', () => {
    expect(screen).toMatch(/const aborted = stoppedEarly \|\| trialsRef\.current\.length < MIN_TRIALS_FOR_LEVEL/);
    expect(screen).toMatch(/levelOutcome\(\{[^}]*aborted \}\)/);
    expect(screen).toMatch(/if \(outcome\.raiseLevel\) lvl\.reach/);
    expect(screen).toMatch(/if \(outcome\.lowerLevel\) lvl\.fail/);
  });

  /**
   * 🔴 ПРИЗНАК ЗАРЯДКИ ОБЯЗАН БЫТЬ НАСТОЯЩИМ. Первая правка вписала сюда
   * `isPreset: false`, и шаг зарядки снова получил право ронять уровень —
   * поймал гейт `warmup-level-drift`. Закрепляем, чтобы не вернулось.
   */
  it('признак зарядки не захардкожен', () => {
    expect(screen).toMatch(/isPreset: classic/);
    expect(screen).not.toMatch(/isPreset: false/);
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
