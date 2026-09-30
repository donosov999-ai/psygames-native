/* psygames-attention-condition-reaches-session · VER 1 · 24.09.2026 */
/**
 * 🔴 УСЛОВИЕ УРОВНЯ ДОЛЖНО ДОЕХАТЬ ДО ПАРТИИ — ПРОВЕРЯЕТСЯ ИГРОЙ, А НЕ ЧТЕНИЕМ КОДА.
 *
 * ЧТО УЖЕ ЕСТЬ. Гейт `attention-condition-recorded` держит КОНТРАКТ восемнадцати
 * функций `levelCondition`: условие содержит все меняющиеся по лестнице поля,
 * отдаёт те же значения, что уровень, и различает L1 и L15. Он не трогает экран.
 *
 * 🔴 ЧЕГО ОН НЕ ВИДИТ. Что запись ДОЕХАЛА до `saveSession`. Строка
 * `...levelCondition(levelRef.current)` стояла в каждом из восемнадцати файлов, и
 * проверена она была ГЛАЗАМИ да типами. Убери спред — контрактный гейт останется
 * зелёным, потому что сами функции не изменились. Заверни спред в условие, которое
 * никогда не истинно, — то же самое. Накопленные партии при этом молча теряют
 * условие, и ни один прогон не краснеет.
 *
 * КАК ПРОВЕРЯЕТСЯ ЗДЕСЬ. Экран монтируется целиком, партия доигрывается на
 * поддельных часах нажатиями, и ловится то, что ушло в `saveSession`. Дальше —
 * сверка: у КАЖДОГО поля `levelCondition(сыгранный уровень)` в `details` партии
 * лежит то же значение.
 *
 * 🔴 СЛЕПОЕ = КРАСНОЕ. Нет записи за отведённое время — проверка краснеет с
 * причиной, а не пропускается. Иначе экран, переставший записывать партии вовсе,
 * дал бы самый зелёный прогон в наборе.
 *
 * ⚠️ УРОВЕНЬ БЕРЁТСЯ ИЗ ЗАПИСИ, А НЕ ИЗ ДОГАДКИ. Проба не знает, на каком уровне
 * экран открылся (лестница лежит в AsyncStorage и общая с прошлыми партиями), и
 * не должна знать: сверять надо с тем уровнем, который записан в саму партию.
 * У iowa уровень — это `doneRun`, число доигранных прогонов, а не `levelRef`;
 * поле в партии всё равно называется `level`, поэтому чтение одинаковое.
 *
 * ⚠️ ТРИ ЭКРАНА ПИШУТ УСЛОВИЕ ПОД ЗАСЛОНОМ — wcst, prl, bart:
 *     wcst  `...(classic ? {} : { level, ...levelCondition(level) })`
 *     prl   `...(classic ? {} : levelCondition(levelRef.current))`
 *     bart  `...(useLevels ? levelCondition(levelRef.current) : {})`
 * В классическом прогоне уровня НЕ СУЩЕСТВУЕТ, и условия там быть не должно —
 * это не дефект, а устройство. Поэтому у трёх проверяются ОБА режима: в уровневом
 * условие обязано быть, в классическом — обязано ОТСУТСТВОВАТЬ. Вторая половина
 * важна не меньше: заслон, снятый «чтобы всегда писалось», подмешал бы в
 * классические партии поля несуществующего уровня.
 * 📌 Карточка задачи 3186010f называла два таких экрана, wcst в ней не было —
 * нашёлся прогоном `grep -n 'levelCondition' app/games/*.tsx` по всем восемнадцати.
 *
 * ⚠️ «КОРРЕКТУРА» ПИШЕТ ПАРТИИ В ТРЁХ МЕСТАХ, проверяется ОДНО. Два других —
 * серия блоков (`seriesSession` из общего `src/services/series.ts`, ею же живут
 * schulte и chess-blind): там своя лестница квадратов 5×5…8×8 и свой уровень,
 * к `levelCondition` корректуры отношения не имеющий. Общий сервис — не моя зона,
 * и подмешивать в него условие чужой игры нельзя.
 */
