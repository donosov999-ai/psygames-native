import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { prepareSudokuCorrection } from './sudoku-correction.mjs';

const CREATED = '2026-10-16T12:00:00.123456Z';
const expected = (overrides = {}) => ({
  owner_id: 'test-owner', issuer: 'https://issuer.invalid', app_id: 'psygames',
  revision: 7, profile: 'women', road: 'normal', targetLevel: 79, ...overrides,
});
function row(data = {}, scope = {}) {
  return {
    owner_id: 'test-owner', issuer: 'https://issuer.invalid', app_id: 'psygames', revision: 7,
    payload: { schema: 1, data: { schema: 1, createdAt: CREATED, data: {
      psygames_sudoku_level_women: '78', psygames_sudoku_best_women: '78', ...data,
    } } }, ...scope,
  };
}
const values = result => result.candidatePayload.data.data;
function freezeDeep(value) {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(freezeDeep);
    Object.freeze(value);
  }
  return value;
}
const resume = (state = {}, env = {}) => JSON.stringify({
  v: 4, savedAt: Date.parse(CREATED) - 1000,
  state: { mode: 'levels', level: 78, road: 'normal', grid: [[0]], ...state }, ...env,
});

test('Valya L78 -> 79 unlocks only own reached-level keys, never invented wins', () => {
  const input = freezeDeep(row({
    psygames_wallet_v1: ' { "balance": 98 } ', psygames_pet_v1: '{"xp":1}',
    psygames_purchases: '["life"]', psygames_history: '[{"lesson":true}]',
    psygames_sudoku_stars_women: '{"77":3}', psygames_sudoku_level_women_warmup: '78',
    psygames_sudoku_practice_women: 'true', psygames_leaderboard_personal_best_sudoku_level: '77',
    psygames_sessions: '[{"passed":false}]', psygames_tokens_v1: '12',
    psygames_sudoku_road_women: 'easy', psygames_sudoku_level_women_easy: '50',
    psygames_sudoku_level_women_hard: '2', psygames_sudoku_level_kids: '8',
    psygames_resume_sudoku_kids: 'untouched', psygames_resume_sudoku_killer_women: 'opaque',
    language: 'ru', 'psygames.bestStreak.sudoku': '4',
  }));
  const original = JSON.stringify(input);
  const result = prepareSudokuCorrection(input, expected());
  assert.deepEqual(result.changes, [
    { key: 'psygames_sudoku_level_women', before: '78', after: '79' },
    { key: 'psygames_sudoku_best_women', before: '78', after: '79' },
  ]);
  for (const [key, value] of Object.entries(input.payload.data.data)) {
    if (!result.changes.some(c => c.key === key)) assert.equal(values(result)[key], value, key);
  }
  assert.equal(JSON.stringify(input), original);
  assert.equal(result.baseRevision, 7);
  assert.equal(result.candidatePayload.data.createdAt, CREATED);
  assert.equal(result.summary.changedKeyCount, 2);
  assert.deepEqual(result.summary.effectiveLevelsAfter, { easy: 79, normal: 79, hard: 2 });
});

test('already 80 is a byte-identical no-op; higher best is never downgraded', () => {
  const input = row({ psygames_sudoku_level_women: '80', psygames_sudoku_best_women: '90' });
  const result = prepareSudokuCorrection(input, expected());
  assert.deepEqual(result.changes, []);
  assert.deepEqual(result.candidatePayload, input.payload);
  assert.deepEqual(prepareSudokuCorrection({ ...input, payload: result.candidatePayload }, expected()).changes, []);
});

