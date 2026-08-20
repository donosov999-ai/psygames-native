/* psygames-friends · VER 1 · 21.08.2026 */
/**
 * ДРУЗЬЯ ПО КОДУ ПРИГЛАШЕНИЯ.
 *
 * 🔴 ЧТО ЗДЕСЬ СОЗНАТЕЛЬНО НЕ ДЕЛАЕТСЯ. Приложение сегодня отправляет на сервер
 * ровно две вещи: отчёты о проблемах и очки лидерборда — того, что человек сам
 * опубликовал, сыграв зачётную партию. История тренировок целиком лежит на
 * устройстве и никуда не уходит.
 *
 * Очевидная витрина для друзей — «Валя тренировалась пять дней подряд» — стоила
 * бы ровно этого: ежедневную активность КАЖДОГО пришлось бы держать на сервере.
 * Поэтому круг друзей построен как ВИД на уже опубликованные очки: новых личных
 * данных не заводится ни одного поля, а код приглашения и пара «кто с кем» —
 * это всё, что добавилось. Витрина со стриками, если она понадобится, — это
 * отдельное решение с отдельной ценой, а не побочный эффект дружбы.
 *
 * ⚠️ ПОЧЕМУ ВЕЗДЕ РАЗЛИЧАЕТСЯ `null` И ПУСТОЙ СПИСОК. Сосед по этому же экрану
 * (`leaderboard.ts`) отдаёт `[]` и когда в таблице правда никого, и когда сети
 * нет, — и человек с рекордом читал «Пока пусто» как поломку. Здесь это
 * разведено с самого начала: `null` — «не смогли спросить», `[]` — «спросили,
 * никого нет». Тексты у этих случаев разные, и путать их нельзя.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getSupabase } from '@/src/services/supabase';
import { getPlayerId } from '@/src/services/leaderboard';

/** Свой код меняется раз в жизни — держим под рукой, чтобы экран не ждал сети. */
const MY_CODE_KEY = 'psygames_friends_my_code';

/** Длина кода. Алфавит из 31 знака без 0/O/1/I/L — код диктуют голосом. */
export const CODE_LEN = 6;

export interface Friend {
  id: string;
  name: string;
  since: string;
}

export interface FriendScore {
  id: string;
  name: string;
  score: number;
  updatedAt: string;
  isMe: boolean;
}

/**
 * Человек переписывает код с чужого экрана или записывает со слуха. Пробелы,
 * дефисы, строчные буквы — это тот же код, и отказывать из-за них нельзя.
 * Ту же нормализацию делает и сервер: клиенту верить нельзя, а человеку удобно.
 */
export function normalizeCode(raw: string): string {
  return (raw || '').replace(/[^0-9a-zA-Z]/g, '').toUpperCase();
}

/** Годится ли введённое на отправку — чтобы кнопка не была живой раньше времени. */
export function isCodeComplete(raw: string): boolean {
  return normalizeCode(raw).length === CODE_LEN;
}

/** Мой код. `null` — спросить не вышло; экран говорит «нет связи», а не молчит. */
export async function getMyInviteCode(): Promise<string | null> {
  try {
    const cached = await AsyncStorage.getItem(MY_CODE_KEY);
    if (cached) return cached;
  } catch { /* нет хранилища — просто сходим на сервер */ }
  try {
    const supabase = getSupabase();
    const { data, error } = await supabase.rpc('psygames_my_invite_code', { p_player_id: await getPlayerId() });
    if (error || !data) return null;
    const code = String(data);
    try { await AsyncStorage.setItem(MY_CODE_KEY, code); } catch { /* переспросим потом */ }
    return code;
  } catch {
    return null;
  }
}

/** Чем кончилась попытка добавить друга. Три исхода, и у каждого свой текст. */
export type AddResult =
  | { kind: 'added'; friend: { id: string; name: string } }
  /** Кода нет, он свой собственный или круг уже полон — сервер молча вернул пусто. */
  | { kind: 'not-found' }
  | { kind: 'offline' };

export async function addFriendByCode(raw: string): Promise<AddResult> {
  const code = normalizeCode(raw);
  if (code.length !== CODE_LEN) return { kind: 'not-found' };
  try {
    const supabase = getSupabase();
    const { data, error } = await supabase.rpc('psygames_add_friend', {
      p_player_id: await getPlayerId(), p_code: code,
    });
    if (error) return { kind: 'offline' };
    const row = Array.isArray(data) ? data[0] : data;
    if (!row?.f_id) return { kind: 'not-found' };
    return { kind: 'added', friend: { id: String(row.f_id), name: String(row.f_name ?? '') } };
  } catch {
    return { kind: 'offline' };
  }
}

/** Круг друзей. `null` — не смогли спросить. */
export async function listFriends(): Promise<Friend[] | null> {
  try {
    const supabase = getSupabase();
    const { data, error } = await supabase.rpc('psygames_friends_list', { p_player_id: await getPlayerId() });
    if (error || !data) return null;
    return (data as any[]).map((r) => ({ id: String(r.f_id), name: String(r.f_name ?? ''), since: String(r.since) }));
  } catch {
    return null;
  }
}

/** Таблица игры среди своих. `null` — не смогли спросить. */
export async function friendsTop(gameId: string): Promise<FriendScore[] | null> {
  try {
    const supabase = getSupabase();
    const { data, error } = await supabase.rpc('psygames_friends_top', {
      p_player_id: await getPlayerId(), p_game_id: gameId,
    });
    if (error || !data) return null;
    return (data as any[]).map((r) => ({
      id: String(r.f_id), name: String(r.f_name ?? ''),
      score: Number(r.score), updatedAt: String(r.updated_at), isMe: !!r.is_me,
    }));
  } catch {
    return null;
  }
}

/** Разрыв взаимен — по той же причине, по которой взаимно добавление. */
export async function removeFriend(friendId: string): Promise<boolean> {
  try {
    const supabase = getSupabase();
    const { error } = await supabase.rpc('psygames_remove_friend', {
      p_player_id: await getPlayerId(), p_friend_id: friendId,
    });
    return !error;
  } catch {
    return false;
  }
}

/**
 * ЧТО РИСОВАТЬ. Решение вынесено чистой функцией по той же причине, по которой
 * это сделано у лидерборда: иначе правило живёт в JSX и проверяется глазами.
 *
 * ⚠️ РАЗНИЦА МЕЖДУ ТРЕМЯ ПУСТОТАМИ — ЭТО И ЕСТЬ СМЫСЛ ФУНКЦИИ. «Друзей нет»,
 * «друзья есть, но в эту игру никто из них не играл» и «не смогли спросить» —
 * три разных сообщения. Слепить их в одно «Пока пусто» значит показать человеку
 * с пятью друзьями и без сети то же самое, что новичку.
 */
export type FriendsView =
  | { kind: 'loading' }
  | { kind: 'offline' }
  | { kind: 'no-friends' }
  | { kind: 'nobody-played' }
  | { kind: 'rows'; rows: FriendScore[] };

export function friendsView(
  friends: Friend[] | null | undefined,
  rows: FriendScore[] | null | undefined,
): FriendsView {
  if (friends === undefined || rows === undefined) return { kind: 'loading' };
  if (friends === null) return { kind: 'offline' };
  if (friends.length === 0) return { kind: 'no-friends' };
  if (rows === null) return { kind: 'offline' };
  // Своя строка есть всегда, когда играл сам, — «никто не играл» это про КРУГ.
  if (rows.filter((r) => !r.isMe).length === 0) return { kind: 'nobody-played' };
  return { kind: 'rows', rows };
}
