import test from 'node:test';
import assert from 'node:assert/strict';
import { AccountDeletionAdapter, ACCOUNT_DELETE_ADAPTER_VERSION } from './adapter.ts';
import type { AccountDeletionHost } from './adapter.ts';
import {
  AccountDeleteError, createNativeDeleteReferenceSender, NATIVE_DELETE_COMMAND,
  NATIVE_DELETE_HTTP, NATIVE_DELETE_VERSION,
} from './native_contract.ts';
import type {
  AccountIdentity, DeletionLease, DeleteErrorCode, NativeDeleteInvoke,
  NativeDeleteRequest, NativeDeleteResult,
} from './native_contract.ts';

const OWNER = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';
const EXPECTED: AccountIdentity = { issuer: 'https://authority.invalid/auth/v1', accountId: OWNER };
const LEASE: DeletionLease = { ...EXPECTED, appId: 'typerighting', generation: 7, leaseId: 'native_lease_00000007' };
const CONFIRM = { confirmAllApps: true };
const SECRET = 'PRIVATE_JWT_OR_UPSTREAM_BODY_MUST_NOT_ESCAPE';
const binding = (lease = LEASE) => ({ version: NATIVE_DELETE_VERSION,
  leaseId: lease.leaseId, generation: lease.generation });
const ack = (lease = LEASE): NativeDeleteResult => ({ ...binding(lease),
  kind: 'response', status: 200, ack: 'ACCOUNT_DELETED' });
const request = (): NativeDeleteRequest => ({ version: NATIVE_DELETE_VERSION, lease: { ...LEASE } });
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
}
async function rejectsCode(action: Promise<unknown>, code: DeleteErrorCode) {
  await assert.rejects(action, error => {
    assert.ok(error instanceof AccountDeleteError);
    assert.equal(error.code, code);
    assert.equal(error.message, code);
    assert.equal(error.cause, undefined);
    assert.ok(!JSON.stringify(error).includes(SECRET));
    assert.ok(!String(error.stack).includes(SECRET));
    return true;
  });
}

/** Deterministic HOST DOUBLE, not a native implementation/credential SDK. */
class Host implements AccountDeletionHost {
  lease = { ...LEASE };
  active = true;
  refresh = true;
  reserved = new Set<string>();
  events: string[] = [];
  captures = 0;
  removals = 0;
  credentialOwner: string | null = OWNER;
  ackB = false;
  fenceFailure = false;
  retirementFailure = false;
  retirementGate?: ReturnType<typeof deferred<void>>;
  retirementStarted = deferred<void>();
  lane: Promise<void> = Promise.resolve();
  captureHook?: () => void;
  capture(_expected: AccountIdentity): DeletionLease | null {
    this.captures++;
    this.captureHook?.();
    return this.active ? this.lease : null;
  }
  owns(lease: DeletionLease): boolean {
    return this.lease.leaseId === lease.leaseId && this.lease.generation === lease.generation &&
      this.lease.issuer === lease.issuer && this.lease.accountId === lease.accountId &&
      this.lease.appId === lease.appId;
  }
  fence(lease: DeletionLease): void {
    if (!this.owns(lease) || !this.active || this.reserved.has(lease.leaseId)) throw Error(SECRET);
    this.reserved.add(lease.leaseId);
    this.events.push('fence');
    this.active = false;
    this.refresh = false;
    if (this.fenceFailure) throw Error(SECRET);
  }
  retainedRest(): () => boolean {
    const oldLease = { ...this.lease };
    return () => this.active && this.owns(oldLease) && !this.reserved.has(oldLease.leaseId);
  }
  retire(lease: DeletionLease): Promise<'retired' | 'superseded'> {
    this.events.push('retire-queued');
    const operation = this.lane.then(async (): Promise<'retired' | 'superseded'> => {
      if (!this.owns(lease)) { this.events.push('retire-skipped'); return 'superseded'; }
      this.events.push('retire-started');
      this.retirementStarted.resolve();
      if (this.retirementGate) await this.retirementGate.promise;
      if (this.retirementFailure) throw Error(SECRET);
      // Model an OS removal already started: B's write must be AFTER it in the lane.
      this.credentialOwner = null;
      this.removals++;
      this.events.push('retire-settled');
      return this.owns(lease) ? 'retired' : 'superseded';
    });
    this.lane = operation.then(() => {}, () => {});
    return operation;
  }
  signInB(): Promise<void> {
    this.lease = { ...LEASE, accountId: OTHER, generation: 8, leaseId: 'native_lease_00000008' };
    this.active = true;
    const write = this.lane.then(() => {
      this.credentialOwner = OTHER;
      this.ackB = true;
      this.events.push('B-ack');
    });
    this.lane = write;
    return write;
  }
}

