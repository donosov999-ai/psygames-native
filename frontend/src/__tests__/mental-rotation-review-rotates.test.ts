/*
 * eslint-disable @typescript-eslint/no-require-imports — экран и его контексты
 * берутся ПОСЛЕ подмен, иначе в дерево попадут настоящие роутер и запись сессий.
 */
/* eslint-disable @typescript-eslint/no-require-imports */
/**
 * 🔴 ВРАЩЕНИЕ В РАЗБОРЕ НЕ ГАСИТСЯ СИСТЕМНОЙ НАСТРОЙКОЙ «МЕНЬШЕ ДВИЖЕНИЯ».
 *
 * ПОВОД. Денис 16.09.2026: «ментальная ротация, вращение не работает после ошибки».
 * Тот же дефект в отчёте тестировщика 11.09: «просто слайдшоу из картинок стало,
 * была анимация» (2.53.6, iOS).
 *
 * ПРИЧИНА, найденная 16.09.2026: экран читал `useReducedMotion()` и передавал
 * значение пропом в `RotationTransition` и `RotationWorkbench`. У обоих внутри есть
 * честная ветка «показать мгновенно» — и на устройстве с включённой настройкой
 * разбор замирал на той самой картинке, из-за которой человек ошибся.
 *
 * ⚠️ ПОЧЕМУ ЭТОГО НЕ ВИДЕЛ СУЩЕСТВУЮЩИЙ ГЕЙТ. `reduced-motion.test.ts` уже вносил
 * оба этих файла в исключения и прямо писал: «экран может форсировать мгновенный
 * показ пропом, но системная настройка сюда не дотягивается». Гейт проверяет файлы,
 * которые АНИМИРУЮТ. Экран не анимирует — он лишь передаёт чужое значение, и вся
 * дыра была шириной в один проп. Поэтому проба монтирует НАСТОЯЩИЙ экран с
 * настройкой, включённой на полную, и смотрит, что доехало до разбора.
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

/*
 * Настройка «меньше движения» ВКЛЮЧЕНА. Это и есть условие опыта: на таком
 * устройстве разбор и переставал вращаться.
 */
jest.mock('@/src/hooks/useReducedMotion', () => ({ useReducedMotion: () => true }));

jest.useFakeTimers();

const METRICS = { frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } };

async function осесть(r: any, кругов = 6) {
  for (let i = 0; i < кругов; i += 1) {
    await TestRenderer.act(async () => {
      jest.advanceTimersByTime(500);
      for (let k = 0; k < 30; k += 1) await Promise.resolve();
    });
  }
}

async function монтировать() {
  await AsyncStorage.clear();
  const { ThemeProvider } = require('@/src/contexts/ThemeContext');
  const { LanguageProvider } = require('@/src/contexts/LanguageContext');
  const { ProfileProvider } = require('@/src/contexts/ProfileContext');
  const { PlayerLevelValue } = require('@/src/contexts/PlayerLevelContext');
  const { SafeAreaProvider } = require('react-native-safe-area-context');
  /*
   * ⚠️ ПРОВАЙДЕР ЗАРЯДКИ ДОБАВЛЕН 09.09.2026. Экран ротации теперь читает
   * состояние зарядки (`useWarmup`) — пространственный пакет завёл шаги
   * упражнений, идущие подряд. В приложении провайдер стоит в корне всегда,
   * а проба монтировала экран без него и падала на входе, не дойдя до кнопки.
   */
  const { WarmupProvider } = require('@/src/contexts/WarmupContext');
  const Screen = require('@/app/games/mental-rotation').default;
  let r: any;
  await TestRenderer.act(async () => {
    r = TestRenderer.create(
      React.createElement(SafeAreaProvider, { initialMetrics: METRICS },
        React.createElement(ProfileProvider, null,
          React.createElement(ThemeProvider, null,
            React.createElement(LanguageProvider, null,
              React.createElement(PlayerLevelValue, { level: 30 },
                React.createElement(WarmupProvider, null,
                  React.createElement(Screen))))))),
    );
  });
  await осесть(r);
  return r;
}

/** Кнопки-варианты ответа: у них подпись «вариант N» для скринридера. */
function варианты(r: any): any[] {
  return r.root.findAll((n: any) => /вариант|option/i.test(String(n.props?.accessibilityLabel ?? '')));
}

