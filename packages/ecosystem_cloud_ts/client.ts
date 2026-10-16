/** Common cloud v1 connector. Authentication and all local application data stay in the host. */
export type AppId = 'psygames' | 'smart-alarm' | 'abstract-hub' | 'typerighting';
export type ErrorCode =
  | 'OFF' | 'ACCOUNT_CHANGED' | 'CONSENT_REQUIRED' | 'CONFLICT' | 'NOT_FOUND'
  | 'NETWORK' | 'INVALID_PAYLOAD' | 'UNAVAILABLE';

export class CloudError extends Error {
  readonly code: ErrorCode;
  constructor(code: ErrorCode) {
    // Never attach server bodies, transport errors, payloads, or credentials.
    super(code);
    this.name = 'CloudError';
    this.code = code;
  }
}

export interface Session { accountId: string; issuer: string }
export interface TransportRequest {
  method: 'GET' | 'POST' | 'DELETE';
  /** Relative to the host's configured PostgREST base, not an auth endpoint. */
  path: string;
  body?: unknown;
  headers?: Readonly<Record<string, string>>;
}
export interface AuthedTransport {
  /** Trusted, current authority-bound session; never a cached token decoder. */
  session(): Session | null;
  /** Settle on actual completion/cancellation, not a timeout that leaves HTTP running. */
  request(request: TransportRequest): Promise<{ status: number; body: unknown }>;
  /** Synchronously revoke this connector's transport capability. */
  suspend(): void;
}
export interface ClientOptions {
  appId: AppId;
  expectedOwner: string;
  expectedIssuer: string;
  transport: AuthedTransport;
  /** Required synchronous privacy/schema allowlist. Only literal true accepts. */
  validatePayload: PayloadValidator;
}
export type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };
export interface Payload { schema: 1; data: { [key: string]: JsonValue } }
export type ReadonlyJsonValue = null | boolean | number | string | readonly ReadonlyJsonValue[] | { readonly [key: string]: ReadonlyJsonValue };
export interface ReadonlyPayload { readonly schema: 1; readonly data: { readonly [key: string]: ReadonlyJsonValue } }
export type PayloadValidator = (payload: ReadonlyPayload) => boolean;
export interface Consent {
  owner_id: string;
  app_id: AppId;
  issuer: string;
  policy_version: 1;
  enabled: boolean;
}
export interface VersionMetadata {
  id: string;
  request_id: string;
  revision: number;
  created_at: string;
}
export interface Snapshot extends VersionMetadata {
  owner_id: string;
  app_id: AppId;
  base_revision: number;
  payload: ReadonlyPayload;
}
export interface SaveOptions { baseRevision: number; requestId: string }

export const MAX_PAYLOAD_BYTES = 5 * 1024 * 1024;
const APPS = new Set<string>(['psygames', 'smart-alarm', 'abstract-hub', 'typerighting']);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const META = 'id,request_id,revision,created_at';
const CONSENT = 'owner_id,app_id,issuer,policy_version,enabled';
const FULL = `${META},owner_id,app_id,base_revision,payload`;
// Shared by replacement connectors in this module instance, not across processes/devices.
const MUTATION_LANES = new Set<string>();
function fail(code: ErrorCode): never { throw new CloudError(code); }
const record = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);
const integer = (v: unknown): v is number => Number.isSafeInteger(v) && (v as number) >= 0;
const uuid = (v: unknown): v is string => typeof v === 'string' && UUID.test(v);

function utc(v: unknown): v is string {
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|\+00:00)$/.test(v)) return false;
  const ms = Date.parse(v);
  return Number.isFinite(ms) && new Date(ms).toISOString().slice(0, 19) === v.slice(0, 19);
}

/** Reject lossy/non-JSON values; do not call user toJSON methods or getters. */
function copyPayload(input: unknown): Payload {
  try {
    const ancestors = new Set<object>();
    const visit = (value: unknown): void => {
      if (value === null || typeof value === 'string' || typeof value === 'boolean') return;
      if (typeof value === 'number' && Number.isFinite(value)) return;
      if (typeof value !== 'object' || value === null || ancestors.has(value)) fail('INVALID_PAYLOAD');
      const object = value as object;
      const array = Array.isArray(object);
      if (array && Object.getPrototypeOf(object) !== Array.prototype) fail('INVALID_PAYLOAD');
      if (!array && Object.getPrototypeOf(object) !== Object.prototype && Object.getPrototypeOf(object) !== null) fail('INVALID_PAYLOAD');
      ancestors.add(object);
      const keys = Reflect.ownKeys(object);
      if (array && keys.length !== (object as unknown[]).length + 1) fail('INVALID_PAYLOAD');
      for (const key of keys) {
        if (array && key === 'length') continue;
        const descriptor = Object.getOwnPropertyDescriptor(object, key)!;
        if (typeof key !== 'string' || !descriptor.enumerable || !('value' in descriptor)) fail('INVALID_PAYLOAD');
        if (array && (!/^(0|[1-9]\d*)$/.test(key) || Number(key) >= (object as unknown[]).length)) fail('INVALID_PAYLOAD');
        visit(descriptor.value);
      }
      ancestors.delete(object);
    };
    visit(input);
    if (!record(input) || input.schema !== 1 || !record(input.data) ||
        Object.keys(input).length !== 2) return fail('INVALID_PAYLOAD');
    const encoded = JSON.stringify(input);
    if (new TextEncoder().encode(encoded).byteLength > MAX_PAYLOAD_BYTES) fail('INVALID_PAYLOAD');
    return JSON.parse(encoded) as Payload;
  } catch {
    return fail('INVALID_PAYLOAD');
  }
}

