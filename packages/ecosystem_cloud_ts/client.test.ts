import test from 'node:test';
import assert from 'node:assert/strict';
import { CloudError, EcosystemCloudClient, MAX_PAYLOAD_BYTES } from './client.ts';
import type { AppId, AuthedTransport, ErrorCode, Payload, PayloadValidator, ReadonlyPayload, Session, TransportRequest } from './client.ts';

const OWNER = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';
const ID = '33333333-3333-4333-8333-333333333333';
const REQUEST = '44444444-4444-4444-8444-444444444444';
const ISSUER = 'https://authority.example/issuer';
const DATE = '2026-10-16T01:02:03.123456+00:00';
const PAYLOAD: Payload = { schema: 1, data: { arbitraryHostField: [1, 'yes', null, { nested: true }] } };
const OPTIONS = { baseRevision: 1, requestId: REQUEST };
const consent = (enabled = true, app: AppId = 'typerighting') =>
  ({ owner_id: OWNER, app_id: app, issuer: ISSUER, policy_version: 1 as const, enabled });
const metadata = (revision = 7) => ({ id: ID, request_id: REQUEST, revision, created_at: DATE });
const snapshot = (app: AppId = 'typerighting') =>
  ({ ...metadata(), owner_id: OWNER, app_id: app, base_revision: 1, payload: PAYLOAD });
type Reply = { status: number; body: unknown };
type Step = Reply | Error | ((request: TransportRequest) => Reply | Promise<Reply>);
const ok = (body: unknown, status = 200): Reply => ({ status, body });

class FakeTransport implements AuthedTransport {
  current: Session | null = { accountId: OWNER, issuer: ISSUER };
  sessionCalls = 0;
  suspensions = 0;
  calls: TransportRequest[] = [];
  steps: Step[] = [];
  session(): Session | null { this.sessionCalls++; return this.current; }
  suspend(): void { this.suspensions++; }
  async request(request: TransportRequest): Promise<Reply> {
    this.calls.push(structuredClone(request));
    const step = this.steps.shift();
    if (!step) throw new Error('Unexpected request; PRIVATE transport diagnostic');
    if (step instanceof Error) throw step;
    return typeof step === 'function' ? await step(request) : step;
  }
}

// Fixture-only acceptance; production hosts must inject their actual privacy/schema allowlist.
function make(app: AppId = 'typerighting', history = true, validatePayload: PayloadValidator = () => true) {
  const transport = new FakeTransport();
  const client = new EcosystemCloudClient({ appId: app, expectedOwner: OWNER, expectedIssuer: ISSUER, transport, validatePayload });
  if (history) client.allowHistoryRead();
  return { client, transport };
}
async function grant(client: EcosystemCloudClient, transport: FakeTransport, app: AppId = 'typerighting') {
  transport.steps.push(ok([consent(true, app)], 201));
  await client.acceptConsent();
}
async function rejectsCode(action: Promise<unknown> | (() => unknown), code: ErrorCode) {
  const verify = (error: unknown) => {
    assert.ok(error instanceof CloudError);
    assert.equal(error.code, code);
    assert.equal(error.message, code);
    assert.equal(error.cause, undefined);
    assert.ok(!JSON.stringify(error).includes('PRIVATE'));
    return true;
  };
  if (typeof action === 'function') assert.throws(action, verify);
  else await assert.rejects(action, verify);
}
function url(request: TransportRequest) { return new URL(request.path, 'https://postgrest.invalid'); }
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
}
function assertDeepFrozen(value: unknown): void {
  if (typeof value !== 'object' || value === null) return;
  assert.equal(Object.isFrozen(value), true);
  for (const child of Object.values(value)) assertDeepFrozen(child);
}

test('host payload validator is mandatory, without constructor transport/validator calls', async () => {
  const transport = new FakeTransport();
  await rejectsCode(() => new EcosystemCloudClient({
    appId: 'typerighting', expectedOwner: OWNER, expectedIssuer: ISSUER, transport,
  } as unknown as ConstructorParameters<typeof EcosystemCloudClient>[0]), 'INVALID_PAYLOAD');
  let invoked = false;
  make('typerighting', false, () => { invoked = true; return true; });
  assert.equal(invoked, false);
  assert.equal(transport.sessionCalls, 0);
  assert.deepEqual(transport.calls, []);
});

