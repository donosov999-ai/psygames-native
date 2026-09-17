/* psygames-mental-rotation-landscape-review · VER 1 · 17.09.2026 */
/* psygames-spatial-claude-mac · задача 5de33bb4 */
/**
 * 🔴 РАЗБОР В АЛЬБОМЕ НЕ ПРЯЧЕТ ЭТАЛОН: ПОДПИСЬ И КНОПКА — СБОКУ ОТ РЯДА, КАРТОЧКИ НЕ РАСТУТ.
 *
 * Замер 17.09.2026 на экспорт-сборке (шесть альбомных окон, все виды заданий): в момент ответа
 * тесный разбор растягивал карточки вариантов по ширине полосы и ставил под ряд подпись и кнопку
 * «Следующий раунд». Полоса росла, поле сжималось до 21–91 px — эталона было видно 0–64 px
 * из 96–131, на 740×360 кнопка уходила ниже окна. Размеры считает `optionLayout` (его стережёт
 * mental-rotation-options-fill), а эта проба — что экран на деле ставит колонку сбоку и не
 * растит карточки: настоящий экран, настоящая партия, ответ до промаха.
 * Живой замер высоты — `frontend/scripts/rotation-landscape-fit.mjs` (мерит и разбор).
 */
import React from 'react';
import { StyleSheet } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const TestRenderer = require('react-test-renderer');

let mockScreen = { w: 844, h: 390 };
jest.mock('@/src/hooks/useScreenWidth', () => ({
  ...jest.requireActual('@/src/hooks/useScreenWidth'),
  useScreenSize: () => mockScreen,
}));
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: () => {}, replace: () => {}, back: () => {} }),
  useLocalSearchParams: () => ({}),
  router: { canGoBack: () => false, back: () => {}, replace: () => {} },
}));
jest.mock('@/src/services/api', () => ({
  ...jest.requireActual('@/src/services/api'),
  saveSession: async (s: any) => s,
}));
/** Партия из основного вида «Поворот»: у него разбор полный (станок доворота), и он самый частый. */
jest.mock('@/src/games/mental-rotation/core', () => {
  const actual = jest.requireActual('@/src/games/mental-rotation/core');
  return { ...actual, planTaskKinds: (_level: number, trials: number) => Array.from({ length: trials }, () => 'rotation') };
});

const текст = (node: any): string => {
  const out: string[] = [];
  const walk = (n: any) => { if (n == null) return; if (typeof n === 'string') { out.push(n); return; } if (Array.isArray(n)) { n.forEach(walk); return; } walk(n.props?.children ?? n.children); };
  walk(node); return out.join(' ');
};
const поId = (r: any, id: string) => r.root.findAll((n: any) => typeof n.type === 'string' && n.props?.testID === id);

async function осесть(кругов = 6, шаг = 500) {
  for (let i = 0; i < кругов; i += 1) {
    await TestRenderer.act(async () => { jest.advanceTimersByTime(шаг); for (let k = 0; k < 30; k += 1) await Promise.resolve(); });
  }
}