/** Only called on the detached, JSON-validated copy; nested objects/arrays freeze too. */
function freezePayload(payload: Payload): ReadonlyPayload {
  const pending: object[] = [payload];
  while (pending.length) {
    const value = pending.pop()!;
    for (const child of Object.values(value)) {
      if (typeof child === 'object' && child !== null) pending.push(child);
    }
    Object.freeze(value);
  }
  return payload;
}

export class EcosystemCloudClient {
  readonly #app: AppId;
  readonly #owner: string;
  readonly #issuer: string;
  readonly #transport: AuthedTransport;
  readonly #validatePayload: PayloadValidator;
  readonly #laneKey: string;
  #history = false;
  #upload = false;
  #stopped = false;
  #generation = 0;
  #permissionEpoch = 0;

  constructor(options: ClientOptions) {
    if (!APPS.has(options.appId) || !uuid(options.expectedOwner) ||
        typeof options.expectedIssuer !== 'string' || !options.expectedIssuer.trim() ||
        options.expectedIssuer !== options.expectedIssuer.trim() || options.expectedIssuer.length > 2048 ||
        typeof options.validatePayload !== 'function') fail('INVALID_PAYLOAD');
    this.#app = options.appId;
    this.#owner = options.expectedOwner;
    this.#issuer = options.expectedIssuer;
    this.#transport = options.transport;
    this.#validatePayload = options.validatePayload;
    this.#laneKey = JSON.stringify([this.#issuer, this.#app, this.#owner.toLowerCase()]);
    // Deliberately no transport/session/network call in the constructor.
  }

