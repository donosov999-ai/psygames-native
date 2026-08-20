/* psygames-friends · VER 1 · 21.08.2026 */
/**
 * КРУГ ДРУЗЕЙ: ТРИ ПУСТОТЫ — ТРИ РАЗНЫХ СООБЩЕНИЯ.
 *
 * 🔴 ЗАЧЕМ ЭТОТ ГЕЙТ. У соседа по экрану (`leaderboard.ts`) в комментарии прямо
 * записано, чем это кончается: `fetchTop` отдаёт `[]` и когда никого нет, и
 * когда нет сети, — и человек с рекордом читал «Пока пусто» как поломку. Здесь
 * та же развилка ветвится на три случая, и слепить их обратно в одну «пустоту»
 * нельзя незаметно: каждый случай назван и проверен.
 */
const mockRpc = jest.fn();
jest.mock('@/src/services/supabase', () => ({ getSupabase: () => ({ rpc: mockRpc }) }));
jest.mock('@/src/services/leaderboard', () => ({ getPlayerId: async () => 'игрок-1' }));
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: async () => null,
  setItem: async () => {},
}));

import {
  normalizeCode, isCodeComplete, friendsView, addFriendByCode,
  listFriends, friendsTop, getMyInviteCode, CODE_LEN,
  type Friend, type FriendScore,
} from '@/src/services/friends';

beforeEach(() => { mockRpc.mockReset(); });

const друг = (id: string): Friend => ({ id, name: 'Тихий Барсук', since: '2026-08-21' });
const строка = (id: string, isMe = false): FriendScore =>
  ({ id, name: 'Тихий Барсук', score: 12, updatedAt: '2026-08-21', isMe });

describe('код приглашения переживает то, как его переписывают', () => {
  it('пробелы, дефисы и регистр — это тот же код', () => {
    expect(normalizeCode(' 2gun-3t ')).toBe('2GUN3T');
    expect(normalizeCode('2 G U N 3 T')).toBe('2GUN3T');
  });

  it('🔴 кнопку не оживляем, пока код не набран целиком', () => {
    expect(isCodeComplete('2GUN3')).toBe(false);
    expect(isCodeComplete('2gun-3t')).toBe(true);
    expect(CODE_LEN).toBe(6);
  });

  it('мусор вместо кода не притворяется годным', () => {
    expect(isCodeComplete('!!!!!!')).toBe(false);
    expect(isCodeComplete('')).toBe(false);
  });
});

describe('🔴 три пустоты не путаются между собой', () => {
  it('ещё не спросили — «загружаем», а не «никого нет»', () => {
    expect(friendsView(undefined, undefined).kind).toBe('loading');
    expect(friendsView([друг('a')], undefined).kind).toBe('loading');
  });

  it('не смогли спросить круг — «нет связи»', () => {
    expect(friendsView(null, null).kind).toBe('offline');
  });

  it('друзей правда нет — зовём добавить, а не жалуемся на сеть', () => {
    expect(friendsView([], []).kind).toBe('no-friends');
  });

  it('🔴 друзья есть, но круг не играл — это НЕ «друзей нет»', () => {
    expect(friendsView([друг('a')], []).kind).toBe('nobody-played');
  });

  it('🔴 своя строка не выдаёт себя за сыгравший круг', () => {
    // Сам сыграл, друг — нет. Показать таблицу из одного себя значит соврать.
    expect(friendsView([друг('a')], [строка('я', true)]).kind).toBe('nobody-played');
  });

  it('круг есть и играл — показываем таблицу', () => {
    const v = friendsView([друг('a')], [строка('я', true), строка('a')]);
    expect(v.kind).toBe('rows');
    expect(v.kind === 'rows' && v.rows.length).toBe(2);
  });

  it('друзья есть, а таблицу спросить не вышло — «нет связи», не «никто не играл»', () => {
    expect(friendsView([друг('a')], null).kind).toBe('offline');
  });
});

