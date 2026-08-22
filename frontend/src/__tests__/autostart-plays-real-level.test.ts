/* psygames-autostart-plays-real-level · VER 1 · 22.08.2026 */
/**
 * АВТОСТАРТ ИГРАЕТ ДОСТИГНУТЫЙ УРОВЕНЬ, А НЕ ПЕРВЫЙ.
 *
 * 🔴 ЧТО НАШЛОСЬ. Уровень читается из хранилища асинхронно: промис не может
 * разрешиться раньше, чем React прогонит эффекты монтирования. Значит в момент
 * `startGame()` уровень равен стартовой единице. Человек с двенадцатым открывал
 * «Вызов дня», получал задачу ПЕРВОГО уровня, безупречно её проходил — и уровень
 * не двигался: `reach(2)` при достигнутом 12 не делает ничего. Дословный репорт,
 * ради которого всё и разбиралось: «уровней 15, но дальше первого я не ухожу».
 * Замена `wu=1` на `auto=1` его не вылечила, потому что причина была другая.
 *
 * Лекарство (`autostart && lvl.loaded`) было написано и стояло в ДВУХ экранах из
 * шестидесяти шести.
 *
 * ЧИНИМ ДВУМЯ СЛОЯМИ, И ОБА ПРОВЕРЯЕМ ЗДЕСЬ:
 *   1) причину — тёплый кэш: все уровни читаются одним заходом на старте
 *      приложения, и хук отвечает готовым значением ПЕРВЫМ ЖЕ кадром;
 *   2) следствие — ожидание готовности во всех экранах (см. playlist-autostart,
 *      там проверка по всему списку игр).
 *
 * ⚠️ Второй слой не лишний: глубокая ссылка прямо в игру может обогнать прогрев.
 * Тогда хук честно уходит в асинхронное чтение — и экран обязан подождать.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  cachedLevelValue, levelsWarm, rememberLevelValue, resetLevelCacheForTests, warmLevelCache,
} from '@/src/services/levelCache';

const KEY = 'psygames_digit_span_level_odv999';
const FAIL = 'psygames_digit_span_failstreak_odv999';

describe('тёплый кэш уровней', () => {
  beforeEach(async () => {
    resetLevelCacheForTests();
    await AsyncStorage.clear();
  });

  it('до прогрева ничего не знает — и честно об этом говорит', () => {
    expect(levelsWarm()).toBe(false);
    expect(cachedLevelValue(KEY)).toBeUndefined();
  });

  it('🔴 после прогрева уровень известен СИНХРОННО — без промиса', async () => {
    await AsyncStorage.setItem(KEY, '12');
    await AsyncStorage.setItem(FAIL, '2');
    await warmLevelCache();
    expect(levelsWarm()).toBe(true);
    expect(cachedLevelValue(KEY)).toBe('12');
    expect(cachedLevelValue(FAIL)).toBe('2');
  });

  it('🔴 читает уровни ВСЕХ игр и профилей, а не одной', async () => {
    const keys = [
      'psygames_digit_span_level_odv999', 'psygames_stroop_level_odv999',
      'psygames_stroop_level_alex', 'psygames_mahjong_level_valya',
    ];
    for (const [i, k] of keys.entries()) await AsyncStorage.setItem(k, String(i + 3));
    await warmLevelCache();
    for (const [i, k] of keys.entries()) expect(`${k}=${cachedLevelValue(k)}`).toBe(`${k}=${i + 3}`);
  });

  it('чужие ключи не тянет', async () => {
    await AsyncStorage.setItem('psygames_sessions', '[]');
    await AsyncStorage.setItem('psygames_theme', 'dark');
    await warmLevelCache();
    expect(cachedLevelValue('psygames_theme')).toBeNull();   // прогрет, но такого уровня нет
  });

  it('🔴 незнакомый уровень после прогрева — это «нет», а не «не знаю»', async () => {
    await warmLevelCache();
    expect(cachedLevelValue('psygames_ant_level_someone')).toBeNull();
  });

  it('🔴 запись держит кэш в согласии с хранилищем', async () => {
    await warmLevelCache();
    rememberLevelValue(KEY, '7');
    expect(cachedLevelValue(KEY)).toBe('7');
  });

  it('повторный прогрев не начинает всё заново', async () => {
    await AsyncStorage.setItem(KEY, '5');
    const a = warmLevelCache();
    const b = warmLevelCache();
    expect(a).toBe(b);
    await a;
    expect(cachedLevelValue(KEY)).toBe('5');
  });

  /**
   * ⚠️ ВСТРЕЧНАЯ СТОРОНА: кэш не должен подменять хранилище. Если прогрев упал,
   * поведение обязано вернуться к прежнему — асинхронному чтению, а не к выдумке.
   */
  it('🔴 упавший прогрев не выдаёт выдуманных уровней', async () => {
    const keys = AsyncStorage.getAllKeys as unknown as jest.Mock;
    const real = keys.getMockImplementation();
    keys.mockImplementationOnce(() => Promise.reject(new Error('хранилище недоступно')));
    await warmLevelCache();
    expect(levelsWarm()).toBe(false);
    expect(cachedLevelValue(KEY)).toBeUndefined();
    if (real) keys.mockImplementation(real);
  });
});

