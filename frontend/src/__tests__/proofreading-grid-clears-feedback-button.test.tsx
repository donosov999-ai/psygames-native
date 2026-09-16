/* psygames-proofreading-grid-clears-feedback-button · VER 1 · 16.09.2026 */
/**
 * СЕТКА «КОРРЕКТУРЫ» НЕ ЗАХОДИТ ПОД КНОПКУ ОТЗЫВА — НИ НА ОДНОМ УРОВНЕ И ОКНЕ.
 *
 * 📍 ЗАМЕР ДО (16.09.2026, живая сборка, уровни проходились касаниями, в центре
 * каждой клетки `elementFromPoint`): 390×844 — L1 закрыто 0 клеток, L2 — 1, L3 — 1;
 * 360×640 — одна уже на L1. Закрывала «Сообщить о проблеме» (48×48, слева 14,
 * низ = insets.bottom + 92). Причина в экране: бюджет высоты `высота − 210` — догадка
 * о том, что над сеткой, — и никакого резерва под ней.
 *
 * 🔴 ПОЧЕМУ ПРОБА ПО ВСЕМ УРОВНЯМ, А НЕ НА СВЕЖЕМ ПРОФИЛЕ. Поле растёт с уровнем
 * (8×8 → 16×12), кнопка стоит на месте. Утренняя приёмка мерила свежий профиль, то
 * есть только L1, и записала «срезанных нет» — на 360×640 это было неверно уже там.
 *
 * Модель поля — факты каркаса, сверенные живьём: прокручиваемое поле начинается под
 * ВЕРХ_ПОЛЯ, сверху зазор 5 (PAD_V), снизу отступ 8 + вырез, содержимое по центру.
 * Сверка: для L3 на 390×844 модель дала низ сетки 749, прибор — низ ТЕКСТА 740 в
 * клетке 43, то есть ровно низ клетки. Верх кнопки берётся у самой кнопки
 * (`fabPosition`), а не у проверяемого экрана.
 */
import React from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { сеткаКорректуры } from '@/src/games/attention/layout';
import { ВЕРХ_ПОЛЯ } from '@/src/components/gameLayout';
import { FAB_BOTTOM, FAB_SIZE } from '@/src/services/fabPosition';

declare const __dirname: string;

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: () => {}, replace: () => {}, back: () => {} }),
  useLocalSearchParams: () => ({}),
  router: { canGoBack: () => false, back: () => {}, replace: () => {} },
}));
/* 🔴 Окно 360×640 нарочно. На широком окне клетка L1 упирается в ШИРИНУ, и старая
   формула `высота − 210` дала бы ту же клетку, что ядро, — проверка «экран берёт
   клетку из ядра» была бы зелёной и при возврате догадки. На 360×640 по высоте
   упирается, и формулы расходятся (старая 41, ядро меньше). Это же окно, где
   кнопка закрывала клетку уже на L1. */
jest.mock('@/src/hooks/useScreenWidth', () => ({
  ...jest.requireActual('@/src/hooks/useScreenWidth'),
  useScreenSize: () => ({ w: 360, h: 640 }),
}));
jest.mock('@/src/services/api', () => ({
  ...jest.requireActual('@/src/services/api'),
  saveSession: async (s: any) => s,
}));

// eslint-disable-next-line @typescript-eslint/no-require-imports -- загрузка ПОСЛЕ jest.mock
const TestRenderer = require('react-test-renderer');
// eslint-disable-next-line @typescript-eslint/no-require-imports -- после моков
const экран = require('@/app/games/proofreading');

const ЗАЗОР_СВЕРХУ = 5;       // GameShell: fieldScrollContent paddingVertical = PAD_V
const ОТСТУП_СНИЗУ = 8;       // GameShell: поле без полосы ответа, paddingBottom = 8 + bottomSafe
const ОКНА: [number, number][] = [[360, 640], [375, 667], [375, 812], [390, 844], [412, 915]];
const ВЫРЕЗЫ = [0, 34];
const НАД_БУКВАМИ = 88;        // блок задания 80 + его отступ 8 — замер 390×844
const НАД_СЕРИЕЙ = 27 + 88;    // строка «Блок n из 3» + блок задания

