/* psygames-mental-rotation-practice-kind · VER 2 · 17.09.2026 *
 * ⚠️ ИМЕНА УЗЛОВ СМЕНИЛИСЬ 23.09.2026 (задача 298e0ae9): свой выпадающий список экрана заменён
 * ОБЩИМ `DropdownSelect`. Теперь строка выбора — `mental-kind`, строки списка —
 * `mental-kind-<вид>`, а «Вперемешку» это значение `null`, то есть `mental-kind-null`.
 * Проба правится вместе с экраном: она сторожит ПОВЕДЕНИЕ выбора, а не имена узлов.
 */
/* psygames-spatial-claude-mac · задача da43411f, отчёт 1263dc58 */
/**
 * 🔴 «МЫСЛЕННОЕ ВРАЩЕНИЕ»: ОТРАБОТКА ОДНОГО ВИДА ЗАДАНИЙ С ЭКРАНА НАСТРОЙКИ.
 *
 * Отчёт 1263dc58 (17.09.2026, 2.54.17): «в настройках нельзя запустить отработку одного вида
 * заданий, они идут только вперемешку». Денис 17.09: «режимы для Ротации, чтобы доступны были те
 * новые, из настроек». Поэтому выбрать можно ЛЮБОЙ вид — и ещё не открытый уровнем: такой вид
 * строится с уровня, где он открывается.
 *
 * Проба монтирует настоящий экран и играет партию до конца: жмёт «Сечение» на уровне 1, отвечает
 * верно на каждое задание (верный номер берётся у настоящего `buildTask`) и смотрит, ЧТО экран
 * построил и ЧТО записал. Отработка не двигает уровень и пишется в историю своим режимом:
 * `taskKey` истории склеивает режим, и «Сечение» ×5 не сравнивается со смесью того же уровня.
 *
 * VER 2: выбор — выпадающим списком (Денис 17.09.2026: «лучше бы выбор выпадающим списком сделать»).
 * Закрытая строка показывает текущий вид, список раскрывается нажатием и закрывается выбором.
 */
import React from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const TestRenderer = require('react-test-renderer');

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: () => {}, replace: () => {}, back: () => {} }),
  useLocalSearchParams: () => ({}),
  router: { canGoBack: () => false, back: () => {}, replace: () => {} },
}));
const mockSaved: any[] = [];
jest.mock('@/src/services/api', () => ({
  ...jest.requireActual('@/src/services/api'),
  saveSession: async (s: any) => { mockSaved.push(s); return s; },
}));
/** Настоящий `buildTask`, но с журналом: какой вид и какой уровень экран попросил построить. */
const mockBuilt: { kind: string; level: number; correctIdx: number }[] = [];
jest.mock('@/src/games/mental-rotation/core', () => {
  const actual = jest.requireActual('@/src/games/mental-rotation/core');
  return {
    ...actual,
    buildTask: (kind: any, level: number, rng: any) => {
      const task = actual.buildTask(kind, level, rng);
      mockBuilt.push({ kind: task.kind, level, correctIdx: task.correctIdx });
      return task;
    },
  };
});

const текст = (node: any): string => {
  const out: string[] = [];
  const walk = (n: any) => { if (n == null) return; if (typeof n === 'string' || typeof n === 'number') { out.push(String(n)); return; } if (Array.isArray(n)) { n.forEach(walk); return; } walk(n.props?.children ?? n.children); };
  walk(node); return out.join(' ');
};
const поId = (r: any, id: string) => r.root.findAll((n: any) => typeof n.type !== 'string' && n.props?.testID === id && typeof n.props?.onPress === 'function');
const естьId = (r: any, id: string) => r.root.findAll((n: any) => n.props?.testID === id).length > 0;

async function осесть(кругов = 6, шаг = 500) {
  for (let i = 0; i < кругов; i += 1) {
    await TestRenderer.act(async () => { jest.advanceTimersByTime(шаг); for (let k = 0; k < 30; k += 1) await Promise.resolve(); });
  }
}