import React from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * ⚠️ МАРШРУТ ЛЕЖИТ В `globalThis`, А НЕ В ПЕРЕМЕННОЙ МОДУЛЯ. Фабрике `jest.mock`
 * запрещено видеть переменные файла (они ещё не созданы: вызов поднимается выше
 * объявлений), и `usePathname: () => маршрут` роняет весь набор до первой пробы.
 * Экранов здесь восемнадцать, у каждого свой путь, поэтому путь обязан быть
 * подвижным — отсюда глобальный держатель, он в списке разрешённых.
 */
const держатель = globalThis as unknown as { маршрутПробы?: string };
держатель.маршрутПробы = '/games/stroop';
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: () => {}, replace: () => {}, back: () => {} }),
  useLocalSearchParams: () => ({}),
  useGlobalSearchParams: () => ({}),
  usePathname: () => (globalThis as unknown as { маршрутПробы?: string }).маршрутПробы ?? '/games/stroop',
  useFocusEffect: () => {},
  useNavigation: () => ({ addListener: () => () => {}, setOptions: () => {} }),
  router: { canGoBack: () => false, back: () => {}, replace: () => {}, push: () => {} },
}));
const записи: any[] = [];
jest.mock('@/src/services/api', () => ({
  ...jest.requireActual('@/src/services/api'),
  saveSession: async (s: any) => { записи.push(s); return s; },
}));

/* eslint-disable @typescript-eslint/no-require-imports -- загрузка ПОСЛЕ jest.mock */
const TestRenderer = require('react-test-renderer');
const { __resetGameClock } = require('@/src/services/gamePause');
/* eslint-enable @typescript-eslint/no-require-imports */

const поднятые: any[] = [];
beforeEach(() => { jest.useFakeTimers(); __resetGameClock(); записи.length = 0; });
afterEach(() => {
  while (поднятые.length) { const r = поднятые.pop(); try { TestRenderer.act(() => { r.unmount(); }); } catch { /* погашено */ } }
  jest.useRealTimers();
});

const осесть = async () => { await TestRenderer.act(async () => { for (let i = 0; i < 20; i += 1) await Promise.resolve(); }); };
const текстУзла = (n: any): string => n.findAll((x: any) => typeof x.props?.children === 'string' || Array.isArray(x.props?.children), { deep: true })
  .map((x: any) => (Array.isArray(x.props.children) ? x.props.children.filter((c: any) => typeof c === 'string' || typeof c === 'number').join('') : x.props.children))
  .join(' ');
const нажимаемые = (r: any) => r.root.findAll((n: any) => n.props && typeof n.props.onPress === 'function', { deep: true });

/**
 * ⚠️ ЖМЁМ ТОЛЬКО ВНУТРИ ПОЛЯ — по положительному признаку `testID`, а не по списку
 * запретов. Список «чего не трогать» отстаёт от кода молча: появится новая кнопка
 * в шапке — проба начнёт её жать и уронит партию, а выглядеть это будет как дефект
 * игры. Поле и панель ответа помечены каркасом (`GameShell`), и этого достаточно.
 */
const вПоле = (r: any) => {
  const зоны = r.root.findAll((n: any) => n.props?.testID === 'game-field' || n.props?.testID === 'game-toolbar', { deep: true });
  return зоны.flatMap((з: any) => з.findAll((n: any) => n.props && typeof n.props.onPress === 'function', { deep: true }));
};

async function нажать(узел: any) {
  await TestRenderer.act(async () => { узел.props.onPress({ nativeEvent: {}, preventDefault() {}, stopPropagation() {} }); });
  await осесть();
}

type Экран = {
  имя: string;
  маршрут: string;
  экран: () => any;
  условие: (l: number) => Record<string, unknown>;
  /** Кнопка режима, которую надо нажать до старта (у экранов с наборами и классикой). */
  режим?: RegExp;
  /** true — в этом прогоне условия в партии быть НЕ должно (классический режим). */
  безУровня?: boolean;
  /** Сколько игрового времени отвести партии. По умолчанию 180 с. */
  срок?: number;
  /** Имя игры в ключе ступени `psygames_<имя>_level_<профиль>` — им проба садится выше первого уровня. */
  ступень: string;
};