  /** Call only after login and the host's history/preview explanation. No upload grant. */
  allowHistoryRead(): void {
    if (this.#stopped) fail('OFF');
    this.#identity();
    this.#history = true;
  }

  /** Terminal for this instance. Does not revoke server consent or delete anything. */
  suspend(): void {
    this.#stop();
    try { this.#transport.suspend(); } catch { fail('NETWORK'); }
  }

  #stop(): void {
    this.#generation++;
    this.#permissionEpoch++;
    this.#history = false;
    this.#upload = false;
    this.#stopped = true;
  }

  #identity(): void {
    let session: Session | null;
    try { session = this.#transport.session(); } catch { session = null; }
    if (!session || session.accountId !== this.#owner || session.issuer !== this.#issuer) {
      this.#stop();
      try { this.#transport.suspend(); } catch { /* Preserve bounded identity error. */ }
      fail('ACCOUNT_CHANGED');
    }
  }

  #guard(generation: number): void {
    if (generation !== this.#generation || !this.#history || this.#stopped) fail('OFF');
    this.#identity();
  }

  #start(): number {
    const generation = this.#generation;
    this.#guard(generation);
    return generation;
  }

  #beginMutation(): number {
    const generation = this.#start();
    // Fail fast; never queue/replay uploads or consent changes behind another mutation.
    if (MUTATION_LANES.has(this.#laneKey)) fail('UNAVAILABLE');
    MUTATION_LANES.add(this.#laneKey);
    return generation;
  }

  #uploadGuard(generation: number): void {
    this.#guard(generation);
    if (!this.#upload) fail('CONSENT_REQUIRED');
  }

  #preparePayload(input: unknown, generation: number): ReadonlyPayload {
    const payload = freezePayload(copyPayload(input));
    let accepted = false;
    try { accepted = this.#validatePayload(payload) === true; }
    catch { /* Host validator diagnostics may contain private data; never expose them. */ }
    this.#guard(generation);
    if (!accepted) fail('INVALID_PAYLOAD');
    return payload;
  }

  #path(table: 'consents' | 'snapshots', fields: Record<string, string>): string {
    const query = new URLSearchParams({ owner_id: `eq.${this.#owner}`, app_id: `eq.${this.#app}`, ...fields });
    return `/ecosystem_app_${table}?${query.toString()}`;
  }

  async #request(generation: number, request: TransportRequest, deletion = false): Promise<unknown> {
    this.#guard(generation);
    let response: unknown;
    try { response = await this.#transport.request(request); }
    catch {
      this.#guard(generation);
      return fail('NETWORK');
    }
    this.#guard(generation);
    if (!record(response) || !Number.isInteger(response.status) ||
        (response.status as number) < 100 || (response.status as number) > 599 ||
        !Object.hasOwn(response, 'body')) fail('INVALID_PAYLOAD');
    const status = response.status as number;
    if (status < 200 || status >= 300) {
      if (deletion) fail('NETWORK');
      const code = record(response.body) ? response.body.code : undefined;
      if (status === 503) fail('NETWORK');
      if (code === '23505') fail('INVALID_PAYLOAD');
      if (status === 409 || code === '40001') fail('CONFLICT');
      if (status === 404) fail('NOT_FOUND');
      if (status === 401 || status === 403) { this.#upload = false; fail('CONSENT_REQUIRED'); }
      fail('UNAVAILABLE');
    }
    if (status !== 200 && !(request.method === 'POST' && status === 201)) fail('INVALID_PAYLOAD');
    return response.body;
  }

  #consent(body: unknown, enabled?: boolean): Consent | null {
    if (!Array.isArray(body) || body.length > 1) fail('INVALID_PAYLOAD');
    if (!body.length) {
      if (enabled !== undefined) fail('INVALID_PAYLOAD');
      return null;
    }
    const row: unknown = body[0];
    if (!record(row) || row.owner_id !== this.#owner || row.app_id !== this.#app ||
        row.issuer !== this.#issuer || row.policy_version !== 1 || typeof row.enabled !== 'boolean' ||
        (enabled !== undefined && row.enabled !== enabled)) fail('INVALID_PAYLOAD');
    return { owner_id: this.#owner, app_id: this.#app, issuer: this.#issuer, policy_version: 1, enabled: row.enabled as boolean };
  }

  #metadata(row: unknown): VersionMetadata {
    if (!record(row) || !uuid(row.id) || !uuid(row.request_id) ||
        !integer(row.revision) || row.revision < 1 || !utc(row.created_at)) fail('INVALID_PAYLOAD');
    // If extra ownership fields are present, they must not contradict the projection.
    if ((Object.hasOwn(row, 'owner_id') && row.owner_id !== this.#owner) ||
        (Object.hasOwn(row, 'app_id') && row.app_id !== this.#app)) fail('INVALID_PAYLOAD');
    return { id: row.id as string, request_id: row.request_id as string, revision: row.revision as number, created_at: row.created_at as string };
  }

  #versions(body: unknown, ordered: boolean): VersionMetadata[] {
    if (!Array.isArray(body) || body.length > 10) fail('INVALID_PAYLOAD');
    const versions = (body as unknown[]).map(row => this.#metadata(row));
    for (const key of ['id', 'request_id', 'revision'] as const) {
      if (new Set(versions.map(row => row[key])).size !== versions.length) fail('INVALID_PAYLOAD');
    }
    if (ordered && versions.some((row, i) => i > 0 && versions[i - 1]!.revision <= row.revision)) fail('INVALID_PAYLOAD');
    return versions;
  }

  async getConsent(): Promise<Consent | null> {
    const generation = this.#start();
    const body = await this.#request(generation, { method: 'GET', path: this.#path('consents', { select: CONSENT }) });
    this.#guard(generation);
    const consent = this.#consent(body);
    if (!consent?.enabled) this.#upload = false;
    // Merely reading a pre-existing enabled row never grants this host upload authority.
    return consent;
  }

  async #writeConsent(generation: number, enabled: boolean, deletion = false): Promise<Consent> {
    const body = await this.#request(generation, {
      method: 'POST',
      path: this.#path('consents', { on_conflict: 'owner_id,app_id', select: CONSENT }),
      headers: { Prefer: 'resolution=merge-duplicates,return=representation' },
      body: { owner_id: this.#owner, app_id: this.#app, issuer: this.#issuer, policy_version: 1, enabled },
    }, deletion);
    this.#guard(generation);
    return this.#consent(body, enabled)!;
  }

  /** Explicit host/user upload opt-in, not an automatic login hook. */
  async acceptConsent(): Promise<Consent> {
    const generation = this.#beginMutation();
    const permissionEpoch = this.#permissionEpoch;
    this.#upload = false;
    try {
      const consent = await this.#writeConsent(generation, true);
      this.#guard(generation);
      if (permissionEpoch !== this.#permissionEpoch) fail('CONSENT_REQUIRED');
      this.#upload = true;
      return consent;
    } finally { MUTATION_LANES.delete(this.#laneKey); }
  }

  async listVersions(): Promise<VersionMetadata[]> {
    const generation = this.#start();
    const body = await this.#request(generation, {
      method: 'GET', path: this.#path('snapshots', { select: META, order: 'revision.desc', limit: '10' }),
    });
    this.#guard(generation);
    return this.#versions(body, true);
  }

  /** Preview only: this never imports or merges anything into local host data. */
  async download(id: string): Promise<Snapshot> {
    const generation = this.#start();
    if (!uuid(id)) fail('INVALID_PAYLOAD');
    const body = await this.#request(generation, {
      method: 'GET', path: this.#path('snapshots', { id: `eq.${id}`, select: FULL, limit: '1' }),
    });
    this.#guard(generation);
    if (!Array.isArray(body) || body.length > 1) fail('INVALID_PAYLOAD');
    if (!body.length) fail('NOT_FOUND');
    const row: unknown = body[0];
    const metadata = this.#metadata(row);
    if (!record(row) || metadata.id !== id || row.owner_id !== this.#owner || row.app_id !== this.#app ||
        !integer(row.base_revision)) fail('INVALID_PAYLOAD');
    return { ...metadata, owner_id: this.#owner, app_id: this.#app,
      base_revision: row.base_revision as number, payload: this.#preparePayload(row.payload, generation) };
  }

  async save(payload: ReadonlyPayload, options: SaveOptions): Promise<VersionMetadata> {
    const generation = this.#beginMutation();
    try {
      this.#uploadGuard(generation);
      if (!options || !integer(options.baseRevision) || options.baseRevision === Number.MAX_SAFE_INTEGER || !uuid(options.requestId)) fail('INVALID_PAYLOAD');
      // Copy both the payload and options before any await; caller mutation cannot change a retry.
      const { baseRevision, requestId } = options;
      const copied = this.#preparePayload(payload, generation);
      const consent = await this.getConsent();
      this.#uploadGuard(generation);
      if (!consent?.enabled) fail('CONSENT_REQUIRED');
      const body = await this.#request(generation, {
        method: 'POST', path: this.#path('snapshots', { select: META }),
        headers: { Prefer: 'return=representation' },
        body: { owner_id: this.#owner, app_id: this.#app, request_id: requestId, base_revision: baseRevision, payload: copied },
      });
      this.#uploadGuard(generation);
      if (!Array.isArray(body) || body.length > 1) fail('INVALID_PAYLOAD');
      let rows: unknown[] = body;
      if (!rows.length) {
        // Trigger's retained exact retry: metadata lookup only, never another POST.
        const retained = await this.#request(generation, {
          method: 'GET', path: this.#path('snapshots', { request_id: `eq.${requestId}`, select: META, limit: '1' }),
        });
        this.#uploadGuard(generation);
        if (!Array.isArray(retained) || retained.length > 1) fail('INVALID_PAYLOAD');
        if (!retained.length) fail('NOT_FOUND');
        rows = retained;
      }
      const result = this.#metadata(rows[0]);
      // Global SQL identity revisions are opaque CAS values: gaps are normal.
      if (result.request_id !== requestId || result.revision <= baseRevision) fail('INVALID_PAYLOAD');
      return result;
    } finally { MUTATION_LANES.delete(this.#laneKey); }
  }

  /** Server app-consent revocation only; does not delete snapshots/local data. */
  async revokeConsent(): Promise<Consent> {
    this.#upload = false;
    this.#permissionEpoch++;
    const generation = this.#beginMutation();
    try {
      const consent = await this.#writeConsent(generation, false);
      this.#guard(generation);
      return consent;
    } finally { MUTATION_LANES.delete(this.#laneKey); }
  }

  /** Explicit cloud-copy deletion: revoke server consent FIRST, then scoped DELETE. */
  async deleteCopies(): Promise<void> {
    this.#upload = false;
    this.#permissionEpoch++;
    const generation = this.#beginMutation();
    try {
      await this.#writeConsent(generation, false, true);
      this.#guard(generation);
      const body = await this.#request(generation, {
        method: 'DELETE', path: this.#path('snapshots', { select: META }),
        headers: { Prefer: 'return=representation' },
      }, true);
      this.#guard(generation);
      this.#versions(body, false);
    } finally { MUTATION_LANES.delete(this.#laneKey); }
  }

  /** Account deletion requires a separately specified authority/API. No invented endpoint. */
  async deleteAccount(): Promise<never> { return fail('UNAVAILABLE'); }
}