for (const direction of ['outgoing', 'download'] as const) {
  test(`host privacy allowlist rejects ${direction} on a deeply frozen copy; no POST`, async () => {
    let seen: ReadonlyPayload | undefined;
    const { client, transport } = make('typerighting', true, payload => {
      seen = payload;
      return Object.keys(payload.data).every(key => key === 'allowed');
    });
    const forbidden: Payload = { schema: 1, data: { allowed: [{ nested: true }], private: 'PRIVATE host data' } };
    if (direction === 'outgoing') {
      await grant(client, transport);
      transport.calls.length = 0; // Consent setup completed; only examine the rejected save.
      await rejectsCode(client.save(forbidden, OPTIONS), 'INVALID_PAYLOAD');
      assert.deepEqual(transport.calls, []); // No consent GET and no snapshot POST.
    } else {
      transport.steps.push(ok([{ ...snapshot(), payload: forbidden }]));
      await rejectsCode(client.download(ID), 'INVALID_PAYLOAD');
      assert.equal(transport.calls.length, 1);
      assert.equal(transport.calls[0]!.method, 'GET');
    }
    assert.ok(seen);
    assertDeepFrozen(seen);
    assert.notEqual(seen, forbidden);
    assert.equal(Object.isFrozen(forbidden.data), false);
    assert.equal(Reflect.set(seen.data as object, 'private', 'altered'), false);
    assert.equal(seen.data.private, 'PRIVATE host data');
  });

  test(`host validator exception on ${direction} is bounded INVALID_PAYLOAD without diagnostics`, async () => {
    const { client, transport } = make('typerighting', true, () => { throw new Error('PRIVATE host diagnostic'); });
    if (direction === 'outgoing') {
      await grant(client, transport);
      transport.calls.length = 0;
      await rejectsCode(client.save(PAYLOAD, OPTIONS), 'INVALID_PAYLOAD');
      assert.deepEqual(transport.calls, []);
    } else {
      transport.steps.push(ok([snapshot()]));
      await rejectsCode(client.download(ID), 'INVALID_PAYLOAD');
    }
  });
}

for (const app of ['typerighting', 'abstract-hub'] as const) {
  test(`${app}: existing inner snapshot stays wrapped, validator approves exact frozen outgoing/downloaded data`, async () => {
    const data: Payload['data'] = app === 'typerighting'
      ? { schema: 1, appId: app, values: { progress: [1, 2] } }
      : { schema: 1, app_id: app, data: { progress: [1, 2] } };
    const payload: Payload = { schema: 1, data };
    const seen: ReadonlyPayload[] = [];
    const { client, transport } = make(app, true, candidate => {
      seen.push(candidate);
      const appKey = app === 'typerighting' ? 'appId' : 'app_id';
      return candidate.data.schema === 1 && candidate.data[appKey] === app;
    });
    await grant(client, transport, app);
    transport.steps.push(ok([consent(true, app)]), request => {
      assert.equal((request.body as { payload: unknown }).payload, seen[0]);
      assertDeepFrozen(seen[0]);
      return ok([metadata()], 201);
    });
    await client.save(payload, OPTIONS);
    transport.steps.push(ok([{ ...snapshot(app), payload }]));
    const downloaded = await client.download(ID);
    assert.equal(seen.length, 2);
    assert.equal(downloaded.payload, seen[1]);
    assertDeepFrozen(downloaded.payload);
    assert.deepEqual(downloaded.payload, payload);
    assert.equal(Object.isFrozen(payload), false);
  });
}

test('host validator must return literal true, not a truthy non-boolean', async () => {
  const { client, transport } = make('typerighting', true, (() => 'true') as unknown as PayloadValidator);
  await grant(client, transport);
  transport.calls.length = 0;
  await rejectsCode(client.save(PAYLOAD, OPTIONS), 'INVALID_PAYLOAD');
  assert.deepEqual(transport.calls, []);
});

test('common malformed envelope is rejected before invoking the host validator', async () => {
  let invoked = false;
  const { client, transport } = make('typerighting', true, () => { invoked = true; return true; });
  await grant(client, transport);
  await rejectsCode(client.save({ schema: 2, data: {} } as unknown as Payload, OPTIONS), 'INVALID_PAYLOAD');
  assert.equal(invoked, false);
  assert.equal(transport.calls.length, 1);
});

for (const direction of ['outgoing', 'download'] as const) {
  test(`${direction}: validator cannot bypass identity guards by changing the bound session`, async () => {
    const { client, transport } = make('typerighting', true, () => {
      transport.current = { accountId: OWNER, issuer: 'https://other.invalid' };
      return true;
    });
    if (direction === 'outgoing') {
      await grant(client, transport);
      transport.calls.length = 0;
      await rejectsCode(client.save(PAYLOAD, OPTIONS), 'ACCOUNT_CHANGED');
      assert.deepEqual(transport.calls, []);
    } else {
      transport.steps.push(ok([snapshot()]));
      await rejectsCode(client.download(ID), 'ACCOUNT_CHANGED');
    }
    assert.equal(transport.suspensions, 1);
  });
}

test('constructor/OFF are inert: no session lookup, network, auth, or automatic consent', async () => {
  const { client, transport } = make('typerighting', false);
  assert.equal(transport.sessionCalls, 0);
  const operations = [
    () => client.getConsent(), () => client.acceptConsent(), () => client.listVersions(),
    () => client.download(ID), () => client.save(PAYLOAD, OPTIONS),
    () => client.revokeConsent(), () => client.deleteCopies(),
  ];
  for (const action of operations) await rejectsCode(action(), 'OFF');
  assert.equal(transport.sessionCalls, 0);
  assert.deepEqual(transport.calls, []);
  assert.equal(transport.suspensions, 0);
});

