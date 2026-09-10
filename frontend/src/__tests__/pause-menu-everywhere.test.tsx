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
    expect(пункты).toEqual(['hint']);
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

  it('🔴 «СТОП» в паузу не берётся: там это дубль выхода, и опасный', async () => {
    const GameAuxAction = require('@/src/components/GameAuxAction').default;  // eslint-disable-line @typescript-eslint/no-require-imports
    const пункты = пунктыМеню(await пауза({
      headerActions: React.createElement(GameAuxAction, { label: 'СТОП', danger: true, onPress: () => {} }),
    }));
    expect(пункты).not.toContain('aux:СТОП');
  });

  it('🔴 кнопка в шапке читается как ПАУЗА, а не как «выйти»', async () => {
    const r = await пауза({});
    const шапка = r.root.findAll((n: any) => n.props?.testID === 'game-back')[0];
    const значки = шапка.findAll((n: any) => typeof n.props?.name === 'string');
    expect(значки.map((n: any) => n.props.name)).toContain('pause');
  });
});
