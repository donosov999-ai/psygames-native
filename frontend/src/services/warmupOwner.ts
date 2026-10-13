/** Transport-only lease. No storage, UI imports, global sink or progression rules. */
export interface WarmupOwner {
  readonly run_id: string;
  readonly step_idx: number;
  readonly attempt_id: string;
}

export function parseWarmupOwner(value: unknown): WarmupOwner | null {
  if (!value || typeof value !== 'object') return null;
  const v = value as Record<string, unknown>;
  if (typeof v.run_id !== 'string' || !v.run_id || typeof v.attempt_id !== 'string' || !v.attempt_id
    || typeof v.step_idx !== 'number' || !Number.isSafeInteger(v.step_idx) || v.step_idx < 0) return null;
  return Object.freeze({ run_id: v.run_id, step_idx: v.step_idx, attempt_id: v.attempt_id });
}

export function sameWarmupOwner(a: WarmupOwner | null | undefined, b: WarmupOwner | null | undefined): boolean {
  return !!a && !!b && a.run_id === b.run_id && a.step_idx === b.step_idx && a.attempt_id === b.attempt_id;
}

export function ownerParams(owner: WarmupOwner | null | undefined): Record<string, string> {
  return owner ? { wuRun: owner.run_id, wuStep: String(owner.step_idx), wuAttempt: owner.attempt_id } : {};
}

/** WEB saves snapshot the launched URL before their first await. Native reports
 * must already carry the owner's snapshot; never infer it from this URL for them. */
export function webLaunchOwner(): WarmupOwner | null {
  if (typeof window === 'undefined') return null;
  const p = new URLSearchParams(window.location?.search ?? '');
  const step = p.get('wuStep');
  if (p.get('wu') !== '1' || step === null || !/^\d+$/.test(step)) return null;
  return parseWarmupOwner({ run_id: p.get('wuRun'), step_idx: Number(step), attempt_id: p.get('wuAttempt') });
}
