/*
 * eslint-disable @typescript-eslint/no-require-imports — экран и контексты берутся
 * ПОСЛЕ подмен, иначе в дерево попадут настоящие роутер и запись сессий.
 */
/* eslint-disable @typescript-eslint/no-require-imports */
/**
 * 🔴 «ЧТО СТОИТ НА ПОДСВЕЧЕННОЙ КЛЕТКЕ» — А ПОДСВЕТКИ НЕТ.
 *
 * Отчёт Дениса 03.09.2026 со скриншотом (`9e1e38f3`, версия 2.34.2): «так и не
 * поправили, почему я не могу выбрать фигуру на доске которую хочу вспомнить
 * сейчас». На кадре четыре фишки и НИ ОДНОЙ рамки — вопрос ссылается на подсветку,
 * которой не видно, и тапнуть некуда: клетка без подсветки ещё и отключена
 * (`disabled` в том же условии).
 *
 * ⚠️ Проверяется НАРИСОВАННОЕ дерево: есть ли на доске клетки с рамкой-подсветкой и
 * включены ли они. Чтение исходника тут бессильно — подсветка в коде БЫЛА, вопрос в
 * том, доходит ли она до экрана.
 */
import React from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

const TestRenderer = require('react-test-renderer');

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: () => {}, replace: () => {}, back: () => {} }),
  useLocalSearchParams: () => ({}),
  router: { canGoBack: () => false, back: () => {}, replace: () => {} },
}));
jest.mock('@/src/services/api', () => ({
  ...jest.requireActual('@/src/services/api'),
  saveSession: async (s: any) => s,
}));

jest.useFakeTimers();

const METRICS = { frame: { x: 0, y: 0, width: 430, height: 932 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } };

async function осесть(кругов = 6, мс = 600) {
  for (let i = 0; i < кругов; i += 1) {
    await TestRenderer.act(async () => {
      jest.advanceTimersByTime(мс);
      for (let k = 0; k < 40; k += 1) await Promise.resolve();
    });
  }
}

async function монтировать() {
  await AsyncStorage.clear();
  const { ThemeProvider } = require('@/src/contexts/ThemeContext');
  const { LanguageProvider } = require('@/src/contexts/LanguageContext');
  const { ProfileProvider } = require('@/src/contexts/ProfileContext');
  const { SafeAreaProvider } = require('react-native-safe-area-context');
  const Screen = require('@/app/games/chess-blind').default;
  let r: any;
  await TestRenderer.act(async () => {
    r = TestRenderer.create(
      React.createElement(SafeAreaProvider, { initialMetrics: METRICS },
        React.createElement(ProfileProvider, null,
          React.createElement(ThemeProvider, null,
            React.createElement(LanguageProvider, null, React.createElement(Screen))))),
    );
  });
  await осесть();
  return r;
}

function текст(node: any): string {
  const out: string[] = [];
  const walk = (n: any) => {
    if (n == null) return;
    if (typeof n === 'string') { out.push(n); return; }
    if (Array.isArray(n)) { n.forEach(walk); return; }
    // ⚠️ Сперва НАРИСОВАННЫЕ дети (`n.children`), а не `props.children`: у
    // компонента в props лежит дерево элементов, которое ещё не развёрнуто, и
    // обход по нему возвращал пустоту — из-за этого проба не находила «Start».
    walk(Array.isArray(n.children) && n.children.length > 0 ? n.children : n.props?.children);
  };
  walk(node);
  return out.join(' ');
}

/**
 * Клетки доски: у них подпись поля вида «e4».
 *
 * ⚠️ Один узел на клетку, а не пять. `findAll` отдаёт и композитные, и хостовые
 * узлы с теми же пропсами — первый вид пробы насчитал 320 «клеток» вместо 64.
 * Берём ПЕРВОЕ вхождение каждой подписи: оно самое внешнее, и рамка-подсветка
 * лежит внутри него.
 */
function клетки(r: any): any[] {
  const по: Map<string, any> = new Map();
  for (const n of r.root.findAll((x: any) => /^[a-h][1-8]$/.test(String(x.props?.accessibilityLabel ?? '')))) {
    const имя = String(n.props.accessibilityLabel);
    if (!по.has(имя)) по.set(имя, n);
  }
  return [...по.values()];
}

/** Есть ли внутри клетки рамка-подсветка (борт 3 px поверх клетки). */
function подсвечена(клетка: any): boolean {
  const { StyleSheet } = require('react-native');
  return клетка.findAll((n: any) => {
    const st = StyleSheet.flatten(n.props?.style) as { borderWidth?: number; borderColor?: string; position?: string } | undefined;
    return !!st && st.position === 'absolute' && (st.borderWidth ?? 0) >= 2 && !!st.borderColor;
  }).length > 0;
}