/**
 * 🔴 ПРОБА ИГРАЕТ ВОСЬМУЮ СТУПЕНЬ, А НЕ ПЕРВУЮ — ИНАЧЕ ОНА СЛЕПА К ЦЕЛОМУ КЛАССУ
 * ПОДМЕН. На первом уровне «условие с постоянного уровня» неотличимо от
 * исправного кода: у iowa `шаг = max(0, min(14, level − 1))` даёт на L1 и на L0
 * одно и то же — 0 мс, и мутация `levelCondition(0)` прошла мимо зелёной. То же
 * слепое пятно у любой лестницы, начинающейся с пола.
 * Восемь — середина пятнадцати: значения условия там отличаются и от первого
 * уровня, и от последнего, и ни одна формула в него не упирается.
 */
const СТУПЕНЬ = 8;

/* eslint-disable @typescript-eslint/no-require-imports -- те же провайдеры после моков */
const ЭКРАНЫ: Экран[] = [
  { имя: 'stroop', ступень: 'stroop', маршрут: '/games/stroop', экран: () => require('@/app/games/stroop'), условие: (l) => require('@/app/games/stroop').levelCondition(l) },
  { имя: 'flanker', ступень: 'flanker', маршрут: '/games/flanker', экран: () => require('@/app/games/flanker'), условие: (l) => require('@/app/games/flanker').levelCondition(l) },
  { имя: 'cpt', ступень: 'cpt', маршрут: '/games/cpt', экран: () => require('@/app/games/cpt'), условие: (l) => require('@/app/games/cpt').levelCondition(l) },
  { имя: 'targets', ступень: 'targets', маршрут: '/games/targets', экран: () => require('@/app/games/targets'), условие: (l) => require('@/app/games/targets').levelCondition(l) },
  { имя: 'stroop-emotional', ступень: 'stroop_emotional', маршрут: '/games/stroop-emotional', экран: () => require('@/app/games/stroop-emotional'), условие: (l) => require('@/app/games/stroop-emotional').levelCondition(l) },
  { имя: 'simon', ступень: 'simon', маршрут: '/games/simon', экран: () => require('@/app/games/simon'), условие: (l) => require('@/app/games/simon').levelCondition(l) },
  { имя: 'choice-rt', ступень: 'choice_rt', маршрут: '/games/choice-rt', экран: () => require('@/app/games/choice-rt'), условие: (l) => require('@/app/games/choice-rt').levelCondition(l) },
  { имя: 'ant', ступень: 'ant', маршрут: '/games/ant', экран: () => require('@/app/games/ant'), условие: (l) => require('@/app/games/ant').levelCondition(l) },
  { имя: 'switching-task', ступень: 'switching_task', маршрут: '/games/switching-task', экран: () => require('@/app/games/switching-task'), условие: (l) => require('@/app/games/switching-task').levelCondition(l) },
  { имя: 'go-no-go', ступень: 'go_no_go', маршрут: '/games/go-no-go', экран: () => require('@/app/games/go-no-go'), условие: (l) => require('@/app/games/go-no-go').levelCondition(l) },
  { имя: 'inhibition', ступень: 'inhibition', маршрут: '/games/inhibition', экран: () => require('@/app/games/inhibition'), условие: (l) => require('@/app/games/inhibition').levelCondition(l) },
  { имя: 'stop-signal', ступень: 'stop_signal', маршрут: '/games/stop-signal', экран: () => require('@/app/games/stop-signal'), условие: (l) => ({ ...require('@/src/games/stop-signal/core').levelCondition(l) }) },
  { имя: 'posner', ступень: 'posner', маршрут: '/games/posner', экран: () => require('@/app/games/posner'), условие: (l) => require('@/app/games/posner').levelCondition(l) },
  { имя: 'proofreading', ступень: 'proofreading', маршрут: '/games/proofreading', экран: () => require('@/app/games/proofreading'), условие: (l) => require('@/app/games/proofreading').levelCondition(l), срок: 240_000 },
  { имя: 'iowa', ступень: 'iowa', маршрут: '/games/iowa', экран: () => require('@/app/games/iowa'), условие: (l) => require('@/app/games/iowa').levelCondition(l) },
  { имя: 'wcst', ступень: 'wcst', маршрут: '/games/wcst', экран: () => require('@/app/games/wcst'), условие: (l) => require('@/app/games/wcst').levelCondition(l) },
  { имя: 'prl', ступень: 'prl', маршрут: '/games/prl', экран: () => require('@/app/games/prl'), условие: (l) => require('@/app/games/prl').levelCondition(l) },
  { имя: 'bart', ступень: 'bart', маршрут: '/games/bart', экран: () => require('@/app/games/bart'), условие: (l) => require('@/app/games/bart').levelCondition(l) },
];