test('all roads and profiles use real keys, inherit only downward, preserve route', () => {
  for (const profile of ['women', 'kids', 'nzt48', 'odv999']) {
    for (const road of ['easy', 'normal', 'hard']) {
      const suffix = road === 'normal' ? '' : `_${road}`;
      const input = row({ [`psygames_sudoku_road_${profile}`]: 'hard' });
      const result = prepareSudokuCorrection(input, expected({ profile, road }));
      assert.equal(values(result)[`psygames_sudoku_level_${profile}${suffix}`], '79');
      assert.equal(values(result)[`psygames_sudoku_best_${profile}${suffix}`], '79');
      assert.equal(values(result)[`psygames_sudoku_road_${profile}`], 'hard');
      assert.ok(result.changes.every(c => c.key.endsWith(`${profile}${suffix}`)));
      if (road === 'easy') assert.ok(result.summary.effectiveLevelsAfter.normal < 79);
      if (road !== 'hard') assert.ok(result.summary.effectiveLevelsAfter.hard < 79);
      if (road === 'hard') assert.deepEqual(result.summary.effectiveLevelsAfter, { easy: 79, normal: 79, hard: 79 });
    }
  }
});

test('inherited higher level and missing counters remain monotonic, no copied road counters', () => {
  const input = row({ psygames_sudoku_level_women_hard: '85' });
  const result = prepareSudokuCorrection(input, expected());
  assert.equal(values(result).psygames_sudoku_level_women, '79');
  assert.equal(values(result).psygames_sudoku_best_women, '85');
  assert.equal(values(result).psygames_sudoku_level_women_hard, '85');
  assert.equal(values(result).psygames_sudoku_level_women_easy, undefined);
  assert.equal(result.summary.effectiveLevelsBefore.normal, 85);
  assert.equal(result.summary.effectiveLevelsAfter.normal, 85);
});

test('stale active resume is retained exactly and requires explicit restore/restart', () => {
  const raw = resume();
  const result = prepareSudokuCorrection(row({ psygames_resume_sudoku_women: raw }), expected());
  assert.equal(values(result).psygames_resume_sudoku_women, raw);
  assert.deepEqual(result.resume, {
    key: 'psygames_resume_sudoku_women', status: 'restore-or-restart-choice-needed',
    reasons: ['level-mismatch'], choiceRequired: true, choices: ['restore', 'restart'],
  });
});

test('resume on inherited easy road also becomes stale; other road remains preserved', () => {
  const easy = prepareSudokuCorrection(row({ psygames_resume_sudoku_women: resume({ road: 'easy' }),
    psygames_sudoku_road_women: 'easy' }), expected());
  assert.ok(easy.resume.reasons.includes('level-mismatch'));
  const hard = prepareSudokuCorrection(row({ psygames_resume_sudoku_women: resume({ road: 'hard', level: 1 }),
    psygames_sudoku_road_women: 'hard' }), expected());
  assert.equal(hard.resume.choiceRequired, false);
});

test('matching, absent, null and side-mode resumes; legacy road defaults normal', () => {
  for (const raw of [undefined, 'null', resume({ level: 79 }), resume({ mode: 'killer' }),
    resume({ level: 79, road: undefined })]) {
    const input = row(raw === undefined ? {} : { psygames_resume_sudoku_women: raw });
    const result = prepareSudokuCorrection(input, expected());
    assert.equal(result.resume.choiceRequired, false);
    assert.equal(values(result).psygames_resume_sudoku_women, raw);
  }
});

test('uninspectable, expired, future or route-conflicting resumes require choice without deletion', () => {
  for (const raw of ['bad json', '{}', '[]', '"secret-marker"', resume({}, { v: 3 }),
    resume({ level: 79 }, { savedAt: 0 }), resume({ level: 79 }, { savedAt: Date.parse(CREATED) + 1 }),
    resume({ road: 'hard', level: 1 }), resume({ mode: 'unknown' })]) {
    const result = prepareSudokuCorrection(row({ psygames_resume_sudoku_women: raw }), expected());
    assert.equal(result.resume.choiceRequired, true);
    assert.equal(values(result).psygames_resume_sudoku_women, raw);
  }
});

