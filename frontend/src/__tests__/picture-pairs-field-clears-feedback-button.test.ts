/**
 * 🔴 ПОЛЕ «ПАРНЫХ КАРТИНОК» НЕ ЗАХОДИТ ПОД КНОПКУ ОТЗЫВА — И НА ТЕЛЕФОНЕ С ВЫРЕЗОМ ТОЖЕ.
 *
 * ЗАМЕР ДО (живая сборка 16.09.2026, L37, 48 карт): кнопка отзыва слева внизу закрывала
 * «Карточку 43» на 38 % при 390×844 и «Карточку 37» на 94 % при 360×640. Прокручиваемого
 * предка у поля не было — карту под кнопкой не достать. Держалось с L21 (там карт
 * становится 48); пункт приёмки «ответ на поле» мерился только на L5 и L14.
 *
 * ЧТО СТОРОЖИТСЯ, ПО ОТРИСОВАННОМУ ДЕРЕВУ НАСТОЯЩЕГО ЭКРАНА:
 *   1. все карты лежат ВНУТРИ прокрутки поля — на 360×640 48 карт по 48 точек выше кнопки
 *      не помещаются, и достать нижние можно только прокруткой;
 *   2. нижний резерв прокрутки не меньше «вырез + FAB_BOTTOM + FAB_SIZE + зазор»: докрутив
 *      до конца, последний ряд встаёт выше кнопки. С вырезом 34 — отдельно: резерв «Поиска»
 *      `reserveBottom` = 131 + max(вырез, 10) дал бы там 165 при верхе кнопки 174.
 *
 * Число — из `src/services/fabPosition.ts`, там же, откуда его берёт сама кнопка.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import React from 'react';
import { StyleSheet } from 'react-native';
import { FAB_BOTTOM, FAB_SIZE, FAB_CLEARANCE } from '@/src/services/fabPosition';
import { ПАЛЕЦ } from '@/src/components/gameLayout';
import { levelCfg, сеткаПар } from '@/app/games/picture-pairs';

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
/** Уровень подставлен: ключ уровня собирается из id профиля, угаданный ключ дал бы L1. */
jest.mock('@/src/hooks/usePersistentLevel', () => ({
  ...jest.requireActual('@/src/hooks/usePersistentLevel'),
  usePersistentLevel: () => ({ level: 37, best: 37, loaded: true, reach: () => false, fail: () => false, pick: () => {} }),
}));

/** Зазор между последним рядом и кнопкой, меньше которого считаем «впритык». */
const ЗАЗОР = 8;

function mount(W: number, H: number, вырез: number) {
  const { ThemeProvider } = require('@/src/contexts/ThemeContext');
  const { LanguageProvider } = require('@/src/contexts/LanguageContext');
  const { ProfileProvider } = require('@/src/contexts/ProfileContext');
  const { WarmupProvider } = require('@/src/contexts/WarmupContext');
  const { SafeAreaProvider } = require('react-native-safe-area-context');
  const Screen = require('@/app/games/picture-pairs').default;
  const metrics = { frame: { x: 0, y: 0, width: W, height: H }, insets: { top: вырез ? 47 : 0, left: 0, right: 0, bottom: вырез } };
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
    for (let left = ms; left > 0; left -= 50) { jest.advanceTimersByTime(Math.min(50, left)); await Promise.resolve(); await Promise.resolve(); }
  });
};
const этоКарта = (n: any) => typeof n.props?.flipped === 'boolean' && typeof n.props?.matched === 'boolean' && typeof n.props?.onPress === 'function';

beforeEach(async () => { jest.useFakeTimers(); await AsyncStorage.clear(); });
afterEach(() => { jest.useRealTimers(); });

describe('picture-pairs: поле не заходит под кнопку отзыва', () => {
  for (const [W, H, вырез] of [[390, 844, 0], [360, 640, 0], [393, 852, 34]] as const) {
    it(`🔴 ${W}×${H}, вырез ${вырез}: 48 карт в прокрутке, резерв снизу выше кнопки`, async () => {
      const r = mount(W, H, вырез);
      try {
        await settle();
        const старт = r.root.findAll((n: any) => typeof n.props?.onStart === 'function')[0];
        await TestRenderer.act(async () => { старт.props.onStart(); });
        await settle(); await tick(50);
        const правило = r.root.findAll((n: any) => n.props?.lr?.open === true)[0];
        if (правило) { await TestRenderer.act(async () => { правило.props.lr.setOpen(false); }); await settle(); }
        await tick(400);

        /** Именно ScrollView, а не любой узел с теми же пропами: у View `contentContainerStyle` молча игнорируется. */
        const имяТипа = (n: any) => (typeof n.type === 'string' ? n.type : n.type?.displayName || n.type?.name || '');
        const прокрутки = r.root.findAll((n: any) => n.props?.testID === 'pp-field-scroll' && n.props?.contentContainerStyle !== undefined && /ScrollView/.test(имяТипа(n)));
        const всегоКарт = r.root.findAll(этоКарта).length;
        const внутри = прокрутки.length ? прокрутки[0].findAll(этоКарта).length : 0;
        expect(`прокрутка поля: ${прокрутки.length > 0}, карт в ней ${внутри} из ${всегоКарт}`).toBe('прокрутка поля: true, карт в ней 48 из 48');

        const резерв = Number(StyleSheet.flatten(прокрутки[0].props.contentContainerStyle)?.paddingBottom ?? 0);
        const нужно = вырез + FAB_BOTTOM + FAB_SIZE + ЗАЗОР;
        expect(`резерв ${резерв} ≥ верх кнопки над краем + зазор (${нужно}): ${резерв >= нужно}`)
          .toBe(`резерв ${резерв} ≥ верх кнопки над краем + зазор (${нужно}): true`);
      } finally {
        TestRenderer.act(() => r.unmount());
      }
    });
  }
});