/** Где окажется низ сетки: сразу (блок влез и стоит по центру) или после прокрутки до конца. */
function низСетки(H: number, вырез: number, над: number, рядов: number, клетка: number, R: number) {
  const верх = ВЕРХ_ПОЛЯ + ЗАЗОР_СВЕРХУ;
  const низ = H - ОТСТУП_СНИЗУ - вырез;
  const блок = над + рядов * клетка + R;
  if (блок <= низ - верх) {
    const сверху = верх + (низ - верх - блок) / 2;
    return { низ: сверху + над + рядов * клетка, прокрутка: false };
  }
  return { низ: низ - R, прокрутка: true };
}
const верхКнопки = (H: number, вырез: number) => H - вырез - FAB_BOTTOM - FAB_SIZE;

type Случай = { имя: string; H: number; W: number; вырез: number; над: number; рядов: number; столбцов: number; пол?: number };
function случаи(): Случай[] {
  const вых: Случай[] = [];
  for (const [W, H] of ОКНА) for (const вырез of ВЫРЕЗЫ) {
    for (let L = 1; L <= экран.MAX_LEVEL; L++) {
      const { rows, cols } = экран.levelParams(L);
      вых.push({ имя: `буквы L${L} ${W}×${H} вырез ${вырез}`, H, W, вырез, над: НАД_БУКВАМИ, рядов: rows, столбцов: cols });
    }
    for (const сторона of [5, 6, 7, 8]) {
      вых.push({ имя: `серия ${сторона}×${сторона} ${W}×${H} вырез ${вырез}`, H, W, вырез, над: НАД_СЕРИЕЙ, рядов: сторона, столбцов: сторона, пол: 24 });
    }
  }
  return вых;
}
const посчитать = (с: Случай) => сеткаКорректуры({
  ширинаПоля: с.W - 30, высотаОкна: с.H, низВыреза: с.вырез,
  столбцов: с.столбцов, рядов: с.рядов, надСеткой: с.над, пол: с.пол,
});

describe('«Корректура»: сетка не заходит под кнопку отзыва', () => {
  it('есть что мерить: оба пути модели встречаются — и «влезло», и «прокрутка»', () => {
    const все = случаи();
    expect(экран.MAX_LEVEL).toBeGreaterThanOrEqual(15);
    const пути = new Set(все.map((с) => { const р = посчитать(с); return низСетки(с.H, с.вырез, с.над, с.рядов, р.клетка, р.резервСнизу).прокрутка; }));
    expect([...пути].sort()).toEqual([false, true]);
  });

  it('🔴 на КАЖДОМ уровне, окне и вырезе низ сетки выше верха кнопки', () => {
    const плохо: string[] = [];
    for (const с of случаи()) {
      const р = посчитать(с);
      const н = низСетки(с.H, с.вырез, с.над, с.рядов, р.клетка, р.резервСнизу);
      if (н.низ > верхКнопки(с.H, с.вырез)) плохо.push(`${с.имя}: низ ${н.низ} > кнопка ${верхКнопки(с.H, с.вырез)}`);
    }
    expect(плохо).toEqual([]);
  });

  it('🔴 бюджет честный: пока клетка не упёрлась в пол, прокрутка не нужна', () => {
    /* Догадка `высота − 210` нарушала именно это: клетка считалась крупнее, чем место.
       ⚠️ Мерим МОДЕЛЬЮ ПОЛЯ из этой пробы, а не флагом `безПрокрутки` ядра: первая версия
       брала флаг, и мутация «ядро переоценило поле» проходила зелёной — ядро было
       согласно само с собой. */
    const плохо: string[] = [];
    for (const с of случаи()) {
      const р = посчитать(с);
      const н = низСетки(с.H, с.вырез, с.над, с.рядов, р.клетка, р.резервСнизу);
      if (р.клетка > (с.пол ?? 22) && н.прокрутка) плохо.push(`${с.имя}: клетка ${р.клетка}, а блок не влез`);
    }
    expect(плохо).toEqual([]);
  });

  it('🔴 резерв сам по себе перекрывает кнопку — это держит даже поле в полу', () => {
    for (const вырез of ВЫРЕЗЫ) {
      const { резервСнизу } = сеткаКорректуры({ ширинаПоля: 300, высотаОкна: 844, низВыреза: вырез, столбцов: 8, рядов: 8, надСеткой: 88 });
      expect(резервСнизу + ОТСТУП_СНИЗУ).toBeGreaterThanOrEqual(FAB_BOTTOM + FAB_SIZE);
    }
  });
});

