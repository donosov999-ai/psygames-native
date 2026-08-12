import AsyncStorage from '@react-native-async-storage/async-storage';

const mockRpc = jest.fn();

jest.mock('@/src/services/supabase', () => ({
  getSupabase: () => ({ rpc: mockRpc }),
}));

import { fetchBest, getPersonalBest, submitScore } from '@/src/services/leaderboard';

describe('leaderboard best result', () => {
  beforeEach(async () => {
    mockRpc.mockReset();
    await AsyncStorage.clear();
  });

  it('fetchBest запрашивает одну строку и возвращает её score', async () => {
    mockRpc.mockResolvedValue({ data: [{ score: 13.637 }], error: null });

    await expect(fetchBest('schulte_table_5x5')).resolves.toBe(13.637);
    expect(mockRpc).toHaveBeenCalledWith('psygames_leaderboard_top', {
      p_game_id: 'schulte_table_5x5',
      p_limit: 1,
    });
  });

  it('сеть, ошибка и пустая таблица дают null для безопасного фолбэка', async () => {
    mockRpc.mockRejectedValueOnce(new Error('offline'));
    await expect(fetchBest('n_back')).resolves.toBeNull();

    mockRpc.mockResolvedValueOnce({ data: [], error: null });
    await expect(fetchBest('n_back')).resolves.toBeNull();
  });

  it('Шульте локально хранит минимальное время даже без сети', async () => {
    mockRpc.mockRejectedValue(new Error('offline'));

    await submitScore('schulte_table_5x5', 20);
    await submitScore('schulte_table_5x5', 25);
    await submitScore('schulte_table_5x5', 15);

    await expect(getPersonalBest('schulte_table_5x5')).resolves.toBe(15);
  });

  it('N-back локально хранит максимальный достигнутый уровень', async () => {
    mockRpc.mockResolvedValue({ data: { ok: true, improved: true }, error: null });

    await submitScore('n_back', 2);
    await submitScore('n_back', 1);
    await submitScore('n_back', 4);

    await expect(getPersonalBest('n_back')).resolves.toBe(4);
  });
});
