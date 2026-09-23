/* psygames-breathing-technique-dropdown · VER 1 · 23.09.2026 */
/**
 * «ДЫХАНИЕ»: ТЕХНИКА ВЫБИРАЕТСЯ ОДНОЙ СТРОКОЙ, А ФИГУРА И ОПИСАНИЕ НЕ ПОТЕРЯНЫ.
 *
 * 📍 ЗАМЕР 23.09.2026 (экспорт main, WebKit 390×844, профиль nzt48), /games/breathing:
 * настройка 1319 px при окне 844 — 1,56 экрана, из них блок «Техника» семью карточками
 * 607 px. На 360×640 — 1431 px, 2,24 экрана. Блок «Формат» ниже края, и человек решил,
 * что параллельного режима в приложении нет (отчёт 8cc27209, 18.09.2026).
 *
 * ⚠️ ПОЧЕМУ НЕ ПРОСТО «СВЕРНУТЬ». Семь техник — это семь ритмов, а не семь слов: карточки
 * делались крупными ради фигуры ритма и строки «зачем это». Свернуть, потеряв их, —
 * поменять простыню на список одинаковых названий. Поэтому проба держит обе вещи:
 * список закрыт по умолчанию И у каждой строки есть описание и своя фигура.
 *
 * Сам выпадающий список сторожит `dropdown-select-one-choice`; здесь — что экран взял
 * ОБЩИЙ список, а не завёл восьмую копию, и что выбор доезжает до запуска.
 */
import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import BreathingGame from '@/app/games/breathing';
import DropdownSelect from '@/src/components/DropdownSelect';
import BreathShape from '@/src/components/breath/BreathShape';

jest.mock('expo-router', () => ({
  useRouter: () => ({ replace: jest.fn(), push: jest.fn(), back: jest.fn() }),
  useLocalSearchParams: () => ({}),
}));
jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: 'SafeAreaView',
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock('@/src/contexts/ThemeContext', () => ({
  useTheme: () => ({ colors: { background: '#fff', surface: '#eee', text: '#000', textSecondary: '#666', border: '#ccc', primary: '#7c6cf0', card: '#eee' }, isDark: false }),
}));
jest.mock('@/src/contexts/LanguageContext', () => ({ useLanguage: () => ({ t: (k: string) => k, language: 'ru' }) }));
jest.mock('@/src/contexts/ProfileContext', () => ({
  useProfile: () => ({ profile: { id: 'nzt48', allowed_games: 'all' } }),
}));
jest.mock('@/src/services/api', () => ({ saveSession: jest.fn(async () => ({})) }));
jest.mock('@expo/vector-icons', () => ({ Ionicons: 'Ionicons' }));
jest.mock('@/src/contexts/WarmupContext', () => ({
  useWarmup: () => ({ session: null, recordResult: jest.fn(), next: jest.fn(), isActive: false }),
  useWarmupSafe: () => null,
}));
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async () => null), setItem: jest.fn(async () => {}), removeItem: jest.fn(async () => {}),
}));

const смонтировать = async () => {
  let tr!: TestRenderer.ReactTestRenderer;
  await act(async () => { tr = TestRenderer.create(<BreathingGame />); });
  return tr;
};

/** Узел общего списка на экране — он должен быть один. */
const списки = (tr: TestRenderer.ReactTestRenderer) => tr.root.findAllByType(DropdownSelect);

describe('«Дыхание»: выбор техники', () => {
  it('🔴 техника — одной строкой на ОБЩЕМ списке, семь карточек не разложены', async () => {
    const tr = await смонтировать();
    const свои = списки(tr);
    // Ровно один общий список — восьмой копии выбора не заведено.
    expect(свои.length).toBe(1);
    const варианты = свои[0].props.варианты as any[];
    // Закрыт: строки списка в дереве нет, видно только текущий выбор.
    expect(tr.root.findAllByProps({ testID: 'tech-select-list' }).length).toBe(0);
    expect(tr.root.findAllByProps({ testID: 'tech-select-value' }).length).toBeGreaterThan(0);
    expect(`техник ${варианты.length} · первая «${варианты[0].текст}» · ритм «${варианты[0].справа}»`)
      .toBe('техник 7 · первая «brTechBox» · ритм «4-4-4-4»');
    await act(async () => { tr.unmount(); });
  });

  it('🔴 у каждой техники остались описание и своя фигура ритма', async () => {
    const tr = await смонтировать();
    const варианты = списки(tr)[0].props.варианты as any[];
    const безОписания = варианты.filter((в) => !в.описание).map((в) => в.значение);
    const безФигуры = варианты.filter((в) => !в.значок || !в.значокЗакрытой).map((в) => в.значение);
    expect(`без описания ${безОписания.length} ${JSON.stringify(безОписания)} · без фигуры ${безФигуры.length} ${JSON.stringify(безФигуры)}`)
      .toBe('без описания 0 [] · без фигуры 0 []');
    // Фигура — тот же компонент, что рисует ритм в самой сессии, а не картинка-двойник.
    expect(варианты[1].значок.type).toBe(BreathShape);
    // …и фигура у «4-7-8» своя, а не общая с «квадратом»: три фазы против четырёх.
    expect(`${варианты[0].значок.props.phases.length} против ${варианты[1].значок.props.phases.length}`).toBe('4 против 3');
    // Два разных узла: один и тот же нельзя показать и в списке, и в закрытой строке.
    expect(варианты[0].значок === варианты[0].значокЗакрытой).toBe(false);
    await act(async () => { tr.unmount(); });
  });

  it('🔴 выбор техники доезжает до запуска: закрытая строка и фигура сессии — выбранные', async () => {
    const tr = await смонтировать();
    const список = списки(tr)[0];
    // Выбрали «4-7-8» — третью по счёту фигуру не трогаем, берём вторую.
    await act(async () => { список.props.onChange('calm478'); });
    expect(списки(tr)[0].props.значение).toBe('calm478');
    // Запуск: фигура сессии строится по фазам ВЫБРАННОЙ техники (4-7-8 = три фазы).
    const начать = tr.root.findAll((n: any) => n.props?.accessibilityRole === 'button'
      && String(n.props?.accessibilityLabel ?? n.props?.testID ?? '') === 'start')[0]
      ?? tr.root.findAllByProps({ testID: 'game-setup-start' })[0];
    if (начать?.props?.onPress) await act(async () => { начать.props.onPress(); });
    const фигуры = tr.root.findAllByType(BreathShape).filter((n: any) => n.props.size > 40);
    expect(`фигура сессии ${фигуры.length ? фигуры[0].props.phases.length + ' фаз' : 'не нарисована'}`)
      .toBe('фигура сессии 3 фаз');
    await act(async () => { tr.unmount(); });
  });
});