jest.mock('@/src/contexts/ProfileContext', () => ({
  useProfile: () => ({ profile: { id: 'odv999' } }),
}));

describe('хук уровня — настоящим рендером', () => {
  /** Что хук отдал на ПЕРВОМ кадре: именно это видит автостарт. */
  function firstFrame(gameId: string): { level: number; loaded: boolean } {
    const React = require('react');
    const TestRenderer = require('react-test-renderer');
    const { usePersistentLevel } = require('@/src/hooks/usePersistentLevel');
    const frames: Array<{ level: number; loaded: boolean }> = [];
    function Probe() {
      const lvl = usePersistentLevel(gameId);
      frames.push({ level: lvl.level, loaded: lvl.loaded });
      return null;
    }
    TestRenderer.act(() => { TestRenderer.create(React.createElement(Probe)); });
    if (!frames.length) throw new Error('хук не отрисовался — проверять нечего');
    return frames[0] as { level: number; loaded: boolean };
  }

  beforeEach(async () => {
    resetLevelCacheForTests();
    await AsyncStorage.clear();
  });

  it('🔴 на прогретом кэше первый же кадр знает достигнутый уровень', async () => {
    await AsyncStorage.setItem(KEY, '12');
    await warmLevelCache();
    expect(firstFrame('digit_span')).toEqual({ level: 12, loaded: true });
  });

  it('🔴 без прогрева первый кадр честно говорит «ещё не знаю»', async () => {
    await AsyncStorage.setItem(KEY, '12');
    expect(firstFrame('digit_span')).toEqual({ level: 1, loaded: false });
  });

  /**
   * ⚠️ «КЛЮЧА НЕТ» — ЭТО НЕ «УРОВЕНЬ ПЕРВЫЙ». При переустановке или смене профиля
   * ключ пропадает, а уровень восстанавливается из истории раундов — и это чтение
   * тоже асинхронное. Поэтому здесь хук обязан ЖДАТЬ, а не отвечать единицей:
   * иначе кэш начнёт врать ровно в том случае, где человеку дороже всего — у того,
   * кто уже наигран, но потерял ключ. Вреда от ожидания нет: экран его переживёт,
   * а неверный уровень — нет.
   */
  it('🔴 ключа нет — хук ждёт историю, а не выдаёт первый уровень', async () => {
    await warmLevelCache();
    expect(firstFrame('digit_span')).toEqual({ level: 1, loaded: false });
  });
});

/**
 * 🔴 САМ ШОВ — ПОВЕДЕНИЕМ. Готовность приходит ПОЗЖЕ монтирования: в этом вся беда.
 * Значит хук обязан перепроверять её на следующих кадрах, а не один раз на mount.
 * Проверка ловит ровно ту подмену, ради которой всё и затевалось: спрятать прежнюю
 * гонку внутрь общего хука (список зависимостей `[]`) и считать дело сделанным.
 */
describe('шов автостарта', () => {
  it('🔴 ждёт готовности, приехавшей после монтирования, и стартует ровно один раз', () => {
    const React = require('react');
    const TestRenderer = require('react-test-renderer');
    const { useAutostartWhenReady } = require('@/src/hooks/useGamePreset');
    const started: number[] = [];
    let setReady: (v: boolean) => void = () => {};

    function Probe() {
      const [ready, set] = React.useState(false);
      setReady = set;
      const [, bump] = React.useState(0);
      (Probe as any).bump = bump;
      useAutostartWhenReady(() => ready, () => started.push(Date.now()));
      return null;
    }
    TestRenderer.act(() => { TestRenderer.create(React.createElement(Probe)); });
    expect(`после монтирования стартов: ${started.length}`).toBe('после монтирования стартов: 0');

    TestRenderer.act(() => { setReady(true); });
    expect(`после готовности стартов: ${started.length}`).toBe('после готовности стартов: 1');

    // лишние перерисовки второй раз не стартуют
    TestRenderer.act(() => { (Probe as any).bump((n: number) => n + 1); });
    TestRenderer.act(() => { (Probe as any).bump((n: number) => n + 1); });
    expect(`после ещё двух кадров стартов: ${started.length}`).toBe('после ещё двух кадров стартов: 1');
  });

  it('🔴 никогда не готов — никогда не стартует', () => {
    const React = require('react');
    const TestRenderer = require('react-test-renderer');
    const { useAutostartWhenReady } = require('@/src/hooks/useGamePreset');
    let calls = 0;
    function Probe() {
      const [, bump] = React.useState(0);
      (Probe as any).bump = bump;
      useAutostartWhenReady(() => false, () => { calls++; });
      return null;
    }
    TestRenderer.act(() => { TestRenderer.create(React.createElement(Probe)); });
    TestRenderer.act(() => { (Probe as any).bump(1); });
    expect(calls).toBe(0);
  });
});
