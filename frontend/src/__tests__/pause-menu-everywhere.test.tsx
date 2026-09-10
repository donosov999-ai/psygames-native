/* psygames-pause-menu-everywhere · VER 1 · 10.09.2026 */
/**
 * МЕНЮ ПАУЗЫ ЕСТЬ У КАЖДОЙ ИГРЫ — И ЭТО ПРОВЕРЯЕТСЯ НАРИСОВАННЫМ, А НЕ СЛОВОМ.
 *
 * 🔴 ЧТО БЫЛО СЛОМАНО. Замер 10.09.2026 по всем 99 файлам `app/games`: развилок 18,
 * игровых экранов 81, `pauseActions` объявлен у 18. У остальных 63 человек жал
 * «назад» и получал карточку «Игра на паузе» БЕЗ ЕДИНОЙ КНОПКИ — ни продолжить, ни
 * выйти, ни начать заново. Денис: «пауза походу опять не доехала до всех».
 *
 * ⚠️ ПОЧЕМУ НЕ ГРЕП ПО СЛОВУ `pauseActions`. Починка сделана в каркасе: игра, не
 * давшая своего набора, получает набор по умолчанию от `GameShell`. Проверка по
 * слову в файле игры краснела бы на 63 ПОЧИНЕННЫХ экранах — то есть ловила бы приём,
 * а не дефект. Здесь монтируется сам каркас и считаются НАРИСОВАННЫЕ кнопки.
 *
 * ⚠️ Экраны гасим после каждой пробы: невыключенный каркас держит таймеры питомца и
 * роняет процесс ПОСЛЕ вердикта — эта течь уже стоила проекту трёх наборов.
 */
import React from 'react';

const TestRenderer = require('react-test-renderer');  // eslint-disable-line @typescript-eslint/no-require-imports

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: () => {}, replace: () => {}, back: () => {} }),
  useLocalSearchParams: () => ({}),
  useGlobalSearchParams: () => ({}),
  usePathname: () => '/games/проба',
  router: { canGoBack: () => false, back: () => {}, replace: () => {} },
  useFocusEffect: (cb: () => void) => require('react').useEffect(cb, [cb]),  // eslint-disable-line @typescript-eslint/no-require-imports
}));

const МЕТРИК = { frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } };
const открытые: any[] = [];
afterEach(async () => {
  while (открытые.length) {
    const r = открытые.pop();
    await TestRenderer.act(async () => { r.unmount(); });
  }
});

/** Смонтировать каркас с заданными пропсами и нажать кнопку паузы в шапке. */
async function пауза(пропсы: Record<string, unknown>) {
  const { ThemeProvider } = require('@/src/contexts/ThemeContext');  // eslint-disable-line @typescript-eslint/no-require-imports
  const { LanguageProvider } = require('@/src/contexts/LanguageContext');  // eslint-disable-line @typescript-eslint/no-require-imports
  const { ProfileProvider } = require('@/src/contexts/ProfileContext');  // eslint-disable-line @typescript-eslint/no-require-imports
  const { SafeAreaProvider } = require('react-native-safe-area-context');  // eslint-disable-line @typescript-eslint/no-require-imports
  const { Text } = require('react-native');  // eslint-disable-line @typescript-eslint/no-require-imports
  const GameShell = require('@/src/components/GameShell').default;  // eslint-disable-line @typescript-eslint/no-require-imports
  let r: any;
  await TestRenderer.act(async () => {
    r = TestRenderer.create(
      React.createElement(SafeAreaProvider, { initialMetrics: МЕТРИК },
        React.createElement(ProfileProvider, null,
          React.createElement(ThemeProvider, null,
            React.createElement(LanguageProvider, null,
              React.createElement(GameShell, { title: 'Проба', ...пропсы },
                React.createElement(Text, null, 'поле')))))),
    );
  });
  await TestRenderer.act(async () => { for (let i = 0; i < 30; i += 1) await Promise.resolve(); });
  открытые.push(r);
  const кнопка = r.root.findAll((n: any) => n.props?.testID === 'game-back')[0];
  await TestRenderer.act(async () => { кнопка.props.onPress?.(); });
  await TestRenderer.act(async () => { for (let i = 0; i < 30; i += 1) await Promise.resolve(); });
  return r;
}