function fixture(invoke?: NativeDeleteInvoke) {
  const host = new Host();
  const calls: NativeDeleteRequest[] = [];
  const sender = createNativeDeleteReferenceSender(async (command, input, signal) => {
    assert.equal(command, NATIVE_DELETE_COMMAND);
    assert.equal(host.refresh, false);
    assert.ok(host.reserved.has(input.lease.leaseId));
    host.events.push('native-started');
    calls.push(input);
    return invoke ? await invoke(command, input, signal) : ack(input.lease);
  });
  return { host, calls, sender, adapter: new AccountDeletionAdapter(host, sender) };
}

test('inert construction, versions and fixed wire policy; no native availability claim', () => {
  const { host, calls } = fixture();
  assert.equal(ACCOUNT_DELETE_ADAPTER_VERSION, 'ecosystem.account-delete.ts/1');
  assert.equal(NATIVE_DELETE_VERSION, 'ecosystem.account-delete.native/1');
  assert.equal(host.captures, 0);
  assert.deepEqual(calls, []);
  assert.deepEqual(host.events, []);
  assert.equal(NATIVE_DELETE_HTTP.path, '/functions/v1/ecosystem-account-delete');
  assert.equal(NATIVE_DELETE_HTTP.method, 'POST');
  assert.deepEqual(JSON.parse(NATIVE_DELETE_HTTP.body), { confirm: 'DELETE_ACCOUNT', scope: 'all_ecosystem_apps' });
  assert.equal(NATIVE_DELETE_HTTP.originHeader, 'forbidden');
  assert.equal(NATIVE_DELETE_HTTP.redirect, 'error');
  assert.equal(NATIVE_DELETE_HTTP.deadlineMs, 70000);
  assert.equal(NATIVE_DELETE_HTTP.maxRequestBytes, 1024);
  assert.equal(NATIVE_DELETE_HTTP.maxResponseBytes, 1024);
  assert.ok(Object.isFrozen(NATIVE_DELETE_HTTP));
});

test('confirmation false and pre-aborted calls do not touch host, HTTP or credentials', async () => {
  const { host, adapter, calls } = fixture();
  await rejectsCode(adapter.deleteAccount(EXPECTED, { confirmAllApps: false }), 'CONFIRMATION_REQUIRED');
  const abort = new AbortController(); abort.abort(SECRET);
  await rejectsCode(adapter.deleteAccount(EXPECTED, CONFIRM, abort.signal), 'ABORTED');
  assert.equal(host.captures, 0);
  assert.deepEqual(host.events, []);
  assert.equal(host.credentialOwner, OWNER);
  assert.equal(calls.length, 0);
  // Guards did not consume the adapter.
  await adapter.deleteAccount(EXPECTED, CONFIRM);
});

test('abort during read-only capture still causes no fence or retirement', async () => {
  const { host, adapter, calls } = fixture();
  const abort = new AbortController(); host.captureHook = () => abort.abort();
  await rejectsCode(adapter.deleteAccount(EXPECTED, CONFIRM, abort.signal), 'ABORTED');
  assert.deepEqual(host.events, []);
  assert.equal(calls.length, 0);
});

test('wrong expected owner/issuer cannot fence or dispatch', async () => {
  for (const expected of [{ ...EXPECTED, accountId: OTHER },
    { ...EXPECTED, issuer: 'https://other.invalid/auth/v1' }]) {
    const { host, adapter, calls } = fixture();
    await rejectsCode(adapter.deleteAccount(expected, CONFIRM), 'ACCOUNT_CHANGED');
    assert.deepEqual(host.events, []); assert.equal(calls.length, 0);
  }
});

