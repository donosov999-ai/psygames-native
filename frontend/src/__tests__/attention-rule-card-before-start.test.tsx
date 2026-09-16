/* psygames-attention-rule-card-before-start · VER 1 · 16.09.2026 */
/**
 * КАРТОЧКА ПРАВИЛА УРОВНЯ — НА НАСТРОЙКЕ, ДО СТАРТА. НЕ ПОВЕРХ ИДУЩЕЙ ПАРТИИ.
 *
 * 📍 ЗАМЕР (16.09.2026, живая сборка). У Струпа, CPT, «Переключения» и PRL карточка
 * открывалась в фазе `playing`. Пробы там идут по таймерам и за открытой карточкой не
 * останавливаются: Струп L5, карточка открыта — счётчик 1/20 → 2/20 за 3,2 с, а «не успел
 * ответить» считается ошибкой. Человек терял пробы за то, что читал правило. Хуже того,
 * в тот же день заведена длинная карточка «Правило может смениться» (L5), читать её дольше.
 * ⚠️ Меню паузы, замер там же, пробы тоже не держит (2/20 → 4/20 за 5 с) — это общий слой,
 * отдано координатору; здесь стережётся только карточка правила.
 *
 * Приём — как у Корси и игр памяти (f1eb95b3): показ в `config`, модалка в дереве
 * настройки; в партии правило открывается значком ⓘ по запросу человека.
 *
 * Проба ПОВЕДЕНЧЕСКАЯ: экран монтируется целиком, уровень выставляется тем же ключом,
 * которым его хранит приложение, и проверяется ТЕКСТ ПРАВИЛА — его рисует только модалка
 * (заголовок печатает ещё и значок ⚡ⓘ, по нему «карточка» нашлась бы и там, где её нет).
 */
import React from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: () => {}, replace: () => {}, back: () => {} }),
  useLocalSearchParams: () => ({}),
  usePathname: () => '/games/attention',
  useFocusEffect: () => {},
  useNavigation: () => ({ addListener: () => () => {}, setOptions: () => {} }),
  router: { canGoBack: () => false, back: () => {}, replace: () => {}, push: () => {} },
}));
jest.mock('@/src/services/api', () => ({
  ...jest.requireActual('@/src/services/api'),
  saveSession: async (s: any) => s,
}));

// eslint-disable-next-line @typescript-eslint/no-require-imports -- загрузка ПОСЛЕ jest.mock
const TestRenderer = require('react-test-renderer');

type Случай = { экран: string; ключУровня: string; уровень: number; словарь: string };
const СЛУЧАИ: Случай[] = [
  { экран: 'stroop', ключУровня: 'stroop', уровень: 5, словарь: 'lr_stroop_switch_rule' },
  { экран: 'cpt', ключУровня: 'cpt', уровень: 3, словарь: 'lr_cpt_lookalike_rule' },
  { экран: 'switching-task', ключУровня: 'switching_task', уровень: 4, словарь: 'lr_switching_task_noise_rule' },
  { экран: 'prl', ключУровня: 'prl', уровень: 1, словарь: 'lr_prl_reversal_rule' },
];

const поднятые: any[] = [];
afterEach(() => {
  while (поднятые.length) { const r = поднятые.pop(); try { TestRenderer.act(() => { r.unmount(); }); } catch { /* погашено */ } }
});
const осесть = async () => { await TestRenderer.act(async () => { for (let i = 0; i < 40; i += 1) await Promise.resolve(); }); };

function текстыДерева(r: any): string {
  const out: string[] = [];
  r.root.findAll((n: any) => typeof n.type === 'string', { deep: true }).forEach((n: any) => {
    const c = n.props && n.props.children;
    if (typeof c === 'string') out.push(c);
    else if (Array.isArray(c)) c.forEach((x: any) => { if (typeof x === 'string') out.push(x); });
  });
  return out.join(' ');
}

async function смонтировать(с: Случай) {
  await AsyncStorage.clear();
  /* eslint-disable @typescript-eslint/no-require-imports -- провайдеры после моков */
  const { ThemeProvider } = require('@/src/contexts/ThemeContext');
  const { LanguageProvider, translateFor } = require('@/src/contexts/LanguageContext');
  const { ProfileProvider } = require('@/src/contexts/ProfileContext');
  const { SafeAreaProvider } = require('react-native-safe-area-context');
  const Screen = require(`@/app/games/${с.экран}`).default;
  /* eslint-enable @typescript-eslint/no-require-imports */
  // Профиль стенда по умолчанию — `free`; уровень кладётся ключом usePersistentLevel.
  await AsyncStorage.setItem('psygames_active_profile', 'free');
  await AsyncStorage.setItem(`psygames_${с.ключУровня}_level_free`, String(с.уровень));
  let r: any;
  await TestRenderer.act(async () => {
    r = TestRenderer.create(React.createElement(SafeAreaProvider, {
      initialMetrics: { frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } },
    }, React.createElement(ProfileProvider, null, React.createElement(ThemeProvider, null,
      React.createElement(LanguageProvider, null, React.createElement(Screen))))));
  });
  await осесть();
  поднятые.push(r);
  const язык = 'en';   // язык теста — английский по умолчанию провайдера
  const правило: string = translateFor(язык, с.словарь);
  return { r, отрывок: правило.slice(0, 30) };
}

describe('раздел «Внимание»: карточка правила открывается до старта, а не поверх партии', () => {
  it('есть что мерить: у каждого экрана правило на выбранном уровне существует', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { translateFor } = require('@/src/contexts/LanguageContext');
    for (const с of СЛУЧАИ) expect(String(translateFor('en', с.словарь)).length).toBeGreaterThan(20);
  });

  for (const с of СЛУЧАИ) {
    it(`🔴 ${с.экран} L${с.уровень}: текст правила виден на настройке, до «Начать»`, async () => {
      const { r, отрывок } = await смонтировать(с);
      expect(текстыДерева(r)).toContain(отрывок);
    });

    it(`🔴 ${с.экран} L${с.уровень}: после «Начать» правило само не открывается`, async () => {
      const { r, отрывок } = await смонтировать(с);
      // закрываем карточку на настройке и стартуем
      const кнопки = () => r.root.findAll((n: any) => n.props && typeof n.props.onPress === 'function'
        && typeof n.props.accessibilityLabel === 'string', { deep: true });
      /* Кнопку карточки ищем по ТЕКСТУ внутри нажимаемого узла: подписи для диктора у
         неё нет, и поиск по accessibilityLabel молча её не находил — карточка оставалась
         открытой, и проба краснела не на экране, а на своём приборе. */
      const закрыть = r.root.findAll((n: any) => n.props && typeof n.props.onPress === 'function', { deep: true })
        .find((b: any) => b.findAll((x: any) => typeof x.props?.children === 'string' && /^got it$/i.test(x.props.children.trim()), { deep: true }).length > 0);
      expect(закрыть).toBeTruthy();
      await TestRenderer.act(async () => { закрыть.props.onPress(); });
      await осесть();
      expect(текстыДерева(r)).not.toContain(отрывок);
      const старт = кнопки().find((b: any) => String(b.props.accessibilityLabel) === 'Start');
      expect(старт).toBeTruthy();
      await TestRenderer.act(async () => { старт.props.onPress(); });
      await осесть();
      expect(текстыДерева(r)).not.toContain(отрывок);
    });
  }
});
