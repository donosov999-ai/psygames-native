/* eslint-disable @typescript-eslint/no-require-imports */
/**
 * 🔴 ВИДНО ИМЕННО ТУ КЛЕТКУ, ПРО КОТОРУЮ СПРАШИВАЮТ — И ФИГУРУ НА НЕЙ.
 *
 * Отчёты Дениса, все помечены fixed: `a4cc1a7d` («подсветка, не видно нихуя, какую
 * фигуру выделять», 04.09), `9e1e38f3` («не могу выбрать фигуру на доске, которую
 * хочу вспомнить», 03.09), `715eaf04` («ни хуя фигуры непонятно, хуёво отрисовать»,
 * 02.09).
 *
 * 📍 ЗАЧЕМ ОТДЕЛЬНЫЙ НАБОР, КОГДА РЯДОМ УЖЕ ЛЕЖИТ `chess-blind-pick-highlight`.
 * Потому что тот НЕ ЛОВИТ эти отчёты. Замер мутациями 06.09.2026 — возвращаю
 * дефект, гоняю 8 наборов / 120 проб раздела:
 *
 *   заливка спрашиваемой клетки убрана ............ 120 из 120 зелёных
 *   спрашиваемая клетка не подсвечена вовсе ....... 120 из 120 зелёных
 *   фигуры снова мелкие (0,86 → 0,5 клетки) ....... 120 из 120 зелёных
 *   подсветка не рисуется совсем .................. 1 упала
 *
 * Причина в модели: соседний набор спрашивает «подсвечена ли ХОТЬ ОДНА клетка».
 * Ждущие ответа клетки (`pendingSqs`) подсвечены всегда, поэтому утверждение
 * держится, даже когда спрашиваемая клетка гаснет. «Хоть одна» и «та самая» —
 * разные величины, и жалоба была про вторую.
 *
 * Здесь клетка берётся ИЗ ВОПРОСА: экран пишет её имя кеглем 40, проба читает это
 * имя и смотрит именно на неё.
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
    walk(Array.isArray(n.children) && n.children.length > 0 ? n.children : n.props?.children);
  };
  walk(node);
  return out.join(' ');
}

const плоский = (s: any): any =>
  (Array.isArray(s) ? s.reduce((a: any, x: any) => ({ ...a, ...(x || {}) }), {}) : (s || {}));

/** Клетки доски: подпись вида «e4», первое (самое внешнее) вхождение каждой. */
function клетки(r: any): Map<string, any> {
  const по = new Map<string, any>();
  for (const n of r.root.findAll((x: any) => /^[a-h][1-8]$/.test(String(x.props?.accessibilityLabel ?? '')))) {
    const имя = String(n.props.accessibilityLabel);
    if (!по.has(имя)) по.set(имя, n);
  }
  return по;
}

/** Имя клетки, про которую спрашивают: экран пишет его кеглем 40 (styles.askSquare). */
function спрошеннаяКлетка(r: any): string | null {
  for (const n of r.root.findAll((x: any) => Number(плоский(x.props?.style).fontSize || 0) >= 24)) {
    const t = String(текст(n)).trim();
    if (/^[a-h][1-8]$/.test(t)) return t;
  }
  return null;
}

async function доОпроса(r: any) {
  for (let шаг = 0; шаг < 10; шаг += 1) {
    if (спрошеннаяКлетка(r)) return true;
    const кнопки = r.root.findAll((n: any) =>
      typeof n.props?.onPress === 'function' && !n.props?.disabled
      && /(начать|start|play|играть|уровень\s*\d|level\s*\d)/i.test(текст(n)));
    if (кнопки.length === 0) { await осесть(3); continue; }
    await TestRenderer.act(async () => { кнопки[0].props.onPress(); });
    await осесть(8);
  }
  return !!спрошеннаяКлетка(r);
}

/** Самая заметная подсветка внутри клетки: толщина борта и есть ли заливка. */
function подсветка(клетка: any): { борт: number; заливка: boolean } {
  let борт = 0; let заливка = false;
  for (const n of клетка.findAll(() => true)) {
    const st = плоский(n.props?.style);
    if (st.position !== 'absolute' || !st.borderColor) continue;
    борт = Math.max(борт, Number(st.borderWidth ?? 0));
    if (st.backgroundColor) заливка = true;
  }
  return { борт, заливка };
}

