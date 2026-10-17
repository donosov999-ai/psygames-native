/** Wire contract only. No fetch, Tauri import, credentials, or native availability probe. */
export const NATIVE_DELETE_VERSION = 'ecosystem.account-delete.native/1' as const;
export const NATIVE_DELETE_COMMAND = 'ecosystem_account_delete_v1' as const;

/** Enforced by the native implementation, NOT by this TS object or a JS timer. */
export const NATIVE_DELETE_HTTP = Object.freeze({
  method: 'POST',
  path: '/functions/v1/ecosystem-account-delete',
  body: '{"confirm":"DELETE_ACCOUNT","scope":"all_ecosystem_apps"}',
  contentType: 'application/json',
  originHeader: 'forbidden',
  redirect: 'error',
  maxRequestBytes: 1024,
  maxResponseBytes: 1024,
  deadlineMs: 70000,
} as const);

export type AppId = 'psygames' | 'smart-alarm' | 'abstract-hub' | 'typerighting';
export interface AccountIdentity { readonly issuer: string; readonly accountId: string }
export interface DeletionLease extends AccountIdentity {
  readonly appId: AppId;
  readonly generation: number;
  /** Opaque, non-credential, single-use handle registered by the trusted host. */
  readonly leaseId: string;
}
export interface NativeDeleteRequest {
  readonly version: typeof NATIVE_DELETE_VERSION;
  readonly lease: DeletionLease;
}
interface ReplyBinding {
  readonly version: typeof NATIVE_DELETE_VERSION;
  readonly leaseId: string;
  readonly generation: number;
}
export type NativeDeleteResult = ReplyBinding & (
  | { readonly kind: 'response'; readonly status: number; readonly ack: 'ACCOUNT_DELETED' | 'UNCONFIRMED' }
  | { readonly kind: 'cancelled'; readonly reason: 'ABORTED' | 'DEADLINE' }
  | { readonly kind: 'failed'; readonly reason: 'TRANSPORT' }
);

export type DeleteErrorCode =
  | 'CONFIRMATION_REQUIRED' | 'ABORTED' | 'INVALID_INPUT' | 'UNAVAILABLE'
  | 'ACCOUNT_CHANGED' | 'SIGN_IN_REQUIRED' | 'RETIREMENT_FAILED' | 'OFF';
export class AccountDeleteError extends Error {
  readonly code: DeleteErrorCode;
  constructor(code: DeleteErrorCode) {
    super(code);
    this.name = 'AccountDeleteError';
    this.code = code;
  }
}
export function reject(code: DeleteErrorCode): never { throw new AccountDeleteError(code); }

/** Brand-check through the built-in getter; never read a caller's shadow getter. */
export function isAborted(signal: AbortSignal): boolean {
  try {
    const get = Object.getOwnPropertyDescriptor(AbortSignal.prototype, 'aborted')!.get!;
    return get.call(signal) === true;
  } catch { return reject('INVALID_INPUT'); }
}

