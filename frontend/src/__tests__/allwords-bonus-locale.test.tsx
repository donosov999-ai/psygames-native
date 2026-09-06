/**
 * КОПИЛКА БОНУСНЫХ СЛОВ СВЕРЯЕТСЯ С ТЕКУЩИМ ЯЗЫКОМ, А НЕ С ТЕМ, ЧТО БЫЛ ПРИ
 * ПЕРВОМ КАДРЕ.
 *
 * 🔴 ЧТО БЫЛО. `сдать` — useCallback со списком зависимостей `[pack, onComplete,
 * now]`, а внутри вызывается `сдатьСлово(pack, слово, текущие, locale)`. Локали в
 * зависимостях не было, поэтому колбэк держал язык таким, каким тот был на
 * первом кадре: человек менял язык внутри сессии, а копилка продолжала
 * спрашивать ПРЕЖНИЙ словарь. Линтер называл это «missing dependency: locale» —
 * и это был единственный его упрёк в файле, за которым стояла поломка, а не
 * стиль.
 *
 * ⚠️ ПОЧЕМУ РУССКИЙ И ЛАТИНСКОЕ СЛОВО. Признак должен РАЗЛИЧАТЬ, а не «скорее
 * всего отличаться»: латинское слово не проходит русский словарь никогда, при
 * любом составе букв. Поэтому исход «бонус» после смены языка возможен только
 * тогда, когда колбэк действительно взял новый язык.
 */
import React from 'react';
// eslint-disable-next-line @typescript-eslint/no-require-imports -- загрузка ПОСЛЕ jest.mock, иначе экран возьмёт настоящее кольцо
const TestRenderer = require('react-test-renderer');

let mockПодача: ((слово: string) => void) | null = null;
jest.mock('@/src/components/letterWheel/LetterWheel', () => ({
  LetterWheel: (props: { onSubmit: (w: string) => void }) => {
    mockПодача = props.onSubmit;
    return null;
  },
}));

// eslint-disable-next-line @typescript-eslint/no-require-imports -- см. выше
const { AllWordsGame } = require('@/src/games/anagrams/AllWordsGame');

const ТЕМА = { surface: '#fff', text: '#000', textSecondary: '#666', border: '#ccc', primary: '#07f', success: '#0a0', danger: '#a00' };
const ПОДПИСИ = { найдено: 'найдено', подсказки: 'подсказки', банк: 'банк', сдать: 'сдать', сброс: 'сброс', подсказка: 'подсказка', перемешать: 'перемешать', копилка: 'копилка' };
/*
  Тройка взята ИЗ ЖИВОГО НАБОРА, а не придумана: «because» → цель «abuse», а из
  тех же плиток собирается ещё и «cues», которого в целях пака нет, зато он есть
  в английском словаре набора. Придуманное слово («ate») в наборе отсутствовало,
  и проба краснела бы не от дефекта, а от моей выдумки.
*/
const ПАК = { base: 'because', words: ['abuse'] };
const БОНУС = 'cues';

/*
  🔴 ССЫЛКИ НА ПРОПЫ ОБЯЗАНЫ БЫТЬ СТАБИЛЬНЫМИ, ИНАЧЕ ПРОБА ЛЕЧИТ ДЕФЕКТ САМА.

  Первая версия передавала `now={() => 0}` и `onComplete={() => {}}` прямо в
  JSX — новые функции на каждом рендере. Они входят в зависимости `сдать`, и
  колбэк пересоздавался ПО ЛЮБОМУ поводу, подхватывая свежий `locale` даже без
  него в списке. Мутация «убрать locale из зависимостей» из-за этого ВЫЖИЛА:
  проба была зелёной и на исправленном коде, и на сломанном.

  Здесь меняется ровно одна вещь — язык.
*/
const СЕЙЧАС = () => 0;
const ГОТОВО = () => {};
const ПРОГРЕСС = () => {};

function собрать(locale: string) {
  return (
    <AllWordsGame pack={ПАК} seed={1} size={320} theme={ТЕМА} now={СЕЙЧАС}
      onComplete={ГОТОВО} onProgress={ПРОГРЕСС} locale={locale} labels={ПОДПИСИ} />
  );
}

/** Сколько слов в копилке — считаем по подписи, которую экран показывает. */
function копилкаВидна(root: any): boolean {
  const тексты: string[] = [];
  root.root.findAll((n: any) => typeof n.type === 'string', { deep: true }).forEach((n: any) => {
    const c = n.props && n.props.children;
    if (typeof c === 'string') тексты.push(c);
    if (Array.isArray(c)) c.forEach((x: any) => { if (typeof x === 'string') тексты.push(x); });
  });
  return тексты.some((t) => t.includes('копилка'));
}

it('после смены языка бонус считается по НОВОМУ словарю', async () => {
  let root: any;
  await TestRenderer.act(async () => { root = TestRenderer.create(собрать('ru')); });
  expect(mockПодача).toBeTruthy();

  // На русском латинское слово бонусом быть не может ни при каком составе букв.
  await TestRenderer.act(async () => { mockПодача!(БОНУС); });
  expect(копилкаВидна(root)).toBe(false);

  // Меняем язык прямо в сессии — как человек в настройках.
  await TestRenderer.act(async () => { root.update(собрать('en')); });
  await TestRenderer.act(async () => { mockПодача!(БОНУС); });
  expect(копилкаВидна(root)).toBe(true);
});