test('inactive/unavailable host and capture errors are bounded with no dispatch', async () => {
  const f = fixture(); f.host.active = false;
  await rejectsCode(f.adapter.deleteAccount(EXPECTED, CONFIRM), 'UNAVAILABLE');
  const unavailable = new AccountDeletionAdapter({ ...f.host,
    capture() { throw Error(SECRET); }, owns: () => false,
    fence() { assert.fail(); }, retire() { assert.fail(); },
  }, f.sender);
  await rejectsCode(unavailable.deleteAccount(EXPECTED, CONFIRM), 'UNAVAILABLE');
  assert.equal(f.calls.length, 0);
});

test('synchronous fence precedes native dispatch; only current ACK plus retirement succeeds', async () => {
  const { host, adapter, calls } = fixture();
  await adapter.deleteAccount(EXPECTED, CONFIRM);
  assert.deepEqual(host.events, ['fence', 'native-started', 'retire-queued', 'retire-started', 'retire-settled']);
  assert.deepEqual(calls, [request()]);
  assert.ok(Object.isFrozen(calls[0])); assert.ok(Object.isFrozen(calls[0].lease));
  assert.equal(host.credentialOwner, null);
  assert.equal(host.removals, 1);
});

test('retained REST remains permanently fenced even after B login', async () => {
  const { host, adapter } = fixture();
  const retained = host.retainedRest(); assert.equal(retained(), true);
  await adapter.deleteAccount(EXPECTED, CONFIRM);
  assert.equal(retained(), false);
  await host.signInB();
  assert.equal(retained(), false);
  assert.equal(host.retainedRest()(), true);
});

test('fence failure dispatches nothing, but fail-closed retirement still settles', async () => {
  const { host, adapter, calls } = fixture(); host.fenceFailure = true;
  await rejectsCode(adapter.deleteAccount(EXPECTED, CONFIRM), 'UNAVAILABLE');
  assert.equal(calls.length, 0); assert.equal(host.removals, 1);
  assert.equal(host.refresh, false);
});

test('an async void fence is rejected/drained; cannot dispatch before it finishes', async () => {
  const f = fixture(), pending = deferred<void>(), original = f.host.fence.bind(f.host);
  f.host.fence = async lease => { await pending.promise; original(lease); };
  const operation = rejectsCode(f.adapter.deleteAccount(EXPECTED, CONFIRM), 'UNAVAILABLE');
  await Promise.resolve();
  assert.equal(f.calls.length, 0); assert.equal(f.host.removals, 0);
  pending.resolve(); await operation;
  assert.equal(f.calls.length, 0); assert.equal(f.host.removals, 1);
});

test('an in-flight, successful or failed attempt cannot be replayed', async () => {
  for (const fail of [false, true]) {
    const pending = deferred<unknown>();
    const { adapter, host, calls } = fixture(async () => pending.promise);
    const first = adapter.deleteAccount(EXPECTED, CONFIRM);
    const checked = fail ? rejectsCode(first, 'SIGN_IN_REQUIRED') : first;
    await rejectsCode(adapter.deleteAccount(EXPECTED, CONFIRM), 'OFF');
    pending.resolve(fail ? { ...binding(), kind: 'failed', reason: 'TRANSPORT' } : ack());
    await checked;
    await rejectsCode(adapter.deleteAccount(EXPECTED, CONFIRM), 'OFF');
    assert.equal(calls.length, 1); assert.equal(host.removals, 1);
    const replacement = new AccountDeletionAdapter(host, fixture().sender);
    await rejectsCode(replacement.deleteAccount(EXPECTED, CONFIRM), 'UNAVAILABLE');
  }
});

test('native exception or broken sender is ambiguous and never leaks diagnostic', async () => {
  const f = fixture(async () => { throw new Error(SECRET); });
  await rejectsCode(f.adapter.deleteAccount(EXPECTED, CONFIRM), 'SIGN_IN_REQUIRED');
  assert.equal(f.host.credentialOwner, null);
  const host = new Host();
  const adapter = new AccountDeletionAdapter(host, async () => { throw { code: SECRET, cause: SECRET }; });
  await rejectsCode(adapter.deleteAccount(EXPECTED, CONFIRM), 'SIGN_IN_REQUIRED');
  assert.equal(host.removals, 1);
});

