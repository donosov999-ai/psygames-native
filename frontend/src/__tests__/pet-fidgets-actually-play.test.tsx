/* eslint-disable @typescript-eslint/no-require-imports -- компонент и контексты
 * берутся ПОСЛЕ подмен, иначе в дерево попадут настоящие роутер и хранилище. */
/**
 * 🔴 ДОРИСОВАННЫЕ СОСТОЯНИЯ ОБЯЗАНЫ ИГРАТЬ, А НЕ ЛЕЖАТЬ В СБОРКЕ.
 *
 * 05.09.2026 коту дорисовали двадцать пять состояний сверх пяти базовых. Самый
 * дешёвый способ «сделать» такую задачу — положить кадры в assets, вписать имена
 * в `PetState` и на этом остановиться. Снаружи это выглядит выполненным: файлы
 * на месте, типы есть, сборка зелёная, вес приложения вырос на пару мегабайт. А
 * питомец на экране по-прежнему только ходит и спит, потому что НИКТО ЭТИ
 * СОСТОЯНИЯ НЕ ВЫЗЫВАЕТ.
 *
 * ⚠️ ПОЧЕМУ ЗДЕСЬ РЕНДЕР, А НЕ ПОИСК СЛОВА В ИСХОДНИКЕ. Проба вида
 * `SRC.includes('PET_FIDGETS')` зеленеет от упоминания в комментарии и от
 * мёртвой переменной, которую никто не читает. Такая проба — призрак: она
 * охраняет текст, а не поведение. Поэтому питомец монтируется по-настоящему,
 * время прокручивается, и записывается, ЧТО он показывал.
 */
import React from 'react';

const TestRenderer = require('react-test-renderer');

/** Что PetSprite просили нарисовать за время прогона. */
const показано: string[] = [];

jest.mock('expo-router', () => ({
  usePathname: () => '/',
  router: { push: () => {}, canGoBack: () => false, back: () => {}, replace: () => {} },
}));

jest.mock('@/src/components/pet/PetSprite', () => {
  const настоящий = jest.requireActual('@/src/components/pet/PetSprite');
  return {
    __esModule: true,
    ...настоящий,
    default: ({ state }: { state: string }) => {
      показано.push(state);
      return null;
    },
  };
});

const МЕТРИК = { frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } };

async function прогнать(секунд: number) {
  показано.length = 0;
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
  // Прокручиваем время кусками: анимация переходов сама двигает таймеры.
  for (let i = 0; i < секунд; i++) {
    await TestRenderer.act(async () => { jest.advanceTimersByTime(1000); });
  }
  await TestRenderer.act(async () => { r.unmount(); });
  return показано.slice();
}

/**
 * 🔴 СЛУЧАЙНОСТЬ ЗАМЕНЕНА ПОВТОРИМОЙ — иначе проба мигает.
 *
 * Питомец выбирает и паузу, и мелочь через `Math.random`. С настоящим генератором
 * проба то ловит мелочь, то нет, и красный цвет перестаёт что-либо значить.
 * Здесь стоит простой повторимый генератор: поведение остаётся тем же (числа
 * равномерны в 0..1), но прогон воспроизводится дословно.
 */
function повторимыйСлучай() {
  let x = 123456789;
  return () => {
    x = (x * 1103515245 + 12345) % 2147483648;
    return x / 2147483648;
  };
}

describe('дорисованные состояния действительно играют', () => {
  let настоящийRandom: () => number;
  beforeEach(() => {
    jest.useFakeTimers();
    настоящийRandom = Math.random;
    Math.random = повторимыйСлучай();
  });
  afterEach(() => { jest.useRealTimers(); Math.random = настоящийRandom; });

  it('есть что проверять: списки не пустые и состоят из настоящих состояний', () => {
    const { PET_FIDGETS, PET_SLEEP_POSES, petFrame } = require('@/src/components/pet/PetSprite');
    expect(PET_FIDGETS.length).toBeGreaterThanOrEqual(8);
    expect(PET_SLEEP_POSES.length).toBeGreaterThanOrEqual(5);
    for (const st of [...PET_FIDGETS, ...PET_SLEEP_POSES]) {
      expect(petFrame('cat', st, 0)).toBeTruthy();
    }
  });

  /**
   * ⚠️ МЕЛОЧИ И ПОЗЫ СНА ПРОВЕРЯЮТСЯ ПОРОЗНЬ, И ЭТО НЕ ПРИДИРКА.
   *
   * Сначала здесь стояла одна проверка «показал хоть что-то из мелочей ИЛИ поз
   * сна». Мутация — выключить ветку мелочей целиком — её НЕ уронила: ветка сна
   * осталась цела, случайные позы сна выпадали, и проба зеленела при выключенной
   * половине задачи. Одна проверка на два независимых механизма всегда сторожит
   * только тот, который сработал первым.
   */
  it('🔴 за две минуты питомец делает МЕЛОЧИ безделья, а не только ходит', async () => {
    const { PET_FIDGETS } = require('@/src/components/pet/PetSprite');
    const было = await прогнать(120);
    expect(было.length).toBeGreaterThan(0);
    const мелочи = было.filter((s) => PET_FIDGETS.includes(s));
    expect(мелочи.length).toBeGreaterThan(0);
  });

  it('🔴 затяжной отдых даёт ПОЗУ СНА, и не всегда одну и ту же', async () => {
    const { PET_SLEEP_POSES } = require('@/src/components/pet/PetSprite');
    const было = await прогнать(240);
    const позы = было.filter((s) => PET_SLEEP_POSES.includes(s));
    expect(позы.length).toBeGreaterThan(0);
    // Клубок во всех случаях = вернулась старая жёсткая поза.
    expect(new Set(позы).size).toBeGreaterThan(1);
  });

  it('🔴 после мелочи питомец возвращается в покой, а не залипает в ней', async () => {
    const { PET_FIDGETS } = require('@/src/components/pet/PetSprite');
    const было = await прогнать(120);
    const последняяМелочь = было.map((s, i) => [s, i] as const)
      .filter(([s]) => PET_FIDGETS.includes(s)).pop();
    // ⚠️ Без этой строки проба тихо проходила бы при полностью выключенных
    // мелочах: «не выпало — проверять нечего» и есть зелёный вслепую.
    expect(последняяМелочь).toBeDefined();
    const [, i] = последняяМелочь!;
    // Дальше по записи обязан встретиться покой или ходьба: мелочь конечна.
    expect(было.slice(i + 1).some((s) => s === 'idle' || s === 'walk')).toBe(true);
  });
});
