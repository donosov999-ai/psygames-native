/* psygames-warmup-picker-step-list-mode-names · VER 1 · 17.09.2026 */
/**
 * ЭКРАН «ЗАРЯДКА»: В СОСТАВЕ НАБОРА ГОЛОВОЛОМКА НАЗВАНА СВОИМ РЕЖИМОМ, А НЕ «ЧЁТ-НЕЧЕТ».
 *
 * 📍 17.09.2026, живой проход «Не спится» (экспорт, nzt48): на карточке «Ночная» состав
 * «1. Чёт-нечет · ~2 мин» — это «Сеть» (`puzzles`, `mode: "Net"`). У 42 головоломок одна
 * карточка каталога (`puzzles` → `puzzlesUnruly`), экран искал имя по `game_id`.
 * Правило имени шага — `services/stepName.ts`.
 *
 * Монтируется настоящий экран выбора; своя серия из «Сети» и «Пар слов» выбрана касанием —
 * в списке состава «puzzlesNet», общей карточки нет.
 */
import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { TouchableOpacity } from 'react-native';
import WarmupPicker from '@/app/warmup-picker';

const mockСостав = {
  профили: { nzt48: { наборы: ['серия-проба'] } },
  наборы: [{
    id: 'серия-проба', название: 'Проба',
    шаги: [
      { game_id: 'puzzles', game_route: '/games/puzzles', mode: 'Net', est_duration_sec: 120 },
      { game_id: 'word_pairs', game_route: '/games/word-pairs', mode: '4 pairs', est_duration_sec: 60 },
    ],
  }],
  порядок: null, хабы: null, замки: null, коллекция: null,
};

jest.mock('@/src/contexts/ProfileContext', () => ({
  useProfile: () => ({
    profile: { id: 'nzt48', allowed_games: 'all', assessment_enabled: false, financial_brain_day_enabled: false },
    составИзФайла: mockСостав,
  }),
}));
jest.mock('@/src/contexts/WarmupContext', () => ({
  useWarmup: () => ({ startPlaylist: jest.fn(), startDay: jest.fn(), startNight: jest.fn(), startEvening: jest.fn(), startWarmup: jest.fn() }),
}));
jest.mock('expo-router', () => ({ useRouter: () => ({ replace: jest.fn(), push: jest.fn(), back: jest.fn() }) }));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock('@/src/contexts/ThemeContext', () => ({
  useTheme: () => ({ colors: { background: '#fff', surface: '#eee', text: '#000', textSecondary: '#666', border: '#ccc', primary: '#7c6cf0', card: '#eee' } }),
}));
jest.mock('@/src/contexts/LanguageContext', () => ({ useLanguage: () => ({ t: (k: string) => k, language: 'ru' }), translateFor: (_l: string, k: string) => k }));
jest.mock('@expo/vector-icons', () => ({ Ionicons: 'Ionicons' }));
jest.mock('@/src/services/assessment', () => ({ getAssessmentStatus: async () => null, ASSESSMENT_PLAYLIST: [] }));
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async () => null), setItem: jest.fn(async () => {}), removeItem: jest.fn(async () => {}),
}));

describe('экран «Зарядка»: состав набора', () => {
  it('🔴 «Сеть» в составе названа своим режимом, а не общей карточкой головоломок', async () => {
    let tr!: TestRenderer.ReactTestRenderer;
    await act(async () => { tr = TestRenderer.create(<WarmupPicker />); });
    const карточка = tr.root.findAllByType(TouchableOpacity)
      .filter((n: any) => n.props?.accessibilityRole === 'radio' && String(n.props.accessibilityLabel ?? '').startsWith('Проба'))[0];
    expect(карточка).toBeTruthy();
    await act(async () => { карточка.props.onPress(); });
    const строки = tr.root.findAll((n: any) => Array.isArray(n.props?.children) && n.props.children[1] === '. ')
      .map((n: any) => n.props.children.filter((c: any) => typeof c === 'string' || typeof c === 'number').join(''));
    const состав = [...new Set(строки)].filter((с) => /^\d+\. /.test(с));
    expect(`строк ${состав.length} · первая «${состав[0]?.split(' · ')[0]}» · общая карточка ${состав.some((с) => с.includes('puzzlesUnruly')) ? 1 : 0}`)
      .toBe('строк 2 · первая «1. puzzlesNet» · общая карточка 0');
    await act(async () => { tr.unmount(); });
  });
});
