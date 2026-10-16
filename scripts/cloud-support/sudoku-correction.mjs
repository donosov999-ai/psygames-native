/**
 * Offline candidate builder, NOT remote access, a support grant, or restore UI.
 * Cloud remains OFF. The outer server must independently verify a current user
 * support grant, bind owner/issuer/app/profile/road, and CAS the exact revision.
 * Recheck consent, remote head, local changes and resume choice before restore.
 * This module performs no I/O, clock reads, session/reward writes, or SDK calls.
 *
 * prepareSudokuCorrection(row, { owner_id, issuer, app_id: 'psygames', revision,
 *   profile, road: 'normal'|'easy'|'hard', targetLevel })
 * row: { owner_id, issuer, app_id, revision, payload: { schema:1,
 *   data: { schema:1, createdAt: UTC ISO string, data: string-map } }, ... }
 * Only plain JSON records are accepted. Profile is an explicit lowercase slug
 * (no underscore: that would alias road suffixes); existence/grant is external.
 * Output is detached. createdAt and all untouched string values stay verbatim.
 * No automatic apply API is provided, even when choiceRequired is false.
 */

const MAX_BYTES = 5 * 1024 * 1024;
const MAX_ENTRIES = 10000;
// Current frontend/app/games/sudoku.tsx SUDOKU_LAST_LEVEL; fail closed on growth.
const MAX_TARGET_LEVEL = 180;
const ROADS = ['easy', 'normal', 'hard'];
const PRIVATE = /(^|[^a-z0-9])(auth|authentication|authorization|oauth|account|consent|device|runtime|transport|cloud|supabase|credential|credentials|password|passwd|secret|secrets|jwt|bearer|token|apikey|privatekey)([^a-z0-9]|$)/;

const internalErrors = new WeakSet();

function fail(code) {
  const error = new Error(code);
  error.name = 'SudokuCorrectionError';
  error.code = code;
  internalErrors.add(error);
  throw error;
}

function record(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail('INVALID_RECORD');
  const proto = Object.getPrototypeOf(value);
  if (proto !== Object.prototype && proto !== null) fail('INVALID_RECORD');
  for (const key of Reflect.ownKeys(value)) {
    const d = Object.getOwnPropertyDescriptor(value, key);
    if (typeof key !== 'string' || !d.enumerable || !Object.hasOwn(d, 'value')) {
      fail('INVALID_RECORD');
    }
  }
  return value;
}

function exact(value, keys) {
  record(value);
  if (Object.keys(value).length !== keys.length || keys.some(k => !Object.hasOwn(value, k))) {
    fail('INVALID_SHAPE');
  }
}

function portableKey(key) {
  if (!(key.startsWith('psygames_') || key.startsWith('psygames.') || key === 'language')) return false;
  const n = key.replace(/([a-z0-9])([A-Z])/g, '$1_$2').toLowerCase();
  return !PRIVATE.test(n) && !/(api|private)[_.-]?key/.test(n) &&
    n !== 'psygames_sessions_outbox' &&
    !['psygames_legacy_import', 'psygames_migration_', 'psygames_sync_'].some(p => n.startsWith(p));
}

function checkSize(value) {
  if (Buffer.byteLength(JSON.stringify(value), 'utf8') > MAX_BYTES) fail('SNAPSHOT_TOO_LARGE');
}

function creationTime(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?Z$/.test(value)) {
    fail('INVALID_CREATED_AT');
  }
  const ms = Date.parse(value);
  if (!Number.isFinite(ms) || new Date(ms).toISOString().slice(0, 19) !== value.slice(0, 19)) {
    fail('INVALID_CREATED_AT');
  }
  return ms;
}

const levelKey = (profile, road) => `psygames_sudoku_level_${profile}${road === 'normal' ? '' : `_${road}`}`;
const bestKey = (profile, road) => `psygames_sudoku_best_${profile}${road === 'normal' ? '' : `_${road}`}`;

function readLevel(data, key, fallback = 1) {
  if (!Object.hasOwn(data, key)) return fallback;
  // Do not normalize malformed numbers or silently destroy potentially higher data.
  const raw = data[key];
  if (!/^[1-9]\d*$/.test(raw) || !Number.isSafeInteger(Number(raw))) fail('INVALID_LEVEL');
  return Number(raw);
}

function effective(data, profile, road) {
  return Math.max(...ROADS.slice(ROADS.indexOf(road)).map(r => readLevel(data, levelKey(profile, r))));
}