/**
 * ТРИ ЭКРАНА С ЗАСЛОНОМ — В КЛАССИЧЕСКОМ РЕЖИМЕ. Здесь условия быть НЕ должно:
 * уровня в таком прогоне не существует, и поля несуществующего уровня в партии —
 * такой же дефект, как их пропажа в уровневом. Подписи кнопок сняты с живого
 * экрана: у wcst и prl режим переключается парой «Levels / Free», у bart — кнопкой
 * «Classic run». Текст в разметке удваивается (узел плюс его же дитя), поэтому
 * образцы написаны с повтором — так же, как в `inhibition-sessions-own-type`.
 */
const КЛАССИКА: Экран[] = [
  { ...ЭКРАНЫ.find((э) => э.имя === 'wcst')!, имя: 'wcst (классика)', режим: /^(Free\s*)+$/, безУровня: true },
  { ...ЭКРАНЫ.find((э) => э.имя === 'prl')!, имя: 'prl (классика)', режим: /^(Free\s*)+$/, безУровня: true },
  { ...ЭКРАНЫ.find((э) => э.имя === 'bart')!, имя: 'bart (классика)', режим: /^(Classic run\s*)+$/, безУровня: true },
];

async function смонтировать(э: Экран) {
  держатель.маршрутПробы = э.маршрут;
  await AsyncStorage.clear();
  await AsyncStorage.setItem('psygames_active_profile', 'free');
  // формат ключа — src/hooks/usePersistentLevel.ts:76
  await AsyncStorage.setItem(`psygames_${э.ступень}_level_free`, String(СТУПЕНЬ));
  const { ThemeProvider } = require('@/src/contexts/ThemeContext');
  const { LanguageProvider } = require('@/src/contexts/LanguageContext');
  const { ProfileProvider } = require('@/src/contexts/ProfileContext');
  const { PlayerLevelProvider } = require('@/src/contexts/PlayerLevelContext');
  const { WarmupProvider } = require('@/src/contexts/WarmupContext');
  const { SafeAreaProvider } = require('react-native-safe-area-context');
  const Screen = э.экран().default;
  /**
   * ⚠️ ПОРЯДОК ПРОВАЙДЕРОВ — ТОТ ЖЕ, ЧТО В `app/_layout.tsx` (стр. 225–229).
   * Без `PlayerLevelProvider` и `WarmupProvider` классический прогон wcst, prl и
   * bart падал с `useWarmup must be inside WarmupProvider`: экраны его не зовут,
   * зовёт каркас на пути, куда уводит классика. Уровневые прогоны при этом были
   * зелёными — то есть проба, собранная «как в образце», проверяла экран в
   * обстановке, которой в приложении не бывает, и половина путей ей недоступна.
   */
  let r: any;
  await TestRenderer.act(async () => {
    r = TestRenderer.create(React.createElement(SafeAreaProvider, {
      initialMetrics: { frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } },
    }, React.createElement(ProfileProvider, null, React.createElement(ThemeProvider, null,
      React.createElement(LanguageProvider, null,
        React.createElement(PlayerLevelProvider, null,
          React.createElement(WarmupProvider, null, React.createElement(Screen))))))));
  });
  await осесть();
  поднятые.push(r);
  return r;
}
/* eslint-enable @typescript-eslint/no-require-imports */

