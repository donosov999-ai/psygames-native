/* eslint-disable @typescript-eslint/no-require-imports -- компонент и сервисы
 * берутся ПОСЛЕ подмен и после сброса модулей, иначе в дерево попадут настоящий
 * роутер и уже «поздоровавшийся» модуль. */
/**
 * 🔴 ВСТРЕЧА ОБЯЗАНА ДОЙТИ ДО ЭКРАНА, А НЕ ОСТАТЬСЯ В СЕРВИСЕ.
 *
 * `pet-greeting.test.ts` проверяет, ЧТО питомец сказал бы. Это половина работы:
 * ровно так же выглядела бы задача, в которой сервис написан, покрыт пробами и
 * никем не вызван. Урок уже записан в этом же наборе про двадцать пять
 * дорисованных состояний, которые лежали в сборке и не игрались.
 *
 * ⚠️ Поэтому здесь питомец монтируется по-настоящему, хранилище засевается
 * настоящими партиями (`recordRound`), время прокручивается — и смотрим, что
 * оказалось в пузыре. Поиска слов в исходнике нет: он зеленеет и от комментария.
 */
/*
 * ⚠️ НИ `React`, НИ `react-test-renderer` НЕ БЕРУТСЯ СВЕРХУ. `jest.resetModules()`
 * ниже заводит новый реестр, и модуль, взятый до сброса, оказывается ДРУГИМ
 * экземпляром: компонент рендерится одним React, а хук ищет диспетчер в другом —
 * падение «Cannot read properties of null (reading 'useContext')». Всё, что
 * участвует в рендере, берётся ВНУТРИ прогона, после сброса.
 */
jest.mock('expo-router', () => ({
  usePathname: () => '/',
  router: { push: () => {}, canGoBack: () => false, back: () => {}, replace: () => {} },
}));

const МЕТРИК = { frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } };

/** Дата N дней назад от сегодняшнего дня — серия считается от «сегодня». */
const назад = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d;
};

/**
 * Смонтировать питомца на главной и вернуть весь текст, который оказался на
 * экране за `секунд` секунд. Засев выполняется ПОСЛЕ сброса модулей — иначе
 * хранилище и модульный флаг «уже здоровались» достаются от прошлой пробы.
 */
async function прогнать(секунд: number, засеять: (m: any) => Promise<void>) {
  jest.resetModules();
  // ⚠️ Мок хранилища отдаётся общим модулем (CommonJS), у него нет `.default`,
  // когда его берут через require — в отличие от import в остальных пробах.
  const хранилище = require('@react-native-async-storage/async-storage');
  const m = {
    storage: хранилище.default ?? хранилище,
    earn: require('@/src/services/earn'),
    goal: require('@/src/services/streakGoal'),
    greet: require('@/src/services/petGreeting'),
  };
  await m.storage.clear();
  await засеять(m);

  const React = require('react');
  const TestRenderer = require('react-test-renderer');
  const { ThemeProvider } = require('@/src/contexts/ThemeContext');
  const { LanguageProvider } = require('@/src/contexts/LanguageContext');
  const { ProfileProvider } = require('@/src/contexts/ProfileContext');
  const { SafeAreaProvider } = require('react-native-safe-area-context');
  const WalkingPet = require('@/src/components/pet/WalkingPet').default;

  let r: any;
  await TestRenderer.act(async () => {
    r = TestRenderer.create(
      React.createElement(SafeAreaProvider, { initialMetrics: МЕТРИК },
        React.createElement(ProfileProvider, null,
          React.createElement(ThemeProvider, null,
            React.createElement(LanguageProvider, null,
              React.createElement(WalkingPet))))),
    );
  });
  // Посекундно, а не одной строкой: одной строкой не отличить «показал и тут же
  // затёр» от «показал и держал», а это ровно то, что здесь и проверяется.
  const посекундно: string[] = [];
  for (let i = 0; i < секунд; i++) {
    await TestRenderer.act(async () => { jest.advanceTimersByTime(1000); });
    посекундно.push(JSON.stringify(r.toJSON() ?? {}));
  }
  await TestRenderer.act(async () => { r.unmount(); });
  return посекундно;
}

/**
 * Реплика, которую питомец обязан показать при серии 4 и цели 30 — на ЛЮБОМ из
 * написанных языков.
 *
 * ⚠️ Язык не зашивается: приложение в пробах поднимается на английском, и
 * ожидание «Серия 4 дн., до цели 26» покраснело бы не потому, что встреча не
 * дошла, а потому что она дошла по-английски. Сам ТЕКСТ пинается литералами в
 * `pet-greeting.test.ts`; здесь проверяется только, что он оказался на экране.
 */
function ожидаемыеРеплики() {
  const greet = require('@/src/services/petGreeting');
  const состояние = { ask: null, progress: { done: 4, left: 26, reached: false }, playedToday: true };
  const тексты = greet.greetLanguages().map((l: string) => greet.pickGreeting(l, состояние).text);
  // Числа человека обязаны быть в каждой — иначе «дошло» ничего не значит.
  for (const t of тексты) expect(`${t}`.includes('4') && `${t}`.includes('26')).toBe(true);
  return тексты as string[];
}