test('history permission is explicit and does not itself make requests or allow upload', async () => {
  const { client, transport } = make('typerighting', false);
  client.allowHistoryRead();
  assert.equal(transport.sessionCalls, 1);
  await rejectsCode(client.save(PAYLOAD, OPTIONS), 'CONSENT_REQUIRED');
  assert.deepEqual(transport.calls, []);
});

test('reading a previous enabled server consent never grants this host upload permission', async () => {
  const { client, transport } = make();
  transport.steps.push(ok([consent()]));
  assert.deepEqual(await client.getConsent(), consent());
  await rejectsCode(client.save(PAYLOAD, OPTIONS), 'CONSENT_REQUIRED');
  assert.equal(transport.calls.length, 1);
});

test('history/preview works without upload consent and returns opaque host data unchanged', async () => {
  const { client, transport } = make();
  transport.steps.push(ok([]), ok([metadata()]), ok([snapshot()]));
  assert.equal(await client.getConsent(), null);
  assert.deepEqual(await client.listVersions(), [metadata()]);
  const downloaded = await client.download(ID);
  assert.deepEqual(downloaded, snapshot());
  assert.notEqual(downloaded.payload, PAYLOAD);
  assert.ok(transport.calls.every(call => call.method === 'GET'));
});

test('explicit consent upsert has exact scope, policy and Prefer; server owns timestamps', async () => {
  const { client, transport } = make();
  await grant(client, transport);
  const call = transport.calls[0]!;
  assert.equal(call.method, 'POST');
  assert.equal(url(call).pathname, '/ecosystem_app_consents');
  assert.equal(url(call).searchParams.get('on_conflict'), 'owner_id,app_id');
  assert.equal(url(call).searchParams.get('select'), 'owner_id,app_id,issuer,policy_version,enabled');
  assert.deepEqual(call.headers, { Prefer: 'resolution=merge-duplicates,return=representation' });
  assert.deepEqual(call.body, consent());
});

for (const app of ['psygames', 'smart-alarm', 'abstract-hub', 'typerighting'] as const) {
  test(`${app}: EVERY request retains owner/app filters, including POST and DELETE`, async () => {
    const { client, transport } = make(app);
    await grant(client, transport, app);
    transport.steps.push(ok([consent(true, app)]), ok([metadata()], 201));
    assert.deepEqual(await client.save(PAYLOAD, OPTIONS), metadata());
    transport.steps.push(ok([metadata()]), ok([snapshot(app)]), ok([consent(false, app)]), ok([consent(false, app)]), ok([]));
    await client.listVersions();
    await client.download(ID);
    await client.revokeConsent();
    await client.deleteCopies();
    for (const call of transport.calls) {
      assert.equal(url(call).searchParams.get('owner_id'), `eq.${OWNER}`);
      assert.equal(url(call).searchParams.get('app_id'), `eq.${app}`);
      assert.ok(!JSON.stringify(call).includes('Authorization'));
    }
    const list = transport.calls.find(call => url(call).searchParams.get('limit') === '10')!;
    assert.equal(url(list).searchParams.get('select'), 'id,request_id,revision,created_at');
    assert.equal(url(list).searchParams.get('order'), 'revision.desc');
    const download = transport.calls.find(call => url(call).searchParams.has('id'))!;
    assert.equal(url(download).searchParams.get('id'), `eq.${ID}`);
    assert.equal(url(download).searchParams.get('limit'), '1');
    const insert = transport.calls.find(call => url(call).pathname.endsWith('snapshots') && call.method === 'POST')!;
    assert.deepEqual(insert.body, { owner_id: OWNER, app_id: app, request_id: REQUEST, base_revision: 1, payload: PAYLOAD });
    assert.deepEqual(insert.headers, { Prefer: 'return=representation' });
    assert.equal(transport.steps.length, 0);
  });
}

test('opaque global revisions: base 1 accepts revision 7 after interleaved app/owner writes', async () => {
  const { client, transport } = make();
  await grant(client, transport);
  transport.steps.push(ok([consent()]), ok([metadata(7)], 201));
  assert.equal((await client.save(PAYLOAD, OPTIONS)).revision, 7);
  transport.steps.push(ok([metadata(23), { ...metadata(7), id: OTHER, request_id: OTHER }]), ok([snapshot()]));
  assert.deepEqual((await client.listVersions()).map(row => row.revision), [23, 7]);
  assert.equal((await client.download(ID)).revision, 7);
});

for (const [serverCode, expected] of [['40001', 'CONFLICT'], ['23505', 'INVALID_PAYLOAD']] as const) {
  test(`${serverCode}: ${expected} is bounded, never retried or assigned a new request id`, async () => {
    const { client, transport } = make();
    await grant(client, transport);
    transport.steps.push(ok([consent()]), { status: serverCode === '40001' ? 400 : 409, body: { code: serverCode, message: 'PRIVATE cloud_revision_conflict', details: PAYLOAD } });
    await rejectsCode(client.save(PAYLOAD, OPTIONS), expected);
    assert.equal(transport.calls.filter(call => call.method === 'POST' && url(call).pathname.endsWith('snapshots')).length, 1);
    assert.equal(transport.calls.length, 3);
  });
}