/**
 * Промахнуться НАМЕРЕННО. Верный вариант пробе неизвестен, поэтому жмём по очереди,
 * пока не появится выход из разбора: попадание в верный просто подаёт новую фигуру.
 *
 * ⚠️ После ВЕРНОГО ответа игра ждёт 700 мс и лишь потом подаёт новую фигуру. Пока
 * пауза не истекла, варианты отключены, и цикл жал бы по мёртвым узлам: первый вид
 * пробы прокручивал время по 300 мс и до новой фигуры не доживал — отсюда и плавание
 * («то зелено, то красно» на четырёх прогонах подряд).
 *
 * ⚠️ Список вариантов перечитывается ПЕРЕД каждым нажатием. Первый вид пробы жал по
 * сохранённому списку и падал, когда ответ случайно оказывался верным: экран уже
 * сменился, а узлы в руках остались от прошлой фигуры.
 */
/**
 * Кнопка выхода из разбора. 09.09.2026 пространственный пакет переименовал `mr-next` в
 * `mental-review-next`; старое имя оставлено, чтобы проба не зависела от одного написания.
 */
const КНОПКА_ВЫХОДА = ['mr-next', 'mental-review-next'];

async function промахнуться(r: any, попыток = 12): Promise<boolean> {
  for (let i = 0; i < попыток; i += 1) {
    if (r.root.findAll((n: any) => КНОПКА_ВЫХОДА.includes(n.props?.testID)).length > 0) return true;
    const живые = варианты(r).filter((n: any) => typeof n.props?.onPress === 'function' && !n.props?.disabled);
    if (живые.length === 0) return false;
    await TestRenderer.act(async () => { живые[i % живые.length].props.onPress(); });
    await осесть(r, 3);   // 1500 мс — заведомо больше паузы в 700 мс после верного
  }
  return r.root.findAll((n: any) => КНОПКА_ВЫХОДА.includes(n.props?.testID)).length > 0;
}

/** Войти в партию: нажать «Начать»/«Play», если экран показывает настройку. */
async function начать(r: any) {
  const старт = r.root.findAll((n: any) =>
    n.props?.accessibilityRole === 'button' && typeof n.props?.onPress === 'function'
    && /начать|start|play|играть/i.test(текст(n)));
  if (старт.length > 0) {
    await TestRenderer.act(async () => { старт[0].props.onPress(); });
    await осесть(r);
  }
}

function текст(node: any): string {
  const out: string[] = [];
  const walk = (n: any) => {
    if (n == null) return;
    if (typeof n === 'string') { out.push(n); return; }
    if (Array.isArray(n)) { n.forEach(walk); return; }
    walk(n.props?.children ?? n.children);
  };
  walk(node);
  return out.join(' ');
}



/** Вернуть все узлы этого вида, у которых поворот погашен пропом. */
function погашенные(r: any, вид: any, имя: string): string[] {
  return r.root.findAllByType(вид)
    .filter((у: any) => у.props.reduceMotion === true)
    .map(() => `${имя}: reduceMotion=true`);
}

/**
 * 🔴 ПРОБА ПЛАВАЛА НА CI, И ЗДЕСЬ ДВЕ ПРИЧИНЫ ЭТО УБРАТЬ (17.09.2026).
 * Прогон 35143532306 (main 54d87ef7, осколок 3): «поворот в разборе показался: НИ РАЗУ»,
 * при этом в двух соседних прогонах и локально — зелёная.
 * 1. Задания экран берёт у `Math.random` (`planTaskKinds`, `buildTask`) — каждый прогон
 *    играет другую партию. Проверяемое свойство от партии не зависит (это проп поворота),
 *    а исход пробы зависел. Теперь случайность своя и с семенем: партия одна и та же везде.
 * 2. Падение ничего не говорило о причине — только «ни разу». Теперь проба ведёт журнал
 *    раундов (сколько живых вариантов, чем кончился промах, сколько поворотов в разборе)
 *    и при провале показывает его: следующий красный скажет, ЧТО случилось.
 * Промахов на раунд — до 12, а не 4: замер 17.09 на 10 нажатиях — 2 попадания, и четыре
 * попадания подряд в первом раунде обрывали всю пробу.
 *
 * ⚠️ И ТРЕТЬЕ, НАЙДЕННОЕ МУТАЦИЕЙ ТОГО ЖЕ ДНЯ: проверка «ручного вращения» была слепой.
 * `RotationWorkbench` монтируется только после кнопки «Покрутить самому»
 * (`rotation-manual-start`), а проба её не нажимала. Мутация `reduceMotion={true}` на нём
 * оставалась зелёной. Теперь проба входит в ручное вращение и обязана его увидеть.
 */
