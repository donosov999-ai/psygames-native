/* psygames-session-write-race · VER 1 · 22.08.2026 */
/**
 * ПАРТИЯ, КОТОРУЮ ЗАПИСАЛИ, НЕ ПРОПАДАЕТ. И ЗАПИСАННАЯ ДВАЖДЫ НЕ СЧИТАЕТСЯ ДВАЖДЫ.
 *
 * 🔴 ЧТО НАШЛОСЬ. Сохранение партии устроено как «прочитал весь журнал → дописал в
 * конец → записал весь журнал обратно». Два сохранения, начатые одновременно, читают
 * ОДИН И ТОТ ЖЕ журнал, и второе затирает первое. Замер до правки:
 *
 *     двенадцать одновременных сохранений → в журнале осталась ОДНА партия.
 *     Одиннадцать исчезли бесследно.
 *
 * Одновременность здесь не редкость: шаг зарядки досохраняется, пока следующая игра
 * уже пишет свою партию; вызов дня коммитит стрик рядом; экран сохраняет партию и на
 * завершении, и при уходе. И журнал — не просто история: из него ВОССТАНАВЛИВАЕТСЯ
 * УРОВЕНЬ, когда пропал локальный ключ. Потерянная партия — это ещё и потерянный
 * прогресс, тот самый, про который была жалоба «уровень откатился».
 *
 * 🔴 ВТОРАЯ ПОЛОВИНА. Та же партия, сохранённая дважды, давала ДВЕ записи — и два
 * начисления очков за один раунд: `recordRound` зовётся на каждое сохранение.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { saveSession } from '@/src/services/api';

const KEY = 'psygames_sessions';
const read = async (): Promise<any[]> => {
  const raw = await AsyncStorage.getItem(KEY);
  return raw ? JSON.parse(raw) : [];
};
const round = (score: number, id?: string) => ({
  ...(id ? { id } : {}),
  game_type: 'stroop', score, errors: 0, time_seconds: 10, difficulty: 'x', details: {},
} as any);

describe('журнал партий', () => {
  beforeEach(async () => { await AsyncStorage.clear(); });

  it('одна партия записывается — иначе проверять нечего', async () => {
    await saveSession(round(5));
    expect((await read()).length).toBe(1);
  });

  it('🔴 двенадцать одновременных сохранений — все двенадцать в журнале', async () => {
    await Promise.all(Array.from({ length: 12 }, (_, i) => saveSession(round(i))));
    const all = await read();
    expect(`записано ${all.length} из 12`).toBe('записано 12 из 12');
    // и это РАЗНЫЕ партии, а не одна, размноженная очередью
    expect(new Set(all.map((s) => s.score)).size).toBe(12);
    expect(new Set(all.map((s) => s.id)).size).toBe(12);
  });

  it('🔴 повтор той же партии не создаёт второй записи', async () => {
    const one = round(99, 'fixed-id');
    await saveSession(one);
    await saveSession(one);
    await saveSession(one);
    expect((await read()).length).toBe(1);
  });

  /**
   * ⚠️ ВСТРЕЧНАЯ СТОРОНА. Отсеивать повторы можно и жульничеством — считать
   * одинаковыми любые похожие партии. Тогда две ЧЕСТНЫЕ партии с одинаковым счётом
   * схлопнулись бы в одну, и человек потерял бы сыгранное.
   */
  it('🔴 две разные партии с одинаковым счётом остаются двумя', async () => {
    await saveSession(round(7));
    await saveSession(round(7));
    expect((await read()).length).toBe(2);
  });

  it('🔴 очередь не переставляет и не теряет при последовательной записи', async () => {
    for (let i = 0; i < 6; i += 1) await saveSession(round(i));
    expect((await read()).map((s) => s.score)).toEqual([0, 1, 2, 3, 4, 5]);
  });

  /**
   * ⚠️ И ОЧЕРЕДЬ НЕ ЗАСТРЕВАЕТ НА ОШИБКЕ. Если одна запись упала, следующая обязана
   * пройти: иначе первая же неудача тихо выключила бы сохранение до перезапуска.
   */
  it('🔴 неудачная запись не запирает очередь', async () => {
    const setItem = AsyncStorage.setItem as unknown as jest.Mock;
    const real = setItem.getMockImplementation();
    setItem.mockImplementationOnce(() => Promise.reject(new Error('хранилище недоступно')));
    await saveSession(round(1));
    if (real) setItem.mockImplementation(real);
    await saveSession(round(2));
    const all = await read();
    expect(`после сбоя записалось ${all.length > 0}`).toBe('после сбоя записалось true');
  });
});
