import {
  exactFields, isAborted, readIdentity, readLease, readNativeResult, reject, NATIVE_DELETE_VERSION,
} from './native_contract.ts';
import type {
  AccountIdentity, DeletionLease, DeleteErrorCode, NativeDeleteResult, NativeDeleteSender,
} from './native_contract.ts';

export const ACCOUNT_DELETE_ADAPTER_VERSION = 'ecosystem.account-delete.ts/1' as const;
export interface DeleteOptions { readonly confirmAllApps: boolean }
export interface AccountDeletionHost {
  /** Synchronous, read-only capture of an ACTIVE, verified, durably bound account. No resume. */
  capture(expected: AccountIdentity): DeletionLease | null;
  /** Compare native/runtime owner+generation+handle; remains meaningful after retirement. */
  owns(lease: DeletionLease): boolean;
  /**
   * Synchronous and one-shot. Recheck/reserve this exact lease, permanently fence
   * all retained REST capabilities and refresh callbacks, stop refresh. Failure
   * must be fail-closed. No HTTP dispatch. Separate deletion handle survives.
   */
  fence(lease: DeletionLease): void;
  /**
   * Conditional retirement through the SAME app+issuer credential FIFO lane as
   * all writes/removals. Check ownership before/after OS mutation; never clear B.
   * Settle after retirement, not after merely enqueueing it. Preserve local data.
   * Reject => host must keep retired A unusable, including automatic recovery.
   */
  retire(lease: DeletionLease): Promise<'retired' | 'superseded'>;
}

/** No SDK, token storage, network implementation, progress writer or snapshot dependency. */
export class AccountDeletionAdapter {
  readonly #host: AccountDeletionHost;
  readonly #send: NativeDeleteSender;
  #used = false;

  constructor(host: AccountDeletionHost, send: NativeDeleteSender) {
    this.#host = host;
    this.#send = send;
  }

  #owns(lease: DeletionLease): boolean {
    try { return this.#host.owns(lease) === true; } catch { return false; }
  }

  async deleteAccount(expected: AccountIdentity, options: DeleteOptions, signal?: AbortSignal): Promise<void> {
    let identity: AccountIdentity;
    let operationSignal: AbortSignal;
    let confirmed: boolean;
    try {
      identity = readIdentity(expected);
      const fields = exactFields(options, ['confirmAllApps']);
      if (typeof fields.confirmAllApps !== 'boolean') reject('INVALID_INPUT');
      confirmed = fields.confirmAllApps;
      if (signal !== undefined && !(signal instanceof AbortSignal)) reject('INVALID_INPUT');
      operationSignal = signal ?? new AbortController().signal;
      isAborted(operationSignal);
    } catch { return reject('INVALID_INPUT'); }
    // These guards perform NO host call, mutation, fence or credential retirement.
    if (!confirmed) return reject('CONFIRMATION_REQUIRED');
    if (isAborted(operationSignal)) return reject('ABORTED');
    if (this.#used) return reject('OFF');

    let captured: DeletionLease | null;
    try { captured = this.#host.capture(identity); } catch { return reject('UNAVAILABLE'); }
    if (captured === null) return reject('UNAVAILABLE');
    let lease: DeletionLease;
    try { lease = readLease(captured); } catch { return reject('UNAVAILABLE'); }
    if (lease.issuer !== identity.issuer || lease.accountId !== identity.accountId || !this.#owns(lease)) {
      return reject('ACCOUNT_CHANGED');
    }
    if (isAborted(operationSignal)) return reject('ABORTED');
    // Terminal from the first fencing attempt; no replay/recovery of this adapter.
    this.#used = true;
    let error: DeleteErrorCode = 'SIGN_IN_REQUIRED';
    let result: NativeDeleteResult | undefined;
    try {
      const fenced: unknown = this.#host.fence(lease); // MUST synchronously reserve/fence.
      if (fenced !== undefined) {
        // A JS async function can type-check as void. Refuse it, do not dispatch,
        // and drain its result before retirement rather than leave late work.
        await Promise.resolve(fenced).catch(() => {});
        error = 'UNAVAILABLE';
      } else if (!this.#owns(lease)) error = 'ACCOUNT_CHANGED';
      else if (isAborted(operationSignal)) error = 'ABORTED';
      else {
        try {
          const raw = await this.#send(Object.freeze({ version: NATIVE_DELETE_VERSION, lease }), operationSignal);
          result = readNativeResult(raw, lease);
        } catch { /* Every attempted dispatch is conservatively ambiguous. */ }
      }
    } catch { error = 'UNAVAILABLE'; }

    // This await is mandatory even on timeout/abort/bad ACK/exception/supersession.
    // No blanket auth.suspend(), namespace erase, or compensating write here.
    let retirement: unknown;
    try { retirement = await this.#host.retire(lease); }
    catch { return reject('RETIREMENT_FAILED'); }
    if (retirement !== 'retired' && retirement !== 'superseded') return reject('RETIREMENT_FAILED');
    if (retirement === 'superseded' || !this.#owns(lease)) return reject('ACCOUNT_CHANGED');
    if (!isAborted(operationSignal) && result?.kind === 'response' &&
        result.status === 200 && result.ack === 'ACCOUNT_DELETED') return;
    return reject(error);
  }
}