test('retained exact retry: empty POST response leads only to scoped request-id metadata GET', async () => {
  const { client, transport } = make();
  await grant(client, transport);
  transport.steps.push(ok([consent()]), ok([]), ok([metadata(7)]));
  assert.deepEqual(await client.save(PAYLOAD, OPTIONS), metadata(7));
  const last = transport.calls.at(-1)!;
  assert.equal(last.method, 'GET');
  assert.equal(url(last).searchParams.get('request_id'), `eq.${REQUEST}`);
  assert.equal(url(last).searchParams.get('owner_id'), `eq.${OWNER}`);
  assert.equal(url(last).searchParams.get('app_id'), 'eq.typerighting');
  assert.equal(url(last).searchParams.get('select'), 'id,request_id,revision,created_at');
  assert.equal(transport.calls.filter(call => call.method === 'POST').length, 2); // consent + ONE snapshot
});

test('retained retry no longer available: NOT_FOUND, no permanent idempotency claim', async () => {
  const { client, transport } = make();
  await grant(client, transport);
  transport.steps.push(ok([consent()]), ok([]), ok([]));
  await rejectsCode(client.save(PAYLOAD, OPTIONS), 'NOT_FOUND');
  assert.equal(transport.calls.length, 4);
});

test('same request id with changed payload: server 23505 surfaces INVALID_PAYLOAD without replay', async () => {
  const { client, transport } = make();
  await grant(client, transport);
  transport.steps.push(ok([consent()]), ok([metadata()], 201));
  await client.save(PAYLOAD, OPTIONS);
  transport.steps.push(ok([consent()]), { status: 409, body: { code: '23505', message: 'cloud_request_reused', details: 'PRIVATE mismatch' } });
  await rejectsCode(client.save({ schema: 1, data: { changed: true } }, OPTIONS), 'INVALID_PAYLOAD');
  assert.equal(transport.calls.filter(call => url(call).pathname.endsWith('snapshots')).length, 2);
});

test('server revocation blocks upload even with a previous host grant', async () => {
  const { client, transport } = make();
  await grant(client, transport);
  transport.steps.push(ok([consent(false)]));
  await rejectsCode(client.save(PAYLOAD, OPTIONS), 'CONSENT_REQUIRED');
  assert.equal(transport.calls.length, 2);
  await rejectsCode(client.save(PAYLOAD, OPTIONS), 'CONSENT_REQUIRED');
  assert.equal(transport.calls.length, 2);
});

for (const field of ['accountId', 'issuer'] as const) {
  test(`initial ${field} mismatch fails closed and revokes transport`, async () => {
    const { client, transport } = make('typerighting', false);
    transport.current = { accountId: OWNER, issuer: ISSUER, [field]: field === 'accountId' ? OTHER : 'https://other.invalid' };
    await rejectsCode(() => client.allowHistoryRead(), 'ACCOUNT_CHANGED');
    assert.equal(transport.suspensions, 1);
    assert.deepEqual(transport.calls, []);
  });
}

type PendingCase = {
  name: string; grant?: boolean; prefix?: Reply[];
  run: (client: EcosystemCloudClient) => Promise<unknown>;
};
const pendingCases: PendingCase[] = [
  { name: 'getConsent', run: c => c.getConsent() },
  { name: 'listVersions', run: c => c.listVersions() },
  { name: 'download', run: c => c.download(ID) },
  { name: 'acceptConsent', run: c => c.acceptConsent() },
  { name: 'revokeConsent', run: c => c.revokeConsent() },
  { name: 'deleteCopies revoke phase', run: c => c.deleteCopies() },
  { name: 'deleteCopies DELETE phase', prefix: [ok([consent(false)])], run: c => c.deleteCopies() },
  { name: 'save consent read', grant: true, run: c => c.save(PAYLOAD, OPTIONS) },
  { name: 'save insert', grant: true, prefix: [ok([consent()])], run: c => c.save(PAYLOAD, OPTIONS) },
  { name: 'save retained lookup', grant: true, prefix: [ok([consent()]), ok([])], run: c => c.save(PAYLOAD, OPTIONS) },
];
for (const scenario of pendingCases) {
  for (const change of ['suspend', 'accountId', 'issuer'] as const) {
    test(`${scenario.name}: reject late result after ${change}, without subsequent requests`, async () => {
      const { client, transport } = make();
      if (scenario.grant) await grant(client, transport);
      const entered = deferred<void>();
      const response = deferred<Reply>();
      transport.steps.push(...(scenario.prefix ?? []), () => { entered.resolve(); return response.promise; });
      const operation = scenario.run(client);
      await entered.promise;
      const calls = transport.calls.length;
      if (change === 'suspend') client.suspend();
      else transport.current = { accountId: OWNER, issuer: ISSUER, [change]: change === 'accountId' ? OTHER : 'https://other.invalid' };
      response.resolve(ok([]));
      await rejectsCode(operation, change === 'suspend' ? 'OFF' : 'ACCOUNT_CHANGED');
      assert.equal(transport.calls.length, calls);
      assert.equal(transport.suspensions, 1);
      await rejectsCode(client.listVersions(), 'OFF');
    });
  }
}

