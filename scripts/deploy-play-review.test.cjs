'use strict';

// Execute the real deployment entry point, including main(), in an isolated VM.
// No googleapis dependency, credentials, AAB, filesystem writes or HTTP calls.
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');
const vm = require('node:vm');

const scriptPath = path.resolve(__dirname, '../.github/scripts/deploy_play.js');
const source = readFileSync(scriptPath, 'utf8');
const packageName = 'com.psygames.app';
const ownEditId = 'synthetic-edit-owned-by-this-run';
const versionCode = '2056999';
const aabPath = '/synthetic/no-file-is-opened/app.aab';

class SimulatedExit extends Error {
  constructor(code) {
    super(`simulated process.exit(${code})`);
    this.code = code;
  }
}

async function execute({ promotion = false, reviewConflict = false, cleanupFails = false } = {}) {
  const calls = [];
  const logs = [];
  const errors = [];
  const reads = [];
  const syntheticBody = Object.freeze({ syntheticAabStream: true });
  const record = (method, params) => {
    // Snapshot foreign-realm objects so later mutations cannot hide a fallback.
    calls.push({ method, params: JSON.parse(JSON.stringify(params)) });
  };
  const edits = Object.freeze({
    insert: async (params) => {
      record('insert', params);
      return { data: { id: ownEditId } };
    },
    bundles: Object.freeze({
      upload: async (params) => {
        record('upload', params);
        assert.equal(params.media.body, syntheticBody);
        return { data: { versionCode } };
      },
    }),
    tracks: Object.freeze({
      update: async (params) => {
        record('track', params);
        return { data: {} };
      },
    }),
    commit: async (params) => {
      record('commit', params);
      if (reviewConflict && calls.filter((call) => call.method === 'commit').length === 1) {
        const error = new Error('You already have changes in review.');
        error.response = { data: { error: {
          code: 400,
          status: 'FAILED_PRECONDITION',
          message: 'You already have changes in review.',
          details: [{
            '@type': 'type.googleapis.com/google.rpc.ErrorInfo',
            reason: 'CHANGES_ALREADY_IN_REVIEW',
            domain: 'googleapis.com',
            metadata: { editId: ownEditId, method: 'edits.commit' },
          }],
        } } };
        throw error;
      }
      // Deliberately let any unsafe fallback succeed: tests must detect a second
      // commit, missing guard, or false success, not merely another mock error.
      return { data: { id: ownEditId } };
    },
    delete: async (params) => {
      record('delete', params);
      if (cleanupFails) throw new Error('synthetic own-edit cleanup failure');
      return { data: {} };
    },
  });
  const googleapis = Object.freeze({ google: Object.freeze({
    auth: Object.freeze({ GoogleAuth: class SyntheticGoogleAuth {} }),
    androidpublisher: (options) => {
      assert.equal(options.version, 'v3');
      return Object.freeze({ edits });
    },
  }) });
  const modules = new Map([
    ['googleapis', googleapis],
    ['fs', Object.freeze({ createReadStream: (file) => {
      reads.push(file);
      return syntheticBody;
    } })],
    ['path', Object.freeze({ ...path })],
    ['./whatsnew-notes', Object.freeze({
      extractNotes: () => ({ ru: ['Синтетическая заметка'], en: ['Synthetic note'] }),
      format: (items) => items.join('\n'),
      PLAY_NOTES_LIMIT: 500,
    })],
  ]);
  const sandbox = {
    require: (name) => {
      assert.ok(modules.has(name), `Unexpected module access: ${name}`);
      return modules.get(name);
    },
    console: Object.freeze({
      log: (...args) => logs.push(args.join(' ')),
      error: (...args) => errors.push(args.join(' ')),
    }),
    process: Object.freeze({
      // Never inherit process.env: only synthetic data enters the real script.
      env: Object.freeze({
        GOOGLE_PLAY_SA_JSON: '{}',
        VERSION_NAME: '2.56.999',
        PLAY_TRACKS: 'internal',
        AAB_PATH: aabPath,
        ...(promotion ? { PROMOTE_VERSION_CODE: versionCode } : {}),
      }),
      exit: (code) => { throw new SimulatedExit(code); },
    }),
  };
  let exitCode = null;
  try {
    // The unmodified source ends in main(); its completion value is the real
    // async deployment promise. No source regex replacement or exported shim.
    const completion = new vm.Script(source, { filename: scriptPath })
      .runInNewContext(sandbox, { timeout: 1000 });
    assert.ok(completion && typeof completion.then === 'function',
      'Deployment entry point must expose its executed async completion');
    await completion;
  } catch (error) {
    if (!(error instanceof SimulatedExit)) throw error;
    exitCode = error.code;
  }
  return { calls, logs, errors, reads, exitCode };
}

