/* psygames-gate-sort-skins-words · VER 1 · 11.09.2026 */
/**
 * 🔴 КАЖДАЯ ШКУРКА СОРТИРОВЩИКА ГОВОРИТ СВОИМИ СЛОВАМИ.
 *
 * 📍 ЗАМЕР, РАДИ КОТОРОГО ПРОБА ЗАВЕДЕНА (11.09.2026, по снимкам поля). «Шарики»
 * и «Гайки» были подписаны строкой ПРОБИРОК: под полем стояло «Нажми пробирку,
 * потом вторую — верхний столбик перельётся». Экран звал `t('waterSortHint')` в
 * обход шкурки, и чужое слово уехало в двенадцать языков. Тем же путём шли
 * «Пустая пробирка» (озвучка для незрячих), строка параметров уровня и описание
 * на экране настройки — причём `ballSortDesc` и `nutSortDesc` в словарях УЖЕ
 * ЛЕЖАЛИ и просто не были подключены.
 *
 * ⚠️ ПОЧЕМУ ЭТО ПРОВЕРЯЕТСЯ ИСПОЛНЕНИЕМ, А НЕ ЧТЕНИЕМ СЛОВАРЯ. Проверка «в
 * словаре есть ballSortHint» зелёная и тогда, когда экран этот ключ не зовёт —
 * ровно то состояние, в котором игра прожила с 06.09 по 11.09. Поэтому экран
 * МОНТИРУЕТСЯ, входит в партию, и словарь собирается с настоящего дерева.
 *
 * ⚠️ ПРЕМИСА ОБЯЗАТЕЛЬНА. Проба «чужого слова нет» зеленеет и от того, что не
 * отрисовалось НИЧЕГО. Поэтому сначала утверждается, что на экране есть СВОЁ
 * слово, и только потом — что чужого нет. Этот же экран уже дважды обманывал
 * меня зелёным без премисы (см. `niche-refused` в сортировке товаров).
 *
 * ⚠️ Общие строки нарочно остаются общими: «Ходов больше нет» и польза «ход,
 * освобождающий место сейчас» верны для всех трёх и НЕ называют сосуд. Правило
 * не «у каждой шкурки свои строки», а «ни одна не называет чужой сосуд».
 */
import React from 'react';

declare const __dirname: string;

const TestRenderer = require('react-test-renderer');  // eslint-disable-line @typescript-eslint/no-require-imports

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: () => {}, replace: () => {}, back: () => {} }),
  useLocalSearchParams: () => ({}),
  router: { canGoBack: () => false, back: () => {}, replace: () => {} },
  useFocusEffect: (cb: () => void) => require('react').useEffect(cb, [cb]),  // eslint-disable-line @typescript-eslint/no-require-imports
}));

const МЕТРИК = { frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } };

/**
 * Экраны гасим после каждой пробы: питомец в шапке каркаса держит `setTimeout`,
 * и незакрытый экран роняет ВЕСЬ прогон уже ПОСЛЕ зелёного вердикта — выход 1
 * без единой строки FAIL. Три моих набора так и потекли 09.09.2026.
 */
const открытые: any[] = [];
afterEach(async () => {
  while (открытые.length) {
    const r = открытые.pop();
    await TestRenderer.act(async () => { r.unmount(); });
  }
});

function весьТекст(n: any): string {
  const куски: string[] = [];
  const обойти = (x: any) => {
    if (x === null || x === undefined) return;
    if (typeof x === 'string' || typeof x === 'number') { куски.push(String(x)); return; }
    if (Array.isArray(x)) { x.forEach(обойти); return; }
    if (x.children) x.children.forEach(обойти);
  };
  обойти(n.children);
  return куски.join(' ');
}

/** Подписи для незрячих собираются отдельно: их в тексте узлов нет. */
function озвучка(r: any): string {
  return r.root.findAll((n: any) => typeof n.type !== 'string' && typeof n.props?.accessibilityLabel === 'string')
    .map((n: any) => n.props.accessibilityLabel).join(' ');
}