test('late transport rejection after suspend stays OFF, not a leaked transport error', async () => {
  const { client, transport } = make();
  transport.steps.push(() => { client.suspend(); throw new Error('PRIVATE jwt'); });
  await rejectsCode(client.listVersions(), 'OFF');
});

// Exercise switches in the microtask gaps between an inner helper's response
// check and its caller's continuation, not only while the network is pending.
for (const [name, run, checks] of [
  ['history', (c: EcosystemCloudClient) => c.listVersions(), [1]],
  ['consent', (c: EcosystemCloudClient) => c.acceptConsent(), [1, 2]],
  ['save consent read', (c: EcosystemCloudClient) => c.save(PAYLOAD, OPTIONS), [1, 2]],
  ['delete revocation', (c: EcosystemCloudClient) => c.deleteCopies(), [1, 2]],
] as const) {
  for (const switchAfter of checks) {
    test(`${name}: recheck identity after helper await boundary ${switchAfter}`, async () => {
      const { client, transport } = make();
      if (name === 'save consent read') await grant(client, transport);
      let replied = false;
      let postReplyChecks = 0;
      const originalSession = transport.session.bind(transport);
      transport.session = () => {
        const current = originalSession();
        if (replied && ++postReplyChecks === switchAfter) {
          queueMicrotask(() => { transport.current = { accountId: OWNER, issuer: 'https://switched.invalid' }; });
        }
        return current;
      };
      transport.steps.push(() => { replied = true; return ok([consent(name !== 'delete revocation')]); });
      const calls = transport.calls.length;
      await rejectsCode(run(client), 'ACCOUNT_CHANGED');
      assert.equal(transport.calls.length, calls + 1);
      assert.equal(transport.suspensions, 1);
    });
  }
}

test('session lookup failure is bounded ACCOUNT_CHANGED and revokes the capability', async () => {
  const { client, transport } = make();
  transport.session = () => { throw new Error('PRIVATE vault detail'); };
  await rejectsCode(client.listVersions(), 'ACCOUNT_CHANGED');
  assert.equal(transport.suspensions, 1);
  assert.deepEqual(transport.calls, []);
});

test('transport suspension failure surfaces NETWORK while keeping the connector OFF', async () => {
  const { client, transport } = make();
  transport.suspend = () => { throw new Error('PRIVATE capability detail'); };
  await rejectsCode(() => client.suspend(), 'NETWORK');
  await rejectsCode(client.listVersions(), 'OFF');
  assert.deepEqual(transport.calls, []);
});

test('suspend is local/terminal: no server revocation, deletion, or implicit re-enable', async () => {
  const { client, transport } = make();
  client.suspend();
  assert.equal(transport.suspensions, 1);
  assert.deepEqual(transport.calls, []);
  await rejectsCode(() => client.allowHistoryRead(), 'OFF');
  await rejectsCode(client.deleteCopies(), 'OFF');
});

test('account deletion is unavailable even OFF, without any fabricated request', async () => {
  const { client, transport } = make('typerighting', false);
  await rejectsCode(client.deleteAccount(), 'UNAVAILABLE');
  assert.deepEqual(transport.calls, []);
});

test('explicit deletion first confirms disabled server consent, then deletes only scoped copies', async () => {
  const { client, transport } = make();
  const local = structuredClone(PAYLOAD);
  transport.steps.push(ok([consent(false)], 201), request => {
    assert.equal(transport.calls[0]!.method, 'POST');
    assert.deepEqual(transport.calls[0]!.body, consent(false));
    assert.equal(request.method, 'DELETE');
    return ok([metadata()]);
  });
  assert.equal(await client.deleteCopies(), undefined);
  assert.deepEqual(local, PAYLOAD);
  assert.equal(transport.calls.length, 2);
  assert.deepEqual(transport.calls[1]!.headers, { Prefer: 'return=representation' });
  await rejectsCode(client.save(PAYLOAD, OPTIONS), 'CONSENT_REQUIRED');
});

for (const phase of ['revocation', 'deletion'] as const) {
  for (const failure of [new Error('PRIVATE network token'), { status: 503, body: { message: 'PRIVATE server info' } }]) {
    test(`deleteCopies ${phase} failure: NETWORK, no false success, no local data change`, async () => {
      const { client, transport } = make();
      await grant(client, transport);
      const local = structuredClone(PAYLOAD);
      transport.steps.push(...(phase === 'deletion' ? [ok([consent(false)])] : []), failure);
      await rejectsCode(client.deleteCopies(), 'NETWORK');
      assert.deepEqual(local, PAYLOAD);
      assert.equal(transport.calls.filter(call => call.method === 'DELETE').length, phase === 'deletion' ? 1 : 0);
      await rejectsCode(client.save(PAYLOAD, OPTIONS), 'CONSENT_REQUIRED');
    });
  }
}

