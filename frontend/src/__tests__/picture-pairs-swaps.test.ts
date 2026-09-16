/**
 * 🔴 ОБМЕНЫ МЕСТАМИ ИСПОЛНЯЮТСЯ НА ЭКРАНЕ, А НЕ ТОЛЬКО ОБЪЯВЛЕНЫ В levelCfg.
 *
 * Ось «Парных картинок» выше L21 (задача 2fb42171): после ошибки закрытые карты меняются
 * местами, пара за парой. Проба ладдера (`picture-pairs-ladder-grows`) читает только
 * объявление — а в разделе уже был дефект, где формула обещала 43 клетки, а поле давало 17.
 *
 * ЧТО ЗДЕСЬ СТОРОЖИТСЯ, ПОВЕДЕНИЕМ НАСТОЯЩЕГО ЭКРАНА:
 *   1. L37 (ровно 4 обмена на ошибку): после ошибки подсвечены ДВЕ закрытые карты, и
 *      поменялись местами ровно они — остальная раскладка не тронута, набор картинок тот же;
 *   2. обменов ровно четыре, после них поле отпирается;
 *   3. секундомер на время обменов стоит — это время навязано игрой;
 *   4. L21 (верх объёма): ошибка — и ничего не переезжает, подсветки нет.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import React from 'react';

declare function require(m: string): any;
const TestRenderer = require('react-test-renderer');

jest.setTimeout(90000);

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: () => {}, replace: () => {}, back: () => {} }),
  useLocalSearchParams: () => ({}),
  router: { canGoBack: () => false, back: () => {}, replace: () => {} },
}));
jest.mock('@/src/services/api', () => ({
  ...jest.requireActual('@/src/services/api'),
  saveSession: async () => ({ ok: true }),
}));
/**
 * ⚠️ УРОВЕНЬ ПОДСТАВЛЕН, А НЕ ЗАПИСАН В ХРАНИЛИЩЕ: ключ уровня собирается из id профиля,
 * и угаданный ключ молча дал бы L1, где обменов нет, — проба зеленела бы вхолостую.
 */
let mockLevel = 37;
jest.mock('@/src/hooks/usePersistentLevel', () => ({
  ...jest.requireActual('@/src/hooks/usePersistentLevel'),
  usePersistentLevel: () => ({ level: mockLevel, best: mockLevel, loaded: true, reach: () => false, fail: () => false, pick: () => {} }),
}));

function mount() {
  const { ThemeProvider } = require('@/src/contexts/ThemeContext');
  const { LanguageProvider } = require('@/src/contexts/LanguageContext');
  const { ProfileProvider } = require('@/src/contexts/ProfileContext');
  const { WarmupProvider } = require('@/src/contexts/WarmupContext');
  const { SafeAreaProvider } = require('react-native-safe-area-context');
  const Screen = require('@/app/games/picture-pairs').default;
  const metrics = { frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } };
  let r: any;
  TestRenderer.act(() => {
    r = TestRenderer.create(
      React.createElement(SafeAreaProvider, { initialMetrics: metrics },
        React.createElement(ProfileProvider, null,
          React.createElement(ThemeProvider, null,
            React.createElement(LanguageProvider, null,
              React.createElement(WarmupProvider, null, React.createElement(Screen)))))));
  });
  return r;
}

const settle = async () => {
  await TestRenderer.act(async () => { for (let i = 0; i < 40; i++) await Promise.resolve(); });
};
const tick = async (ms: number) => {
  await TestRenderer.act(async () => {
    for (let left = ms; left > 0; left -= 50) {
      jest.advanceTimersByTime(Math.min(50, left));
      await Promise.resolve(); await Promise.resolve();
    }
  });
};
const карты = (r: any) => r.root.findAll((n: any) => typeof n.props?.flipped === 'boolean' && typeof n.props?.matched === 'boolean' && typeof n.props?.onPress === 'function');
/** Какая картинка лежит в клетке — по лицу карты; лицо отрисовано и у закрытой. */
const лица = (r: any) => карты(r).map((n: any) => JSON.stringify(n.props.front?.props?.children?.props?.source));
const подсвеченные = (r: any) => карты(r).map((n: any, i: number) => (n.props.back?.props?.testID === 'pp-swap-lit' ? i : -1)).filter((i: number) => i >= 0);
const заперто = (r: any) => карты(r).filter((n: any) => !n.props.matched && !n.props.flipped).every((n: any) => n.props.disabled);
const секунды = (r: any) => Number((String(r.root.findAll((n: any) => n.props?.icon === 'time' && n.props?.value !== undefined)[0]?.props.value ?? '').match(/\d+/) || ['NaN'])[0]);

