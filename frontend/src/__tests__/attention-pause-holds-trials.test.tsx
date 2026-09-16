/* psygames-attention-pause-holds-trials · VER 1 · 16.09.2026 */
/**
 * ПОКА ИГРУ ДЕРЖАТ, ПАРТИЯ СТОИТ — НА ВСЕХ 18 ЭКРАНАХ «КОНФЛИКТА ВНИМАНИЯ».
 *
 * 📍 ЗАМЕР ДО (16.09.2026, живая сборка, прибор ~/dev/psygames/attention-chat/пауза-держит-партию.mjs):
 * меню паузы на экране, а партия шла. Струп L1: 3/20 → 5/20 за 8 с под меню, каждая
 * просроченная проба засчитывалась ошибкой. «Айова»: выбор колоды прямо перед паузой, и под
 * меню открылась следующая проба (1/60 → 2/60). Пробы сменял `setTimeout`, а удержание
 * (`holdGame`) его не касалось. Экраны переведены на `gameTimeout` (задача 5d5fdc5e).
 *
 * КАК ПРОВЕРЯЕТСЯ — ПОВЕДЕНИЕМ, НА ФАЛЬШИВЫХ ЧАСАХ. Экран монтируется целиком, партия
 * стартует кнопкой «Start». Снимок — все тексты и подписи дерева (анимации в него не
 * попадают, игровое состояние — счётчики, стимул, итог — попадает).
 *   1. Держим игру, крутим 16 с: снимок обязан остаться прежним.
 *   2. Отпускаем, крутим 16 с: снимок обязан измениться — иначе «стоит» ничего не значит.
 * Экран, который без ответа не двигается сам (выбор без срока: «Айова», «Шарик», PRL…),
 * получает нажатие ответа ПРЯМО ПЕРЕД удержанием, и оба шага повторяются: удержание
 * обязано остановить уже запущенный показ исхода и переход к следующей пробе.
 *
 * 🔴 СЛЕПОЕ = КРАСНОЕ. Если экран не сдвинулся ни сам, ни после ответа — проверка краснеет
 * с причиной, а не проходит: «стоит под удержанием» у мёртвой партии ничего не доказывает.
 *
 * ⚠️ ЧЕГО ПРОБА НЕ ВИДИТ: изменения только стиля (вспышка ошибки у «Корректуры» — цвет
 * клетки на 350 мс). Это оформление, партию оно не двигает.
 */
import React from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

declare const __dirname: string;

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: () => {}, replace: () => {}, back: () => {} }),
  useLocalSearchParams: () => ({}),
  useGlobalSearchParams: () => ({}),
  usePathname: () => '/games/attention',
  useFocusEffect: () => {},
  useNavigation: () => ({ addListener: () => () => {}, setOptions: () => {} }),
  router: { canGoBack: () => false, back: () => {}, replace: () => {}, push: () => {} },
}));
jest.mock('@/src/services/api', () => ({
  ...jest.requireActual('@/src/services/api'),
  saveSession: async (s: any) => s,
}));

/* eslint-disable @typescript-eslint/no-require-imports -- загрузка ПОСЛЕ jest.mock */
const TestRenderer = require('react-test-renderer');
const { holdGame, __resetGameClock } = require('@/src/services/gamePause');
/* eslint-enable @typescript-eslint/no-require-imports */

/** Состав развилки на 16.09.2026 (hubContents.ts + gameSuites.ts). Проверка состава — ниже. */
const ЭКРАНЫ = [
  'stroop', 'stroop-emotional', 'flanker', 'simon', 'choice-rt', 'ant', 'cpt', 'switching-task', 'targets',
  'wcst', 'inhibition', 'go-no-go', 'stop-signal', 'posner', 'prl', 'iowa', 'bart', 'proofreading',
];

const КРУТИТЬ_МС = 16_000;
const ШАГ_МС = 500;
const СЛУЖЕБНЫЕ = /stop|pause|back|rules|help|report|feedback|quiet|hush|restart|again|menu|ⓘ/i;

const поднятые: any[] = [];
const держат: (() => void)[] = [];
beforeEach(() => {
  jest.useFakeTimers();
  __resetGameClock();
});
afterEach(() => {
  while (держат.length) держат.pop()!();
  while (поднятые.length) { const r = поднятые.pop(); try { TestRenderer.act(() => { r.unmount(); }); } catch { /* погашено */ } }
  jest.useRealTimers();
});

const осесть = async () => { await TestRenderer.act(async () => { for (let i = 0; i < 20; i += 1) await Promise.resolve(); }); };
const крутить = async (мс: number) => {
  for (let t = 0; t < мс; t += ШАГ_МС) {
    await TestRenderer.act(async () => { jest.advanceTimersByTime(ШАГ_МС); });
    await осесть();
  }
};