/**
 * 🔴 ПРОБА ИДЁТ ПО-РУССКИ, И ЭТО НЕ ЛЕНЬ, А ЕДИНСТВЕННЫЙ ЯЗЫК, ГДЕ УТЕЧКА ВИДНА.
 *
 * 📍 По-английски и пробирка, и трубка шариков называются `tube` (`waterSortDesc`
 * «each tube», `ballSortDesc` «into tubes») — по словарю сосудов эти две шкурки
 * в английском НЕ различаются, и проба на `en` была бы зелёной при полностью
 * перепутанных строках. Первый прогон этой пробы и покраснел именно так: язык
 * по умолчанию `en`, русские корни не нашлись, премиса не пустила дальше.
 * Поэтому язык ставится явно, а полнота по остальным одиннадцати словарям
 * проверяется отдельной пробой по ключам.
 */
async function открыть(путь: string) {
  const AsyncStorage = require('@react-native-async-storage/async-storage');  // eslint-disable-line @typescript-eslint/no-require-imports
  await AsyncStorage.clear();
  await AsyncStorage.setItem('language', 'ru');
  const { ThemeProvider } = require('@/src/contexts/ThemeContext');  // eslint-disable-line @typescript-eslint/no-require-imports
  const { LanguageProvider } = require('@/src/contexts/LanguageContext');  // eslint-disable-line @typescript-eslint/no-require-imports
  const { ProfileProvider } = require('@/src/contexts/ProfileContext');  // eslint-disable-line @typescript-eslint/no-require-imports
  const { SafeAreaProvider } = require('react-native-safe-area-context');  // eslint-disable-line @typescript-eslint/no-require-imports
  const Screen = require(путь).default;  // eslint-disable-line
  let r: any;
  await TestRenderer.act(async () => {
    r = TestRenderer.create(
      React.createElement(SafeAreaProvider, { initialMetrics: МЕТРИК },
        React.createElement(ProfileProvider, null,
          React.createElement(ThemeProvider, null,
            React.createElement(LanguageProvider, null,
              React.createElement(Screen))))),
    );
  });
  await TestRenderer.act(async () => { for (let i = 0; i < 30; i += 1) await Promise.resolve(); });
  открытые.push(r);
  return r;
}

/** Войти в партию: до неё на экране настройки поля нет вовсе. */
async function вПартию(r: any) {
  const кнопка = r.root.findAll((n: any) => typeof n.type !== 'string'
    && n.props?.accessibilityRole === 'button'
    && /Начать|Продолжить|Start/i.test(весьТекст(n)))[0];
  if (кнопка) {
    await TestRenderer.act(async () => { кнопка.props.onPress?.(); });
    await TestRenderer.act(async () => { for (let i = 0; i < 30; i += 1) await Promise.resolve(); });
  }
  return !!кнопка;
}

/**
 * Словарь сосудов. Своё слово — то, которое обязано БЫТЬ; чужие — которых быть
 * не может. Корни, а не целые слова: падежи.
 */
const ШКУРКИ = [
  { имя: 'Пробирки', путь: '@/app/games/water-sort', своё: [/пробирк/i], чужие: [/трубк/i, /стержн|стержен/i, /гайк/i, /шарик/i] },
  { имя: 'Шарики', путь: '@/app/games/ball-sort', своё: [/трубк/i, /шарик/i], чужие: [/пробирк/i, /стержн|стержен/i, /гайк/i] },
  { имя: 'Гайки', путь: '@/app/games/nut-sort', своё: [/стержн|стержен/i, /гайк/i], чужие: [/пробирк/i, /трубк/i, /шарик/i] },
];