test('malformed revocation confirmation prevents DELETE', async () => {
  const { client, transport } = make();
  transport.steps.push(ok([consent(true)]));
  await rejectsCode(client.deleteCopies(), 'INVALID_PAYLOAD');
  assert.equal(transport.calls.length, 1);
});

test('revokeConsent alone does not delete and requires fresh explicit acceptance to upload', async () => {
  const { client, transport } = make();
  await grant(client, transport);
  transport.steps.push(ok([consent(false)]));
  assert.equal((await client.revokeConsent()).enabled, false);
  await rejectsCode(client.save(PAYLOAD, OPTIONS), 'CONSENT_REQUIRED');
  assert.ok(transport.calls.every(call => call.method === 'POST'));
  await grant(client, transport);
  transport.steps.push(ok([consent()]), ok([metadata()], 201));
  await client.save(PAYLOAD, OPTIONS);
});

const malformedConsent: unknown[] = [null, {}, [null], [consent(), consent()],
  [{ ...consent(), owner_id: OTHER }], [{ ...consent(), app_id: 'psygames' }],
  [{ ...consent(), issuer: 'other' }], [{ ...consent(), policy_version: 2 }],
  [{ ...consent(), enabled: 'true' }]];
for (const [index, body] of malformedConsent.entries()) {
  test(`malformed/foreign consent envelope ${index} rejected without upload`, async () => {
    const { client, transport } = make();
    transport.steps.push(ok(body));
    await rejectsCode(client.acceptConsent(), 'INVALID_PAYLOAD');
    await rejectsCode(client.save(PAYLOAD, OPTIONS), 'CONSENT_REQUIRED');
    assert.equal(transport.calls.length, 1);
  });
}

const malformedMetadata: unknown[] = [null, {}, [null], [{ ...metadata(), id: 'x' }],
  [{ ...metadata(), request_id: 'x' }], [{ ...metadata(), revision: 0 }],
  [{ ...metadata(), revision: 1.5 }], [{ ...metadata(), revision: Number.MAX_SAFE_INTEGER + 1 }],
  [{ ...metadata(), created_at: '2026-02-30T00:00:00Z' }],
  [{ ...metadata(), created_at: '2026-10-16T01:02:03+05:00' }],
  [{ ...metadata(), owner_id: OTHER }], [{ ...metadata(), app_id: 'psygames' }],
  [metadata(), metadata()], Array(11).fill(metadata()),
  [metadata(7), { ...metadata(23), id: OTHER, request_id: OTHER }]];
for (const [index, body] of malformedMetadata.entries()) {
  test(`malformed metadata envelope ${index} rejected`, async () => {
    const { client, transport } = make();
    transport.steps.push(ok(body));
    await rejectsCode(client.listVersions(), 'INVALID_PAYLOAD');
  });
}

for (const row of [
  { ...snapshot(), id: OTHER }, { ...snapshot(), owner_id: OTHER },
  { ...snapshot(), app_id: 'psygames' }, { ...snapshot(), base_revision: -1 },
  { ...snapshot(), payload: { schema: 2, data: {} } },
  { ...snapshot(), payload: { schema: 1, data: [] } },
]) {
  test(`malformed/foreign download rejected: ${JSON.stringify(Object.keys(row))}`, async () => {
    const { client, transport } = make();
    transport.steps.push(ok([row]));
    await rejectsCode(client.download(ID), 'INVALID_PAYLOAD');
  });
}

test('missing download is NOT_FOUND; invalid ids are rejected before request', async () => {
  const { client, transport } = make();
  await rejectsCode(client.download('invalid'), 'INVALID_PAYLOAD');
  assert.deepEqual(transport.calls, []);
  transport.steps.push(ok([]));
  await rejectsCode(client.download(ID), 'NOT_FOUND');
});

for (const retry of [false, true]) {
  for (const bad of [metadata(1), metadata(0), { ...metadata(), request_id: OTHER }, null]) {
    test(`save validates exact request id and revision > base, including retained=${retry}`, async () => {
      const { client, transport } = make();
      await grant(client, transport);
      transport.steps.push(ok([consent()]), ...(retry ? [ok([])] : []), ok([bad]));
      await rejectsCode(client.save(PAYLOAD, OPTIONS), 'INVALID_PAYLOAD');
    });
  }
}