describe('«Доска в уме»: спрашиваемая клетка и фигура на ней', () => {
  it('🔴 подсвечена ИМЕННО та клетка, что названа в вопросе, и заливкой', async () => {
    const r = await монтировать();
    expect(await доОпроса(r)).toBe(true);

    const имя = спрошеннаяКлетка(r)!;
    const карта = клетки(r);
    expect(`клеток на доске: ${карта.size}`).toBe('клеток на доске: 64');
    expect(`клетка «${имя}» есть на доске: ${карта.has(имя)}`).toBe(`клетка «${имя}» есть на доске: true`);

    const п = подсветка(карта.get(имя));
    // Борт 5 и заливка — «сильная» подсветка спрашиваемой клетки: волосок в 3 точки
    // на охристой доске под фишкой теряется, это и было в отчёте.
    expect(`клетка «${имя}»: борт ${п.борт}, заливка ${п.заливка}`)
      .toBe(`клетка «${имя}»: борт 5, заливка true`);
    await TestRenderer.act(async () => { r.unmount(); });
  });

  it('🔴 по спрашиваемой клетке можно попасть пальцем', async () => {
    const r = await монтировать();
    expect(await доОпроса(r)).toBe(true);
    const имя = спрошеннаяКлетка(r)!;
    const к = клетки(r).get(имя);
    expect(`клетка «${имя}» нажимаема: ${!к.props?.disabled}`).toBe(`клетка «${имя}» нажимаема: true`);
    await TestRenderer.act(async () => { r.unmount(); });
  });

  /**
   * 🔴 РАЗМЕР ФИГУРЫ — ДОЛЕЙ КЛЕТКИ, А НЕ НА ГЛАЗ. Отчёты 02.09.2026 «ни хуя фигуры
   * непонятно, хуёво отрисовать» и «картинки на доске можно покрупнее»: было 0,82
   * клетки, стало 0,86. Уменьшение обратно возвращает жалобу, и ни одна проба
   * этого не замечала — замер мутацией: 0,86 → 0,5 даёт 120 из 120 зелёных.
   *
   * ⚠️ МЕРИТЬ НАДО В ФАЗЕ ПОКАЗА, А НЕ В ОПРОСЕ. В опросе фигуры на доске скрыты
   * фишками-масками, и на экране остаются только кнопки ответа шириной 44 — по ним
   * размер доски не читается вовсе. Первая редакция этой пробы так и промахнулась:
   * клетка 60, найденные картинки [44], доля 0,73 — «дефект» на исправном коде.
   */
  it('🔴 фигуры на доске занимают не меньше 0,8 клетки (фаза показа)', async () => {
    const r = await монтировать();
    const кнопки = r.root.findAll((n: any) =>
      typeof n.props?.onPress === 'function' && !n.props?.disabled
      && /(начать|start|play|играть|уровень\s*\d|level\s*\d)/i.test(текст(n)));
    expect(`кнопка старта найдена: ${кнопки.length > 0}`).toBe('кнопка старта найдена: true');
    await TestRenderer.act(async () => { кнопки[0].props.onPress(); });

    // Идём малыми шагами: ищем миг, когда фигура нарисована ВНУТРИ клетки доски.
    let сторона = 0; let фигура = 0;
    for (let шаг = 0; шаг < 40 && !фигура; шаг += 1) {
      await осесть(1, 200);
      for (const [, к] of клетки(r)) {
        const ш = Number(плоский(к.props?.style).width || 0);
        if (!ш) continue;
        const кар = к.findAll((n: any) => typeof n.props?.xml === 'string' && Number(n.props?.width) > 0);
        if (кар.length) { сторона = ш; фигура = Number(кар[0].props.width); break; }
      }
    }
    expect(`фигура на доске найдена: ${фигура > 0}`).toBe('фигура на доске найдена: true');
    const доля = фигура / сторона;
    expect(`клетка ${сторона}, фигура ${фигура}, доля ${доля.toFixed(2)} ≥ 0,8: ${доля >= 0.8}`)
      .toBe(`клетка ${сторона}, фигура ${фигура}, доля ${доля.toFixed(2)} ≥ 0,8: true`);
    await TestRenderer.act(async () => { r.unmount(); });
  });

  /**
   * 🔴 ОТВЕТИЛ — ВИДНО, ЧТО ВЫШЛО. Отчёты `52267f4f` и `63969cc9`, Денис писал
   * ТРИ РАЗА: «чтобы можно было видеть, где ошибка», «ты вслепую ответ дал и не
   * знаешь толком, ошибся или нет».
   *
   * ⚠️ Рядом это уже «проверяется» — регулярками по тексту `chess-blind.tsx`
   * (`expect(экран).toMatch(/flipSq === sq\) hl = .../)`). Такая проверка держится
   * за написание строки, а не за то, что человек увидел: переставь условие, и
   * поведение то же, а проба красная; убери отрисовку ниже — поведения нет, а
   * проба зелёная. Здесь ответ даётся НАЖАТИЕМ и смотрится нарисованная доска.
   */
  it('🔴 после ответа спрошенная клетка окрашена по результату и фигура открыта', async () => {
    const r = await монтировать();
    expect(await доОпроса(r)).toBe(true);
    const имя = спрошеннаяКлетка(r)!;

    // Кнопки выбора — те, что несут картинку фигуры и нажимаются.
    const варианты = () => r.root.findAll((n: any) =>
      typeof n.props?.onPress === 'function' && !n.props?.disabled
      && n.findAll((x: any) => typeof x.props?.xml === 'string').length > 0
      && !/^[a-h][1-8]$/.test(String(n.props?.accessibilityLabel ?? '')));
    const в = варианты();
    expect(`кнопок выбора: ${в.length > 0}`).toBe('кнопок выбора: true');

    const доОтвета = подсветка(клетки(r).get(имя));
    await TestRenderer.act(async () => { в[0].props.onPress(); });
    await осесть(1, 200);

    const клетка = клетки(r).get(имя);
    const цвета = клетка.findAll((n: any) => {
      const st = плоский(n.props?.style);
      return st.position === 'absolute' && !!st.borderColor;
    }).map((n: any) => String(плоский(n.props.style).borderColor).toLowerCase());

    // Зелёный — верно, красный — промах. Любой из двух значит «человеку сказали».
    const сказали = цвета.some((c: string) => c.includes('22c55e') || c.includes('f43f5e'));
    expect(`после ответа клетка «${имя}» окрашена по результату: ${сказали} (было ${доОтвета.борт}, цвета ${цвета.join(',') || '—'})`)
      .toBe(`после ответа клетка «${имя}» окрашена по результату: true (было ${доОтвета.борт}, цвета ${цвета.join(',') || '—'})`);

    // И фишка на ней открыта — иначе не видно, что там стояло.
    const открыта = клетка.findAll((n: any) => typeof n.props?.xml === 'string').length > 0;
    expect(`фигура на клетке «${имя}» открыта: ${открыта}`).toBe(`фигура на клетке «${имя}» открыта: true`);
    await TestRenderer.act(async () => { r.unmount(); });
  });

  /**
   * 🔴 И ПРИ ВЕРНОМ ОТВЕТЕ ТОЖЕ. Это половина отчёта `63969cc9`, и именно она
   * была безмолвной: «при верном ответе не происходило ничего — звук и через
   * 350 мс следующий вопрос».
   *
   * ⚠️ Проба, отвечающая наугад, эту половину НЕ ловит: попал в промах — красное
   * есть, утверждение «окрашено по результату» держится. Замер мутацией это и
   * показал: «красим только промах, при верном молчим» — 4 из 4 зелёных.
   * Поэтому здесь ответ даётся ЗАВЕДОМО ВЕРНЫЙ: расстановка снимается в фазе
   * показа, и нажимается кнопка с той же картинкой, что стояла на клетке.
   */
  it('🔴 при ВЕРНОМ ответе клетка зеленеет, а не молчит', async () => {
    const r = await монтировать();
    const старт = r.root.findAll((n: any) =>
      typeof n.props?.onPress === 'function' && !n.props?.disabled
      && /(начать|start|play|играть|уровень\s*\d|level\s*\d)/i.test(текст(n)));
    await TestRenderer.act(async () => { старт[0].props.onPress(); });

    // Фаза показа: запоминаем, что на какой клетке стоит.
    const расстановка = new Map<string, string>();
    for (let шаг = 0; шаг < 40 && !расстановка.size; шаг += 1) {
      await осесть(1, 200);
      for (const [имя, к] of клетки(r)) {
        const кар = к.findAll((n: any) => typeof n.props?.xml === 'string');
        if (кар.length) расстановка.set(имя, String(кар[0].props.xml));
      }
    }
    expect(`расстановка снята: ${расстановка.size > 0}`).toBe('расстановка снята: true');

    expect(await доОпроса(r)).toBe(true);
    const имя = спрошеннаяКлетка(r)!;
    const нужная = расстановка.get(имя);
    expect(`знаем, что стояло на «${имя}»: ${!!нужная}`).toBe(`знаем, что стояло на «${имя}»: true`);

    const верная = r.root.findAll((n: any) =>
      typeof n.props?.onPress === 'function' && !n.props?.disabled
      && !/^[a-h][1-8]$/.test(String(n.props?.accessibilityLabel ?? ''))
      && n.findAll((x: any) => x.props?.xml === нужная).length > 0);
    expect(`кнопка с верной фигурой найдена: ${верная.length > 0}`).toBe('кнопка с верной фигурой найдена: true');

    await TestRenderer.act(async () => { верная[0].props.onPress(); });
    await осесть(1, 200);

    const цвета = клетки(r).get(имя).findAll((n: any) => {
      const st = плоский(n.props?.style);
      return st.position === 'absolute' && !!st.borderColor;
    }).map((n: any) => String(плоский(n.props.style).borderColor).toLowerCase());
    expect(`после ВЕРНОГО ответа «${имя}» зелёная: ${цвета.some((c: string) => c.includes('22c55e'))} (цвета ${цвета.join(',') || '—'})`)
      .toBe(`после ВЕРНОГО ответа «${имя}» зелёная: true (цвета ${цвета.join(',') || '—'})`);
    await TestRenderer.act(async () => { r.unmount(); });
  });
});