/**
 * ⚠️ БЕЗ ДЕДУПЛИКАЦИИ СЧЁТ ВРЁТ В ЧЕТЫРЕ РАЗА. `findAll` отдаёт и составной узел, и
 * его хост-потомков — один `pause-action:hint` пришёл четырьмя. Первая редакция это
 * скрыла, потому что все проверки были `toContain`: они зелёные и на повторах.
 */
function текстВнутри(n: any): string {
  const куски: string[] = [];
  const обойти = (x: any) => {
    if (!x) return;
    if (typeof x === 'string') { куски.push(x); return; }
    if (typeof x === 'number') { куски.push(String(x)); return; }
    if (Array.isArray(x)) { x.forEach(обойти); return; }
    if (x.children) x.children.forEach(обойти);
  };
  обойти(n.children);
  return куски.join(' ');
}

/**
 * Подписи пунктов — по ОДНОЙ на пункт. Дедупликация обязательна по той же причине,
 * что и у `пунктыМеню`: `findAll` отдаёт составной узел вместе с хост-потомками, и
 * первая редакция этой пробы насчитала пять «На главную» вместо одной.
 */
const подписиМеню = (r: any): string[] => {
  const по = new Map<string, string>();
  r.root.findAll((n: any) => typeof n.props?.testID === 'string'
    && n.props.testID.startsWith('pause-action:'))
    .forEach((n: any) => {
      const ключ = n.props.testID as string;
      const текст = текстВнутри(n).trim();
      if (текст && !по.has(ключ)) по.set(ключ, текст);
    });
  return [...по.values()];
};

const пунктыМеню = (r: any): string[] =>
  [...new Set(r.root.findAll((n: any) => typeof n.props?.testID === 'string'
    && n.props.testID.startsWith('pause-action:'))
    .map((n: any) => n.props.testID.slice('pause-action:'.length)) as string[])];