describe('шкурки сортировщика говорят своими словами', () => {
  for (const ш of ШКУРКИ) {
    it(`${ш.имя}: на поле нет чужого сосуда`, async () => {
      const r = await открыть(ш.путь);
      expect(await вПартию(r)).toBe(true);

      const текст = `${весьТекст(r.root)} ${озвучка(r)}`;

      // ПРЕМИСА: экран вообще отрисовался и говорит про СВОЙ сосуд.
      expect({ шкурка: ш.имя, кириллицы: (текст.match(/[а-яё]/gi) ?? []).length })
        .toEqual({ шкурка: ш.имя, кириллицы: (текст.match(/[а-яё]/gi) ?? []).length });
      expect((текст.match(/[а-яё]/gi) ?? []).length).toBeGreaterThan(40);
      expect(ш.своё.some((re) => re.test(текст))).toBe(true);

      // И только теперь — что чужого сосуда нет.
      const чужие = ш.чужие
        .map((re) => ({ re: String(re), кусок: (текст.match(new RegExp(`.{0,40}${re.source}.{0,40}`, 'i')) ?? [])[0] }))
        .filter((x) => x.кусок);
      expect(чужие).toEqual([]);
    });
  }

  /**
   * 🔴 ВСТУПЛЕНИЕ НАДО РАСКРЫТЬ, ИНАЧЕ ПРОБА ЕГО НЕ ВИДИТ.
   *
   * 📍 Мутация «вернуть общий `waterSortIntroDesc`» ПЕРЕЖИЛА первую редакцию этой
   * пробы: `GameAbout` свёрнут по умолчанию (`open = !!defaultOpen`), длинный
   * текст правил в дерево не попадает вовсе — проба читала заголовок и зеленела.
   * Ровно тот случай, когда зелёное означает «не дошло», а не «работает».
   */
  it('экран настройки каждой шкурки тоже говорит своими словами', async () => {
    for (const ш of ШКУРКИ) {
      const r = await открыть(ш.путь);
      // Ищем строку «Об игре» по подписи, а не по `accessibilityState`: флаг
      // раскрытия висит на одном узле, а `onPress` — на другом, и нажатие по
      // первому найденному ничего не делало (проверено прогоном: правила
      // остались свёрнутыми, а проба при этом зеленела).
      const шапки = r.root.findAll((n: any) => typeof n.type !== 'string'
        && typeof n.props?.onPress === 'function'
        && /Об игре|About/i.test(весьТекст(n)));
      expect(шапки.length).toBeGreaterThan(0);
      await TestRenderer.act(async () => { шапки[шапки.length - 1].props.onPress(); });
      await TestRenderer.act(async () => { for (let i = 0; i < 10; i += 1) await Promise.resolve(); });
      const текст = `${весьТекст(r.root)} ${озвучка(r)}`;
      // ПРЕМИСА: правила действительно раскрылись. Признак — оборот ИЗ САМОГО
      // вступления, а не длина текста: порог по длине я бы поставил на глаз, и
      // 350 знаков заголовков прошли бы за «правила на месте».
      expect(/Уровень взят, когда/.test(текст)).toBe(true);
      expect(ш.своё.some((re) => re.test(текст))).toBe(true);
      const чужие = ш.чужие
        .map((re) => ({ шкурка: ш.имя, кусок: (текст.match(new RegExp(`.{0,40}${re.source}.{0,40}`, 'i')) ?? [])[0] }))
        .filter((x) => x.кусок);
      expect(чужие).toEqual([]);
      await TestRenderer.act(async () => { открытые.pop().unmount(); });
    }
  });

  /**
   * Ключи шкурки обязаны быть во ВСЕХ словарях. Без этого `t` вернёт имя ключа,
   * и на экране появится «ballSortHint» — по-английски это выглядит почти как
   * текст, и заметить можно не сразу.
   */
  it('у каждой шкурки свои ключи во всех двенадцати словарях', () => {
    const fs = require('fs');            // eslint-disable-line @typescript-eslint/no-require-imports
    const path = require('path');        // eslint-disable-line @typescript-eslint/no-require-imports
    const корень = path.join(__dirname, '..', 'contexts');
    const хвосты = ['Desc', 'IntroDesc', 'LvlParams', 'Hint', 'EmptyVessel'];
    const приставки = ['waterSort', 'ballSort', 'nutSort'];
    const файлы = ['LanguageContext.tsx', ...['ar', 'de', 'es', 'fr', 'hi', 'it', 'ja', 'ko', 'pt', 'zh']
      .map((l) => path.join('translations', `${l}.ts`))];

    const дыры: string[] = [];
    for (const ф of файлы) {
      const текст = fs.readFileSync(path.join(корень, ф), 'utf8');
      for (const п of приставки) {
        for (const х of хвосты) {
          const ключ = `${п}${х}`;
          if (!new RegExp(`["']?${ключ}["']?\\s*:`).test(текст)) дыры.push(`${ф}: ${ключ}`);
        }
      }
    }
    expect(дыры).toEqual([]);
  });
});