describe('«Корректура»: у КАЖДОЙ сетки экрана резерв снизу', () => {
  it('🔴 все три сетки (буквы, филворды, серия) несут резерв — замок на место показа', () => {
    /* Проверка ПРИЁМА, а не поведения, и это сказано честно: рендер ниже открывает только
       режим букв, серию он не видит. Мутация «у сетки серии нет резерва» проходила бы
       зелёной. Поэтому здесь считаем: сколько сеток на styles.gridContainer — столько
       же обязано нести marginBottom: резервСнизу. */
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const src: string = require('fs').readFileSync(require('path').join(__dirname, '../../app/games/proofreading.tsx'), 'utf8');
    const сетки = src.match(/styles\.gridContainer,\s*\{[^}]*\}/g) ?? [];
    expect(сетки.length).toBe(3);
    expect(сетки.filter((с) => /marginBottom:\s*резервСнизу/.test(с)).length).toBe(3);
  });
});

describe('«Корректура»: экран берёт размер и резерв из ядра', () => {
  const поднятые: any[] = [];
  afterEach(() => {
    while (поднятые.length) { const r = поднятые.pop(); try { TestRenderer.act(() => { r.unmount(); }); } catch { /* погашено */ } }
  });
  const осесть = async () => { await TestRenderer.act(async () => { for (let i = 0; i < 30; i += 1) await Promise.resolve(); }); };

  it('🔴 у сетки резерв снизу, и клетка та, что посчитало ядро', async () => {
    await AsyncStorage.clear();
    /* eslint-disable @typescript-eslint/no-require-imports -- провайдеры после моков */
    const { ThemeProvider } = require('@/src/contexts/ThemeContext');
    const { LanguageProvider } = require('@/src/contexts/LanguageContext');
    const { ProfileProvider } = require('@/src/contexts/ProfileContext');
    const { SafeAreaProvider } = require('react-native-safe-area-context');
    const { StyleSheet } = require('react-native');
    const { ширинаПодПоле } = require('@/src/games/fillwords/core/generator');
    /* eslint-enable @typescript-eslint/no-require-imports */
    /* Размер окна, который видит экран, — из мока выше. Сработал ли мок, доказывает
       различающая проверка ширины сетки: иначе экран взял бы другой размер. */
    const размер = { w: 360, h: 640 };
    let r: any;
    await TestRenderer.act(async () => {
      r = TestRenderer.create(React.createElement(SafeAreaProvider, {
        initialMetrics: { frame: { x: 0, y: 0, width: 360, height: 640 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } },
      }, React.createElement(ProfileProvider, null, React.createElement(ThemeProvider, null,
        React.createElement(LanguageProvider, null, React.createElement(экран.default))))));
    });
    await осесть();
    поднятые.push(r);
    const старт = r.root.findAll((n: any) => n.props && n.props.accessibilityRole === 'button'
      && typeof n.props.onPress === 'function' && String(n.props.accessibilityLabel ?? '') === 'Start', { deep: true })[0];
    expect(старт).toBeTruthy();
    await TestRenderer.act(async () => { старт.props.onPress(); });
    await осесть();

    const сетки = r.root.findAll((n: any) => n.props && n.props.testID === 'proof-grid' && typeof n.type === 'string', { deep: true });
    expect(сетки.length).toBeGreaterThan(0);
    const стиль = StyleSheet.flatten(сетки[0].props.style) as { width: number; marginBottom?: number };
    expect(стиль.marginBottom ?? 0).toBeGreaterThanOrEqual(FAB_BOTTOM + FAB_SIZE - ОТСТУП_СНИЗУ);

    const { rows, cols } = экран.levelParams(1);
    const ждём = сеткаКорректуры({
      ширинаПоля: ширинаПодПоле(размер.w, false), высотаОкна: размер.h, низВыреза: 0,
      столбцов: cols, рядов: rows, надСеткой: НАД_БУКВАМИ,
    });
    // Проверка обязана различать: старая догадка на этом окне дала бы ДРУГУЮ клетку.
    const догадка = Math.max(22, Math.min(Math.floor(ширинаПодПоле(360, false) / cols), Math.floor((640 - 210) / rows), 72));
    expect(догадка).not.toBe(ждём.клетка);
    expect(стиль.width).toBe(ждём.клетка * cols);
  });
});