test('payload UTF-8 limit applies to the complete schema/data envelope: exact 5 MiB accepted', async () => {
  const { client, transport } = make();
  await grant(client, transport);
  const overhead = new TextEncoder().encode(JSON.stringify({ schema: 1, data: { text: '' } })).byteLength;
  const exact: Payload = { schema: 1, data: { text: 'a'.repeat(MAX_PAYLOAD_BYTES - overhead) } };
  assert.equal(new TextEncoder().encode(JSON.stringify(exact)).byteLength, MAX_PAYLOAD_BYTES);
  transport.steps.push(ok([consent()]), ok([metadata()], 201));
  await client.save(exact, OPTIONS);
  const calls = transport.calls.length;
  await rejectsCode(client.save({ schema: 1, data: { text: (exact.data.text as string) + 'a' } }, OPTIONS), 'INVALID_PAYLOAD');
  assert.equal(transport.calls.length, calls);
  await rejectsCode(client.save({ schema: 1, data: { text: 'я'.repeat(Math.floor(MAX_PAYLOAD_BYTES / 2)) } }, OPTIONS), 'INVALID_PAYLOAD');
  assert.equal(transport.calls.length, calls);
});

test('oversized download is rejected too', async () => {
  const { client, transport } = make();
  transport.steps.push(ok([{ ...snapshot(), payload: { schema: 1, data: { text: 'x'.repeat(MAX_PAYLOAD_BYTES) } } }]));
  await rejectsCode(client.download(ID), 'INVALID_PAYLOAD');
});

test('reject non-JSON/lossy payloads, cycles and accessors without invoking getters', async () => {
  const { client, transport } = make();
  await grant(client, transport);
  const cycle: Record<string, unknown> = {}; cycle.self = cycle;
  let invoked = false;
  const accessor = { schema: 1, get data() { invoked = true; return {}; } };
  const invalid = [null, {}, { schema: 1, data: [] }, { schema: 2, data: {} },
    { schema: 1, data: {}, extra: true }, { schema: 1, data: { x: undefined } },
    { schema: 1, data: { x: NaN } }, { schema: 1, data: { x: Infinity } },
    { schema: 1, data: { x: 1n } }, { schema: 1, data: { x: () => 1 } },
    { schema: 1, data: { x: Symbol('x') } }, { schema: 1, data: { x: new Date() } },
    { schema: 1, data: cycle }, { schema: 1, data: { x: Array(2) } }, accessor];
  for (const payload of invalid) await rejectsCode(client.save(payload as Payload, OPTIONS), 'INVALID_PAYLOAD');
  assert.equal(invoked, false);
  assert.equal(transport.calls.length, 1);
});

test('payload and options are captured before awaiting server consent', async () => {
  const { client, transport } = make();
  await grant(client, transport);
  const payload: Payload = { schema: 1, data: { value: 'original' } };
  const options = { ...OPTIONS };
  transport.steps.push(() => {
    payload.data.value = 'changed'; options.requestId = OTHER; options.baseRevision = 99;
    return ok([consent()]);
  }, ok([metadata()], 201));
  await client.save(payload, options);
  assert.deepEqual(transport.calls.at(-1)!.body, {
    owner_id: OWNER, app_id: 'typerighting', request_id: REQUEST, base_revision: 1,
    payload: { schema: 1, data: { value: 'original' } },
  });
});

test('invalid CAS options are rejected before any upload/consent read', async () => {
  const { client, transport } = make();
  await grant(client, transport);
  for (const baseRevision of [-1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER]) {
    await rejectsCode(client.save(PAYLOAD, { ...OPTIONS, baseRevision }), 'INVALID_PAYLOAD');
  }
  await rejectsCode(client.save(PAYLOAD, { ...OPTIONS, requestId: 'new-id' }), 'INVALID_PAYLOAD');
  assert.equal(transport.calls.length, 1);
});

test('concurrent mutations fail fast instead of queueing stale actions', async () => {
  const { client, transport } = make();
  const response = deferred<Reply>();
  transport.steps.push(() => response.promise);
  const pending = client.acceptConsent();
  await rejectsCode(client.save(PAYLOAD, OPTIONS), 'UNAVAILABLE');
  await rejectsCode(client.acceptConsent(), 'UNAVAILABLE');
  response.resolve(ok([consent()]));
  await pending;
  assert.equal(transport.calls.length, 1);
});

test('replacement connector stays busy after original OFF until the original transport promise settles', async () => {
  for (const settlement of ['resolve', 'reject'] as const) {
    const { client: original, transport: originalTransport } = make();
    await grant(original, originalTransport);
    const entered = deferred<void>();
    const response = deferred<Reply>();
    originalTransport.steps.push(ok([consent()]), async () => {
      entered.resolve();
      const reply = await response.promise;
      if (settlement === 'reject') throw new Error('PRIVATE original HTTP failure');
      return reply;
    });
    const pending = original.save(PAYLOAD, OPTIONS);
    await entered.promise; // Original snapshot POST is actually in flight.
    original.suspend();
    assert.equal(originalTransport.suspensions, 1);
    await rejectsCode(original.listVersions(), 'OFF');
    const { client: replacement, transport: replacementTransport } = make();
    await rejectsCode(replacement.revokeConsent(), 'UNAVAILABLE');
    await rejectsCode(replacement.deleteCopies(), 'UNAVAILABLE');
    await rejectsCode(replacement.acceptConsent(), 'UNAVAILABLE');
    await rejectsCode(replacement.save(PAYLOAD, OPTIONS), 'UNAVAILABLE');
    assert.equal(replacementTransport.calls.length, 0); // No fake server revocation/deletion.
    response.resolve(ok([metadata()], 201));
    await rejectsCode(pending, 'OFF');
    replacementTransport.steps.push(ok([consent(false)]));
    assert.equal((await replacement.revokeConsent()).enabled, false);
    assert.equal(replacementTransport.calls.length, 1); // Only after real transport settlement.
    assert.deepEqual(replacementTransport.calls[0]!.body, consent(false));
  }
});