async function экран(): Promise<any> {
  /* eslint-disable @typescript-eslint/no-require-imports */
  const { ThemeProvider } = require('@/src/contexts/ThemeContext');
  const { LanguageProvider } = require('@/src/contexts/LanguageContext');
  const { ProfileProvider } = require('@/src/contexts/ProfileContext');
  const { PlayerLevelValue } = require('@/src/contexts/PlayerLevelContext');
  const { SafeAreaProvider } = require('react-native-safe-area-context');
  const { WarmupProvider } = require('@/src/contexts/WarmupContext');
  const Screen = require('@/app/games/mental-rotation').default;
  /* eslint-enable @typescript-eslint/no-require-imports */
  const METRICS = { frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } };
  let r: any;
  await TestRenderer.act(async () => {
    r = TestRenderer.create(React.createElement(SafeAreaProvider, { initialMetrics: METRICS },
      React.createElement(ProfileProvider, null, React.createElement(ThemeProvider, null, React.createElement(LanguageProvider, null,
        React.createElement(PlayerLevelValue, { level: 8 }, React.createElement(WarmupProvider, null, React.createElement(Screen))))))));
  });
  await осесть();
  mockBuilt.length = 0;   // стартовое задание из useState — ещё не партия
  return r;
}

async function нажать(r: any, id: string): Promise<void> {
  const узел = поId(r, id)[0];
  if (!узел) throw new Error(`нет нажимаемого ${id}; на экране: ${текст(r.toJSON()).slice(0, 200)}`);
  await TestRenderer.act(async () => { узел.props.onPress(); });
  await осесть(1, 50);
}
/** Выбрать вид: раскрыть список и нажать строку. */
async function выбратьВид(r: any, вид: string): Promise<void> {
  await нажать(r, 'mental-kind');
  await нажать(r, `mental-kind-${вид}`);
}
async function нажатьТекст(r: any, re: RegExp): Promise<void> {
  const узел = r.root.findAll((n: any) => n.props?.accessibilityRole === 'button' && typeof n.props?.onPress === 'function' && re.test(текст(n)))[0];
  if (!узел) throw new Error(`нет кнопки ${re}; на экране: ${текст(r.toJSON()).slice(0, 300)}`);
  await TestRenderer.act(async () => { узел.props.onPress(); });
  await осесть(1, 50);
}

/**
 * Партия до конца: на каждое задание — верный вариант (номер у построенного задания). Узлы вариантов
 * в дереве повторяются (обёртка и нажимаемое), поэтому вариант ищется по своей подписи «Вариант N».
 * Промах открывает разбор — тогда «Следующий раунд». «Одинаковы?» (да/нет) проба не берёт.
 */
async function сыграть(r: any, проб: number): Promise<void> {
  for (let шаг = 0; шаг < проб * 8 && mockSaved.length === 0; шаг += 1) {
    const дальше = поId(r, 'mental-review-next')[0];
    if (дальше) { await TestRenderer.act(async () => { дальше.props.onPress(); }); await осесть(2); continue; }
    const задание = mockBuilt[mockBuilt.length - 1];
    const варианты = r.root.findAll((n: any) => typeof n.type !== 'string' && typeof n.props?.onPress === 'function'
      && /вариант|option/i.test(String(n.props?.accessibilityLabel ?? '')) && !n.props.disabled);
    const верный = задание && варианты.find((n: any) => new RegExp(`\\b${задание.correctIdx + 1}\\b`).test(String(n.props.accessibilityLabel)));
    if (!верный) { await осесть(2); continue; }
    await TestRenderer.act(async () => { верный.props.onPress(); });
    await осесть(4);
  }
}