function assertProtectedCommit(result) {
  const commits = result.calls.filter((call) => call.method === 'commit');
  assert.equal(commits.length, 1, 'Exactly one commit; no fallback or retry');
  assert.deepEqual(commits[0].params, {
    packageName,
    editId: ownEditId,
    changesInReviewBehavior: 'ERROR_IF_IN_REVIEW',
  });
  for (const call of result.calls) {
    assert.equal(call.params.packageName, packageName);
    if (call.method !== 'insert') assert.equal(call.params.editId, ownEditId);
  }
}

test('ordinary upload commits with ERROR_IF_IN_REVIEW', async () => {
  const result = await execute();
  assertProtectedCommit(result);
  assert.deepEqual(result.calls.map((call) => call.method), ['insert', 'upload', 'track', 'commit']);
  assert.deepEqual(result.reads, [aabPath]);
  assert.deepEqual(result.calls.find((call) => call.method === 'track')
    .params.requestBody.releases[0].versionCodes, [versionCode]);
  assert.equal(result.exitCode, null);
  assert.equal(result.errors.length, 0);
  assert.equal(result.logs.filter((line) => line.startsWith('✅')).length, 1);
});

test('promotion commits with ERROR_IF_IN_REVIEW without reading or uploading an AAB', async () => {
  const result = await execute({ promotion: true });
  assertProtectedCommit(result);
  assert.deepEqual(result.calls.map((call) => call.method), ['insert', 'track', 'commit']);
  assert.deepEqual(result.reads, []);
  assert.deepEqual(result.calls.find((call) => call.method === 'track')
    .params.requestBody.releases[0].versionCodes, [versionCode]);
  assert.equal(result.exitCode, null);
  assert.equal(result.errors.length, 0);
  assert.equal(result.logs.filter((line) => line.startsWith('✅')).length, 1);
});

for (const promotion of [false, true]) {
  test(`${promotion ? 'promotion' : 'upload'} review conflict fails closed without retry or false success`, async () => {
    const result = await execute({ promotion, reviewConflict: true });
    assertProtectedCommit(result);
    assert.equal(result.exitCode, 1);
    assert.equal(result.logs.some((line) => line.includes('✅')), false);
    assert.ok(result.errors.some((line) => line.includes('CHANGES_ALREADY_IN_REVIEW')));
    const expected = promotion ? ['insert', 'track', 'commit'] : ['insert', 'upload', 'track', 'commit'];
    const cleanup = result.calls.filter((call) => call.method === 'delete');
    // Preserving the edit for a later explicit retry is also safe. If cleanup
    // occurs, it may only delete this invocation's edit, never a foreign review.
    assert.ok(cleanup.length <= 1, 'At most one own-edit cleanup');
    assert.deepEqual(result.calls.map((call) => call.method),
      [...expected, ...(cleanup.length ? ['delete'] : [])]);
    for (const call of cleanup) assert.deepEqual(call.params, { packageName, editId: ownEditId });
  });
}

test('review conflict stays unsuccessful even when own-edit cleanup fails', async () => {
  const result = await execute({ reviewConflict: true, cleanupFails: true });
  assertProtectedCommit(result);
  assert.equal(result.exitCode, 1);
  assert.equal(result.logs.some((line) => line.includes('✅')), false);
  assert.ok(result.errors.some((line) => line.includes('CHANGES_ALREADY_IN_REVIEW')));
  assert.ok(result.calls.filter((call) => call.method === 'delete').length <= 1);
});