test('wrong owner, issuer, app or revision, missing scope and coercions fail closed', () => {
  for (const [key, value] of [['owner_id', 'other'], ['issuer', 'https://other.invalid'],
    ['app_id', 'other-app'], ['revision', 8], ['revision', '7'], ['revision', undefined]]) {
    assert.throws(() => prepareSudokuCorrection(row({}, { [key]: value }), expected()), /SCOPE_OR_REVISION_MISMATCH/);
  }
  for (const overrides of [{ app_id: 'other' }, { revision: 0 }, { profile: 'women_easy' },
    { profile: '../women' }, { road: 'NORMAL' }, { targetLevel: 0 }, { targetLevel: 181 },
    { targetLevel: 79.5 }, { targetLevel: '79' }, { revision: Number.MAX_SAFE_INTEGER + 1 }]) {
    assert.throws(() => prepareSudokuCorrection(row(), expected(overrides)));
  }
  for (const key of Object.keys(expected())) {
    const e = expected(); delete e[key];
    assert.throws(() => prepareSudokuCorrection(row(), e));
  }
});

test('malformed nested envelopes, schemas, dates and data are rejected entirely', () => {
  const badPayloads = [null, [], 'json', { schema: 1, data: {} },
    { ...row().payload, extra: true }, { ...row().payload, schema: '1' }];
  for (const payload of badPayloads) assert.throws(() => prepareSudokuCorrection(row({}, { payload }), expected()));
  for (const patch of [{ schema: 2 }, { createdAt: '2026-02-30T12:00:00Z' },
    { createdAt: '2026-10-16T12:00:00+00:00' }, { createdAt: '2026-10-16T25:00:00Z' },
    { createdAt: null }, { data: [] }, { data: null }, { data: { foreign: 'x' } },
    { data: { psygames_wallet: 1 } }, { data: { psygames_wallet: { toJSON: () => 'x' } } },
    { extra: 1 }]) {
    const input = row(); Object.assign(input.payload.data, patch);
    assert.throws(() => prepareSudokuCorrection(input, expected()));
  }
  for (const raw of ['0', '-1', '78.5', '078', '78x', ' 78', '9007199254740992', '']) {
    assert.throws(() => prepareSudokuCorrection(row({ psygames_sudoku_level_women: raw }), expected()), /INVALID_LEVEL/);
  }
});

test('CloudSnapshot excludes private/local/foreign keys but allows gameplay tokens', () => {
  for (const key of ['foreign', 'psygames_auth', 'psygames_accessToken', 'psygames_cloud_consent',
    'psygames_apikey', 'psygames_private-key', 'psygames_sessions_outbox',
    'psygames_legacy_import_v1', 'psygames_migration_v1', 'psygames_sync_v1']) {
    assert.throws(() => prepareSudokuCorrection(row({ [key]: 'do-not-echo-marker' }), expected()), /NON_PORTABLE_DATA/);
  }
});

test('5 MiB UTF-8 and 10000-entry limits apply before and after correction', () => {
  assert.throws(() => prepareSudokuCorrection(row({ psygames_history: 'я'.repeat(3 * 1024 * 1024) }), expected()), /SNAPSHOT_TOO_LARGE/);
  const data = Object.fromEntries(Array.from({ length: 10001 }, (_, i) => [`psygames_test_${i}`, 'x']));
  assert.throws(() => prepareSudokuCorrection(row(data), expected()), /TOO_MANY_ENTRIES/);
  const exactData = Object.fromEntries(Array.from({ length: 9999 }, (_, i) => [`psygames_test_${i}`, 'x']));
  const input = row(exactData);
  delete input.payload.data.data.psygames_sudoku_best_women;
  assert.equal(Object.keys(input.payload.data.data).length, 10000);
  assert.throws(() => prepareSudokuCorrection(input, expected()), /TOO_MANY_ENTRIES/);
  const sizeInput = row({ psygames_history: '' });
  delete sizeInput.payload.data.data.psygames_sudoku_best_women;
  const available = 5 * 1024 * 1024 - Buffer.byteLength(JSON.stringify(sizeInput.payload));
  sizeInput.payload.data.data.psygames_history = 'x'.repeat(available);
  assert.throws(() => prepareSudokuCorrection(sizeInput, expected()), /SNAPSHOT_TOO_LARGE/);
});

