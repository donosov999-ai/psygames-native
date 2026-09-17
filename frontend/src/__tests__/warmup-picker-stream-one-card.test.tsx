/* psygames-warmup-picker-stream-one-card · VER 1 · 17.09.2026 */
/**
 * ЭКРАН «ЗАРЯДКА»: ПОТОК — ОДНОЙ КАРТОЧКОЙ С ПЕРЕКЛЮЧАТЕЛЕМ 5/10/15, А НЕ ТРЕМЯ СТРОКАМИ.
 *
 * 📍 Отчёт 5ff162e1, Денис 17.09.2026: «в «Зарядке» переключатель 5/10/15 минут вместо трёх
 * строк». Замер на экспорт-сборке 1101b52b, профиль nzt48: в «Своих сериях» одиннадцать
 * карточек, девять — три длины трёх потоков. На карточке своей серии уже стояли чипы 5/10/15,
 * но мёртвые: ни один не выделен, запуск длину не читал.
 *
 * Монтируется настоящий экран выбора; подменены профиль с файлом состава, зарядка,
 * навигация и хранилище:
 *   · три набора потока `поток-проба-5|10|15` — одна карточка «Проба»;
 *   · «10 мин» на ней — «Начать» запускает набор на десять минут;
 *   · одиночная серия — без чипов длины;
 *   · контроль: у карточки слота «Дневная» чипы длины на месте.
 */
import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { TouchableOpacity } from 'react-native';
import WarmupPicker from '@/app/warmup-picker';

const mockStartPlaylist = jest.fn();
const шаг = (id: string) => ({ game_id: id, game_route: `/games/${id}`, est_duration_sec: 60 });
const mockСостав = {
  профили: { nzt48: { наборы: ['поток-проба-5', 'поток-проба-10', 'поток-проба-15', 'серия-хаб-проба'] } },
  наборы: [
    { id: 'поток-проба-5', название: 'Проба · 5 мин', шаги: ['corsi', 'digit_span'].map(шаг) },
    { id: 'поток-проба-10', название: 'Проба · 10 мин', шаги: ['corsi', 'digit_span', 'n_back', 'memory_matrix'].map(шаг) },
    { id: 'поток-проба-15', название: 'Проба · 15 мин', шаги: ['corsi', 'digit_span', 'n_back', 'memory_matrix', 'word_pairs', 'mnemonics'].map(шаг) },
    { id: 'серия-хаб-проба', название: 'Все игры · Проба', шаги: ['corsi', 'n_back', 'mnemonics'].map(шаг) },
  ],
  порядок: null, хабы: null, замки: null, коллекция: null,
};

jest.mock('@/src/contexts/ProfileContext', () => ({
  useProfile: () => ({
    profile: { id: 'nzt48', allowed_games: 'all', assessment_enabled: false, financial_brain_day_enabled: false },
    составИзФайла: mockСостав,
  }),
}));
jest.mock('@/src/contexts/WarmupContext', () => ({
  useWarmup: () => ({ startPlaylist: mockStartPlaylist, startDay: jest.fn(), startNight: jest.fn(), startEvening: jest.fn(), startWarmup: jest.fn() }),
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

beforeEach(() => { mockStartPlaylist.mockClear(); });

async function экран(): Promise<TestRenderer.ReactTestRenderer> {
  let tr!: TestRenderer.ReactTestRenderer;
  await act(async () => { tr = TestRenderer.create(<WarmupPicker />); });
  return tr;
}
/** Строго по типу: у `TouchableOpacity` те же свойства несут и его внутренние слои. */
const кнопки = (корень: any) => корень.findAllByType(TouchableOpacity);
const карточки = (tr: TestRenderer.ReactTestRenderer, начало: string) =>
  кнопки(tr.root).filter((n: any) => n.props?.accessibilityRole === 'radio'
    && String(n.props.accessibilityLabel ?? '').startsWith(начало));
const нажать = async (узел: any) => { await act(async () => { узел.props.onPress(); }); };
const чипыВ = (узел: any) => кнопки(узел).filter((n: any) => n !== узел && n.props?.accessibilityRole === 'radio'
  && / unitMin$/.test(String(n.props.accessibilityLabel ?? '')));

describe('экран «Зарядка»: поток одной карточкой', () => {
  it('🔴 три набора потока — одна карточка с названием без «· N мин»', async () => {
    const tr = await экран();
    expect(карточки(tr, 'Проба. ').length).toBe(1);
    expect(карточки(tr, 'Проба · ').length).toBe(0);
    await act(async () => { tr.unmount(); });
  });

  it('🔴 «10 мин» на карточке потока — «Начать» запускает набор на десять минут', async () => {
    const tr = await экран();
    await нажать(карточки(tr, 'Проба. ')[0]);
    const карточка = карточки(tr, 'Проба. ')[0];
    const чипы = чипыВ(карточка);
    expect(чипы.map((ч: any) => ч.props.accessibilityLabel)).toEqual(['5 unitMin', '10 unitMin', '15 unitMin']);
    await нажать(чипы[1]);
    const старт = кнопки(tr.root).filter((n: any) => n.props?.accessibilityLabel === 'start')[0];
    await нажать(старт);
    expect(mockStartPlaylist.mock.calls.length).toBe(1);
    const набор = mockStartPlaylist.mock.calls[0][0];
    expect(`${набор.track_label} · шагов ${набор.steps.length}`).toBe('Проба · 10 мин · шагов 4');
    await act(async () => { tr.unmount(); });
  });

  it('одиночная серия — без чипов длины', async () => {
    const tr = await экран();
    await нажать(карточки(tr, 'Все игры · Проба')[0]);
    expect(чипыВ(карточки(tr, 'Все игры · Проба')[0]).length).toBe(0);
    await act(async () => { tr.unmount(); });
  });

  it('контроль: у карточки слота «Дневная» чипы длины на месте', async () => {
    const tr = await экран();
    await нажать(карточки(tr, 'slotDay')[0]);
    expect(чипыВ(карточки(tr, 'slotDay')[0]).length).toBe(3);
    await act(async () => { tr.unmount(); });
  });
});
