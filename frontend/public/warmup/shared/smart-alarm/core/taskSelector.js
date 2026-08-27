import { boundedSnoozeDifficulty } from './failSafe.js';
function hash32(value) {
    let hash = 0x811c9dc5;
    for (let index = 0; index < value.length; index += 1) {
        hash ^= value.charCodeAt(index);
        hash = Math.imul(hash, 0x01000193);
    }
    return hash >>> 0;
}
function isEligible(definition, allowedGameIds) {
    return definition.alarmSafe
        && definition.runnerKind !== 'absent'
        && definition.offline
        && !definition.requiresAccount
        && definition.maxEstimatedDurationSec <= 120
        && allowedGameIds.has(definition.gameId);
}
function isDifficultyTier(value) {
    return value === 'easy' || value === 'medium' || value === 'hard';
}
function sameSettings(snapshot, safeDefaults) {
    const left = snapshot ?? {};
    const right = safeDefaults ?? {};
    return Object.keys(left).every((key) => left[key] === right[key]);
}
function snapshotMismatch(step, definition) {
    if (step.route !== definition.route)
        return 'morning task route was replaced by the alarm-safe packaged route';
    if (!Number.isFinite(step.estimatedDurationSec) || step.estimatedDurationSec <= 0 || step.estimatedDurationSec > definition.maxEstimatedDurationSec) {
        return 'morning task duration was replaced by the alarm-safe packaged duration';
    }
    if (!isDifficultyTier(step.difficulty))
        return 'morning task difficulty was replaced by the alarm-safe default';
    if (!sameSettings(step.settings, definition.defaultSettings)) {
        return 'morning task settings were replaced by alarm-safe packaged settings';
    }
    return undefined;
}
function taskFrom(definition, step, input, source, fidelity, degradedReason) {
    const requestedDifficulty = isDifficultyTier(step?.difficulty)
        ? step.difficulty
        : definition.defaultDifficulty;
    const difficulty = boundedSnoozeDifficulty(requestedDifficulty, input.snoozeCount, input.spec.snooze);
    const requestedDuration = step && Number.isFinite(step.estimatedDurationSec) && step.estimatedDurationSec > 0
        ? step.estimatedDurationSec
        : definition.maxEstimatedDurationSec;
    const settings = { ...(definition.defaultSettings ?? {}) };
    const seed = hash32(`${input.selectionSeed}|${definition.gameId}|${input.snoozeCount}`);
    return {
        gameId: definition.gameId,
        route: definition.route,
        difficulty,
        estimatedDurationSec: Math.min(requestedDuration, definition.maxEstimatedDurationSec, 120),
        settings,
        seed,
        runnerKind: definition.runnerKind,
        source,
        fidelity,
        ...(degradedReason ? { degradedReason } : {}),
    };
}
function fallback(input, reason) {
    const definition = input.registry.find((candidate) => candidate.gameId === input.safeFallbackGameId);
    if (!definition || !isEligible(definition, input.allowedGameIds)) {
        throw new Error('safe fallback task is missing or not eligible in the current runner');
    }
    return taskFrom(definition, null, input, 'safe-fallback', 'fallback', reason);
}
function selectFirstWarmup(input, reasonPrefix) {
    const first = input.morningPlan.steps[0];
    if (!first)
        return fallback(input, reasonPrefix ?? 'morning plan is empty');
    const definition = input.registry.find((candidate) => candidate.gameId === first.gameId);
    if (!definition || !isEligible(definition, input.allowedGameIds)) {
        return fallback(input, reasonPrefix ?? `first morning task ${first.gameId} is not available in the current alarm runner`);
    }
    const mismatch = snapshotMismatch(first, definition);
    const degradedReason = reasonPrefix ?? mismatch;
    return taskFrom(definition, first, input, 'first-warmup', degradedReason ? 'fallback' : 'exact', degradedReason);
}
function isFresh(snapshot, nowMs, maxAgeMs) {
    return Number.isSafeInteger(snapshot.assessedAtMs)
        && snapshot.assessedAtMs <= nowMs
        && nowMs - snapshot.assessedAtMs <= maxAgeMs;
}
function selectWeakDomain(input, maxAgeMs) {
    if (!Number.isSafeInteger(maxAgeMs) || maxAgeMs < 0)
        throw new RangeError('maxAssessmentAgeMs must be a non-negative safe integer');
    const snapshot = input.weakDomain;
    if (!snapshot)
        return selectFirstWarmup(input, 'weak-domain data is absent; used first warmup task');
    if (!isFresh(snapshot, input.nowMs, maxAgeMs)) {
        return selectFirstWarmup(input, 'weak-domain data is stale; used first warmup task');
    }
    const recommendedOrder = new Map(snapshot.recommendedGameIds.map((gameId, index) => [gameId, index]));
    const candidates = input.registry
        .filter((definition) => isEligible(definition, input.allowedGameIds))
        .filter((definition) => definition.domains.some((domain) => snapshot.weakDomains.includes(domain)))
        .sort((left, right) => (recommendedOrder.get(left.gameId) ?? 10_000) - (recommendedOrder.get(right.gameId) ?? 10_000));
    if (candidates.length === 0) {
        return selectFirstWarmup(input, 'no alarm-safe packaged task matches the weak domains');
    }
    const index = hash32(input.selectionSeed) % candidates.length;
    const definition = candidates[index];
    if (!definition)
        return selectFirstWarmup(input, 'weak-domain candidate selection failed');
    return taskFrom(definition, null, input, 'weak-domain', 'exact');
}
export function selectAlarmTask(input) {
    if (!Number.isSafeInteger(input.nowMs) || input.nowMs < 0)
        throw new RangeError('nowMs must be a non-negative safe integer');
    if (!Number.isInteger(input.snoozeCount) || input.snoozeCount < 0)
        throw new RangeError('snoozeCount must be a non-negative integer');
    const policy = input.spec.taskPolicy;
    if (policy.mode === 'first-warmup')
        return selectFirstWarmup(input);
    if (policy.mode === 'weak-domain')
        return selectWeakDomain(input, policy.maxAssessmentAgeMs);
    const definition = input.registry.find((candidate) => candidate.gameId === policy.gameId);
    if (!definition || !isEligible(definition, input.allowedGameIds)) {
        return fallback(input, `fixed task ${policy.gameId} is not available in the current alarm runner`);
    }
    return taskFrom(definition, null, input, 'fixed', 'exact');
}
export const LAB_ALARM_TASKS = [
    {
        gameId: 'schulte_table',
        route: '/games/schulte',
        domains: ['processing_speed', 'attention_sustained'],
        alarmSafe: true,
        runnerKind: 'shared-core',
        offline: true,
        requiresAccount: false,
        maxEstimatedDurationSec: 60,
        defaultDifficulty: 'easy',
        defaultSettings: { size: 3, mode: 'numbers' },
    },
    {
        gameId: 'choice_rt',
        route: '/games/choice-rt',
        domains: ['processing_speed'],
        alarmSafe: true,
        runnerKind: 'shared-core',
        offline: true,
        requiresAccount: false,
        maxEstimatedDurationSec: 60,
        defaultDifficulty: 'easy',
        defaultSettings: { trials: 10, directions: 2 },
    },
];