for (const [name, result] of [
  ['wrong code', { ...ack(), ack: 'UNCONFIRMED' }],
  ['202', { ...ack(), status: 202 }], ['204', { ...ack(), status: 204 }],
  ['401', { ...ack(), status: 401 }], ['503', { ...ack(), status: 503 }],
  ['network failure', { ...binding(), kind: 'failed', reason: 'TRANSPORT' }],
  ['cancelled', { ...binding(), kind: 'cancelled', reason: 'ABORTED' }],
  ['deadline', { ...binding(), kind: 'cancelled', reason: 'DEADLINE' }],
  ['wrong handle', { ...ack(), leaseId: 'native_lease_00000099' }],
  ['wrong generation', { ...ack(), generation: 8 }],
  ['wrong version', { ...ack(), version: 'unknown' }],
  ['unknown code', { ...ack(), ack: SECRET }],
  ['missing status', { ...binding(), kind: 'response', ack: 'ACCOUNT_DELETED' }],
  ['extra body', { ...ack(), body: SECRET }], ['string', SECRET], ['null', null],
] as const) {
  test(`only exact ACK is success; ${name} retires A and requires fresh sign-in`, async () => {
    const { host, adapter } = fixture(async () => result);
    await rejectsCode(adapter.deleteAccount(EXPECTED, CONFIRM), 'SIGN_IN_REQUIRED');
    assert.equal(host.credentialOwner, null); assert.equal(host.removals, 1);
  });
}

for (const reason of ['ABORTED', 'DEADLINE'] as const) {
  test(`${reason}: await actual native cancellation, then await actual retirement`, async () => {
    const cancellationStarted = deferred<void>(), nativeStopped = deferred<void>();
    const abort = new AbortController();
    let nativeStillRunning = true;
    const f = fixture(async (_command, input, signal) => {
      // Fake native's own deadline/cancel lifecycle, NOT an adapter timer.
      signal.addEventListener('abort', () => cancellationStarted.resolve(), { once: true });
      if (reason === 'DEADLINE') cancellationStarted.resolve();
      await nativeStopped.promise;
      nativeStillRunning = false;
      return { ...binding(input.lease), kind: 'cancelled', reason };
    });
    f.host.retirementGate = deferred<void>();
    let settled = false;
    const operation = rejectsCode(f.adapter.deleteAccount(EXPECTED, CONFIRM, abort.signal), 'SIGN_IN_REQUIRED')
      .then(() => { settled = true; });
    if (reason === 'ABORTED') abort.abort(SECRET);
    await cancellationStarted.promise;
    assert.equal(nativeStillRunning, true); assert.equal(settled, false);
    assert.equal(f.host.events.includes('retire-queued'), false);
    nativeStopped.resolve();
    await f.host.retirementStarted.promise;
    assert.equal(nativeStillRunning, false); assert.equal(settled, false);
    f.host.retirementGate.resolve();
    await operation;
    assert.equal(f.host.removals, 1); assert.equal(settled, true);
  });
}

test('late 200 ACK after abort is not success, even if HTTP completed', async () => {
  const pending = deferred<unknown>(); const abort = new AbortController();
  const f = fixture(async () => pending.promise);
  const outcome = rejectsCode(f.adapter.deleteAccount(EXPECTED, CONFIRM, abort.signal), 'SIGN_IN_REQUIRED');
  abort.abort(); pending.resolve(ack()); await outcome;
  assert.equal(f.host.removals, 1);
});

test('never-settling sender does NOT manufacture completion or retirement', async () => {
  const pending = deferred<unknown>(); const abort = new AbortController();
  const f = fixture(async () => pending.promise);
  let settled = false;
  const operation = rejectsCode(f.adapter.deleteAccount(EXPECTED, CONFIRM, abort.signal), 'SIGN_IN_REQUIRED')
    .then(() => { settled = true; });
  abort.abort(); await Promise.resolve(); await Promise.resolve();
  assert.equal(settled, false); assert.equal(f.host.removals, 0);
  // Release fixture; a real broken host remains fenced/pending and is NOT accepted.
  pending.resolve({ ...binding(), kind: 'cancelled', reason: 'ABORTED' });
  await operation;
});

