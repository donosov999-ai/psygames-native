/**
 * Слой незаконченной партии: сохранение доски, стек отмены, модель провала.
 *
 * Регресс здесь означает ровно тот баг, ради которого слой и написан: человек играет
 * двадцать минут, сворачивает приложение и теряет всё. На длинных режимах (самурай,
 * фрактал — партия на час) это цена часа работы.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { saveResume, loadResume, clearResume, listResumable, resolveResumableGame, RESUME_MAX_AGE_MS } from '@/src/services/resume';
import { createMoveStack } from '@/src/services/moveStack';
import { failurePolicy, formatErrorCount, isOver, livesLeft, STANDARD_LIVES } from '@/src/services/failure';

const GAME = 'sudoku';
const PID = 'default';
const V = 1;

interface Board { grid: number[][]; errors: number }
const board: Board = { grid: [[1, 2], [3, 4]], errors: 1 };

describe('resume — незаконченная партия', () => {
  beforeEach(async () => { await AsyncStorage.clear(); });

  it('доска переживает уход с экрана: сохранили → прочитали то же самое', async () => {
    await saveResume(GAME, PID, V, board);
    expect(await loadResume<Board>(GAME, PID, V)).toEqual(board);
  });

  it('партии нет → null, экран просто начинает заново', async () => {
    expect(await loadResume<Board>(GAME, PID, V)).toBeNull();
  });

  it('чужая версия формата не отдаётся — иначе экран упадёт на старых полях', async () => {
    await saveResume(GAME, PID, 1, board);
    expect(await loadResume<Board>(GAME, PID, 2)).toBeNull();
    // и подчищается, чтобы не лежала мёртвым грузом
    expect(await loadResume<Board>(GAME, PID, 1)).toBeNull();
  });

  it('партия старше срока не предлагается', async () => {
    const stale = { v: V, savedAt: Date.now() - RESUME_MAX_AGE_MS - 1000, state: board };
    await AsyncStorage.setItem(`psygames_resume_${GAME}_${PID}`, JSON.stringify(stale));
    expect(await loadResume<Board>(GAME, PID, V)).toBeNull();
  });

  it('битый JSON не роняет игру', async () => {
    await AsyncStorage.setItem(`psygames_resume_${GAME}_${PID}`, '{не json');
    expect(await loadResume<Board>(GAME, PID, V)).toBeNull();
  });

  it('партии разных профилей не смешиваются', async () => {
    await saveResume(GAME, 'kids', V, { grid: [[9]], errors: 0 });
    await saveResume(GAME, 'default', V, board);
    expect(await loadResume<Board>(GAME, 'kids', V)).toEqual({ grid: [[9]], errors: 0 });
    expect(await loadResume<Board>(GAME, 'default', V)).toEqual(board);
  });

  it('доиграл или начал заново → партия выброшена', async () => {
    await saveResume(GAME, PID, V, board);
    await clearResume(GAME, PID);
    expect(await loadResume<Board>(GAME, PID, V)).toBeNull();
  });

  it('listResumable отдаёт игры профиля, свежие первыми, чужой профиль не показывает', async () => {
    const now = Date.now();
    await AsyncStorage.setItem(`psygames_resume_hanoi_${PID}`, JSON.stringify({ v: 1, savedAt: now - 60_000, state: {} }));
    await AsyncStorage.setItem(`psygames_resume_sudoku_${PID}`, JSON.stringify({ v: 1, savedAt: now - 1_000, state: {} }));
    await AsyncStorage.setItem(`psygames_resume_sudoku_kids`, JSON.stringify({ v: 1, savedAt: now, state: {} }));
    const list = await listResumable(PID);
    expect(list.map((r) => r.gameId)).toEqual(['sudoku', 'hanoi']);
  });

  it('протухшая партия в списке не показывается', async () => {
    await AsyncStorage.setItem(
      `psygames_resume_hanoi_${PID}`,
      JSON.stringify({ v: 1, savedAt: Date.now() - RESUME_MAX_AGE_MS - 1000, state: {} }),
    );
    expect(await listResumable(PID)).toEqual([]);
  });

  it('карточка берёт канонический route из реестра и пропускает удалённую игру', () => {
    const registry = [
      { id: 'sudoku', route: '/games/sudoku' },
      { id: 'schulte_table', route: '/games/schulte' },
    ];
    const resolved = resolveResumableGame([
      { gameId: 'removed_game', savedAt: 3 },
      { gameId: 'schulte_table', savedAt: 2 },
    ], registry);
    expect(resolved).toEqual({ id: 'schulte_table', route: '/games/schulte' });
    expect(resolveResumableGame([{ gameId: 'unknown', savedAt: 1 }], registry)).toBeNull();
  });
});

describe('moveStack — отмена хода', () => {
  it('отменяет и возвращает в правильном порядке', () => {
    const s = createMoveStack<number>();
    s.push(1); s.push(2); s.push(3);
    expect(s.undo()).toBe(3);
    expect(s.undo()).toBe(2);
    expect(s.redo()).toBe(2);
    expect(s.undo()).toBe(2);
    expect(s.undo()).toBe(1);
    expect(s.undo()).toBeNull();
  });

  it('отменять нечего → null, а не падение', () => {
    const s = createMoveStack<number>();
    expect(s.undo()).toBeNull();
    expect(s.redo()).toBeNull();
    expect(s.canUndo()).toBe(false);
  });

  it('новый ход обрывает ветку возврата', () => {
    const s = createMoveStack<number>();
    s.push(1); s.push(2);
    s.undo();
    expect(s.canRedo()).toBe(true);
    s.push(9);
    expect(s.canRedo()).toBe(false);
  });

  it('переполнение срезает СТАРЫЕ ходы — свежие остаются отменяемыми', () => {
    const s = createMoveStack<number>(3);
    s.push(1); s.push(2); s.push(3); s.push(4);
    expect(s.undo()).toBe(4);
    expect(s.undo()).toBe(3);
    expect(s.undo()).toBe(2);
    expect(s.undo()).toBeNull();   // ход 1 вытеснен
  });

  it('лента переживает укладку в партию и подъём обратно', () => {
    const s = createMoveStack<number>();
    s.push(1); s.push(2); s.undo();
    const snap = s.serialize();
    const s2 = createMoveStack<number>();
    s2.restore(snap);
    expect(s2.undo()).toBe(1);
    expect(s2.redo()).toBe(1);
    expect(s2.redo()).toBe(2);
  });

  it('restore(мусор) даёт пустую ленту, а не падение', () => {
    const s = createMoveStack<number>();
    s.restore(null);
    expect(s.canUndo()).toBe(false);
    s.restore({ past: undefined, future: undefined });
    expect(s.canUndo()).toBe(false);
  });
});

describe('failure — модель провала как параметр режима', () => {
  it('короткая партия: три ошибки и конец — как было в судоку', () => {
    const p = failurePolicy('standard');
    expect(p.lives).toBe(STANDARD_LIVES);
    expect(isOver(p, 2)).toBe(false);
    expect(isOver(p, 3)).toBe(true);
    expect(livesLeft(p, 2)).toBe(1);
    expect(formatErrorCount(p, 0)).toBe('0/3');
    expect(formatErrorCount(p, 2)).toBe('2/3');
  });

  it('длинная партия: ошибки считаются, но час работы не обрывают', () => {
    const p = failurePolicy('longform');
    expect(p.fatal).toBe(false);
    expect(isOver(p, 3)).toBe(false);
    expect(isOver(p, 99)).toBe(false);
    expect(livesLeft(p, 99)).toBe(Infinity);
    expect(formatErrorCount(p, 99)).toBe('99');
  });
});
