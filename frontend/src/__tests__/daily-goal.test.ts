/**
 * ГЕЙТ КАРТОЧКИ «ЦЕЛЬ ДНЯ».
 *
 * 🔴 ЧТО ЗДЕСЬ ПРОВЕРЯЕТСЯ ИСПОЛНЕНИЕМ, А НЕ ЧТЕНИЕМ. Карточка стоит на первом
 * экране и показывает СЛОВА ЧЕЛОВЕКА. Ошибиться в ней можно тремя способами, и все
 * три тихие: показать вчерашнюю строку как сегодняшнюю, показать чужую строку на
 * семейном устройстве и вернуться сегодня же к тому, кто её закрыл. Ни один из трёх
 * не виден в исходнике — все три видны только на данных. Поэтому ниже нет проверок
 * вида «в файле написано нужное слово»: каждое утверждение либо гоняет сервис на
 * настоящем хранилище, либо рисует компонент настоящим рендером и нажимает кнопки.
 *
 * ⚠️ ПОЧЕМУ ГЕЙТ ЗАОДНО СТЕРЕЖЁТ ПОКАЗ. За сутки до этого захода в SET нашёлся бейдж,
 * написанный, переведённый на 12 языков и покрытый гейтом — и мёртвый: разметка была
 * на месте, а состояние не присваивалось нигде. Отсюда две проверки на проводку:
 * экран обязан монтировать карточку с обработчиками и не имеет права заслонять её
 * `{false && …}`.
 *
 * ЧЕТЫРЕ ОБЯЗАТЕЛЬСТВА, названные словами (порядок = порядок describe ниже):
 *   1. цель живёт ровно сутки и не протекает в следующий день;
 *   2. закрытая карточка не возвращается в тот же день;
 *   3. чужой профиль не видит чужую цель;
 *   4. пустой ввод не сохраняется как цель — ни в сервисе, ни по кнопке.
 */
import React from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import DailyGoalCard from '@/src/components/DailyGoalCard';
import {
  DAY_GOAL_EXAMPLE_KEYS, DAY_GOAL_MAX_LEN, DailyGoal, DayGoalCardState,
  dayGoalDismissKey, dayGoalKey, dayKey, dismissGoalCard, isGoalReviewTime,
  loadDailyGoal, loadGoalCard, markGoalOutcome, normalizeGoalText, resolveGoalCard,
  saveDailyGoal,
} from '@/src/services/dailyGoal';
import { slotForHour } from '@/src/services/warmup';

declare const __dirname: string;
declare function require(id: string): any;

const TestRenderer = require('react-test-renderer');
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '../..');
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8') as string;

const DENIS = 'odv999';
const VALYA = 'valya';

/** Утро, день, вечер и ночь одних и тех же суток. */
const MORNING = new Date(2026, 7, 20, 8, 0, 0);
const DAY = new Date(2026, 7, 20, 13, 0, 0);
const EVENING = new Date(2026, 7, 20, 21, 0, 0);
const NEXT_DAY = new Date(2026, 7, 21, 9, 0, 0);
const NEXT_NIGHT = new Date(2026, 7, 21, 0, 30, 0);   // уже следующие сутки, хоть и «ночью»

beforeEach(async () => { await AsyncStorage.clear(); });

// ─────────────────────────────────────────────────────────────────────────────
// 0. ЕСТЬ ЧТО ПРОВЕРЯТЬ. Гейт, у которого пустой предмет, зелен вслепую.
// ─────────────────────────────────────────────────────────────────────────────