/** Экран в окне `w×h` до открытого разбора. Возвращает рендерер и ширины карточек до и после ответа. */
async function доРазбора(w: number, h: number, язык?: string) {
  mockScreen = { w, h };
  await AsyncStorage.clear();
  if (язык) await AsyncStorage.setItem('language', язык);
  /* eslint-disable @typescript-eslint/no-require-imports */
  const { ThemeProvider } = require('@/src/contexts/ThemeContext');
  const { LanguageProvider } = require('@/src/contexts/LanguageContext');
  const { ProfileProvider } = require('@/src/contexts/ProfileContext');
  const { PlayerLevelValue } = require('@/src/contexts/PlayerLevelContext');
  const { SafeAreaProvider } = require('react-native-safe-area-context');
  const { WarmupProvider } = require('@/src/contexts/WarmupContext');
  const Screen = require('@/app/games/mental-rotation').default;
  /* eslint-enable @typescript-eslint/no-require-imports */
  const METRICS = { frame: { x: 0, y: 0, width: w, height: h }, insets: { top: 0, left: 0, right: 0, bottom: 0 } };
  let r: any;
  await TestRenderer.act(async () => {
    r = TestRenderer.create(React.createElement(SafeAreaProvider, { initialMetrics: METRICS },
      React.createElement(ProfileProvider, null, React.createElement(ThemeProvider, null, React.createElement(LanguageProvider, null,
        React.createElement(PlayerLevelValue, { level: 8 }, React.createElement(WarmupProvider, null, React.createElement(Screen))))))));
  });
  await осесть();
  const старт = r.root.findAll((n: any) => n.props?.accessibilityRole === 'button' && typeof n.props?.onPress === 'function' && /начать|start|play|играть|ابدأ/i.test(текст(n)));
  await TestRenderer.act(async () => { старт[0].props.onPress(); });
  await осесть(2, 100);
  const варианты = () => r.root.findAll((n: any) => typeof n.type !== 'string' && /вариант|option|الخيار/i.test(String(n.props?.accessibilityLabel ?? '')) && typeof n.props?.onPress === 'function');
  const ширины = () => [...new Set(варианты().map((n: any) => StyleSheet.flatten(n.props.style)?.width))];
  const доОтвета: unknown[] = [];
  let разбор = false;
  for (let i = 0; i < 12 && !разбор; i++) {
    const живые = варианты().filter((n: any) => !n.props.disabled);
    if (!живые.length) { await осесть(3); continue; }
    доОтвета.splice(0, доОтвета.length, ...ширины());
    await TestRenderer.act(async () => { живые[i % живые.length].props.onPress(); });
    await осесть(1, 100);
    разбор = поId(r, 'mental-review-next').length > 0;
    if (!разбор) await осесть(3);
  }
  // Текст внутри карточек вариантов: в «Повороте» рисунок — SVG, значит любой текст там — подпись разбора.
  const подписейВКарточках = варианты().reduce((s: number, v: any) => s + v.findAll((x: any) => x.type === 'Text').length, 0);
  return { r, разбор, доОтвета, вРазборе: ширины(), подписейВКарточках };
}

describe('разбор «Мысленного вращения» в альбоме', () => {
  beforeEach(() => { jest.useFakeTimers(); });
  afterEach(() => { jest.useRealTimers(); });

  it('🔴 844×390: кнопка и подпись — в колонке сбоку, карточки вариантов того же размера, что до ответа', async () => {
    const { r, разбор, доОтвета, вРазборе, подписейВКарточках } = await доРазбора(844, 390);
    expect(`разбор открылся: ${разбор}`).toBe('разбор открылся: true');
    const колонка = поId(r, 'mental-review-side');
    expect(колонка.length).toBe(1);
    expect(колонка[0].findAll((n: any) => typeof n.type === 'string' && n.props?.testID === 'mental-review-next').length).toBe(1);
    expect(колонка[0].findAll((n: any) => typeof n.type === 'string' && n.props?.testID === 'mental-picked-note').length).toBe(1);
    // одна кнопка на экране — не осталась ли старая под рядом
    expect(поId(r, 'mental-review-next').length).toBe(1);
    // карточки не выросли: ширина та же, что в задании (в альбоме она задана числом)
    expect(typeof доОтвета[0]).toBe('number');
    expect(вРазборе).toEqual(доОтвета);
    // подписи под каждой карточкой в альбоме не встают — «верный ответ» виден рамкой
    expect(`подписей в карточках: ${подписейВКарточках}`).toBe('подписей в карточках: 0');
    await TestRenderer.act(async () => { r.unmount(); });
  });

  it('🔴 сторона колонки: кнопка отзыва слева — колонка справа; в арабском кнопка справа — колонка слева', async () => {
    const сторона = (r: any) => {
      const стиль = StyleSheet.flatten(поId(r, 'mental-review-side')[0]?.props.style) ?? {};
      return `left ${стиль.left ?? '—'} · right ${стиль.right ?? '—'}`;
    };
    const ru = await доРазбора(844, 390, 'ru');
    expect(`разбор открылся: ${ru.разбор}`).toBe('разбор открылся: true');
    expect(сторона(ru.r)).toBe('left 50% · right —');
    await TestRenderer.act(async () => { ru.r.unmount(); });
    const ar = await доРазбора(844, 390, 'ar');
    expect(`разбор открылся: ${ar.разбор}`).toBe('разбор открылся: true');
    expect(сторона(ar.r)).toBe('left — · right 50%');
    await TestRenderer.act(async () => { ar.r.unmount(); });
  });

  it('портрет 390×844: колонки нет, подписи под карточками, кнопка под рядом — как было', async () => {
    const { r, разбор, подписейВКарточках } = await доРазбора(390, 844);
    expect(`разбор открылся: ${разбор}`).toBe('разбор открылся: true');
    expect(поId(r, 'mental-review-side').length).toBe(0);
    expect(поId(r, 'mental-review-next').length).toBe(1);
    expect(подписейВКарточках).toBeGreaterThanOrEqual(3);
    await TestRenderer.act(async () => { r.unmount(); });
  });
});
