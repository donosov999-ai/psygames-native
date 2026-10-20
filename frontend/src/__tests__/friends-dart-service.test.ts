/* psygames-friends-dart-service · VER 1 · 20.10.2026 */
/**
 * 🔴 СЕРВИС «ДРУЗЕЙ» — ЭТАЛОН ЗАПРОСОВ И РАЗБОРА ДЛЯ DART (задача d6a60b02, вариант Б).
 *
 * Настоящий `services/friends.ts` и настоящий клиент supabase-js, а сеть подменена: подставной `fetch`
 * записывает каждый запрос (адрес, метод, заголовки ключа, тело) и отвечает заготовкой. Образец —
 * случаи «вызов → запросы → ответы → итог»: Dart (`lib/shell/friends_service.dart`) обязан послать те же
 * запросы и разобрать те же ответы в тот же итог. Продакшн-сервер не трогается.
 * Перезапись — `WRITE=1 npx jest -i --runTestsByPath src/__tests__/friends-dart-service.test.ts`.
 */
declare const process: { env: Record<string, string | undefined> };
/* eslint-disable @typescript-eslint/no-require-imports -- загрузка после сброса модулей */
const fs = require('fs');
const path = require('path');
/* eslint-enable @typescript-eslint/no-require-imports */

const PLAYER = '0b9d5a3e-6c1f-4f7a-9e2b-1d2c3b4a5f60';
type Reply = { status: number; body: unknown } | 'network';
type Case = { name: string; call: string; args: unknown[]; storage?: Record<string, string>; replies: Reply[] };

const CASES: Case[] = [
  { name: 'myCode', call: 'getMyInviteCode', args: [], replies: [{ status: 200, body: 'K7Q2ZP' }] },
  { name: 'myCodeCached', call: 'getMyInviteCode', args: [], storage: { psygames_friends_my_code: 'AAA111' }, replies: [] },
  { name: 'myCodeServerError', call: 'getMyInviteCode', args: [], replies: [{ status: 500, body: { message: 'boom' } }] },
  { name: 'myCodeNetwork', call: 'getMyInviteCode', args: [], replies: ['network'] },
  { name: 'addAdded', call: 'addFriendByCode', args: [' k7q-2 zp '], replies: [{ status: 200, body: [{ reason: 'added', f_id: 'f1', f_name: 'Валя' }] }] },
  { name: 'addSelf', call: 'addFriendByCode', args: ['K7Q2ZP'], replies: [{ status: 200, body: [{ reason: 'self' }] }] },
  { name: 'addFull', call: 'addFriendByCode', args: ['K7Q2ZP'], replies: [{ status: 200, body: { reason: 'full', circle_max: 12 } }] },
  { name: 'addBadCode', call: 'addFriendByCode', args: ['K7Q2ZP'], replies: [{ status: 200, body: [{ reason: 'bad-code' }] }] },
  { name: 'addOldServer', call: 'addFriendByCode', args: ['K7Q2ZP'], replies: [{ status: 200, body: [] }] },
  { name: 'addOffline', call: 'addFriendByCode', args: ['K7Q2ZP'], replies: [{ status: 500, body: { message: 'boom' } }] },
  { name: 'addNetwork', call: 'addFriendByCode', args: ['K7Q2ZP'], replies: ['network'] },
  { name: 'addShort', call: 'addFriendByCode', args: ['K7Q'], replies: [] },
  { name: 'list', call: 'listFriends', args: [], replies: [{ status: 200, body: [{ f_id: 'f1', f_name: 'Валя', since: '2026-10-01T10:00:00+00:00' }, { f_id: 'f2', f_name: null, since: '2026-10-02' }] }] },
  { name: 'listEmpty', call: 'listFriends', args: [], replies: [{ status: 200, body: [] }] },
  { name: 'listError', call: 'listFriends', args: [], replies: [{ status: 401, body: { message: 'no' } }] },
  { name: 'top', call: 'friendsTop', args: ['n_back'], replies: [{ status: 200, body: [{ f_id: 'me', f_name: 'Я', score: 4, updated_at: '2026-10-19', is_me: true }, { f_id: 'f1', f_name: 'Валя', score: '3', updated_at: '2026-10-18', is_me: false }] }] },
  { name: 'topNetwork', call: 'friendsTop', args: ['corsi'], replies: ['network'] },
  { name: 'remove', call: 'removeFriend', args: ['f1'], replies: [{ status: 204, body: null }] },
  { name: 'removeError', call: 'removeFriend', args: ['f1'], replies: [{ status: 500, body: { message: 'boom' } }] },
];

const g = globalThis as any;
const realFetch = g.fetch;
afterAll(() => { g.fetch = realFetch; });

describe('«Друзья» — эталон запросов и разбора для Dart', () => {
  const out: unknown[] = [];
  for (const c of CASES) {
    it(c.name, async () => {
      jest.resetModules();
      const mod = require('@react-native-async-storage/async-storage');   // eslint-disable-line @typescript-eslint/no-require-imports
      const AsyncStorage = mod.default ?? mod;
      await AsyncStorage.clear();
      await AsyncStorage.setItem('psygames_leaderboard_player_id', PLAYER);
      for (const [k, v] of Object.entries(c.storage ?? {})) await AsyncStorage.setItem(k, v);
      const requests: any[] = [];
      const replies = [...c.replies];
      g.fetch = async (input: any, init: any = {}) => {
        const url = typeof input === 'string' ? input : input.url;
        const h = new Headers(init.headers ?? (typeof input === 'string' ? undefined : input.headers));
        requests.push({
          url, method: init.method ?? 'GET',
          headers: { apikey: h.get('apikey'), authorization: h.get('authorization'), 'content-type': h.get('content-type') },
          body: init.body == null ? null : JSON.parse(String(init.body)),
        });
        const r = replies.shift();
        if (r === undefined || r === 'network') throw new TypeError('fetch failed');
        return new Response(r.body === null ? null : JSON.stringify(r.body), { status: r.status, headers: { 'content-type': 'application/json' } });
      };
      const friends = require('@/src/services/friends');   // eslint-disable-line @typescript-eslint/no-require-imports
      const result = await friends[c.call](...c.args);
      const keys: string[] = [...(await AsyncStorage.getAllKeys())].sort();
      const after: Record<string, string> = {};
      for (const [k, v] of await AsyncStorage.multiGet(keys)) if (v != null) after[k] = v;
      out.push({ ...c, requests, result: result === undefined ? null : result, after });
      expect(requests.length).toBeLessThanOrEqual(c.replies.length + 1);
    });
  }
  afterAll(() => {
    const file = path.resolve(__dirname, '../../../flutter/test/fixtures/friends_dart_service.json');
    if (process.env.WRITE === '1') fs.writeFileSync(file, `${JSON.stringify({ player: PLAYER, cases: out }, null, 1)}\n`, 'utf8');
  });
});