/** Дойти до опроса: нажать «Начать», дождаться показа фигур и их скрытия. */
async function доОпроса(r: any) {
  for (let шаг = 0; шаг < 10; шаг += 1) {
    if (/подсвеченной|highlighted|на клетке|on square/i.test(текст(r.toJSON()))) return true;
    // ⚠️ Ищем по НАЛИЧИЮ обработчика, а не по роли: кнопка старта в этой игре
    // нарисована без `accessibilityRole="button"`, и проба её не видела.
    const кнопки = r.root.findAll((n: any) =>
      typeof n.props?.onPress === 'function' && !n.props?.disabled
      && /(начать|start|play|играть|уровень\s*\d|level\s*\d)/i.test(текст(n)));
    if (кнопки.length === 0) { await осесть(3); continue; }
    await TestRenderer.act(async () => { кнопки[0].props.onPress(); });
    await осесть(8);
  }
  return /подсвеченной|highlighted|на клетке|on square/i.test(текст(r.toJSON()));
}

describe('«Доска в уме»: вопрос про подсветку — значит подсветка видна', () => {
  it('🔴 в опросе хотя бы одна клетка подсвечена и нажимаема', async () => {
    const r = await монтировать();
    expect(await доОпроса(r)).toBe(true);        // опрос вправду начался

    const все = клетки(r);
    expect(все.length).toBe(64);                 // доска нарисована целиком

    const светящиеся = все.filter(подсвечена);
    expect(светящиеся.length).toBeGreaterThan(0);   // 🔴 вопрос ссылается на неё

    const нажимаемые = светящиеся.filter((к: any) => !к.props?.disabled);
    expect(нажимаемые.length).toBeGreaterThan(0);   // 🔴 и по ней можно попасть
    await TestRenderer.act(async () => { r.unmount(); });
  });

  it('🔴 вопрос НАЗЫВАЕТ клетку, а не только ссылается на подсветку', async () => {
    const r = await монтировать();
    expect(await доОпроса(r)).toBe(true);
    /**
     * Замер по кадру Дениса 03.09.2026: на клетках с фишками ноль синих точек —
     * рамка до экрана не дошла. Вопрос обязан быть понятен и без неё.
     */
    const весь = текст(r.toJSON());
    expect(весь).toMatch(/(на клетке|on square)\s*[a-h][1-8]\?/i);
    await TestRenderer.act(async () => { r.unmount(); });
  });
});

/**
 * ОТВЕТИЛ — ВИДНО, ЧТО ВЫШЛО (отчёты 63969cc9 и 52267f4f, Денис писал ТРИ РАЗА).
 *
 * Было: при верном ответе не происходило ничего — звук и через 350 мс следующий
 * вопрос; при неверном подсвечивалась правильная КНОПКА, но не было видно ни
 * своего промаха, ни того, что стояло на клетке. Его слова: «ты вслепую ответ дал
 * и не знаешь толком, ошибся или нет».
 *
 * Замер живьём после правки (Chromium, партия 3×3): картинок фигур на экране до
 * ответа 6 (только кнопки), после ответа 7 — седьмая открылась НА ДОСКЕ.
 */
describe('обратная связь после ответа', () => {
  const экран: string = require('fs').readFileSync(
    require('path').join(__dirname, '../../app/games/chess-blind.tsx'), 'utf8',
  );

  it('🔴 фишка на спрошенной клетке открывается при ЛЮБОМ ответе, а не только при ошибке', () => {
    // Переворот ставится до развилки верно/неверно — значит виден в обоих случаях.
    const кусок = экран.slice(экран.indexOf('const answerPick'), экран.indexOf('const answerLocate'));
    expect(кусок).toMatch(/setFlipSq\(q\.sq\);[\s\S]{0,120}if \(correct\)/);
    expect(экран).toContain('showPieces || flipSq === sq');
  });

  it('🔴 клетка обводится по результату: зелёным при верном, красным при промахе', () => {
    expect(экран).toMatch(/flipSq === sq\) hl = flipRight \? '#22c55e' : '#f43f5e'/);
  });

  it('🔴 нажатая кнопка красится — иначе промах не виден вовсе', () => {
    expect(экран).toContain('const isPicked');
    expect(экран).toMatch(/isPicked \? \(flipRight \? '#22c55e' : '#f43f5e'\)/);
  });

  it('пауза при верном ответе даёт увидеть открытую фигуру (было 350 мс)', () => {
    const кусок = экран.slice(экран.indexOf('const answerPick'), экран.indexOf('const answerLocate'));
    const мс = [...кусок.matchAll(/later\(nextQuestion, (\d+)\)/g)].map((m) => Number(m[1]));
    expect(мс.length).toBe(2);
    expect(Math.min(...мс)).toBeGreaterThanOrEqual(600);
  });

  it('показ сбрасывается при переходе к следующему вопросу', () => {
    expect(экран).toContain('setFlipSq(null); setPickedOpt(null);');
  });
});