describe('добавление по коду', () => {
  it('🔴 сервер вернул друга — добавлен', async () => {
    mockRpc.mockResolvedValue({ data: [{ f_id: 'b', f_name: 'Тихий Барсук', reason: 'added', circle_max: 50 }], error: null });
    const r = await addFriendByCode('2gun-3t');
    expect(r).toEqual({ kind: 'added', friend: { id: 'b', name: 'Тихий Барсук' } });
    expect(mockRpc).toHaveBeenCalledWith('psygames_add_friend', { p_player_id: 'игрок-1', p_code: '2GUN3T' });
  });

  it('🔴 такого кода нет — так и говорим, а не «нет связи»', async () => {
    mockRpc.mockResolvedValue({ data: [{ reason: 'not-found', circle_max: 50 }], error: null });
    expect((await addFriendByCode('ZZZZZZ')).kind).toBe('not-found');
  });

  /**
   * 🔴 ТРИ ОТКАЗА, КОТОРЫЕ РАНЬШЕ БЫЛИ ОДНИМ. Сервер возвращал пусто и когда кода
   * нет, и когда код СВОЙ СОБСТВЕННЫЙ, и когда круг полон, — экран во всех трёх
   * случаях говорил «такого кода нет». В двух случаях из трёх это была неправда.
   */
  it('🔴 свой собственный код — это не «кода нет»', async () => {
    mockRpc.mockResolvedValue({ data: [{ reason: 'self', circle_max: 50 }], error: null });
    expect((await addFriendByCode('2GUN3T')).kind).toBe('self');
  });

  it('🔴 круг полон — это не «кода нет», и предел приходит С СЕРВЕРА', async () => {
    mockRpc.mockResolvedValue({ data: [{ reason: 'full', circle_max: 50 }], error: null });
    const r = await addFriendByCode('2GUN3T');
    expect(r).toEqual({ kind: 'full', max: 50 });
  });

  /** Предел не переписан в клиент числом: что сервер сказал, то и покажем. */
  it('🔴 предел круга не выдуман клиентом', async () => {
    mockRpc.mockResolvedValue({ data: [{ reason: 'full', circle_max: 7 }], error: null });
    const r = await addFriendByCode('2GUN3T');
    expect(r.kind === 'full' && r.max).toBe(7);
  });

  /** Старый сервер без `reason` — для человека это просто «код не подошёл». */
  it('ответ без причины не роняет экран', async () => {
    mockRpc.mockResolvedValue({ data: [{ f_id: 'b', f_name: 'Барсук' }], error: null });
    expect((await addFriendByCode('2GUN3T')).kind).toBe('not-found');
  });

  it('🔴 сеть отвалилась — это НЕ «кода нет»', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'network' } });
    expect((await addFriendByCode('ZZZZZZ')).kind).toBe('offline');
  });

  it('короткий код до сервера не доходит вовсе', async () => {
    expect((await addFriendByCode('2GUN')).kind).toBe('not-found');
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it('исключение внутри клиента не роняет экран', async () => {
    mockRpc.mockImplementation(() => { throw new Error('bang'); });
    expect((await addFriendByCode('2GUN3T')).kind).toBe('offline');
  });
});

describe('чтение круга', () => {
  it('список приходит разобранным', async () => {
    mockRpc.mockResolvedValue({ data: [{ f_id: 'b', f_name: 'Тихий Барсук', since: '2026-08-21' }], error: null });
    expect(await listFriends()).toEqual([{ id: 'b', name: 'Тихий Барсук', since: '2026-08-21' }]);
  });

  it('🔴 ошибка чтения — null, а не пустой список', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'network' } });
    expect(await listFriends()).toBeNull();
    expect(await friendsTop('schulte_table_5x5')).toBeNull();
  });

  it('таблица круга помечает, где я', async () => {
    mockRpc.mockResolvedValue({ data: [
      { f_id: 'игрок-1', f_name: 'Я', score: 9, updated_at: '2026-08-21', is_me: true },
      { f_id: 'b', f_name: 'Барсук', score: 12, updated_at: '2026-08-21', is_me: false },
    ], error: null });
    const rows = await friendsTop('schulte_table_5x5');
    expect(rows?.map((r) => r.isMe)).toEqual([true, false]);
  });

  it('свой код спрашивается у сервера и отдаётся строкой', async () => {
    mockRpc.mockResolvedValue({ data: 'NNTETZ', error: null });
    expect(await getMyInviteCode()).toBe('NNTETZ');
  });

  it('🔴 кода не добыли — null, экран скажет про связь, а не покажет пустое место', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'network' } });
    expect(await getMyInviteCode()).toBeNull();
  });
});
