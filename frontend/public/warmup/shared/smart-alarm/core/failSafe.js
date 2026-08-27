export function validateFailSafePolicy(policy) {
    if (!Number.isInteger(policy.maxFailedAttempts) || policy.maxFailedAttempts < 1 || policy.maxFailedAttempts > 10) {
        throw new RangeError('maxFailedAttempts must be 1..10');
    }
    if (!Number.isSafeInteger(policy.maxContinuousRingMs) || policy.maxContinuousRingMs < 1_000) {
        throw new RangeError('maxContinuousRingMs must be at least 1000');
    }
    if (!Number.isSafeInteger(policy.maxTotalRingMs) || policy.maxTotalRingMs < policy.maxContinuousRingMs) {
        throw new RangeError('maxTotalRingMs must be >= maxContinuousRingMs');
    }
}
export function validateSnoozePolicy(policy) {
    if (!Number.isInteger(policy.maxSnoozes) || policy.maxSnoozes < 0 || policy.maxSnoozes > 5) {
        throw new RangeError('maxSnoozes must be 0..5');
    }
    if (!Number.isSafeInteger(policy.delayMs) || policy.delayMs < 60_000) {
        throw new RangeError('snooze delayMs must be at least one minute');
    }
    if (policy.escalation === 'none' && policy.maxTierIncrease !== 0) {
        throw new RangeError('escalation none requires maxTierIncrease 0');
    }
    if (policy.escalation === 'one-tier' && policy.maxTierIncrease !== 1) {
        throw new RangeError('one-tier escalation requires maxTierIncrease 1');
    }
}
export function activeRingMs(state, nowMonoMs) {
    if (state.ringingStartedMonoMs === null || !state.alertActive)
        return 0;
    return Math.max(0, nowMonoMs - state.ringingStartedMonoMs);
}
export function totalRingMs(state, nowMonoMs) {
    return state.accumulatedRingMs + activeRingMs(state, nowMonoMs);
}
export function evaluateFailSafe(state, nowMonoMs) {
    validateFailSafePolicy(state.spec.failSafe);
    if (state.failedAttempts >= state.spec.failSafe.maxFailedAttempts)
        return 'attempt-cap';
    const active = activeRingMs(state, nowMonoMs);
    if (active >= state.spec.failSafe.maxContinuousRingMs)
        return 'time-cap';
    if (state.accumulatedRingMs + active >= state.spec.failSafe.maxTotalRingMs)
        return 'total-time-cap';
    return null;
}
/** Native watchdog gets the earliest remaining wall-clock deadline. */
export function nativeFailSafeDeadlineMs(state, triggeredWallMs) {
    if (!Number.isSafeInteger(triggeredWallMs) || triggeredWallMs < 0) {
        throw new RangeError('triggeredWallMs must be a non-negative safe integer');
    }
    const continuousRemaining = state.spec.failSafe.maxContinuousRingMs;
    const totalRemaining = Math.max(0, state.spec.failSafe.maxTotalRingMs - state.accumulatedRingMs);
    const remaining = Math.min(continuousRemaining, totalRemaining);
    if (triggeredWallMs > Number.MAX_SAFE_INTEGER - remaining) {
        throw new RangeError('native fail-safe deadline overflow');
    }
    return triggeredWallMs + remaining;
}
const tiers = ['easy', 'medium', 'hard'];
/** Alarm escalation is deliberately capped at medium even if the source task was hard. */
export function boundedSnoozeDifficulty(difficulty, snoozeCount, policy) {
    validateSnoozePolicy(policy);
    const start = Math.min(1, tiers.indexOf(difficulty));
    if (policy.escalation === 'none' || snoozeCount <= 0)
        return tiers[start] ?? 'easy';
    const increase = Math.min(policy.maxTierIncrease, snoozeCount);
    return tiers[Math.min(1, start + increase)] ?? 'medium';
}