/** Снимок игрового состояния: тексты и подписи для диктора, по порядку дерева. */
function снимок(r: any): string {
  const out: string[] = [];
  r.root.findAll((n: any) => typeof n.type === 'string', { deep: true }).forEach((n: any) => {
    const c = n.props && n.props.children;
    if (typeof c === 'string' || typeof c === 'number') out.push(String(c));
    else if (Array.isArray(c)) c.forEach((x: any) => { if (typeof x === 'string' || typeof x === 'number') out.push(String(x)); });
    if (typeof n.props?.accessibilityLabel === 'string') out.push(`[${n.props.accessibilityLabel}]`);
  });
  return out.join('|');
}

/** Текст внутри узла. Дети-массивы тоже: `<Text>⚡ {title} ⓘ</Text>` — это массив, и без них
 *  значок правила уровня читался пустым и принимался за орган ответа (так было у PRL). */
const текстУзла = (n: any): string => n.findAll((x: any) => typeof x.props?.children === 'string' || Array.isArray(x.props?.children), { deep: true })
  .map((x: any) => (Array.isArray(x.props.children) ? x.props.children.filter((c: any) => typeof c === 'string' || typeof c === 'number').join('') : x.props.children))
  .join(' ');

async function смонтировать(экран: string) {
  await AsyncStorage.clear();
  await AsyncStorage.setItem('psygames_active_profile', 'free');
  /* eslint-disable @typescript-eslint/no-require-imports -- провайдеры после моков */
  const { ThemeProvider } = require('@/src/contexts/ThemeContext');
  const { LanguageProvider } = require('@/src/contexts/LanguageContext');
  const { ProfileProvider } = require('@/src/contexts/ProfileContext');
  const { SafeAreaProvider } = require('react-native-safe-area-context');
  const Screen = require(`@/app/games/${экран}`).default;
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

const нажимаемые = (r: any) => r.root.findAll((n: any) => n.props && typeof n.props.onPress === 'function', { deep: true });

async function нажать(узел: any) {
  await TestRenderer.act(async () => { узел.props.onPress({ nativeEvent: {}, preventDefault() {}, stopPropagation() {} }); });
  await осесть();
}

async function начатьПартию(r: any): Promise<string | null> {
  const понятно = нажимаемые(r).find((b: any) => /^got it$/i.test(текстУзла(b).trim()));
  if (понятно) await нажать(понятно);
  const старт = нажимаемые(r).find((b: any) => String(b.props.accessibilityLabel) === 'Start')
    ?? нажимаемые(r).find((b: any) => /^start$/i.test(текстУзла(b).trim()));
  if (!старт) return 'нет кнопки Start';
  await нажать(старт);
  await крутить(1_000);
  const поле = () => r.root.findAll((n: any) => n.props?.testID === 'game-toolbar' || n.props?.testID === 'game-field', { deep: true }).length > 0;
  /* «Мишени» ставят между настройкой и партией экран «Готов?» со своей кнопкой START. */
  if (!поле()) {
    // текст кнопки собирается из двух узлов («START START»: значок и подпись), поэтому повтор допустим
    const второй = нажимаемые(r).find((b: any) => /^(start\s*)+$/i.test(текстУзла(b).trim()));
    if (второй) { await нажать(второй); await крутить(1_000); }
  }
  return поле() ? null : 'после Start нет поля партии (game-field/game-toolbar)';
}

/**
 * Ответ, после которого экран без срока обязан запустить свой таймер. По умолчанию — первый
 * орган ответа. У «Шарика» один «Pump» таймера не ставит (лопается редко, на L1 риск 6 %),
 * а «Cash» до первого накачивания выключен — поэтому последовательность: накачать, забрать.
 * Первая редакция жала один «Pump» и была зелёной или красной по броску монеты.
 */
const ОТВЕТЫ: Record<string, RegExp[]> = {
  bart: [/pump/i, /cash/i],
};

/** Первый орган ответа в поле или полосе ответа, не служебная кнопка каркаса. */
function органОтвета(r: any, образец?: RegExp): { узел: any; имя: string } | null {
  /* Сначала полоса ответа, потом поле: в поле живут и служебные значки (правило уровня). */
  const зоны = [
    ...r.root.findAll((n: any) => n.props?.testID === 'game-toolbar', { deep: true }),
    ...r.root.findAll((n: any) => n.props?.testID === 'game-field', { deep: true }),
  ];
  for (const зона of зоны) {
    const кандидаты = зона.findAll((n: any) => n.props && typeof n.props.onPress === 'function' && !n.props.disabled, { deep: true });
    for (const к of кандидаты) {
      const имя = `${к.props.accessibilityLabel ?? ''} ${текстУзла(к)}`.trim();
      if (имя && !СЛУЖЕБНЫЕ.test(имя) && (!образец || образец.test(имя))) return { узел: к, имя: имя.slice(0, 30) };
    }
  }
  return null;
}

type Итог = { путь: string; подУдержанием: boolean; послеСнятия: boolean; было?: string; стало?: string };

/** Держим, крутим, сравниваем; отпускаем, крутим, сравниваем. */
async function удержаниеИСнятие(r: any): Promise<Итог> {
  держат.push(holdGame());
  /* Каждый снимок — ПОСЛЕ отрисовки смены удержания. Каркас сам перерисовывается и на паузу,
     и на её снятие (объявление, показатели). Первая редакция снимала «до» сразу после
     holdGame() и ловила реакцию каркаса вместо хода партии, а «после снятия сдвинулась»
     было истинным у ВСЕХ экранов, включая стоящие: менялся каркас, а не партия. Часы на
     время отрисовки не двигаются — крутятся только микрозадачи. */
  await осесть();
  const s0 = снимок(r);
  await крутить(КРУТИТЬ_МС);
  const s1 = снимок(r);
  держат.pop()!();
  await осесть();
  const s1r = снимок(r);
  await крутить(КРУТИТЬ_МС);
  const s2 = снимок(r);
  /* Первое расхождение ищем по частям снимка, а не по символам: у эмодзи символ и код разной
     длины, и сравнение по индексам врало «расхождения нет» при разных строках. */
  const ч0 = s0.split('|'); const ч1 = s1.split('|');
  const i = ч0.findIndex((ч, k) => ч !== ч1[k]);
  const k = i >= 0 ? i : Math.min(ч0.length, ч1.length);
  return {
    путь: '', подУдержанием: s0 === s1, послеСнятия: s2 !== s1r,
    было: ч0.slice(Math.max(0, k - 2), k + 3).join('|') + ` (частей ${ч0.length})`,
    стало: ч1.slice(Math.max(0, k - 2), k + 3).join('|') + ` (частей ${ч1.length})`,
  };
}

/** Какой путь прошёл каждый экран — печатается в конце, чтобы «зелёный» было видно чем. */
const пути: string[] = [];
afterAll(() => { if (пути.length) console.log(`пауза держит партию:\n${пути.join('\n')}`); });

describe('раздел «Внимание»: пока игру держат, партия стоит', () => {
  it('состав развилки в пробе совпадает с кодом приложения', () => {
    /* eslint-disable @typescript-eslint/no-require-imports */
    const fs = require('fs'); const path = require('path');
    /* eslint-enable @typescript-eslint/no-require-imports */
    const корень = path.join(__dirname, '../constants');
    const хаб = fs.readFileSync(path.join(корень, 'hubContents.ts'), 'utf8') as string;
    const наб = fs.readFileSync(path.join(корень, 'gameSuites.ts'), 'utf8') as string;
    const наборы: Record<string, string[]> = {}; let текущий: string | null = null;
    for (const строка of наб.split('\n')) {
      const id = строка.match(/id:\s*'(suite_[a-z_]+)'/);
      if (id) { текущий = id[1]; наборы[текущий] = []; }
      const m = строка.match(/route:\s*'\/games\/([a-z0-9-]+)'/);
      if (m && текущий) наборы[текущий].push(m[1]);
    }
    const блок = хаб.match(/'\/games\/attention-conflict':\s*\[([\s\S]*?)\n {2}\],/);
    expect(`блок развилки найден: ${!!блок}`).toBe('блок развилки найден: true');
    const поКоду = new Set<string>();
    for (const строка of блок![1].split('\n')) {
      const m = строка.match(/route:\s*'\/games\/([a-z0-9-]+)'/);
      if (!m) continue;
      const s = строка.match(/suiteId:\s*'(suite_[a-z_]+)'/);
      for (const э of (s && наборы[s[1]] ? наборы[s[1]] : [m[1]])) поКоду.add(э);
    }
    expect([...поКоду].sort()).toEqual([...ЭКРАНЫ].sort());
  });

  for (const экран of ЭКРАНЫ) {
    it(`🔴 ${экран}: под удержанием снимок не меняется 16 с, после снятия партия идёт`, async () => {
      const r = await смонтировать(экран);
      const почему = await начатьПартию(r);
      expect(`${экран}: партия началась${почему ? ` — НЕТ: ${почему}` : ''}`).toBe(`${экран}: партия началась`);

      let итог = await удержаниеИСнятие(r);
      итог.путь = 'сама';
      if (итог.подУдержанием && !итог.послеСнятия) {
        const нажатые: string[] = [];
        for (const образец of ОТВЕТЫ[экран] ?? [undefined]) {
          const орган = органОтвета(r, образец);
          if (!орган) continue;          // «Cash» выключен, если шарик лопнул — таймер лопания уже идёт
          await нажать(орган.узел);
          нажатые.push(орган.имя.trim());
        }
        expect(`${экран}: сама стоит, нажато ответов ${нажатые.length > 0 ? 'есть' : 'НЕТ'}`).toBe(`${экран}: сама стоит, нажато ответов есть`);
        итог = await удержаниеИСнятие(r);
        итог.путь = `после ответа «${нажатые.join(' → ')}»`;
      }
      expect(`${экран} (${итог.путь}): под удержанием стоит ${итог.подУдержанием}${итог.подУдержанием ? '' : ` · было «${итог.было}» → стало «${итог.стало}»`}`)
        .toBe(`${экран} (${итог.путь}): под удержанием стоит true`);
      expect(`${экран} (${итог.путь}): после снятия сдвинулась ${итог.послеСнятия}`)
        .toBe(`${экран} (${итог.путь}): после снятия сдвинулась true`);
      пути.push(`  ${экран.padEnd(17)} ${итог.путь}`);
    }, 60_000);
  }
});
