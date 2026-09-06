/**
 * 🔴 КУСКИ ТОРТА ВИДНЫ. ПРОВЕРКА ЗАВЕДЕНА ПОСЛЕ БОЕВОГО ПРОМАХА, А НЕ ДО.
 *
 * ОТЧЁТ ТЕСТИРОВЩИКА (профиль NZT-48, 06.09.2026): «А где тортики ?» — на
 * тарелках не было НИ ОДНОГО куска. В разметке они были: по шесть путей на
 * тарелку, с верной геометрией и цветами. Их закрывала картинка самой тарелки.
 *
 * ПОЧЕМУ ЭТО ПРОЖИЛО ДО ЖИВОГО ЧЕЛОВЕКА. Девять моих гейтов проверяли ядро
 * тортов — доску, раздачу, решатель, эталон ходов, темы, подсказку, вписывание.
 * Все они честные и все зелёные. НИ ОДИН не смотрел на то, ВИДНО ЛИ ИГРУ:
 * «правильно посчитано» и «нарисовано так, что человек это видит» — разные
 * утверждения, и второе у меня не проверялось ничем.
 *
 * ⚠️ ПРИЧИНА, КОТОРУЮ СТОИТ ЗАПОМНИТЬ. В родном RN порядок отрисовки задаёт
 * порядок в разметке, и картинка, объявленная ПЕРВОЙ, ушла бы вниз сама. На
 * вебе (а сборка Tauri — это вебвью) правило другое: позиционированный элемент
 * красится выше статичного независимо от порядка. `Image` у react-native-web
 * позиционирован (`position: absolute`), `svg` — нет. Отсюда клинья под посудой
 * на вебе при верной разметке для RN. Порядок в JSX здесь НЕ ГАРАНТИЯ.
 *
 * Поэтому проверка не про порядок узлов, а про то, что у слоя с клиньями есть
 * ЯВНОЕ основание краситься выше картинки — и что клинья вообще есть.
 */
import React from 'react';
/*
 * ⚠️ Импорт экрана стоит ВЫШЕ `jest.mock`, и это верно: babel-jest поднимает
 * вызовы `jest.mock` над импортами сам. Обратный порядок дал бы предупреждение
 * `import/first` и ничего не изменил бы по сути.
 */
import CakeSortGame from '@/app/games/cake-sort';

/*
 * ⚠️ Контексты подменяем, а не поднимаем целиком: экран тортов просит тему,
 * язык и профиль, а нам нужна ТОЛЬКО отрисовка тарелки. Поднимать ради этого
 * три поставщика — значит проверять их, а не куски торта. Приём тот же, что в
 * `autostart-plays-real-level`.
 */
jest.mock('@/src/contexts/ThemeContext', () => ({
  useTheme: () => ({ colors: { bg: '#fff', text: '#000', textSecondary: '#666', card: '#eee', border: '#ccc', primary: '#7c6cf0' }, isDark: false }),
}));
jest.mock('@/src/contexts/ProfileContext', () => ({ useProfile: () => ({ profile: { id: 'free' } }) }));
jest.mock('@/src/contexts/LanguageContext', () => ({
  useLanguage: () => ({ t: (k: string) => k, language: 'ru' }),
}));
jest.mock('react-native-safe-area-context', () => {
  /* eslint-disable @typescript-eslint/no-require-imports -- внутри фабрики
     `jest.mock` импорты запрещены самим jest: она поднимается выше них. */
  const React = require('react');
  const { View } = require('react-native');
  return {
    useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
    SafeAreaView: ({ children, ...p }: any) => React.createElement(View, p, children),
    SafeAreaProvider: ({ children }: any) => children,
  };
  /* eslint-enable @typescript-eslint/no-require-imports */
});

const TestRenderer = require('react-test-renderer');  // eslint-disable-line @typescript-eslint/no-require-imports

/** Свести style (массив, вложенность, undefined) в один объект — как это делает RN. */
function плоскийСтиль(s: unknown): Record<string, unknown> {
  if (!s) return {};
  if (Array.isArray(s)) return s.reduce((a: Record<string, unknown>, x) => ({ ...a, ...плоскийСтиль(x) }), {});
  return s as Record<string, unknown>;
}

function нарисовать() {
  let r: any;
  TestRenderer.act(() => { r = TestRenderer.create(<CakeSortGame />); });
  return r;
}

describe('куски торта видно, а не только посчитано', () => {
  const r = нарисовать();

  /**
   * Экран стартует в настройке, доска появляется по «Начать». Поэтому сначала
   * находим кнопку старта и жмём её — иначе проверка смотрела бы на пустой стол
   * и была бы зелена вслепую.
   */
  TestRenderer.act(() => {
    const кнопки = r.root.findAll((n: any) => typeof n.props?.onPress === 'function'
      && typeof n.props?.accessibilityLabel === 'string');
    const старт = кнопки.find((n: any) => /начать|start/i.test(n.props.accessibilityLabel));
    if (старт) старт.props.onPress();
  });

  const пути = () => r.root.findAll((n: any) => n.type === 'Path' || n.type === 'RNSVGPath');
  const свг = () => r.root.findAll((n: any) => n.type === 'Svg' || n.type === 'RNSVGSvgView');

  it('🔴 есть что проверять: на столе нарисованы клинья', () => {
    // Шесть секторов на круг; на стартовом столе тарелок минимум пять.
    expect(пути().length).toBeGreaterThanOrEqual(6);
  });

  it('🔴 слой с клиньями поднят над картинкой тарелки ЯВНО', () => {
    const слои = свг();
    expect(слои.length).toBeGreaterThan(0);
    const без: string[] = [];
    слои.forEach((n: any, i: number) => {
      const st = плоскийСтиль(n.props?.style);
      const поднят = Number(st.zIndex) > 0 || st.position === 'absolute';
      if (!поднят) без.push(`слой ${i}: ${JSON.stringify(st)}`);
    });
    expect(без).toEqual([]);
  });

  /**
   * И обратная сторона: картинка тарелки на месте. Без этого пункт выше можно
   * было бы «починить», убрав тарелки совсем, — стол стал бы плоским, а гейт
   * зелёным.
   */
  it('картинка тарелки никуда не делась', () => {
    const картинки = r.root.findAll((n: any) => n.type === 'Image' && n.props?.source);
    expect(картинки.length).toBeGreaterThan(0);
  });

  afterAll(() => { TestRenderer.act(() => { r.unmount(); }); });
});