function сСеменем(семя: number): () => number {
  let n = семя >>> 0;
  return () => { n = (Math.imul(n, 1664525) + 1013904223) >>> 0; return n / 4294967296; };
}

describe('разбор ошибки вращается даже при включённой настройке «меньше движения»', () => {
  afterEach(() => { jest.restoreAllMocks(); });

  it('🔴 системная настройка не доезжает до поворота фигуры', async () => {
    jest.spyOn(Math, 'random').mockImplementation(сСеменем(20260917));
    const { RotationTransition } = require('@/src/components/RotationShape');
    const RotationWorkbench = require('@/src/components/RotationWorkbench').default;
    const r = await монтировать();
    await начать(r);

    const беды: string[] = [];
    const журнал: string[] = [];
    let виделиПоворот = 0, виделиРучное = 0;
    for (let раунд = 0; раунд < 14; раунд += 1) {
      const живых = варианты(r).filter((n: any) => typeof n.props?.onPress === 'function' && !n.props?.disabled).length;
      if (!(await промахнуться(r, 12))) { журнал.push(`раунд ${раунд + 1}: промаха нет (живых вариантов ${живых})`); break; }
      await осесть(r, 4);          // кадры разбора листаются сами — дать им появиться
      const поворотов = r.root.findAllByType(RotationTransition).length;
      виделиПоворот += поворотов;
      // кадр разбора проверяется ДО ручного вращения: оно заменяет кадр на верстак
      беды.push(...погашенные(r, RotationTransition, 'кадр разбора'));
      const вручную = r.root.findAll((n: any) => n.props?.testID === 'rotation-manual-start' && typeof n.props?.onPress === 'function');
      if (вручную.length > 0) {
        await TestRenderer.act(async () => { вручную[0].props.onPress(); });
        await осесть(r, 2);
        виделиРучное += r.root.findAllByType(RotationWorkbench).length;
      }
      журнал.push(`раунд ${раунд + 1}: промах, поворотов в разборе ${поворотов}, ручное вращение ${вручную.length ? 'открыто' : 'кнопки нет'}`);
      беды.push(...погашенные(r, RotationWorkbench, 'ручное вращение'));
      const выход = r.root.findAll((n: any) => КНОПКА_ВЫХОДА.includes(n.props?.testID));
      if (выход.length === 0) break;
      await TestRenderer.act(async () => { выход[0].props.onPress(); });
      await осесть(r, 2);
      if (виделиПоворот > 0 && виделиРучное > 0 && беды.length === 0) break;
    }

    // Сперва честность самой пробы: не увидели ни одного поворота — проверять было нечего.
    expect(`поворот в разборе показался: ${виделиПоворот > 0 ? 'да' : `НИ РАЗУ; ход пробы: ${журнал.join(' | ') || 'в партию не вошли'}`}`)
      .toBe('поворот в разборе показался: да');
    expect(`ручное вращение открылось: ${виделиРучное > 0 ? 'да' : `НИ РАЗУ; ход пробы: ${журнал.join(' | ')}`}`)
      .toBe('ручное вращение открылось: да');
    expect(беды.slice(0, 3)).toEqual([]);
  });

  /**
   * 🔬 КОНТРОЛЬ С ИЗВЕСТНЫМ ОТВЕТОМ. Условие то же самое, вход — заведомо погашенный
   * узел. Условие обязано его назвать; не назовёт — зелёный цвет выше ничего не значит.
   */
  it('🔬 прибор умеет отказывать: погашенный поворот назван по имени', () => {
    const дерево = { root: { findAllByType: () => [{ props: { reduceMotion: true } }, { props: { reduceMotion: false } }] } };
    expect(погашенные(дерево, null, 'кадр разбора')).toEqual(['кадр разбора: reduceMotion=true']);
  });
});