test('late A HTTP ACK cannot clear already committed B or ACK on its behalf', async () => {
  const pending = deferred<unknown>();
  const f = fixture(async () => pending.promise);
  const operation = rejectsCode(f.adapter.deleteAccount(EXPECTED, CONFIRM), 'ACCOUNT_CHANGED');
  await f.host.signInB();
  pending.resolve(ack()); await operation;
  assert.equal(f.host.credentialOwner, OTHER); assert.equal(f.host.removals, 0);
  assert.equal(f.host.active, true);
  assert.ok(f.host.events.includes('retire-skipped'));
});

test('slow started A removal drains BEFORE B credential ACK, never after it', async () => {
  const f = fixture(); f.host.retirementGate = deferred<void>();
  const operation = rejectsCode(f.adapter.deleteAccount(EXPECTED, CONFIRM), 'ACCOUNT_CHANGED');
  await f.host.retirementStarted.promise;
  const newer = f.host.signInB();
  await Promise.resolve(); assert.equal(f.host.ackB, false);
  f.host.retirementGate.resolve();
  await Promise.all([operation, newer]);
  assert.equal(f.host.credentialOwner, OTHER); assert.equal(f.host.ackB, true);
  assert.ok(f.host.events.indexOf('retire-settled') < f.host.events.indexOf('B-ack'));
});

test('retirement failure/invalid ACK never resolves success or poisons successor lane', async () => {
  const f = fixture(); f.host.retirementFailure = true;
  await rejectsCode(f.adapter.deleteAccount(EXPECTED, CONFIRM), 'RETIREMENT_FAILED');
  assert.equal(f.host.active, false); assert.equal(f.host.refresh, false);
  await f.host.signInB(); assert.equal(f.host.credentialOwner, OTHER);
  const host = new Host();
  host.retire = async () => 'not-a-retirement' as 'retired';
  await rejectsCode(new AccountDeletionAdapter(host, async () => ack()).deleteAccount(EXPECTED, CONFIRM), 'RETIREMENT_FAILED');
});

for (const [name, forged] of [
  ['URL', { ...request(), url: 'https://attacker.invalid' }],
  ['endpoint', { ...request(), path: '/functions/v1/other' }],
  ['method', { ...request(), method: 'GET' }],
  ['body', { ...request(), body: { user_id: OTHER } }],
  ['headers', { ...request(), headers: { Authorization: SECRET, Origin: 'null' } }],
  ['JWT', { ...request(), accessToken: SECRET }],
  ['command', { ...request(), command: 'generic_fetch' }],
  ['deadline override', { ...request(), deadlineMs: 1 }],
  ['nested target', { ...request(), lease: { ...LEASE, target: OTHER } }],
  ['version', { ...request(), version: 'future' }],
  ['null', null], ['array', []],
] as const) {
  test(`strict native request rejects forged ${name} before invocation`, async () => {
    let invoked = 0;
    const send = createNativeDeleteReferenceSender(async () => { invoked++; return ack(); });
    await rejectsCode(send(forged as unknown as NativeDeleteRequest, new AbortController().signal), 'INVALID_INPUT');
    assert.equal(invoked, 0);
  });
}

test('strict envelopes reject getters, hidden/symbol fields, inherited data and throwing proxies', async () => {
  let getterCalls = 0, invoked = 0;
  const getter = request();
  Object.defineProperty(getter, 'lease', { enumerable: true, get() { getterCalls++; throw Error(SECRET); } });
  const hidden = request(); Object.defineProperty(hidden, 'url', { value: SECRET });
  const symbol = request(); Object.defineProperty(symbol, Symbol('secret'), { value: SECRET });
  const proxy = new Proxy({}, { getPrototypeOf() { throw Error(SECRET); } });
  const inherited = Object.create(request());
  const send = createNativeDeleteReferenceSender(async () => { invoked++; return ack(); });
  for (const forged of [getter, hidden, symbol, proxy, inherited]) {
    await rejectsCode(send(forged as NativeDeleteRequest, new AbortController().signal), 'INVALID_INPUT');
  }
  assert.equal(getterCalls, 0); assert.equal(invoked, 0);
});