/** Четыре дня подряд, считая сегодняшний, и цель на 30 дней. */
const четыреДняИЦель = async (m: any) => {
  for (const n of [3, 2, 1, 0]) {
    await m.earn.recordRound({ profileId: 'free', game: 'schulte', score: 10, errors: 0, warmupStep: false, now: назад(n) });
  }
  await m.goal.saveStreakGoal('free', m.goal.startGoal(30));
};

describe('встреча при заходе доходит до экрана', () => {
  beforeEach(() => { jest.useFakeTimers(); });
  afterEach(() => { jest.useRealTimers(); });

  it('🔴 серия 4 дня и цель на 30 — питомец здоровается ЕГО числами', async () => {
    const кадры = await прогнать(5, четыреДняИЦель);
    const текст = кадры.join('');
    const попало = ожидаемыеРеплики().filter((t) => текст.includes(t));
    expect(`встреча на экране: ${попало.length}`).toBe('встреча на экране: 1');
  });

  it('🔴 сегодня уже здоровались — второй раз за день молчит', async () => {
    const текст = (await прогнать(5, async (m) => {
      await четыреДняИЦель(m);
      await m.greet.markGreeted('free');
    })).join('');
    expect(ожидаемыеРеплики().filter((t) => текст.includes(t))).toEqual([]);
  });

  it('🔴 цели нет — говорит окно цели, питомец молчит', async () => {
    const текст = (await прогнать(5, async (m) => {
      for (const n of [3, 2, 1, 0]) {
        await m.earn.recordRound({ profileId: 'free', game: 'schulte', score: 10, errors: 0, warmupStep: false, now: назад(n) });
      }
      // Цель не сохранена — `askReason` вернёт 'first', и слово за окном.
    })).join('');
    expect(ожидаемыеРеплики().filter((t) => текст.includes(t))).toEqual([]);
  });

  /**
   * 🔴 ЭТА ПРОБА ЛОВИТ ИМЕННО ЗАСЛОН ПЕРЕД ОКНОМ, а соседняя («цели нет») — нет:
   * там цели не было вовсе, и питомец промолчал бы всё равно, потому что нечего
   * сказать числом. Здесь цель ЕСТЬ, серия идёт, число есть — и всё-таки молчит,
   * потому что окно собирается спросить (`weekly`: с прошлого показа неделя).
   * Разницу поймала контрпроба: подмена повода на `null` первую пробу не красила.
   */
  it('🔴 окно цели собирается спросить — питомец молчит, хотя ему есть что сказать', async () => {
    const текст = (await прогнать(5, async (m) => {
      for (const n of [3, 2, 1, 0]) {
        await m.earn.recordRound({ profileId: 'free', game: 'schulte', score: 10, errors: 0, warmupStep: false, now: назад(n) });
      }
      const восемь = m.earn.dayKey(назад(8));
      await m.goal.saveStreakGoal('free', { days: 30, startedAt: восемь, askedAt: восемь, reachedAt: null });
    })).join('');
    expect(ожидаемыеРеплики().filter((t) => текст.includes(t))).toEqual([]);
  });

  /**
   * 🔴 БОЛТОВНЯ НЕ ЗАТИРАЕТ ВСТРЕЧУ. Обычная фраза приходит на 4-8-й секунде, а
   * встреча висит с 1,3-й по 7,3-ю — то есть без заслона она перебивалась бы
   * почти всегда. Той же бедой болел праздник рекорда (5 с с отметки 1,3 с), и
   * заметил я её, только когда поставил встречу в тот же пузырь.
   *
   * ⚠️ `Math.random` заменён постоянной: иначе момент болтовни случаен и красный
   * цвет пробы перестаёт что-либо значить. 0 даёт самый ранний срок — 4-я секунда.
   */
  it('🔴 встреча держится на экране, а не затирается обычной болтовнёй', async () => {
    const настоящий = Math.random;
    Math.random = () => 0;
    try {
      const кадры = await прогнать(6, четыреДняИЦель);
      const реплики = ожидаемыеРеплики();
      // Пятая секунда — болтовня к этому моменту уже просилась на экран.
      const держится = реплики.some((t) => кадры[4].includes(t));
      expect(`встреча на 5-й секунде: ${держится}`).toBe('встреча на 5-й секунде: true');
    } finally { Math.random = настоящий; }
  });

  it('отметка встречи остаётся в хранилище — назавтра она и остановит второй показ', async () => {
    await прогнать(5, четыреДняИЦель);
    // ⚠️ Модули берутся ПОСЛЕ прогона: он сам сбрасывает реестр, и взятое до
    // него хранилище было бы уже чужим — с пустой отметкой и зелёной пробой.
    const хранилище = require('@react-native-async-storage/async-storage');
    const storage = хранилище.default ?? хранилище;
    const greet = require('@/src/services/petGreeting');
    const было = await storage.getItem(greet.greetedKey('free'));
    expect(было).toBe(require('@/src/services/earn').dayKey(new Date()));
  });
});