/**
 * Расчёт сетки — отдельно от отрисовки: в пробе раскладки нет (onLayout не приходит),
 * поэтому подгонку по высоте проверяем прямо на функции, на тех высотах поля, что
 * намерены живой сборкой 16.09.2026 (окно прокрутки: 390×844 → 686, 360×640 → 482,
 * 375×667 → 509; 320×568 → 410 — та же разница 158).
 */
describe('picture-pairs: сетка поля помещается над кнопкой, где это возможно при пальце 48', () => {
  const ОКНА = [
    { имя: '390×844', ширина: 390, поле: 686 },
    { имя: '360×640', ширина: 360, поле: 482 },
    { имя: '375×667', ширина: 375, поле: 509 },
    { имя: '320×568', ширина: 320, поле: 410 },
    { имя: '430×932', ширина: 430, поле: 774 },
  ];
  const ПОДСКАЗКА = 44;
  const сетка = (окно: typeof ОКНА[number], L: number, поле = окно.поле) => {
    const c = levelCfg(L);
    const р = сеткаПар({ групп: c.pairs, карт: c.pairs * c.groupSize, ширинаКонтейнера: Math.min(окно.ширина - 32, 480), высотаПоля: поле, резервСнизу: FAB_CLEARANCE, подсказка: ПОДСКАЗКА });
    return { поШирине: (Math.min(окно.ширина - 32, 480) - (р.столбцов - 1) * 8) / р.столбцов, ...р };
  };

  it('ширина сетки никогда не вылезает за контейнер', () => {
    const вылезли: string[] = [];
    for (const о of ОКНА) for (let L = 1; L <= 60; L++) {
      const с = сетка(о, L);
      if (с.ширина > Math.min(о.ширина - 32, 480) + 0.5) вылезли.push(`${о.имя} L${L}: ${с.ширина}`);
    }
    expect(`вылезли: ${вылезли.length}${вылезли.length ? ' — ' + вылезли.slice(0, 4).join(', ') : ''}`).toBe('вылезли: 0');
  });

  it('карта не мельче пальца везде, где это позволяет ширина', () => {
    const мелкие: string[] = [];
    for (const о of ОКНА) for (let L = 1; L <= 60; L++) {
      const с = сетка(о, L);
      if (с.поШирине >= ПАЛЕЦ && с.карта < ПАЛЕЦ) мелкие.push(`${о.имя} L${L}: ${с.карта}`);
    }
    expect(`мельче ${ПАЛЕЦ}: ${мелкие.length}${мелкие.length ? ' — ' + мелкие.slice(0, 4).join(', ') : ''}`).toBe(`мельче ${ПАЛЕЦ}: 0`);
  });

  it('на малых окнах прокрутка остаётся только там, где при пальце 48 иначе нельзя', () => {
    for (const о of ОКНА.slice(1)) {
      const скролл = Array.from({ length: 60 }, (_, i) => i + 1).filter((L) => !сетка(о, L).безПрокрутки);
      // каждая такая сетка уже на пальце: мельче карту сделать нельзя, выше поле не станет
      const небезвыходные = скролл.filter((L) => сетка(о, L).карта > ПАЛЕЦ && сетка(о, L).поШирине > ПАЛЕЦ);
      expect(`${о.имя}: с прокруткой ${скролл.length}, из них карта крупнее пальца ${небезвыходные.length}`)
        .toBe(`${о.имя}: с прокруткой ${скролл.length}, из них карта крупнее пальца 0`);
    }
  });

  it('🔴 на эталонном 390×844 все 60 уровней помещаются над кнопкой без прокрутки', () => {
    const скролл = Array.from({ length: 60 }, (_, i) => i + 1).filter((L) => !сетка(ОКНА[0], L).безПрокрутки);
    expect(`уровней с прокруткой: ${скролл.length}`).toBe('уровней с прокруткой: 0');
  });

  it('🔴 найденный случай: 360×640 L14 (5 рядов) теперь помещается — карта от высоты, не 76 от ширины', () => {
    const с = сетка(ОКНА[1], 14);
    expect(`карта ${с.карта} (по ширине было бы ${с.поШирине}), без прокрутки: ${с.безПрокрутки}`).toBe(`карта ${с.карта} (по ширине было бы 76), без прокрутки: true`);
    expect(с.карта).toBeGreaterThanOrEqual(ПАЛЕЦ);
  });

  it('поле ещё не измерено (0) — сетка ровно прежняя, только по ширине', () => {
    for (const о of ОКНА) for (let L = 1; L <= 60; L++) {
      const с = сетка(о, L, 0);
      expect(`${о.имя} L${L}: ${с.карта}`).toBe(`${о.имя} L${L}: ${Math.floor(с.поШирине)}`);
    }
  });
});