test('strict public inputs reject coercions and arbitrary options without host mutation', async () => {
  const f = fixture();
  for (const expected of [
    { ...EXPECTED, issuer: 'http://authority.invalid/auth/v1' },
    { ...EXPECTED, issuer: SECRET }, { ...EXPECTED, issuer: `${EXPECTED.issuer}?q=1` },
    { ...EXPECTED, issuer: 'https://user:pass@authority.invalid/auth/v1' },
    { ...EXPECTED, accountId: '' }, { ...EXPECTED, accountId: `${OWNER}\n` },
    { ...EXPECTED, target: OTHER },
  ]) await rejectsCode(f.adapter.deleteAccount(expected as AccountIdentity, CONFIRM), 'INVALID_INPUT');
  for (const options of [{ confirmAllApps: 'true' }, { confirmAllApps: 1 },
    { confirmAllApps: true, headers: { Authorization: SECRET } }, {}]) {
    await rejectsCode(f.adapter.deleteAccount(EXPECTED, options as typeof CONFIRM), 'INVALID_INPUT');
  }
  assert.deepEqual(f.host.events, []); assert.equal(f.host.captures, 0);
});

test('forged AbortSignal and shadow getters cannot leak diagnostics or fake cancellation', async () => {
  const f = fixture();
  await rejectsCode(f.adapter.deleteAccount(EXPECTED, CONFIRM,
    Object.create(AbortSignal.prototype) as AbortSignal), 'INVALID_INPUT');
  assert.equal(f.host.captures, 0);
  const abort = new AbortController(); let getterCalls = 0;
  Object.defineProperty(abort.signal, 'aborted', { get() { getterCalls++; throw Error(SECRET); } });
  await f.adapter.deleteAccount(EXPECTED, CONFIRM, abort.signal);
  assert.equal(getterCalls, 0);
});

test('malformed host leases and forged/native result accessors fail closed', async () => {
  for (const lease of [
    { ...LEASE, generation: 0 }, { ...LEASE, generation: 1.5 },
    { ...LEASE, generation: Number.MAX_SAFE_INTEGER + 1 },
    { ...LEASE, leaseId: '' }, { ...LEASE, leaseId: `${LEASE.leaseId}\n` },
    { ...LEASE, appId: 'foreign' },
    { ...LEASE, headers: { Authorization: SECRET } },
  ]) {
    const f = fixture(); f.host.lease = lease as DeletionLease;
    await rejectsCode(f.adapter.deleteAccount(EXPECTED, CONFIRM), 'UNAVAILABLE');
    assert.deepEqual(f.host.events, []); assert.equal(f.calls.length, 0);
  }
  let getterCalls = 0;
  const result = ack();
  Object.defineProperty(result, 'ack', { enumerable: true, get() { getterCalls++; throw Error(SECRET); } });
  const f = fixture(async () => result);
  await rejectsCode(f.adapter.deleteAccount(EXPECTED, CONFIRM), 'SIGN_IN_REQUIRED');
  assert.equal(getterCalls, 0); assert.equal(f.host.removals, 1);
});

test('reference bridge detaches/freezes exact input and forwards the original cancellation signal', async () => {
  const input = request(), abort = new AbortController();
  const pending = deferred<unknown>(); let received: NativeDeleteRequest | undefined;
  const sender = createNativeDeleteReferenceSender(async (command, data, signal) => {
    assert.equal(command, NATIVE_DELETE_COMMAND); assert.equal(signal, abort.signal);
    received = data; return pending.promise;
  });
  const operation = sender(input, abort.signal);
  (input.lease as { accountId: string }).accountId = OTHER;
  assert.equal(received?.lease.accountId, OWNER);
  assert.ok(Object.isFrozen(received)); assert.ok(Object.isFrozen(received?.lease));
  pending.resolve(ack()); await operation;
});

test('no snapshot, history read, hidden resume or local gameplay deletion surface', async () => {
  const local = Object.freeze({ history: 'opaque', wallet: '98', pet: 'keep', progress: '42' });
  const f = fixture(); await f.adapter.deleteAccount(EXPECTED, CONFIRM);
  assert.deepEqual(local, { history: 'opaque', wallet: '98', pet: 'keep', progress: '42' });
  assert.deepEqual(Object.getOwnPropertyNames(AccountDeletionAdapter.prototype).sort(), ['constructor', 'deleteAccount']);
  assert.equal(f.calls.length, 1);
});