/** Партия доигрывается: часы идут шагами, между шагами жмётся очередная кнопка поля. */
async function доиграть(r: any, срокМс: number) {
  const шаг = 250;
  let нажатий = 0;
  for (let t = 0; t < срокМс; t += шаг) {
    await TestRenderer.act(async () => { jest.advanceTimersByTime(шаг); });
    await осесть();
    if (записи.length) return нажатий;
    const цели = вПоле(r);
    if (цели.length) { await нажать(цели[нажатий % цели.length]); нажатий += 1; }
    if (записи.length) return нажатий;
  }
  return нажатий;
}

async function сыграть(э: Экран) {
  const r = await смонтировать(э);
  const понятно = нажимаемые(r).find((b: any) => /^(got it\s*)+$/i.test(текстУзла(b).trim()));
  if (понятно) await нажать(понятно);
  if (э.режим) {
    const кнопка = нажимаемые(r).find((b: any) => э.режим!.test(текстУзла(b).trim()));
    expect(кнопка ? `${э.имя}: кнопка режима есть` : `${э.имя}: нет кнопки режима «${э.режим.source}»`).toBe(`${э.имя}: кнопка режима есть`);
    await нажать(кнопка);
  }
  /**
   * ⚠️ СТАРТОВЫХ ЗАСЛОНОВ У ЭКРАНА БЫВАЕТ БОЛЬШЕ ОДНОГО. У «Мишеней» их два:
   * «Start» на настройках, а за ним отдельный «START» — готовность к первой пробе.
   * Проба, жавшая ровно один, висела все 180 с на втором экране и объявляла
   * «партия не записалась» — то есть красила ИСПРАВНУЮ игру. Поэтому жмём заслоны,
   * пока в поле не появятся кнопки: признак «партия идёт» — поле, а не счётчик
   * нажатий. Потолок 4 — чтобы неизвестный экран не крутил заслоны вечно.
   */
  for (let i = 0; i < 4 && вПоле(r).length === 0 && !записи.length; i += 1) {
    const старт = нажимаемые(r).find((b: any) => String(b.props.accessibilityLabel) === 'Start')
      ?? нажимаемые(r).find((b: any) => /^(start\s*)+$/i.test(текстУзла(b).trim()));
    if (!старт) break;
    await нажать(старт);
  }
  await доиграть(r, э.срок ?? 180_000);
  expect(записи.length ? `${э.имя}: партия записана` : `${э.имя}: за ${(э.срок ?? 180_000) / 1000} с партия не записалась — проверять нечего`)
    .toBe(`${э.имя}: партия записана`);
  return записи[записи.length - 1];
}