async function войтиВПартию(r: any) {
  await settle();
  const старт = r.root.findAll((n: any) => typeof n.props?.onStart === 'function')[0];
  await TestRenderer.act(async () => { старт.props.onStart(); });
  await settle();
  await tick(50);
  const открытое = r.root.findAll((n: any) => n.props?.lr?.open === true)[0];
  if (открытое) { await TestRenderer.act(async () => { открытое.props.lr.setOpen(false); }); await settle(); }
  await tick(400);   // показ на этих уровнях 250 мс
}

/** Ошибка наверняка: первая карта и три других, среди которых есть картинка не как у первой. */
async function ошибиться(r: any) {
  const л = лица(r);
  const чужая = л.findIndex((f: string) => f !== л[0]);
  expect(`на поле есть разные картинки: ${чужая > 0}`).toBe('на поле есть разные картинки: true');
  const ход = [0, чужая, ...л.map((_: string, i: number) => i).filter((i: number) => i !== 0 && i !== чужая).slice(0, 2)];
  for (const i of ход) {
    await TestRenderer.act(async () => { карты(r)[i].props.onPress(); });
  }
  await settle();
}

beforeEach(async () => {
  jest.useFakeTimers();
  await AsyncStorage.clear();
});
afterEach(() => { jest.useRealTimers(); });

describe('picture-pairs: обмены местами после ошибки', () => {
  it('🔴 L37: подсвечены две закрытые карты, переезжают ровно они; четыре обмена, потом поле открыто и часы шли только вне обменов', async () => {
    mockLevel = 37;
    const r = mount();
    try {
      await войтиВПартию(r);
      expect(`карт на поле: ${карты(r).length}, закрыто: ${карты(r).filter((n: any) => !n.props.flipped).length}`).toBe('карт на поле: 48, закрыто: 48');
      await tick(1500);   // часы уже идут — чтобы было что замораживать
      await ошибиться(r);
      await tick(800);    // ошибка видна 800 мс, карты закрываются
      const до = лица(r);
      const набор = [...до].sort().join('|');
      await tick(150);    // пауза перед первой парой
      const часыНаОбменах = секунды(r);
      const пары: string[] = [];
      for (let k = 1; k <= 4; k++) {
        const пара = подсвеченные(r);
        expect(`обмен ${k}: подсвечено ${пара.length}, поле заперто: ${заперто(r)}`).toBe(`обмен ${k}: подсвечено 2, поле заперто: true`);
        const перед = лица(r);
        await tick(450);  // пара видна, затем меняется местами
        const после = лица(r);
        const сдвинулись = после.map((f: string, i: number) => (f !== перед[i] ? i : -1)).filter((i: number) => i >= 0);
        const [a, b] = пара;
        expect(`обмен ${k}: сдвинулись только подсвеченные — ${сдвинулись.every((i: number) => i === a || i === b)}; обмен честный — ${после[a] === перед[b] && после[b] === перед[a]}`)
          .toBe(`обмен ${k}: сдвинулись только подсвеченные — true; обмен честный — true`);
        пары.push(`${a}↔${b}`);
        await tick(150);
      }
      expect(`после четырёх обменов подсвечено: ${подсвеченные(r).length}, поле заперто: ${заперто(r)}`).toBe('после четырёх обменов подсвечено: 0, поле заперто: false');
      expect(`набор картинок тот же: ${[...лица(r)].sort().join('|') === набор}`).toBe('набор картинок тот же: true');
      expect(`часы за ~2,5 с обменов ушли на: ${секунды(r) - часыНаОбменах} с`).toBe('часы за ~2,5 с обменов ушли на: 0 с');
      await tick(2100);
      expect(`после обменов часы снова идут: ${секунды(r) > часыНаОбменах}`).toBe('после обменов часы снова идут: true');
      await tick(2000);
      expect(`пятого обмена нет: подсвечено ${подсвеченные(r).length}`).toBe('пятого обмена нет: подсвечено 0');
    } finally {
      TestRenderer.act(() => r.unmount());
    }
  });

  it('L21, верх объёма: после ошибки ничего не переезжает и подсветки нет', async () => {
    mockLevel = 21;
    const r = mount();
    try {
      await войтиВПартию(r);
      await ошибиться(r);
      await tick(800);
      const до = лица(r);
      let виденоПодсветки = 0;
      for (let t = 0; t < 30; t++) { await tick(100); виденоПодсветки += подсвеченные(r).length; }
      expect(`подсветки: ${виденоПодсветки}, сдвинулось клеток: ${лица(r).filter((f: string, i: number) => f !== до[i]).length}, заперто: ${заперто(r)}`)
        .toBe('подсветки: 0, сдвинулось клеток: 0, заперто: false');
    } finally {
      TestRenderer.act(() => r.unmount());
    }
  });
});