describe('«Мысленное вращение»: выбор вида заданий на настройке (отчёт 1263dc58)', () => {
  beforeEach(async () => {
    jest.useFakeTimers();
    mockSaved.length = 0;
    mockBuilt.length = 0;
    await AsyncStorage.clear();
  });
  afterEach(() => { jest.useRealTimers(); });

  it('🔴 выпадающий список: закрыт — видна строка «Вперемешку»; раскрыт — 12 строк по порядку; выбор закрывает список и показывает подпись', async () => {
    const r = await экран();
    const строки = () => r.root.findAll((n: any) => typeof n.type !== 'string' && typeof n.props?.onPress === 'function' && /^mental-kind-(?!note$)[a-z-]+$/.test(String(n.props?.testID ?? '')))
      .filter((n: any, i: number, все: any[]) => все.findIndex((m: any) => m.props.testID === n.props.testID) === i);
    const выбор = () => поId(r, 'mental-kind')[0];
    // закрыт: строк списка нет, в строке выбора — «вперемешку»
    expect(`строк ${строки().length}, раскрыт ${выбор().props.accessibilityState?.expanded}`).toBe('строк 0, раскрыт false');
    expect(выбор().props.accessibilityLabel).toMatch(/Mixed|Вперемешку/);
    await нажать(r, 'mental-kind');
    expect(строки().map((n: any) => n.props.testID)).toEqual([
      'mental-kind-null', 'mental-kind-rotation', 'mental-kind-projection', 'mental-kind-net', 'mental-kind-viewpoint', 'mental-kind-same',
      'mental-kind-assembly', 'mental-kind-memory', 'mental-kind-formation', 'mental-kind-section', 'mental-kind-missing', 'mental-kind-oblique',
    ]);
    expect(строки()[0].props.accessibilityState).toEqual({ selected: true });
    expect(естьId(r, 'mental-kind-note')).toBe(false);
    // вид выше уровня игрока — порог виден прямо в строке списка
    expect(текст(строки()[11])).toContain('24');
    await нажать(r, 'mental-kind-oblique');
    expect(`строк ${строки().length}, раскрыт ${выбор().props.accessibilityState?.expanded}`).toBe('строк 0, раскрыт false');
    expect(выбор().props.accessibilityLabel).toMatch(/Cross-section|Сечение/);
    expect(текст(r.root.findAll((n: any) => n.props?.testID === 'mental-kind-note')[0])).toContain('24');
    await TestRenderer.act(async () => { r.unmount(); });
  });

  it('🔴 «Сечение» на уровне 1: все задания партии — сечение уровня 24, уровень игрока не сдвинулся, режим истории свой', async () => {
    const r = await экран();
    await выбратьВид(r, 'oblique');
    expect(текст(r.root.findAll((n: any) => n.props?.testID === 'mental-kind-note')[0])).toContain('24');
    await нажатьТекст(r, /^\s*5\s*$/);
    await нажатьТекст(r, /начать|start/i);
    await сыграть(r, 5);
    expect(`построено ${mockBuilt.length}: ${[...new Set(mockBuilt.map((b) => `${b.kind}@${b.level}`))].join(', ')}`)
      .toBe('построено 5: oblique@24');
    expect(mockSaved.length).toBe(1);
    const s = mockSaved[0];
    expect(`${s.mode} · ${s.details.practice_kind} · верных ${s.details.hits}`).toBe('lvl24-3D-oblique · oblique · верных 5');
    // все пять верны, но уровень не растёт: отработка — не партия уровня
    const ключи = (await AsyncStorage.getAllKeys()).filter((k: string) => /psygames_mental_rotation_level_/.test(k));
    const уровни = await Promise.all(ключи.map((k: string) => AsyncStorage.getItem(k)));
    expect(уровни.filter((v: string | null) => v !== null && v !== '1')).toEqual([]);
    await TestRenderer.act(async () => { r.unmount(); });
  });

  it('контроль: «Вперемешку» (по умолчанию) — партия уровня как была: смесь по плану, уровень растёт, режим без вида', async () => {
    const r = await экран();
    await нажатьТекст(r, /^\s*5\s*$/);
    await нажатьТекст(r, /начать|start/i);
    await сыграть(r, 5);
    expect(mockBuilt.length).toBe(5);
    expect(mockBuilt.every((b) => b.level === 1)).toBe(true);
    expect(mockSaved.length).toBe(1);
    expect(`${mockSaved[0].mode} · ${mockSaved[0].details.practice_kind ?? 'нет'}`).toBe('lvl1-3D · нет');
    const ключи = (await AsyncStorage.getAllKeys()).filter((k: string) => /psygames_mental_rotation_level_/.test(k));
    const уровни = await Promise.all(ключи.map((k: string) => AsyncStorage.getItem(k)));
    expect(уровни).toContain('2');
    await TestRenderer.act(async () => { r.unmount(); });
  });

  it('вид, открытый уровнем, строится на уровне игрока, а «Вперемешку» снимает выбор', async () => {
    const r = await экран();
    await выбратьВид(r, 'rotation');
    expect(текст(r.root.findAll((n: any) => n.props?.testID === 'mental-kind-note')[0])).toContain('1');
    await выбратьВид(r, 'null');   // «Вперемешку» — значение null у общего списка
    expect(естьId(r, 'mental-kind-note')).toBe(false);
    await выбратьВид(r, 'projection');
    await нажатьТекст(r, /^\s*5\s*$/);
    await нажатьТекст(r, /начать|start/i);
    await сыграть(r, 5);
    expect([...new Set(mockBuilt.map((b) => `${b.kind}@${b.level}`))]).toEqual(['projection@3']);
    await TestRenderer.act(async () => { r.unmount(); });
  });
});
