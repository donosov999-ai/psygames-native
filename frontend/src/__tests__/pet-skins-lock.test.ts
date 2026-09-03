/* eslint-disable @typescript-eslint/no-require-imports -- экран и его контексты
 * берутся ПОСЛЕ подмен, иначе в дерево попадут настоящие роутер и запись сессий. */
/**
 * НАРЯДЫ ПИТОМЦА — ступень лестницы (b96bfc4b, ур. 8), проверка по НАРИСОВАННОМУ.
 *
 * 🔴 Ключевое здесь не «замок есть», а «базовый скин НЕ заперт»: запри все четыре —
 * и питомец останется без вида, а ступень превратится в поломку.
 */
import React from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

const TestRenderer = require('react-test-renderer');

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: () => {}, replace: () => {}, back: () => {} }),
  useLocalSearchParams: () => ({}),
  router: { canGoBack: () => false, back: () => {}, replace: () => {} },
  // Экран питомца обновляет шкалы на ФОКУСЕ. В пробе фокус наступает один раз —
  // при монтировании, поэтому подмена сводит его к обычному эффекту.
  useFocusEffect: (cb: () => void) => require('react').useEffect(cb, [cb]),
}));

const METRICS = { frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } };

async function монтировать(level: number | null) {
  await AsyncStorage.clear();
  const { ThemeProvider } = require('@/src/contexts/ThemeContext');
  const { LanguageProvider } = require('@/src/contexts/LanguageContext');
  const { ProfileProvider } = require('@/src/contexts/ProfileContext');
  const { PlayerLevelValue } = require('@/src/contexts/PlayerLevelContext');
  const { SafeAreaProvider } = require('react-native-safe-area-context');
  const Screen = require('@/app/pet').default;
  let r: any;
  await TestRenderer.act(async () => {
    r = TestRenderer.create(
      React.createElement(SafeAreaProvider, { initialMetrics: METRICS },
        React.createElement(ProfileProvider, null,
          React.createElement(ThemeProvider, null,
            React.createElement(LanguageProvider, null,
              React.createElement(PlayerLevelValue, { level },
                React.createElement(Screen)))))),
    );
  });
  await TestRenderer.act(async () => { for (let i = 0; i < 30; i += 1) await Promise.resolve(); });
  return r;
}

/**
 * Карточки скинов. Опознаём по СТРУКТУРНОМУ признаку — `accessibilityState.selected`
 * стоит только на них, — а не по словам подписи: поиск по «Auto/Кот» цеплял пятнадцать
 * узлов вместо четырёх (вложенные фиберы и чужие кнопки с теми же словами).
 */
function карточки(r: any): any[] {
  const все = r.root.findAll((n: any) =>
    typeof n.type !== 'string'
    && n.props?.accessibilityRole === 'button'
    && typeof n.props?.accessibilityState?.selected === 'boolean'
    && typeof n.props?.accessibilityLabel === 'string');
  // ⚠️ Одна карточка — четыре узла (Touchable → TouchableOpacity → AnimatedComponent
  // → View) с одинаковыми свойствами. Без свёртки по подписи выходило 16 вместо 4,
  // и проба мерила глубину дерева, а не число нарядов.
  const по = new Map<string, any>();
  for (const n of все) if (!по.has(n.props.accessibilityLabel)) по.set(n.props.accessibilityLabel, n);
  return [...по.values()];
}

describe('наряды питомца под замком', () => {
  it('🔴 новичок: базовый скин ОТКРЫТ, остальные заперты', async () => {
    const r = await монтировать(0);
    const c = карточки(r);
    expect(c.length).toBe(4);              // ни одна карточка не спряталась
    const заперты = c.filter((n) => /Unlocks at level|Откроется на уровне/i.test(n.props.accessibilityLabel));
    expect(заперты.length).toBe(3);        // ровно три наряда, базовый свободен
    const базовый = c.find((n) => /Cat|Кот/i.test(n.props.accessibilityLabel));
    expect(/Unlocks at level|Откроется/i.test(базовый.props.accessibilityLabel)).toBe(false);
    await TestRenderer.act(async () => { r.unmount(); });
  });

  it('🔴 запертый наряд не переключается по нажатию', async () => {
    const r = await монтировать(0);
    const робот = карточки(r).find((n) => /Robot|Робот/i.test(n.props.accessibilityLabel));
    expect(робот.props.accessibilityState.selected).toBe(false);
    await TestRenderer.act(async () => { робот.props.onPress(); });
    const после = карточки(r).find((n) => /Robot|Робот/i.test(n.props.accessibilityLabel));
    expect(после.props.accessibilityState.selected).toBe(false);   // остался невыбранным
    await TestRenderer.act(async () => { r.unmount(); });
  });

  it('на восьмом уровне заперто ничего', async () => {
    const r = await монтировать(8);
    const c = карточки(r);
    expect(c.length).toBe(4);
    expect(c.filter((n) => /Unlocks at level|Откроется/i.test(n.props.accessibilityLabel)).length).toBe(0);
    await TestRenderer.act(async () => { r.unmount(); });
  });

  it('уровень неизвестен — замка нет', async () => {
    const r = await монтировать(null);
    expect(карточки(r).filter((n) => /Unlocks at level|Откроется/i.test(n.props.accessibilityLabel)).length).toBe(0);
    await TestRenderer.act(async () => { r.unmount(); });
  });
});
