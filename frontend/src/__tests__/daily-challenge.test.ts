/**
 * Вызов дня: детерминизм ротации (все игроки видят одну игру в день) и
 * pending→commit механика стрика (v1.107.0: день засчитывается за ЗАВЕРШЕНИЕ
 * раунда игры вызова, не за тап по карточке).
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  getTodayChallenge, setPendingChallenge, commitChallengeIfPending, loadChallengeStreak,
} from '@/src/services/daily-challenge';

describe('getTodayChallenge', () => {
  it('детерминирован по дате: два вызова с одной датой → одна игра и сложность', () => {
    const d = new Date(2026, 6, 4);
    const a = getTodayChallenge(d);
    const b = getTodayChallenge(d);
    expect(a.game.id).toBe(b.game.id);
    expect(a.difficulty).toBe(b.difficulty);
    expect(['easy', 'medium', 'hard']).toContain(a.difficulty);
  });

  it('не выдаёт хабы-группы и восстановление (они не сохраняют сессий)', () => {
    for (let i = 0; i < 120; i++) {
      const c = getTodayChallenge(new Date(2026, 0, 1 + i));
      expect(['span_group', 'attention_conflict']).not.toContain(c.game.id);
      expect(c.game.category).not.toBe('recovery');
    }
  });
});

describe('pending → commit стрика', () => {
  const PID = 'test_profile';
  beforeEach(async () => AsyncStorage.clear());

  it('без pending завершение раунда ничего не коммитит', async () => {
    const res = await commitChallengeIfPending(PID, 'schulte_table');
    expect(res).toBeNull();
    expect((await loadChallengeStreak(PID)).total).toBe(0);
  });

  it('завершение ДРУГОЙ игры не коммитит день', async () => {
    await setPendingChallenge(PID, 'mnemonics');
    const res = await commitChallengeIfPending(PID, 'schulte_table');
    expect(res).toBeNull();
    expect((await loadChallengeStreak(PID)).total).toBe(0);
  });

  it('завершение игры вызова коммитит день ровно один раз (идемпотентно)', async () => {
    await setPendingChallenge(PID, 'mnemonics');
    const first = await commitChallengeIfPending(PID, 'mnemonics');
    expect(first).not.toBeNull();
    expect(first!.streak).toBe(1);
    expect(first!.total).toBe(1);
    // pending удалён — повторное завершение не даёт второй день
    const second = await commitChallengeIfPending(PID, 'mnemonics');
    expect(second).toBeNull();
    expect((await loadChallengeStreak(PID)).total).toBe(1);
  });

  it('вчерашний pending протух — сегодня не коммитится', async () => {
    const yest = new Date(); yest.setDate(yest.getDate() - 1);
    const stale = { date: `${yest.getFullYear()}-${yest.getMonth() + 1}-${yest.getDate()}`, gameId: 'mnemonics' };
    await AsyncStorage.setItem(`psygames_daily_challenge_pending_${PID}`, JSON.stringify(stale));
    const res = await commitChallengeIfPending(PID, 'mnemonics');
    expect(res).toBeNull();
  });
});