function inspectResume(data, profile, snapshotTime) {
  const key = `psygames_resume_sudoku_${profile}`;
  const result = { key, status: 'absent', reasons: [], choiceRequired: false, choices: [] };
  if (!Object.hasOwn(data, key)) return result;
  let env;
  try { env = JSON.parse(data[key]); } catch { env = undefined; }
  if (env === null) return result; // Legacy explicit empty slot; preserve the bytes.
  result.status = 'preserved';
  // ResumeStore v4 is opaque except for the routing/age/level fields. This is
  // NOT validation that the board can actually be restored on either client.
  if (!env || typeof env !== 'object' || Array.isArray(env) || env.v !== 4 ||
      !Number.isSafeInteger(env.savedAt) || env.savedAt < 0 || !env.state ||
      typeof env.state !== 'object' || Array.isArray(env.state)) {
    result.reasons.push('uninspectable-resume');
  } else {
    if (snapshotTime - env.savedAt > 30 * 24 * 60 * 60 * 1000) result.reasons.push('expired-at-snapshot');
    if (env.savedAt > snapshotTime) result.reasons.push('future-resume-time');
    const state = env.state;
    if (state.mode === 'levels') {
      const road = state.road ?? 'normal'; // Native legacy fallback.
      if (!ROADS.includes(road) || !Number.isSafeInteger(state.level) || state.level < 1) {
        result.reasons.push('uninspectable-resume');
      } else {
        if (state.level !== effective(data, profile, road)) result.reasons.push('level-mismatch');
        const preferred = data[`psygames_sudoku_road_${profile}`] ?? 'normal';
        if (road !== preferred) result.reasons.push('route-mismatch');
      }
    } else if (!['free', 'killer', 'towers', 'unequal'].includes(state.mode)) {
      result.reasons.push('uninspectable-resume');
    }
  }
  if (result.reasons.length) {
    result.status = 'restore-or-restart-choice-needed';
    result.choiceRequired = true;
    result.choices = ['restore', 'restart'];
  }
  return result;
}

function prepare(row, expected) {
  exact(expected, ['owner_id', 'issuer', 'app_id', 'revision', 'profile', 'road', 'targetLevel']);
  record(row);
  for (const key of ['owner_id', 'issuer']) {
    const v = expected[key];
    if (typeof v !== 'string' || v.length < 1 || v.length > 2048 || /\s/.test(v)) fail('INVALID_EXPECTATION');
  }
  if (expected.app_id !== 'psygames' || !Number.isSafeInteger(expected.revision) || expected.revision < 1 ||
      typeof expected.profile !== 'string' || !/^[a-z][a-z0-9-]{0,63}$/.test(expected.profile) ||
      !ROADS.includes(expected.road) || !Number.isSafeInteger(expected.targetLevel) ||
      expected.targetLevel < 1 || expected.targetLevel > MAX_TARGET_LEVEL) fail('INVALID_EXPECTATION');
  for (const key of ['owner_id', 'issuer', 'app_id', 'revision']) {
    if (!Object.hasOwn(row, key) || row[key] !== expected[key]) fail('SCOPE_OR_REVISION_MISMATCH');
  }
  if (!Object.hasOwn(row, 'payload')) fail('INVALID_SHAPE');
  const payload = row.payload;
  exact(payload, ['schema', 'data']);
  if (payload.schema !== 1) fail('INVALID_SCHEMA');
  const snapshot = payload.data;
  exact(snapshot, ['schema', 'createdAt', 'data']);
  if (snapshot.schema !== 1) fail('INVALID_SCHEMA');
  const time = creationTime(snapshot.createdAt);
  record(snapshot.data);
  const entries = Object.entries(snapshot.data);
  if (entries.length > MAX_ENTRIES) fail('TOO_MANY_ENTRIES');
  for (const [key, value] of entries) {
    if (!portableKey(key) || typeof value !== 'string') fail('NON_PORTABLE_DATA');
  }
  checkSize(payload); // Ecosystem envelope (stricter than inner CloudSnapshot).
  const data = Object.fromEntries(entries);
  const { profile, road, targetLevel } = expected;
  const beforeLevels = Object.fromEntries(ROADS.map(r => [r, effective(data, profile, r)]));
  const own = readLevel(data, levelKey(profile, road));
  const reached = readLevel(data, bestKey(profile, road), 1);
  const changes = [];
  function raise(key, value, beforeNumber) {
    if (value <= beforeNumber) return;
    const before = Object.hasOwn(data, key) ? data[key] : null;
    data[key] = String(value);
    changes.push({ key, before, after: data[key] });
  }
  raise(levelKey(profile, road), Math.max(own, targetLevel), own);
  // SudokuRoadStore / LevelLadder.best is the highest REACHED (selectable)
  // level, NOT the leaderboard's highest COMPLETED level. Never alter the
  // leaderboard, stars, solved counts, fail streaks, practice or resume records.
  raise(bestKey(profile, road), Math.max(reached, effective(data, profile, road)), reached);
  if (Object.keys(data).length > MAX_ENTRIES) fail('TOO_MANY_ENTRIES');
  const candidatePayload = { schema: 1, data: { schema: 1, createdAt: snapshot.createdAt, data } };
  checkSize(candidatePayload);
  return {
    candidatePayload,
    baseRevision: expected.revision,
    changes,
    summary: {
      profile, road, targetLevel, changedKeyCount: changes.length,
      effectiveLevelsBefore: beforeLevels,
      effectiveLevelsAfter: Object.fromEntries(ROADS.map(r => [r, effective(data, profile, r)])),
    },
    resume: inspectResume(data, profile, time),
  };
}

export function prepareSudokuCorrection(row, expected) {
  try {
    return prepare(row, expected);
  } catch (error) {
    // No input keys, values, identifiers, JSON fragments, causes or parser
    // diagnostics are ever exposed. Includes exotic/non-JSON caller objects.
    if (internalErrors.has(error)) throw error;
    fail('INVALID_INPUT');
  }
}