/** Read only exact own enumerable data fields. Never evaluate accessors/toJSON. */
export function exactFields(input: unknown, keys: readonly string[]): Record<string, unknown> {
  try {
    if (typeof input !== 'object' || input === null || Array.isArray(input)) reject('INVALID_INPUT');
    const proto = Object.getPrototypeOf(input);
    if (proto !== Object.prototype && proto !== null) reject('INVALID_INPUT');
    const own = Reflect.ownKeys(input);
    if (own.length !== keys.length || own.some(k => typeof k !== 'string' || !keys.includes(k))) reject('INVALID_INPUT');
    const out: Record<string, unknown> = Object.create(null);
    for (const key of keys) {
      const descriptor = Object.getOwnPropertyDescriptor(input, key);
      if (!descriptor || !descriptor.enumerable || !('value' in descriptor)) reject('INVALID_INPUT');
      out[key] = descriptor.value;
    }
    return out;
  } catch { return reject('INVALID_INPUT'); }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const HANDLE = /^[A-Za-z0-9_-]{16,128}$/;
const APPS = new Set(['psygames', 'smart-alarm', 'abstract-hub', 'typerighting']);
export function readIdentity(input: unknown): AccountIdentity {
  const r = exactFields(input, ['issuer', 'accountId']);
  if (typeof r.issuer !== 'string' || r.issuer.length > 2048 ||
      typeof r.accountId !== 'string' || UUID.exec(r.accountId)?.[0] !== r.accountId) reject('INVALID_INPUT');
  let url: URL;
  try { url = new URL(r.issuer); } catch { return reject('INVALID_INPUT'); }
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash ||
      r.issuer !== `${url.origin}/auth/v1`) reject('INVALID_INPUT');
  return Object.freeze({ issuer: r.issuer, accountId: r.accountId });
}
export function readLease(input: unknown): DeletionLease {
  const r = exactFields(input, ['issuer', 'accountId', 'appId', 'generation', 'leaseId']);
  const identity = readIdentity({ issuer: r.issuer, accountId: r.accountId });
  if (typeof r.appId !== 'string' || !APPS.has(r.appId) ||
      !Number.isSafeInteger(r.generation) || (r.generation as number) < 1 ||
      typeof r.leaseId !== 'string' || HANDLE.exec(r.leaseId)?.[0] !== r.leaseId) reject('INVALID_INPUT');
  return Object.freeze({ ...identity, appId: r.appId as AppId,
    generation: r.generation as number, leaseId: r.leaseId });
}
export function readNativeRequest(input: unknown): NativeDeleteRequest {
  const r = exactFields(input, ['version', 'lease']);
  if (r.version !== NATIVE_DELETE_VERSION) reject('INVALID_INPUT');
  return Object.freeze({ version: NATIVE_DELETE_VERSION, lease: readLease(r.lease) });
}
export function readNativeResult(input: unknown, lease: DeletionLease): NativeDeleteResult {
  // Inspect the discriminant without invoking a getter, then enforce its EXACT shape.
  if (typeof input !== 'object' || input === null) reject('INVALID_INPUT');
  let kind: unknown;
  try { kind = Object.getOwnPropertyDescriptor(input, 'kind')?.value; }
  catch { return reject('INVALID_INPUT'); }
  const r = exactFields(input, kind === 'response'
    ? ['version', 'leaseId', 'generation', 'kind', 'status', 'ack']
    : ['version', 'leaseId', 'generation', 'kind', 'reason']);
  if (r.version !== NATIVE_DELETE_VERSION || r.leaseId !== lease.leaseId ||
      r.generation !== lease.generation) reject('INVALID_INPUT');
  const binding = { version: NATIVE_DELETE_VERSION, leaseId: lease.leaseId, generation: lease.generation } as const;
  if (kind === 'response' && Number.isInteger(r.status) && (r.status as number) >= 100 &&
      (r.status as number) <= 599 && (r.ack === 'ACCOUNT_DELETED' || r.ack === 'UNCONFIRMED')) {
    return Object.freeze({ ...binding, kind, status: r.status as number, ack: r.ack });
  }
  if (kind === 'cancelled' && (r.reason === 'ABORTED' || r.reason === 'DEADLINE')) {
    return Object.freeze({ ...binding, kind, reason: r.reason });
  }
  if (kind === 'failed' && r.reason === 'TRANSPORT') {
    return Object.freeze({ ...binding, kind, reason: r.reason });
  }
  return reject('INVALID_INPUT');
}

/** Must settle ONLY after actual HTTP completion or cancellation (including body). */
export type NativeDeleteSender = (request: NativeDeleteRequest, signal: AbortSignal) => Promise<NativeDeleteResult>;
/**
 * Injection seam, NOT the stock Tauri invoke API or a production native adapter.
 * Implementer must forward cancellation to native and enforce the native deadline.
 * The command has no caller-supplied URL, method, body, headers or credentials.
 */
export type NativeDeleteInvoke = (
  command: typeof NATIVE_DELETE_COMMAND,
  request: NativeDeleteRequest,
  signal: AbortSignal,
) => Promise<unknown>;

/** Strict reference bridge only. Cannot prove an injected function is native. */
export function createNativeDeleteReferenceSender(invoke: NativeDeleteInvoke): NativeDeleteSender {
  return async (input, signal) => {
    let request: NativeDeleteRequest;
    try {
      request = readNativeRequest(input);
      if (!(signal instanceof AbortSignal)) reject('INVALID_INPUT');
      isAborted(signal);
    } catch { return reject('INVALID_INPUT'); }
    if (isAborted(signal)) return reject('ABORTED');
    try {
      // No Promise.race, soft timeout, fetch fallback, or optimistic abort ACK.
      const result = await invoke(NATIVE_DELETE_COMMAND, request, signal);
      return readNativeResult(result, request.lease);
    } catch { return reject('SIGN_IN_REQUIRED'); }
  };
}