describe('условие уровня доезжает до записанной партии — у всех восемнадцати экранов', () => {
  it('есть что проверять — иначе набор зелен вслепую', () => {
    expect(ЭКРАНЫ.length).toBe(18);
  });

  it.each(ЭКРАНЫ)('$имя: в details партии лежат ВСЕ поля levelCondition сыгранного уровня', async (э) => {
    const з = await сыграть(э);
    const детали = (з.details ?? {}) as Record<string, unknown>;
    const уровень = детали.level;
    expect(`${э.имя}: уровень в партии ${typeof уровень === 'number' ? 'число' : `НЕ ЗАПИСАН (${JSON.stringify(уровень)})`}`)
      .toBe(`${э.имя}: уровень в партии число`);
    /**
     * 🔴 ЗАСЕВ ПРОВЕРЯЕТСЯ ОТДЕЛЬНО. Ключ мог не подойти (имя игры в ключе не
     * совпадает с маршрутом у пяти экранов: `choice_rt`, `switching_task`,
     * `go_no_go`, `stroop_emotional`, `stop_signal`), чтение могло не успеть до
     * старта партии. Тогда сыгран первый уровень, и проба осталась бы ровно такой
     * же слепой, какой была, — но выглядела бы усиленной.
     * ⚠️ ТРЕБУЕМ «НЕ НИЖЕ», А НЕ «РОВНО». Ступень растёт ВНУТРИ партии: проба
     * играет без ошибок (жмёт всё подряд), и «Мишени» за одну партию уезжают с
     * засеянной восьмой на пятнадцатую — в записи лежит level 15 и условие
     * пятнадцатого, и это верно. Требование «ровно 8» красило бы исправную игру.
     */
    expect(`${э.имя}: сыгранная ступень ${(уровень as number) >= СТУПЕНЬ ? `не ниже ${СТУПЕНЬ}` : `${уровень} — засев ступени не сработал`}`)
      .toBe(`${э.имя}: сыгранная ступень не ниже ${СТУПЕНЬ}`);
    const надо = э.условие(уровень as number);
    /**
     * 🔴 ДВА СПОСОБА ПРОЙТИ ВХОЛОСТУЮ, ОБА ВЫГЛЯДЯТ КАК ЗЕЛЁНАЯ ПРОБА.
     * Первый: условие вернуло пустой набор — сверять нечего, и цикл ниже не
     * сделает ни одного сравнения. Второй: поля в партии НЕТ вовсе, и тогда
     * `детали[k]` и `надо[k]` оба `undefined`, а `JSON.stringify` у обоих даёт
     * `undefined` — сравнение совпадает, хотя записи не было. Именно этот случай
     * проба и обязана ловить (убранный спред стирает поля целиком), поэтому
     * наличие ключа проверяется отдельно от значения.
     */
    expect(`${э.имя}: полей в условии ${Object.keys(надо).length}`).not.toBe(`${э.имя}: полей в условии 0`);
    const расхождения = Object.keys(надо)
      .filter((k) => !(k in детали) || JSON.stringify(детали[k]) !== JSON.stringify(надо[k]))
      .map((k) => (k in детали
        ? `${k}: в партии ${JSON.stringify(детали[k])} ≠ у уровня ${JSON.stringify(надо[k])}`
        : `${k}: в партии ПОЛЯ НЕТ, у уровня ${JSON.stringify(надо[k])}`));
    expect(`${э.имя} L${уровень} расхождения: ${расхождения.join(' · ') || '—'}`)
      .toBe(`${э.имя} L${уровень} расхождения: —`);
  }, 120_000);

  /**
   * 🔴 ВТОРАЯ ПОЛОВИНА, БЕЗ КОТОРОЙ ПЕРВАЯ ЧИНИТСЯ НЕВЕРНО. Увидев красную пробу
   * «условия нет», проще всего снять заслон — «пусть пишется всегда». Тогда в
   * классические партии поедут поля уровня, которого в них не существует, и
   * разбор накопленного станет врать в другую сторону. Поэтому отсутствие условия
   * в классике проверяется так же строго, как его наличие в уровневом прогоне.
   */
  it.each(КЛАССИКА)('$имя: условия уровня в партии НЕТ — уровня в этом прогоне не существует', async (э) => {
    const з = await сыграть(э);
    const детали = (з.details ?? {}) as Record<string, unknown>;
    const поля = Object.keys(э.условие(1));
    expect(`${э.имя}: полей в условии ${поля.length}`).not.toBe(`${э.имя}: полей в условии 0`);
    /**
     * 🔴 СНАЧАЛА ДОКАЗАТЬ, ЧТО ПРОЙДЕН ИМЕННО КЛАССИЧЕСКИЙ ПУТЬ. Без этого проба
     * зелена и тогда, когда кнопка режима перестала переключать: сыграл бы
     * уровневый прогон, условие в нём есть — и «лишних полей» проверка не нашла бы
     * ровно потому, что искала бы не там. У всех трёх экранов `level` лежит под тем
     * же заслоном, что и условие, поэтому его отсутствие и есть признак классики.
     */
    expect(`${э.имя}: level в партии ${'level' in детали ? `есть (${JSON.stringify(детали.level)}) — сыгран УРОВНЕВЫЙ прогон, кнопка режима не сработала` : 'отсутствует'}`)
      .toBe(`${э.имя}: level в партии отсутствует`);
    const лишние = поля.filter((k) => k in детали).map((k) => `${k}=${JSON.stringify(детали[k])}`);
    expect(`${э.имя} лишние поля уровня: ${лишние.join(' · ') || '—'}`)
      .toBe(`${э.имя} лишние поля уровня: —`);
  }, 120_000);
});
