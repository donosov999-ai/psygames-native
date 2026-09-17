/* psygames-inhibition-sessions-own-type · VER 1 · 17.09.2026 */
/**
 * «ТОРМОЖЕНИЕ» ПИШЕТ ПАРТИИ ПОД СВОИМ game_type — ВО ВСЕХ ТРЁХ РЕЖИМАХ.
 *
 * 📍 БЫЛО (до 17.09.2026, main 7e7bed68): режим Go/No-Go сохранялся как 'go_no_go', Стоп-сигнал
 * — как 'stop_signal', Микс — как 'inhibition_mixed'. Экран статистики (app/statistics.tsx)
 * группирует очки по game_type, поэтому:
 *   · карточки «Go/No-Go» и «Стоп-сигнал» смешивали очки двух разных формул
 *     (stop-signal: h·50 + cs·100 − e·60; «Торможение»: h·10 + cr·5 − fa·12 − m·5) и двух разных
 *     заданий — лестница задержки и SSRT против одной задержки на уровень;
 *   · 'inhibition_mixed' нет в GAMES, и statistics.tsx отбрасывал такие партии вовсе;
 *   · карточка «Торможение» не получала ни одной партии.
 * Решение — вариант А задачи c1dac288, согласовано с координатором: game_type 'inhibition' у
 * всех режимов, режим — в details.submode.
 *
 * КАК ПРОВЕРЯЕТСЯ — ПОВЕДЕНИЕМ. Экран монтируется целиком, режим выбирается кнопкой настройки,
 * партия стартует «Start» и доигрывается на фальшивых часах без ответов: пропуски, удержания и
 * стоп-пробы сами доводят её до конца. Ловится запись, ушедшая в saveSession.
 * 🔴 СЛЕПОЕ = КРАСНОЕ: нет ни одной записи за партию — проверка краснеет с причиной.
 */
import React from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: () => {}, replace: () => {}, back: () => {} }),
  useLocalSearchParams: () => ({}),
  useGlobalSearchParams: () => ({}),
  usePathname: () => '/games/inhibition',
  useFocusEffect: () => {},
  useNavigation: () => ({ addListener: () => () => {}, setOptions: () => {} }),
  router: { canGoBack: () => false, back: () => {}, replace: () => {}, push: () => {} },
}));
const записи: any[] = [];
jest.mock('@/src/services/api', () => ({
  ...jest.requireActual('@/src/services/api'),
  saveSession: async (s: any) => { записи.push(s); return s; },
}));

/* eslint-disable @typescript-eslint/no-require-imports -- загрузка ПОСЛЕ jest.mock */
const TestRenderer = require('react-test-renderer');
const { __resetGameClock } = require('@/src/services/gamePause');
/* eslint-enable @typescript-eslint/no-require-imports */

const поднятые: any[] = [];
beforeEach(() => { jest.useFakeTimers(); __resetGameClock(); записи.length = 0; });
afterEach(() => {
  while (поднятые.length) { const r = поднятые.pop(); try { TestRenderer.act(() => { r.unmount(); }); } catch { /* погашено */ } }
  jest.useRealTimers();
});

const осесть = async () => { await TestRenderer.act(async () => { for (let i = 0; i < 20; i += 1) await Promise.resolve(); }); };
const крутить = async (мс: number, шаг = 500) => {
  for (let t = 0; t < мс; t += шаг) {
    await TestRenderer.act(async () => { jest.advanceTimersByTime(шаг); });
    await осесть();
    if (записи.length) return;
  }
};
const текстУзла = (n: any): string => n.findAll((x: any) => typeof x.props?.children === 'string' || Array.isArray(x.props?.children), { deep: true })
  .map((x: any) => (Array.isArray(x.props.children) ? x.props.children.filter((c: any) => typeof c === 'string' || typeof c === 'number').join('') : x.props.children))
  .join(' ');
const нажимаемые = (r: any) => r.root.findAll((n: any) => n.props && typeof n.props.onPress === 'function', { deep: true });
async function нажать(узел: any) {
  await TestRenderer.act(async () => { узел.props.onPress({ nativeEvent: {}, preventDefault() {}, stopPropagation() {} }); });
  await осесть();
}

async function смонтировать() {
  await AsyncStorage.clear();
  await AsyncStorage.setItem('psygames_active_profile', 'free');
  /* eslint-disable @typescript-eslint/no-require-imports -- провайдеры после моков */
  const { ThemeProvider } = require('@/src/contexts/ThemeContext');
  const { LanguageProvider } = require('@/src/contexts/LanguageContext');
  const { ProfileProvider } = require('@/src/contexts/ProfileContext');
  const { SafeAreaProvider } = require('react-native-safe-area-context');
  const Screen = require('@/app/games/inhibition').default;
  /* eslint-enable @typescript-eslint/no-require-imports */
  let r: any;
  await TestRenderer.act(async () => {
    r = TestRenderer.create(React.createElement(SafeAreaProvider, {
      initialMetrics: { frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } },
    }, React.createElement(ProfileProvider, null, React.createElement(ThemeProvider, null,
      React.createElement(LanguageProvider, null, React.createElement(Screen))))));
  });
  await осесть();
  поднятые.push(r);
  return r;
}

/** Текст кнопки собирается из вложенных узлов дважды («Mixed Mixed»), поэтому повтор допустим. */
const РЕЖИМЫ: [string, RegExp][] = [
  ['go_no_go', /^(Go \/ No-Go: Inhibition\s*)+$/],
  ['stop_signal', /^(Stop-Signal: Inhibition\s*)+$/],
  ['mixed', /^(Mixed\s*)+$/],
];

describe('«Торможение»: партии под своим game_type', () => {
  it.each(РЕЖИМЫ)('режим %s → game_type inhibition, режим в details.submode', async (режим, подпись) => {
    const r = await смонтировать();
    const понятно = нажимаемые(r).find((b: any) => /^got it$/i.test(текстУзла(b).trim()));
    if (понятно) await нажать(понятно);
    const кнопкаРежима = нажимаемые(r).find((b: any) => подпись.test(текстУзла(b).trim()));
    expect(кнопкаРежима ? 'кнопка режима есть' : `нет кнопки режима «${подпись.source}»`).toBe('кнопка режима есть');
    await нажать(кнопкаРежима);
    const старт = нажимаемые(r).find((b: any) => String(b.props.accessibilityLabel) === 'Start')
      ?? нажимаемые(r).find((b: any) => /^start$/i.test(текстУзла(b).trim()));
    expect(старт ? 'кнопка Start есть' : 'нет кнопки Start').toBe('кнопка Start есть');
    await нажать(старт);
    await крутить(180_000);
    expect(записи.length ? 'партия записана' : 'за 180 с партия не записалась — проверять нечего').toBe('партия записана');
    const з = записи[записи.length - 1];
    expect({ game_type: з.game_type, submode: з.details?.submode }).toEqual({ game_type: 'inhibition', submode: режим });
  });
});