test('output is detached in both directions, repeated calls are deterministic', () => {
  const input = row({ psygames_history: 'keep' });
  const result = prepareSudokuCorrection(input, expected());
  assert.deepEqual(result, prepareSudokuCorrection(input, expected()));
  assert.notEqual(result.candidatePayload, input.payload);
  assert.notEqual(result.candidatePayload.data, input.payload.data);
  assert.notEqual(values(result), input.payload.data.data);
  values(result).psygames_history = 'changed';
  result.changes[0].after = '1';
  assert.equal(input.payload.data.data.psygames_history, 'keep');
  input.payload.data.data.psygames_sudoku_level_women = '100';
  assert.equal(values(result).psygames_sudoku_level_women, '79');
});

test('errors never echo secrets or invoke getters/toJSON hooks', () => {
  const marker = 'DO-NOT-EXPOSE-TEST-MARKER';
  const getter = row();
  Object.defineProperty(getter.payload.data.data, 'psygames_bad', { enumerable: true,
    get() { throw new Error(marker); } });
  const proxy = new Proxy({}, { getPrototypeOf() { throw new Error(marker); } });
  for (const input of [getter, proxy, row({ psygames_secret: marker }),
    row({}, { owner_id: marker }), row({ psygames_resume_sudoku_women: marker, psygames_bad: {} })]) {
    assert.throws(() => prepareSudokuCorrection(input, expected()), error => {
      assert.equal(error.name, 'SudokuCorrectionError');
      assert.ok(!String(error.stack).includes(marker));
      assert.ok(!JSON.stringify(error).includes(marker));
      assert.equal(error.cause, undefined);
      return true;
    });
  }
});

test('bounded target ceiling agrees with the checked-in frontend ladder', () => {
  const source = readFileSync(new URL('../../frontend/app/games/sudoku.tsx', import.meta.url), 'utf8');
  assert.match(source, /const SUDOKU_LAST_LEVEL = 180;/);
  assert.doesNotThrow(() => prepareSudokuCorrection(row(), expected({ targetLevel: 180 })));
});

test('caller-thrown errors cannot impersonate internal sanitized errors', () => {
  const marker = 'DO_NOT_EXPOSE_TEST_MARKER';
  const proxy = new Proxy({}, { getPrototypeOf() {
    throw { name: 'SudokuCorrectionError', code: marker };
  } });
  assert.throws(() => prepareSudokuCorrection(proxy, expected()), error => {
    assert.equal(error.code, 'INVALID_INPUT');
    assert.ok(!String(error.stack).includes(marker));
    return true;
  });
});

test('malformed best and inherited counters are never silently overwritten', () => {
  for (const key of ['psygames_sudoku_best_women', 'psygames_sudoku_level_women_hard',
    'psygames_sudoku_level_women_easy']) {
    const input = row({ [key]: 'not-a-level' });
    const original = JSON.stringify(input);
    assert.throws(() => prepareSudokuCorrection(input, expected()), /INVALID_LEVEL/);
    assert.equal(JSON.stringify(input), original);
  }
});

test('foreign prototypes, symbols, non-enumerable extras and accessor fields are not JSON', () => {
  const inputs = [];
  const inherited = row(); inherited.payload = Object.create(row().payload); inputs.push(inherited);
  const symbol = row(); symbol.payload[Symbol('extra')] = 1; inputs.push(symbol);
  const hidden = row(); Object.defineProperty(hidden.payload, 'extra', { value: 1 }); inputs.push(hidden);
  const accessor = expected();
  Object.defineProperty(accessor, 'owner_id', { enumerable: true, get() { throw new Error('test-marker'); } });
  for (const input of inputs) assert.throws(() => prepareSudokuCorrection(input, expected()));
  assert.throws(() => prepareSudokuCorrection(row(), accessor), /INVALID_RECORD/);
  const nullPrototype = row();
  nullPrototype.payload.data.data = Object.assign(Object.create(null), nullPrototype.payload.data.data);
  assert.doesNotThrow(() => prepareSudokuCorrection(nullPrototype, expected()));
});