test('shared mutation lane isolates distinct issuer/app/owner tuples', async () => {
  const { client: original, transport: originalTransport } = make();
  const response = deferred<Reply>();
  originalTransport.steps.push(() => response.promise);
  const pending = original.acceptConsent();
  try {
    for (const [issuer, appId, owner] of [
      ['https://other.invalid', 'typerighting', OWNER],
      [ISSUER, 'psygames', OWNER],
      [ISSUER, 'typerighting', OTHER],
    ] as const) {
      const transport = new FakeTransport();
      transport.current = { accountId: owner, issuer };
      const client = new EcosystemCloudClient({
        transport, appId, expectedOwner: owner, expectedIssuer: issuer, validatePayload: () => true,
      });
      client.allowHistoryRead();
      transport.steps.push(ok([{ ...consent(), owner_id: owner, app_id: appId, issuer }], 201));
      assert.equal((await client.acceptConsent()).enabled, true);
      assert.equal(transport.calls.length, 1);
    }
  } finally {
    response.resolve(ok([consent()], 201));
    await pending;
  }
});

test('busy revoke/delete withdraw local upload immediately and fence late accept without claiming server revocation', async () => {
  for (const revoke of [(c: EcosystemCloudClient) => c.revokeConsent(), (c: EcosystemCloudClient) => c.deleteCopies()]) {
    const { client, transport } = make();
    const response = deferred<Reply>();
    transport.steps.push(() => response.promise);
    const accepting = client.acceptConsent();
    await rejectsCode(revoke(client), 'UNAVAILABLE');
    response.resolve(ok([consent()])); // Server accept may have committed; local activation must not.
    await rejectsCode(accepting, 'CONSENT_REQUIRED');
    await rejectsCode(client.save(PAYLOAD, OPTIONS), 'CONSENT_REQUIRED');
    assert.equal(transport.calls.length, 1);
    assert.deepEqual(transport.calls[0]!.body, consent(true)); // No false server-revoke/deletion claim.
    await grant(client, transport); // Only a fresh explicit acceptance uses the new permission epoch.
    transport.steps.push(ok([consent()]), ok([metadata()], 201));
    await client.save(PAYLOAD, OPTIONS);
  }
});

test('NETWORK errors do not expose the transport exception; retry is host-owned', async () => {
  const { client, transport } = make();
  transport.steps.push(new Error('PRIVATE Authorization: Bearer secret'));
  await rejectsCode(client.listVersions(), 'NETWORK');
  assert.equal(transport.calls.length, 1);
});

for (const response of [null, {}, { status: '200', body: [] }, { status: 200 },
  { status: 99, body: [] }, { status: 204, body: null }, { status: 202, body: [] }]) {
  test(`invalid HTTP envelope/status rejected: ${JSON.stringify(response)}`, async () => {
    const { client, transport } = make();
    transport.steps.push(response as Reply);
    // FakeTransport uses an explicit function for null, which would otherwise be an absent step.
    if (response === null) transport.steps = [() => response as unknown as Reply];
    await rejectsCode(client.listVersions(), 'INVALID_PAYLOAD');
  });
}

for (const [status, expected] of [[401, 'CONSENT_REQUIRED'], [403, 'CONSENT_REQUIRED'],
  [404, 'NOT_FOUND'], [409, 'CONFLICT'], [500, 'UNAVAILABLE'], [503, 'NETWORK']] as const) {
  test(`HTTP ${status} has bounded structured code only`, async () => {
    const { client, transport } = make();
    transport.steps.push({ status, body: { message: 'PRIVATE JWT and server detail' } });
    await rejectsCode(client.listVersions(), expected);
  });
}

test('invalid app/owner/issuer configuration rejected without transport activity', async () => {
  const transport = new FakeTransport();
  for (const override of [{ appId: 'private-app' }, { expectedOwner: 'not-uuid' },
    { expectedIssuer: '' }, { expectedIssuer: ' whitespace ' }]) {
    await rejectsCode(() => new EcosystemCloudClient({
      appId: 'typerighting', expectedOwner: OWNER, expectedIssuer: ISSUER, transport,
      validatePayload: () => true,
      ...override,
    } as ConstructorParameters<typeof EcosystemCloudClient>[0]), 'INVALID_PAYLOAD');
  }
  assert.equal(transport.sessionCalls, 0);
  assert.deepEqual(transport.calls, []);
});