describe('цель дня: предмет проверки на месте', () => {
  it('примеров формулировок ровно три и они разные ключи', () => {
    expect(DAY_GOAL_EXAMPLE_KEYS.length).toBe(3);
    expect(new Set(DAY_GOAL_EXAMPLE_KEYS).size).toBe(3);
  });

  it('вечер у цели тот же, что у зарядки и рекомендаций — своего календаря не заводим', () => {
    for (let h = 0; h < 24; h++) {
      expect(`${h}: ${isGoalReviewTime(new Date(2026, 7, 20, h, 0, 0))}`)
        .toBe(`${h}: ${slotForHour(h) === 'evening'}`);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 🔴 ОБЯЗАТЕЛЬСТВО 1. ЦЕЛЬ ЖИВЁТ РОВНО СУТКИ.
// ─────────────────────────────────────────────────────────────────────────────

describe('🔴 цель живёт ровно сутки и не протекает в следующий день', () => {
  it('записана сегодня — читается сегодня в любой час', async () => {
    await saveDailyGoal(DENIS, 'не путать имена на планёрке', MORNING);
    for (const t of [MORNING, DAY, EVENING]) {
      const g = await loadDailyGoal(DENIS, t);
      expect(`${t.getHours()}: ${g?.text}`).toBe(`${t.getHours()}: не путать имена на планёрке`);
    }
  });

  it('🔴 завтра той же цели уже нет — ни текста, ни исхода', async () => {
    await saveDailyGoal(DENIS, 'не путать имена на планёрке', DAY);
    await markGoalOutcome(DENIS, 'done', EVENING);
    // Запись в хранилище осталась (её никто не стирал) — и это ровно тот случай,
    // когда «протечь» проще всего: читаем ЗАВТРА и обязаны получить пусто.
    expect(await AsyncStorage.getItem(dayGoalKey(DENIS))).toBeTruthy();
    expect(await loadDailyGoal(DENIS, NEXT_DAY)).toBeNull();
    const card = await loadGoalCard(DENIS, NEXT_DAY);
    expect(`${card.state} / ${card.goal === null}`).toBe('ask / true');
  });

  it('🔴 в 00:30 наступают новые сутки — карточка спрашивает заново, а не показывает вчерашнее', async () => {
    await saveDailyGoal(DENIS, 'дочитать главу без телефона', EVENING);
    const card = await loadGoalCard(DENIS, NEXT_NIGHT);
    expect(`${card.state} / ${card.goal?.text ?? 'нет'}`).toBe('ask / нет');
  });

  it('состояния дня идут по часам: день — показ, вечер — вопрос, отмеченное — итог', async () => {
    await saveDailyGoal(DENIS, 'спокойно провести вечер', MORNING);
    expect((await loadGoalCard(DENIS, MORNING)).state).toBe('active');
    expect((await loadGoalCard(DENIS, DAY)).state).toBe('active');
    expect((await loadGoalCard(DENIS, EVENING)).state).toBe('review');
    await markGoalOutcome(DENIS, 'not_today', EVENING);
    expect((await loadGoalCard(DENIS, EVENING)).state).toBe('closed');
  });

  it('🔴 вчерашняя цель не отмечается задним числом', async () => {
    await saveDailyGoal(DENIS, 'считать сдачу в уме', DAY);
    expect(await markGoalOutcome(DENIS, 'done', NEXT_DAY)).toBeNull();
    // И вчерашняя запись от этого не «дозакрылась» втихую.
    const raw = JSON.parse((await AsyncStorage.getItem(dayGoalKey(DENIS))) as string) as DailyGoal;
    expect(`${raw.date} / ${raw.outcome}`).toBe(`${dayKey(DAY)} / null`);
  });

  it('чистая часть согласна с хранилищем: дата записи ≠ сегодня → приглашение', () => {
    const stale: DailyGoal = { text: 'вчерашнее', date: dayKey(DAY), createdAt: DAY.toISOString(), outcome: null };
    expect(resolveGoalCard({ goal: stale, dismissedOn: null, now: NEXT_DAY })).toBe('ask');
    expect(resolveGoalCard({ goal: stale, dismissedOn: null, now: DAY })).toBe('active');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 🔴 ОБЯЗАТЕЛЬСТВО 2. ЗАКРЫЛ — СЕГОДНЯ НЕ ВОЗВРАЩАЕТСЯ.
// ─────────────────────────────────────────────────────────────────────────────

describe('🔴 закрытая карточка не возвращается в тот же день', () => {
  it('🔴 закрыл утром — молчит весь день, в том числе вечером', async () => {
    await dismissGoalCard(DENIS, MORNING);
    for (const t of [MORNING, DAY, EVENING]) {
      expect(`${t.getHours()}: ${(await loadGoalCard(DENIS, t)).state}`).toBe(`${t.getHours()}: hidden`);
    }
  });

  it('закрытая при УЖЕ ПОСТАВЛЕННОЙ цели тоже молчит — но цель не стёрта', async () => {
    await saveDailyGoal(DENIS, 'не терять мысль на середине фразы', MORNING);
    await dismissGoalCard(DENIS, DAY);
    expect((await loadGoalCard(DENIS, DAY)).state).toBe('hidden');
    expect((await loadDailyGoal(DENIS, DAY))?.text).toBe('не терять мысль на середине фразы');
  });

  it('🔴 завтра спрашивает снова — отказ на сутки, а не навсегда', async () => {
    await dismissGoalCard(DENIS, DAY);
    expect((await loadGoalCard(DENIS, NEXT_DAY)).state).toBe('ask');
  });

  it('поставленная цель отменяет вчерашнее закрытие — иначе написанное исчезло бы сразу', async () => {
    await dismissGoalCard(DENIS, DAY);
    await saveDailyGoal(DENIS, 'разобрать почту на свежую голову', DAY);
    expect((await loadGoalCard(DENIS, DAY)).state).toBe('active');
    expect(await AsyncStorage.getItem(dayGoalDismissKey(DENIS))).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 🔴 ОБЯЗАТЕЛЬСТВО 3. СЕМЕЙНОЕ УСТРОЙСТВО: ЧУЖОЕ НЕ ПОКАЗЫВАЕТСЯ.
// ─────────────────────────────────────────────────────────────────────────────

describe('🔴 чужой профиль не видит чужую цель', () => {
  it('🔴 цель Дениса не показывается Вале', async () => {
    await saveDailyGoal(DENIS, 'не путать имена на встрече', DAY);
    expect(await loadDailyGoal(VALYA, DAY)).toBeNull();
    const card = await loadGoalCard(VALYA, DAY);
    expect(`${card.state} / ${card.goal?.text ?? 'нет'}`).toBe('ask / нет');
  });

  it('у каждого профиля своя строка — переключение не подменяет текст', async () => {
    await saveDailyGoal(DENIS, 'считать в уме на кассе', DAY);
    await saveDailyGoal(VALYA, 'выспаться и не тянуть до ночи', DAY);
    expect((await loadDailyGoal(DENIS, DAY))?.text).toBe('считать в уме на кассе');
    expect((await loadDailyGoal(VALYA, DAY))?.text).toBe('выспаться и не тянуть до ночи');
  });

  it('закрытие карточки — тоже своё: Денис закрыл, у Вали она осталась', async () => {
    await dismissGoalCard(DENIS, DAY);
    expect((await loadGoalCard(DENIS, DAY)).state).toBe('hidden');
    expect((await loadGoalCard(VALYA, DAY)).state).toBe('ask');
  });

  it('исход одного не приписывается другому', async () => {
    await saveDailyGoal(DENIS, 'дочитать главу', DAY);
    await saveDailyGoal(VALYA, 'дочитать главу', DAY);
    await markGoalOutcome(DENIS, 'done', EVENING);
    expect((await loadDailyGoal(DENIS, EVENING))?.outcome).toBe('done');
    expect((await loadDailyGoal(VALYA, EVENING))?.outcome).toBeNull();
  });

  it('ключи хранилища действительно разведены по профилю', () => {
    expect(dayGoalKey(DENIS)).not.toBe(dayGoalKey(VALYA));
    expect(dayGoalDismissKey(DENIS)).not.toBe(dayGoalDismissKey(VALYA));
    expect(dayGoalKey(DENIS)).toContain(DENIS);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 🔴 ОБЯЗАТЕЛЬСТВО 4. ПУСТОЕ ЦЕЛЬЮ НЕ СТАНОВИТСЯ.
// ─────────────────────────────────────────────────────────────────────────────

const EMPTY_INPUTS: [string, string][] = [
  ['пустая строка', ''],
  ['пробелы', '    '],
  ['перевод строки', '\n\n'],
  ['табуляция', '\t\t'],
  ['неразрывный пробел', '\u00a0\u00a0'],
  ['нулевой ширины', '\u200b\u200c'],
  ['всё вместе', ' \t\n\u00a0\u200b '],
];

describe('🔴 пустой ввод не сохраняется как цель', () => {
  it.each(EMPTY_INPUTS)('«%s» не проходит нормализацию', (_name, raw) => {
    expect(normalizeGoalText(raw)).toBeNull();
  });

  it.each(EMPTY_INPUTS)('🔴 «%s» не пишется в хранилище вовсе', async (_name, raw) => {
    expect(await saveDailyGoal(DENIS, raw, DAY)).toBeNull();
    // Не «пустая цель» и не «цель-пробел» — записи нет ни одной.
    expect(await AsyncStorage.getItem(dayGoalKey(DENIS))).toBeNull();
    expect((await loadGoalCard(DENIS, DAY)).state).toBe('ask');
  });

  it('пустой ввод не затирает уже поставленную сегодня цель', async () => {
    await saveDailyGoal(DENIS, 'не путать имена на встрече', MORNING);
    expect(await saveDailyGoal(DENIS, '   ', DAY)).toBeNull();
    expect((await loadDailyGoal(DENIS, DAY))?.text).toBe('не путать имена на встрече');
  });

  it('настоящий текст проходит и хранится ровно как написан', async () => {
    const saved = await saveDailyGoal(DENIS, '  не путать имена  ', DAY);
    expect(saved?.text).toBe('не путать имена');
  });

  it('многострочное схлопывается в одну строку — карточка однострочная', () => {
    expect(normalizeGoalText('первое\nвторое\tтретье')).toBe('первое второе третье');
  });

  it('слишком длинное обрезается по объявленной границе, а не по вёрстке', () => {
    const long = 'я'.repeat(DAY_GOAL_MAX_LEN + 40);
    expect(normalizeGoalText(long)?.length).toBe(DAY_GOAL_MAX_LEN);
  });

  it('не строка ломает не приложение, а только запись', async () => {
    expect(normalizeGoalText(undefined as any)).toBeNull();
    expect(await saveDailyGoal(DENIS, null as any, DAY)).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// ПОВЕДЕНИЕ КАРТОЧКИ. Настоящий рендер и настоящие нажатия, а не чтение разметки.
// ─────────────────────────────────────────────────────────────────────────────

const COLORS = { surface: '#fff', card: '#eee', border: '#ccc', text: '#000', textSecondary: '#666' };
/** Словарь-заглушка: подпись обязана прийти через t(), а не быть зашитой в компонент. */
const DICT: Record<string, string> = {
  dayGoalTitle: 'Цель дня',
  dayGoalAsk: 'Ради чего сегодня?',
  dayGoalAskHint: 'Одна строка своими словами',
  dayGoalPlaceholder: 'Своими словами',
  dayGoalSave: 'Запомнить',
  notNow: 'Не сейчас',
  dayGoalExamplesTitle: 'Так это может звучать:',
  dayGoalExample1: 'не путать имена на встрече',
  dayGoalExample2: 'держать счёт в уме на кассе',
  dayGoalExample3: 'не терять мысль на середине фразы',
  dayGoalTodayLine: 'Твоя цель на сегодня:',
  dayGoalRounds: 'Партий к ней сегодня: {n}',
  dayGoalRoundsNone: 'Партий сегодня пока нет',
  dayGoalReview: 'Как вышло?',
  dayGoalYes: 'Получилось',
  dayGoalNo: 'Не сегодня',
  dayGoalDoneNote: 'Отмечено. Завтра спросим снова.',
  dayGoalMissedNote: 'Бывает. Цель никуда не делась — завтра тоже день.',
  dayGoalCloseA11y: 'Убрать карточку цели на сегодня',
};
const t = (k: string) => DICT[k] ?? k;

interface CardProps {
  state: DayGoalCardState;
  goalText?: string | null;
  outcome?: 'done' | 'not_today' | null;
  roundsToday?: number;
  onSave?: (raw: string) => void;
  onDismiss?: () => void;
  onOutcome?: (o: 'done' | 'not_today') => void;
}

function render(props: CardProps) {
  let r: any;
  TestRenderer.act(() => {
    r = TestRenderer.create(React.createElement(DailyGoalCard as any, {
      goalText: null, outcome: null, roundsToday: 0, colors: COLORS, t,
      onSave: () => {}, onDismiss: () => {}, onOutcome: () => {}, ...props,
    }));
  });
  return r;
}

/** Обход СНЯТОГО дерева: в нём остаются только настоящие узлы, без обёрток-компонентов. */
function walk(node: any, out: any[] = []): any[] {
  if (!node || typeof node !== 'object') return out;
  if (Array.isArray(node)) { node.forEach((n) => walk(n, out)); return out; }
  out.push(node);
  (node.children || []).forEach((c: any) => walk(c, out));
  return out;
}
const shown = (r: any) => JSON.stringify(r.toJSON() ?? null);
/** Кнопка по подписи для скринридера — ищем так же, как её найдёт человек. */
const button = (r: any, label: string) =>
  r.root.findAll((n: any) => n.props?.accessibilityRole === 'button'
    && n.props?.accessibilityLabel === label
    && typeof n.props?.onPress === 'function', { deep: true })[0];
/**
 * Поля ввода — по ОДНОМУ на настоящее поле. Без сведения по обработчику их выходит
 * два: обёртка и хост-узел под ней, и проверка «поле ровно одно» краснела бы зря.
 */
const inputs = (r: any) => {
  const seen = new Set<any>();
  const out: any[] = [];
  for (const n of r.root.findAll((x: any) => typeof x.props?.onChangeText === 'function', { deep: true })) {
    if (seen.has(n.props.onChangeText)) continue;
    seen.add(n.props.onChangeText);
    out.push(n);
  }
  return out;
};
/** Весь текст внутри узла. JSON.stringify по props здесь нельзя — дерево циклическое. */
const subtreeText = (inst: any): string => inst
  .findAll((x: any) => typeof x.props?.children === 'string', { deep: true })
  .map((x: any) => x.props.children as string)
  .join(' | ');

describe('карточка: закрытая не занимает места', () => {
  it('🔴 в состоянии hidden не рисуется НИЧЕГО — ни рамки, ни пустой полоски', () => {
    const r = render({ state: 'hidden', goalText: 'не путать имена на встрече' });
    expect(r.toJSON()).toBeNull();
    TestRenderer.act(() => r.unmount());
  });

  it('в остальных состояниях карточка на экране есть — иначе проверка выше зелена вслепую', () => {
    for (const state of ['ask', 'active', 'review', 'closed'] as DayGoalCardState[]) {
      const r = render({ state, goalText: 'не путать имена на встрече' });
      expect(`${state}: ${r.toJSON() !== null}`).toBe(`${state}: true`);
      TestRenderer.act(() => r.unmount());
    }
  });
});

describe('карточка: приглашение назвать цель', () => {
  it('🔴 нажатие «Запомнить» на ПУСТОМ поле не сохраняет ничего', () => {
    const saved: string[] = [];
    const r = render({ state: 'ask', onSave: (x) => saved.push(x) });
    TestRenderer.act(() => { button(r, 'Запомнить').props.onPress(); });
    expect(saved).toEqual([]);
    TestRenderer.act(() => r.unmount());
  });

  it('🔴 один пробел — тоже пусто: кнопка молчит', () => {
    const saved: string[] = [];
    const r = render({ state: 'ask', onSave: (x) => saved.push(x) });
    TestRenderer.act(() => { inputs(r)[0].props.onChangeText('   '); });
    TestRenderer.act(() => { button(r, 'Запомнить').props.onPress(); });
    expect(saved).toEqual([]);
    TestRenderer.act(() => r.unmount());
  });

  it('🔴 написал — нажал — строка ушла наружу целиком', () => {
    const saved: string[] = [];
    const r = render({ state: 'ask', onSave: (x) => saved.push(x) });
    TestRenderer.act(() => { inputs(r)[0].props.onChangeText('не путать имена на планёрке'); });
    TestRenderer.act(() => { button(r, 'Запомнить').props.onPress(); });
    expect(saved).toEqual(['не путать имена на планёрке']);
    TestRenderer.act(() => r.unmount());
  });

  it('🔴 пропуск в один тап: «Не сейчас» закрывает карточку', () => {
    let closed = 0;
    const r = render({ state: 'ask', onDismiss: () => { closed++; } });
    TestRenderer.act(() => { button(r, 'Не сейчас').props.onPress(); });
    expect(closed).toBe(1);
    TestRenderer.act(() => r.unmount());
  });

  it('крестик закрывает из любого состояния — отказ не спрятан вглубь', () => {
    for (const state of ['ask', 'active', 'review', 'closed'] as DayGoalCardState[]) {
      let closed = 0;
      const r = render({ state, goalText: 'цель', onDismiss: () => { closed++; } });
      TestRenderer.act(() => { button(r, 'Убрать карточку цели на сегодня').props.onPress(); });
      expect(`${state}: ${closed}`).toBe(`${state}: 1`);
      TestRenderer.act(() => r.unmount());
    }
  });

  it('🔴 примеры показаны, но НЕ НАЖИМАЮТСЯ — заполнять за человека нельзя', () => {
    const r = render({ state: 'ask' });
    const html = shown(r);
    for (const k of DAY_GOAL_EXAMPLE_KEYS) expect(html).toContain(DICT[k]);
    // Ни один нажимаемый узел не содержит текста примера: иначе пример стал бы
    // кнопкой-подстановкой, и цель оказалась бы нашей, а не его.
    const pressables = r.root.findAll((n: any) => typeof n.props?.onPress === 'function', { deep: true });
    const guilty = pressables
      .map((n: any) => subtreeText(n))
      .filter((s: string) => DAY_GOAL_EXAMPLE_KEYS.some((k) => s.includes(DICT[k])));
    expect(guilty).toEqual([]);
    TestRenderer.act(() => r.unmount());
  });

  it('🔴 в приглашении нет НИ ОДНОГО утверждения о человеке — только вопрос и примеры', () => {
    const r = render({ state: 'ask' });
    const html = shown(r);
    // Единственные тексты приглашения — из словаря, и все они перечислены здесь.
    const allowed = [
      'dayGoalTitle', 'dayGoalAsk', 'dayGoalAskHint', 'dayGoalPlaceholder', 'dayGoalSave',
      'notNow', 'dayGoalExamplesTitle', ...DAY_GOAL_EXAMPLE_KEYS, 'dayGoalCloseA11y',
    ];
    const leaked = Object.keys(DICT).filter((k) => !allowed.includes(k) && html.includes(DICT[k]));
    expect(leaked).toEqual([]);
    TestRenderer.act(() => r.unmount());
  });
});

describe('карточка: цель задана', () => {
  it('🔴 на экране стоит строка ЧЕЛОВЕКА, а не наш пример', () => {
    const r = render({ state: 'active', goalText: 'сдать отчёт без правок' });
    const html = shown(r);
    expect(html).toContain('сдать отчёт без правок');
    for (const k of DAY_GOAL_EXAMPLE_KEYS) expect(html).not.toContain(DICT[k]);
    TestRenderer.act(() => r.unmount());
  });

  it('поле ввода исчезает — цель уже названа, второго приглашения нет', () => {
    expect(inputs(render({ state: 'active', goalText: 'цель' })).length).toBe(0);
    expect(inputs(render({ state: 'ask' })).length).toBe(1);
  });

  it('🔴 число партий — настоящее, из журнала, а не выдуманное', () => {
    expect(shown(render({ state: 'active', goalText: 'цель', roundsToday: 4 })))
      .toContain('Партий к ней сегодня: 4');
    // Ноль партий — так и сказано, без «вы обычно тренируете память».
    const zero = shown(render({ state: 'active', goalText: 'цель', roundsToday: 0 }));
    expect(zero).toContain('Партий сегодня пока нет');
    expect(zero).not.toContain('Партий к ней сегодня');
  });

  it('🔴 вечером спрашивает, как вышло, и оба ответа доходят наружу', () => {
    const seen: string[] = [];
    const r1 = render({ state: 'review', goalText: 'цель', onOutcome: (o) => seen.push(o) });
    expect(shown(r1)).toContain('Как вышло?');
    TestRenderer.act(() => { button(r1, 'Получилось').props.onPress(); });
    TestRenderer.act(() => r1.unmount());
    const r2 = render({ state: 'review', goalText: 'цель', onOutcome: (o) => seen.push(o) });
    TestRenderer.act(() => { button(r2, 'Не сегодня').props.onPress(); });
    TestRenderer.act(() => r2.unmount());
    expect(seen).toEqual(['done', 'not_today']);
  });

  it('днём вопроса «как вышло» нет — не торопим до вечера', () => {
    expect(shown(render({ state: 'active', goalText: 'цель' }))).not.toContain('Как вышло?');
  });

  it('🔴 итог «не сегодня» подан без осуждения — цветом и словом', () => {
    const r = render({ state: 'closed', goalText: 'цель', outcome: 'not_today' });
    const html = shown(r);
    expect(html).toContain(DICT.dayGoalMissedNote);
    // Красного (цвет ошибки в этом приложении) на закрытой карточке нет.
    expect(html.toLowerCase()).not.toContain('#ef4444');
    expect(html.toLowerCase()).not.toContain('#dc2626');
    TestRenderer.act(() => r.unmount());
  });

  /**
   * ⚠️ ЭТА ПРОВЕРКА ПОЯВИЛАСЬ ОТ ПОЛОМКИ. Я поменял условие показа итога с
   * `state === 'closed'` на `state !== 'ask'` — и весь гейт остался зелёным, хотя
   * вечером человек видел бы «Как вышло?» и тут же «Отмечено» под ней: пометка о
   * записанном ответе стояла бы ДО того, как он ответил. Соседняя проверка смотрела
   * только в другую сторону (что в закрытой нет вопроса), и дыру не видела.
   */
  it('🔴 до ответа никакой пометки об исходе нет — ни днём, ни вечером', () => {
    for (const state of ['active', 'review'] as DayGoalCardState[]) {
      const html = shown(render({ state, goalText: 'цель', outcome: null }));
      expect(`${state}: ${html.includes(DICT.dayGoalDoneNote)} ${html.includes(DICT.dayGoalMissedNote)}`)
        .toBe(`${state}: false false`);
    }
  });

  it('отмеченный итог заменяет вопрос, а не добавляется к нему', () => {
    const html = shown(render({ state: 'closed', goalText: 'цель', outcome: 'done' }));
    expect(html).toContain(DICT.dayGoalDoneNote);
    expect(html).not.toContain('Как вышло?');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// ПОКАЗ. Всё выше верно и при карточке, которую экран не рисует. Стережём проводку.
// ─────────────────────────────────────────────────────────────────────────────

describe('карточка доезжает до главного экрана', () => {
  const home = () => read('app/index.tsx');

  it('🔴 экран монтирует карточку и отдаёт ей все три действия', () => {
    const src = home();
    expect(src).toContain('<DailyGoalCard');
    const el = src.slice(src.indexOf('<DailyGoalCard'), src.indexOf('/>', src.indexOf('<DailyGoalCard')));
    for (const prop of ['state=', 'goalText=', 'roundsToday=', 'onSave=', 'onDismiss=', 'onOutcome=']) {
      expect(`${prop} ${el.includes(prop)}`).toBe(`${prop} true`);
    }
  });

  it('🔴 состояние карточки не мёртвое: сеттер зовётся, и не только при загрузке', () => {
    const src = home();
    const calls = (src.match(/setGoalCard\s*\(/g) || []).length;
    // Загрузка на фокусе + три обработчика: закрыть, сохранить, отметить итог.
    expect(calls).toBeGreaterThanOrEqual(4);
    expect(src).toContain('loadGoalCard');
  });

  it('🔴 карточку не заслонили выключателем — {false && …} перед ней', () => {
    const src = home();
    const at = src.indexOf('<DailyGoalCard');
    const before = src.slice(Math.max(0, at - 700), at);
    expect(/\{\s*false\s*&&/.test(before)).toBe(false);
    expect(/\{\s*false\s*&&/.test(src)).toBe(false);
  });

  it('число партий берётся из того же журнала, что и блок «Сегодня» — второго счёта нет', () => {
    const src = home();
    const el = src.slice(src.indexOf('<DailyGoalCard'), src.indexOf('/>', src.indexOf('<DailyGoalCard')));
    expect(el).toContain('roundsToday={today.rounds}');
    expect(src).toContain('todayEarnings');
  });

  it('карточка стоит ВЫШЕ блока «Сегодня»: сначала зачем, потом сколько', () => {
    const src = home();
    expect(src.indexOf('<DailyGoalCard')).toBeLessThan(src.indexOf('📒 «Сегодня»'));
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// СЛОВАРЬ. Подпись, которой нет, показывается человеку именем ключа.
// ─────────────────────────────────────────────────────────────────────────────

describe('подписи карточки переведены', () => {
  const LOCALES = ['de', 'es', 'pt', 'fr', 'it', 'zh', 'ja', 'ko', 'hi', 'ar'];
  /** Те же ключи, что просит компонент, — список написан ПРЯМО, а не взят из него. */
  const KEYS = [
    'dayGoalTitle', 'dayGoalAsk', 'dayGoalAskHint', 'dayGoalPlaceholder', 'dayGoalSave',
    'notNow', 'dayGoalExamplesTitle', 'dayGoalExample1', 'dayGoalExample2', 'dayGoalExample3',
    'dayGoalTodayLine', 'dayGoalRounds', 'dayGoalRoundsNone', 'dayGoalReview', 'dayGoalYes',
    'dayGoalNo', 'dayGoalDoneNote', 'dayGoalMissedNote', 'dayGoalCloseA11y',
  ];

  it('компонент просит ровно эти ключи и ни одного сверх', () => {
    const src = read('src/components/DailyGoalCard.tsx');
    const asked = new Set((src.match(/\bt\(\s*'([a-zA-Z_][a-zA-Z0-9_]*)'\s*\)/g) || [])
      .map((m: string) => m.replace(/^t\(\s*'/, '').replace(/'\s*\)$/, '')));
    // Примеры компонент зовёт через список ключей — их добавляем к найденным.
    for (const k of DAY_GOAL_EXAMPLE_KEYS) asked.add(k);
    const unknown = [...asked].filter((k) => !KEYS.includes(k));
    expect(`лишние: ${unknown.join(', ')}`).toBe('лишние: ');
  });

  it('🔴 каждый ключ есть в базовом словаре', () => {
    const src = read('src/contexts/LanguageContext.tsx');
    const missing = KEYS.filter((k) => !new RegExp(`^ {2}${k}:\\s*\\{`, 'm').test(src));
    expect(`нет в базе: ${missing.join(', ')}`).toBe('нет в базе: ');
  });

  it.each(LOCALES)('🔴 каждый ключ переведён в локали %s', (loc) => {
    const src = read(`src/contexts/translations/${loc}.ts`);
    const missing = KEYS.filter((k) => !src.includes(`"${k}":`));
    expect(`${loc}: ${missing.join(', ')}`).toBe(`${loc}: `);
  });

  it('🔴 подстановка {n} доехала во все локали — иначе число партий не покажется', () => {
    for (const loc of LOCALES) {
      const line = read(`src/contexts/translations/${loc}.ts`)
        .split('\n').find((l: string) => l.includes('"dayGoalRounds":')) as string;
      expect(`${loc}: ${line.includes('{n}')}`).toBe(`${loc}: true`);
    }
  });
});