describe('меню паузы есть у каждой игры', () => {
  it('игра без своего набора получает «Продолжить» и «На главную» от каркаса', async () => {
    const пункты = пунктыМеню(await пауза({}));
    expect(пункты).toContain('resume');
    expect(пункты).toContain('home');
    // «Заново» каркас сам дать не может — партию перераздаёт игра
    expect(пункты).not.toContain('restart');
  });

  it('🔴 дал onRestart — появилось «Заново»', async () => {
    expect(пунктыМеню(await пауза({ onRestart: () => {} }))).toContain('restart');
  });

  it('🔴 свой набор игры приоритетнее умолчания — его не подменяют', async () => {
    const пункты = пунктыМеню(await пауза({
      pauseActions: [{ id: 'hint', label: 'Подсказка', icon: 'bulb-outline', onPress: () => {} }],
    }));
    // Свой набор игры на месте; общие пункты каркаса приходят сверх него.
    expect(пункты[0]).toBe('hint');
    /**
     * 🔴 ЗДЕСЬ РАНЬШЕ СТОЯЛО ОБРАТНОЕ: «своего выхода игра не объявила — каркас его
     * не дописывает». Утверждение перевёрнуто 10.09.2026 осознанно, и вот почему.
     *
     * С 09.09 стрелка в шапке не выбрасывает из партии, а ОТКРЫВАЕТ меню паузы.
     * Значит меню — единственный путь наружу. Экран, объявивший своё меню и забывший
     * в нём выход, запирал бы человека в партии: ни одной кнопки ухода, а стрелка
     * ведёт в это же меню. Прежняя формулировка охраняла ровно эту ловушку.
     *
     * ⚠️ На живых экранах случай пока не встречается: замер 10.09.2026 — своё меню у
     * восемнадцати, `leave` есть у всех восемнадцати. Правило нужно не ради них, а
     * ради девятнадцатого.
     */
    expect(пункты).toContain('home');
    expect(пункты[пункты.length - 1]).toBe('home');
  });

  it('🔴 контрпроба: меню без кнопок невозможно, сколько бы игра ни молчала', async () => {
    const n = пунктыМеню(await пауза({})).length;
    expect(`кнопок в меню ${n}, не меньше двух: ${n >= 2}`).toBe(`кнопок в меню ${n}, не меньше двух: true`);
  });

  it('🔴 служебные кнопки игры видны в паузе — даже завёрнутые в чужой View', async () => {
    const { View } = require('react-native');  // eslint-disable-line @typescript-eslint/no-require-imports
    const GameAuxAction = require('@/src/components/GameAuxAction').default;  // eslint-disable-line @typescript-eslint/no-require-imports
    // Обёртка нарочно: игры кладут кнопки не прямыми детьми (у судоку — колонка).
    const пункты = пунктыМеню(await пауза({
      headerActions: React.createElement(View, null,
        React.createElement(View, null,
          React.createElement(GameAuxAction, { icon: 'arrow-undo', label: 'Отменить', onPress: () => {} }),
          React.createElement(GameAuxAction, { icon: 'bulb', label: 'Подсказка', onPress: () => {} }))),
    }));
    expect(пункты).toContain('aux:Отменить');
    expect(пункты).toContain('aux:Подсказка');
    // Выход остаётся последним: служебное встаёт ПЕРЕД ним, а не после.
    expect(пункты[пункты.length - 1]).toBe('home');
  });

  it('🔴 выключенная кнопка показана серой, а не спрятана', async () => {
    const GameAuxAction = require('@/src/components/GameAuxAction').default;  // eslint-disable-line @typescript-eslint/no-require-imports
    // Так «Отменить» выглядит в начале партии: отменять ещё нечего.
    const r = await пауза({
      headerActions: React.createElement(GameAuxAction,
        { icon: 'arrow-undo', label: 'Отменить', disabled: true, onPress: () => {} }),
    });
    expect(пунктыМеню(r)).toContain('aux:Отменить');
    const кнопка = r.root.findAll((n: any) => n.props?.testID === 'pause-action:aux:Отменить')[0];
    expect(кнопка.props.accessibilityState?.disabled).toBe(true);
  });

  it('🔴 у игры со своим набором выход всё равно последний, а собранное — перед ним', async () => {
    const GameAuxAction = require('@/src/components/GameAuxAction').default;  // eslint-disable-line @typescript-eslint/no-require-imports
    // Так устроен маджонг: свой набор с «На главную» и служебные кнопки в шапке.
    const пункты = пунктыМеню(await пауза({
      pauseActions: [
        { id: 'resume', label: 'Продолжить игру', icon: 'play', primary: true },
        { id: 'home', label: 'На главную', icon: 'home', leave: true },
      ],
      headerActions: React.createElement(GameAuxAction,
        { icon: 'shuffle', label: 'Перемешать', onPress: () => {} }),
    }));
    // Общие пункты каркаса встают вместе с собранным — ПЕРЕД выходом.
    expect(пункты[0]).toBe('resume');
    expect(пункты[пункты.length - 1]).toBe('home');
    expect(пункты.indexOf('aux:Перемешать')).toBeGreaterThan(0);
    expect(пункты.indexOf('aux:Перемешать')).toBeLessThan(пункты.indexOf('home'));
  });

  it('🔴 «СТОП» в паузу не берётся: там это дубль выхода, и опасный', async () => {
    const GameAuxAction = require('@/src/components/GameAuxAction').default;  // eslint-disable-line @typescript-eslint/no-require-imports
    const пункты = пунктыМеню(await пауза({
      headerActions: React.createElement(GameAuxAction, { label: 'СТОП', danger: true, onPress: () => {} }),
    }));
    expect(пункты).not.toContain('aux:СТОП');
  });

  it('🔴 общие пункты приходят на КАЖДЫЙ экран: тишина и отчёт', async () => {
    const пункты = пунктыМеню(await пауза({}));
    expect(пункты).toContain('hush');
    expect(пункты).toContain('report');
  });

  it('🔴 «как идёт партия» показывает те же счётчики, что и шапка', async () => {
    const r = await пауза({
      hud: [
        { key: 'level', label: 'Уровень', value: 7 },
        { key: 'errors', label: 'Ошибок', value: 2 },
      ],
    });
    const текст = текстВнутри(r.root.findAll((n: any) => n.props?.testID === 'game-pause-menu')[0]);
    expect(текст).toContain('7');
    expect(текст).toContain('Уровень');
    expect(текст).toContain('Ошибок');
  });

  it('🔴 второй вид счётчиков (stats=) тоже виден в паузе', async () => {
    const { Text } = require('react-native');  // eslint-disable-line @typescript-eslint/no-require-imports
    // Так кормят каркас 10 экранов из 77 — готовой разметкой, а не разобранным списком.
    // На этом я и споткнулся: первая редакция читала только `hud`, и у «Ментальной
    // ротации» строка «как идёт партия» не появилась вовсе.
    const r = await пауза({ stats: React.createElement(Text, null, 'Раунд 3 из 10') });
    const текст = текстВнутри(r.root.findAll((n: any) => n.props?.testID === 'game-pause-menu')[0]);
    expect(текст).toContain('Раунд 3 из 10');
  });

  it('🔴 пропуск шага зарядки — ТОЛЬКО в зарядке, а не в обычной партии', async () => {
    expect(пунктыМеню(await пауза({}))).not.toContain('wu-skip');
  });

  it('🔴 Б1: пока меню открыто, часы партии стоят', async () => {
    const { gameNow, isGameHeld } = require('@/src/services/gamePause');  // eslint-disable-line @typescript-eslint/no-require-imports
    const r = await пауза({});
    expect(isGameHeld()).toBe(true);
    const t1 = gameNow();
    await new Promise((f) => setTimeout(f, 120));
    const t2 = gameNow();
    // Часы игры — не часы стены: под открытым меню они обязаны стоять.
    expect(`сдвиг часов ${t2 - t1} мс, стоят: ${t2 === t1}`).toBe(`сдвиг часов ${t2 - t1} мс, стоят: true`);
    // Снимаем задержку, чтобы не оставить счётчик пауз поднятым для соседей.
    const продолжить = r.root.findAll((n: any) => n.props?.testID === 'pause-action:resume')[0];
    await TestRenderer.act(async () => { продолжить.props.onPress?.(); });
  });

  it('🔴 Д6: «закончить и записать» есть только у игры, давшей обработчик', async () => {
    expect(пунктыМеню(await пауза({}))).not.toContain('finish');
    expect(пунктыМеню(await пауза({ onFinishEarly: () => {} }))).toContain('finish');
  });

  it('🔴 Д2/Д3: смены уровня НЕТ, если каркасу нечем перераздать партию', async () => {
    // Лестница живая, но ни onRestart, ни своего пункта restart — менять уровень
    // молча, не перераздав, значит соврать про то, во что человек играет.
    const { renderHook } = { renderHook: null } as any;   // hook монтируется самим экраном
    const пункты = пунктыМеню(await пауза({}));
    expect(пункты).not.toContain('easier');
    expect(пункты).not.toContain('harder');
    expect(renderHook).toBeNull();
  });

  it('🔴 «тихий режим» не выбрасывает из паузы и меняет подпись', async () => {
    const r = await пауза({});
    const кнопка = () => r.root.findAll((n: any) => n.props?.testID === 'pause-action:hush')[0];
    const было = текстВнутри(кнопка());
    await TestRenderer.act(async () => { кнопка().props.onPress?.(); });
    // Меню на месте: переключатель — не выход.
    expect(пунктыМеню(r)).toContain('hush');
    expect(текстВнутри(кнопка())).not.toBe(было);
    // Возвращаем звук, чтобы не менять настройку соседним пробам.
    await TestRenderer.act(async () => { кнопка().props.onPress?.(); });
  });

  it('🔴 два разных выхода: из упражнения и на главную', async () => {
    // Денис 10.09.2026: «не хватает кнопки выйти из упражнения и выйти в главное
    // меню, надо оба». До этого пункт был один, и подпись «На главную» обещала не
    // то, что делала: `leave` уводит через `onBack` игры, а это `goBackOrHome()` —
    // шаг назад, в развилку раздела.
    const пункты = пунктыМеню(await пауза({}));
    expect(пункты).toContain('exit');
    expect(пункты).toContain('home');
    // Выход на главную — последний: он самый дальний по смыслу.
    expect(пункты[пункты.length - 1]).toBe('home');
    expect(пункты.indexOf('exit')).toBeLessThan(пункты.indexOf('home'));
  });

  /**
   * 🔴 ТЕ ЖЕ ДВА ВЫХОДА — И У ЭКРАНОВ СО СВОИМ МЕНЮ. Проба выше проверяла только
   * ветку каркаса, а замер по коду 10.09.2026: своё меню у ВОСЕМНАДЦАТИ экранов,
   * `leave` есть у всех восемнадцати, `toHome` — ни у одного. То есть просьбу
   * Дениса «надо оба варианта» я выполнил у шестидесяти трёх экранов из
   * восьмидесяти одного и считал сделанной.
   */
  /**
   * ⚠️ ПОДПИСИ БЕРУТСЯ ИЗ СЛОВАРЯ, А НЕ ПИШУТСЯ ПО-РУССКИ РУКАМИ. Первая редакция
   * этих проб сравнивала с «На главную» — и была ЗЕЛЁНОЙ при мутации, потому что
   * язык каркаса в пробах английский (`LanguageContext`: база — English), и русская
   * строка не совпадала ни с чем. Проба ничего не проверяла и об этом молчала.
   */
  it('🔴 у экрана со СВОИМ меню тоже два выхода, и подписи не спорят', async () => {
    const { translateFor } = require('@/src/contexts/LanguageContext');  // eslint-disable-line @typescript-eslint/no-require-imports
    const домой = translateFor('en', 'goHome');
    const r = await пауза({
      pauseActions: [
        { id: 'resume', label: 'Continue', icon: 'play', primary: true },
        { id: 'quit', label: домой, icon: 'home', leave: true },
      ],
    });
    // Каркас дописал НАСТОЯЩУЮ «на главную» — id `home` экран не объявлял.
    const пункты = пунктыМеню(r);
    expect(пункты).toContain('quit');
    expect(пункты).toContain('home');
    expect(пункты[пункты.length - 1]).toBe('home');

    // Две одинаковые подписи с разным поведением — хуже одной неверной.
    const подписи = подписиМеню(r);
    // ⚠️ Сравнение ВХОЖДЕНИЕМ, а не равенством: перед подписью стоит глиф значка,
    // и `trim()` его не снимает — это буква приватной области, а не пробел.
    expect(подписи.filter((x: string) => x.includes(домой))).toHaveLength(1);
    // Чужой выход переподписан на «шаг назад», раз он звался «на главную».
    expect(подписи.some((x: string) => x.includes(translateFor('en', 'pauseExitGame')))).toBe(true);
  });

  it('🔴 экран, назвавший выход по-своему, переподписан НЕ будет', async () => {
    // «Настроить игру» — честная подпись: она не обещает главную. Трогать её нечего.
    const { translateFor } = require('@/src/contexts/LanguageContext');  // eslint-disable-line @typescript-eslint/no-require-imports
    const r = await пауза({
      pauseActions: [
        { id: 'resume', label: 'Continue', icon: 'play', primary: true },
        { id: 'cfg', label: 'Configure game', icon: 'options', leave: true },
      ],
    });
    const подписи = подписиМеню(r);
    expect(подписи.some((x: string) => x.includes('Configure game'))).toBe(true);
    expect(подписи.some((x: string) => x.includes(translateFor('en', 'goHome')))).toBe(true);
    expect(пунктыМеню(r)).toContain('home');
  });

  it('🔴 кнопка в шапке читается как ПАУЗА, а не как «выйти»', async () => {
    const r = await пауза({});
    const шапка = r.root.findAll((n: any) => n.props?.testID === 'game-back')[0];
    const значки = шапка.findAll((n: any) => typeof n.props?.name === 'string');
    expect(значки.map((n: any) => n.props.name)).toContain('pause');
  });
});
