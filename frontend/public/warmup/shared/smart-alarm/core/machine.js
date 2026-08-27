import { activeRingMs, boundedSnoozeDifficulty, evaluateFailSafe, nativeFailSafeDeadlineMs, validateFailSafePolicy, validateSnoozePolicy } from './failSafe.js';
import { snoozedOccurrence } from './schedule.js';
const terminalPhases = new Set([
    'dismissed',
    'fail-safe-stopped',
    'escaped',
    'error-stopped',
    'disposed',
]);
function safeInteger(value) {
    return Number.isSafeInteger(value) && value >= 0;
}
function clocksValid(state, wallMs, monoMs) {
    return safeInteger(wallMs)
        && safeInteger(monoMs)
        && (state.lastMonoMs === null || monoMs >= state.lastMonoMs);
}
function terminalPhase(reason) {
    if (reason === 'passed')
        return 'dismissed';
    if (reason === 'escape')
        return 'escaped';
    if (reason === 'adapter-error' || reason === 'clock-error')
        return 'error-stopped';
    if (reason === 'dispose')
        return 'disposed';
    return 'fail-safe-stopped';
}
function stopRuntime(state, reason, nowMonoMs, extraCommands = [], activeRingOverrideMs) {
    const occurrenceId = state.occurrence?.occurrenceId ?? 'unknown';
    const active = activeRingOverrideMs ?? activeRingMs(state, nowMonoMs);
    const total = state.accumulatedRingMs + active;
    const shouldStopAlert = state.alertActive && !state.stopIssued;
    const next = {
        ...state,
        phase: terminalPhase(reason),
        accumulatedRingMs: total,
        ringingStartedWallMs: null,
        ringingStartedMonoMs: null,
        lastMonoMs: safeInteger(nowMonoMs) ? nowMonoMs : state.lastMonoMs,
        alertActive: false,
        stopIssued: state.stopIssued || shouldStopAlert,
        stopReason: reason,
        pendingSafety: null,
        revision: state.revision + 1,
    };
    const trailingCommands = [{
            type: 'record-outcome',
            occurrenceId,
            reason,
            failedAttempts: next.failedAttempts,
            snoozes: next.snoozeCount,
            totalRingMs: total,
        }, ...extraCommands];
    if (!shouldStopAlert) {
        return { state: next, commands: [{ type: 'persist' }, ...trailingCommands] };
    }
    return durableSafetyTransition(next, {
        stop: { occurrenceId, reason },
        schedule: null,
    }, trailingCommands);
}
function durableSafetyTransition(next, pendingSafety, trailingCommands = []) {
    const checkpoint = { ...next, pendingSafety };
    const commands = [{ type: 'persist', checkpoint }];
    if (pendingSafety.stop) {
        commands.push({ type: 'stop-alert', ...pendingSafety.stop });
    }
    if (pendingSafety.schedule) {
        commands.push({ type: 'schedule', occurrence: pendingSafety.schedule });
    }
    commands.push({ type: 'persist' }, ...trailingCommands);
    return { state: next, commands };
}
function recoverPendingSafety(state) {
    if (!state.pendingSafety)
        return { state, commands: [] };
    const next = {
        ...state,
        pendingSafety: null,
        revision: state.revision + 1,
    };
    const commands = [];
    if (state.pendingSafety.stop) {
        commands.push({ type: 'stop-alert', ...state.pendingSafety.stop });
    }
    if (state.pendingSafety.schedule) {
        commands.push({ type: 'schedule', occurrence: state.pendingSafety.schedule });
    }
    commands.push({ type: 'persist' });
    return { state: next, commands };
}
function clockError(state, monoMs) {
    const safeMonoMs = safeInteger(monoMs)
        ? monoMs
        : state.lastMonoMs ?? state.ringingStartedMonoMs ?? 0;
    return stopRuntime(state, 'clock-error', safeMonoMs);
}
function activeChallengeCommands(state) {
    if (!state.occurrence || !state.task || state.ringingStartedWallMs === null)
        return [];
    return [
        // Persist first. A failed checkpoint must never leave a newly started alert
        // without a durable state from which the host can recover or stop it.
        { type: 'persist' },
        {
            type: 'arm-native-fail-safe',
            occurrenceId: state.occurrence.occurrenceId,
            deadlineWallMs: nativeFailSafeDeadlineMs(state, state.ringingStartedWallMs),
        },
        { type: 'start-alert', occurrenceId: state.occurrence.occurrenceId },
        { type: 'open-challenge', occurrenceId: state.occurrence.occurrenceId, task: state.task },
    ];
}
export function transitionAlarm(state, event) {
    validateFailSafePolicy(state.spec.failSafe);
    validateSnoozePolicy(state.spec.snooze);
    if (event.type === 'recover-pending')
        return recoverPendingSafety(state);
    if (event.type === 'arm') {
        if (state.phase === 'disposed' || !state.spec.enabled)
            return { state, commands: [] };
        if (state.phase !== 'idle' && !terminalPhases.has(state.phase))
            return { state, commands: [] };
        const next = {
            ...state,
            phase: 'scheduled',
            occurrence: event.occurrence,
            task: event.task,
            failedAttempts: 0,
            snoozeCount: event.occurrence.snoozeIndex,
            accumulatedRingMs: 0,
            ringingStartedWallMs: null,
            ringingStartedMonoMs: null,
            lastMonoMs: null,
            alertActive: false,
            stopIssued: false,
            stopReason: null,
            pendingSafety: null,
            revision: state.revision + 1,
        };
        return { state: next, commands: [{ type: 'persist' }, { type: 'schedule', occurrence: event.occurrence }] };
    }
    if (terminalPhases.has(state.phase))
        return { state, commands: [] };
    if (event.type === 'recover-active') {
        if (state.phase !== 'challenge' || state.ringingStartedWallMs === null)
            return { state, commands: [] };
        if (!safeInteger(event.wallMs) || !safeInteger(event.monoMs) || event.wallMs < state.ringingStartedWallMs) {
            return clockError(state, event.monoMs);
        }
        const elapsedWallMs = event.wallMs - state.ringingStartedWallMs;
        const totalRingMs = state.accumulatedRingMs + elapsedWallMs;
        if (elapsedWallMs >= state.spec.failSafe.maxContinuousRingMs) {
            return stopRuntime(state, 'time-cap', event.monoMs, [], elapsedWallMs);
        }
        if (totalRingMs >= state.spec.failSafe.maxTotalRingMs) {
            return stopRuntime(state, 'total-time-cap', event.monoMs, [], elapsedWallMs);
        }
        // A monotonic clock lower than wall elapsed indicates reboot/reset. Stop
        // safely instead of granting a fresh unbounded continuous-ring period.
        if (event.monoMs < elapsedWallMs)
            return stopRuntime(state, 'clock-error', event.monoMs, [], elapsedWallMs);
        const recovered = {
            ...state,
            ringingStartedMonoMs: event.monoMs - elapsedWallMs,
            lastMonoMs: event.monoMs,
            revision: state.revision + 1,
        };
        try {
            return { state: recovered, commands: activeChallengeCommands(recovered) };
        }
        catch {
            return clockError(recovered, event.monoMs);
        }
    }
    if (!clocksValid(state, event.wallMs, event.monoMs))
        return clockError(state, event.monoMs);
    if (event.type === 'trigger') {
        if (state.phase !== 'scheduled' || !state.occurrence || !state.task)
            return { state, commands: [] };
        if (event.occurrenceId !== state.occurrence.occurrenceId)
            return { state, commands: [] };
        if (event.scheduledForMs !== state.occurrence.scheduledForMs || event.wallMs < state.occurrence.scheduledForMs) {
            return { state, commands: [] };
        }
        const next = {
            ...state,
            phase: 'challenge',
            ringingStartedWallMs: event.wallMs,
            ringingStartedMonoMs: event.monoMs,
            lastMonoMs: event.monoMs,
            alertActive: true,
            stopIssued: false,
            stopReason: null,
            pendingSafety: null,
            revision: state.revision + 1,
        };
        try {
            return { state: next, commands: activeChallengeCommands(next) };
        }
        catch {
            return clockError(state, event.monoMs);
        }
    }
    if (event.type === 'tick') {
        if (state.phase !== 'challenge')
            return { state, commands: [] };
        const checked = { ...state, lastMonoMs: event.monoMs };
        const reason = evaluateFailSafe(checked, event.monoMs);
        return reason ? stopRuntime(checked, reason, event.monoMs) : { state: checked, commands: [] };
    }
    if (event.type === 'challenge-failed') {
        if (state.phase !== 'challenge')
            return { state, commands: [] };
        const checked = {
            ...state,
            failedAttempts: state.failedAttempts + 1,
            lastMonoMs: event.monoMs,
            revision: state.revision + 1,
        };
        const reason = evaluateFailSafe(checked, event.monoMs);
        return reason ? stopRuntime(checked, reason, event.monoMs) : { state: checked, commands: [{ type: 'persist' }] };
    }
    if (event.type === 'challenge-passed') {
        if (state.phase !== 'challenge' || !state.task)
            return { state, commands: [] };
        return stopRuntime(state, 'passed', event.monoMs, [{ type: 'continue-warmup', task: state.task }]);
    }
    if (event.type === 'snooze') {
        if (state.phase !== 'challenge' || !state.occurrence || !state.task)
            return { state, commands: [] };
        if (state.snoozeCount >= state.spec.snooze.maxSnoozes) {
            return { state: { ...state, lastMonoMs: event.monoMs }, commands: [{ type: 'snooze-rejected', reason: 'limit-reached' }] };
        }
        const reason = evaluateFailSafe(state, event.monoMs);
        if (reason)
            return stopRuntime(state, reason, event.monoMs);
        const ringMs = activeRingMs(state, event.monoMs);
        const accumulatedRingMs = state.accumulatedRingMs + ringMs;
        if (accumulatedRingMs >= state.spec.failSafe.maxTotalRingMs) {
            return stopRuntime(state, 'total-time-cap', event.monoMs);
        }
        const occurrence = snoozedOccurrence(state.occurrence, event.wallMs, state.spec.snooze.delayMs);
        const snoozeCount = state.snoozeCount + 1;
        const task = {
            ...state.task,
            difficulty: boundedSnoozeDifficulty(state.task.difficulty, snoozeCount, state.spec.snooze),
            seed: (state.task.seed ^ Math.imul(snoozeCount, 0x9e3779b1)) >>> 0,
        };
        const next = {
            ...state,
            phase: 'scheduled',
            occurrence,
            task,
            snoozeCount,
            accumulatedRingMs,
            ringingStartedWallMs: null,
            ringingStartedMonoMs: null,
            // A scheduled snooze may survive process/device restart. Never persist a
            // monotonic-clock checkpoint across that boundary.
            lastMonoMs: null,
            alertActive: false,
            stopIssued: false,
            stopReason: null,
            pendingSafety: null,
            revision: state.revision + 1,
        };
        return durableSafetyTransition(next, {
            stop: { occurrenceId: state.occurrence.occurrenceId, reason: 'snooze' },
            schedule: occurrence,
        });
    }
    if (event.type === 'escape') {
        if (state.phase !== 'challenge')
            return { state, commands: [] };
        return stopRuntime(state, 'escape', event.monoMs);
    }
    if (event.type === 'adapter-error') {
        return stopRuntime(state, 'adapter-error', event.monoMs);
    }
    if (event.type === 'dispose') {
        return stopRuntime(state, 'dispose', event.monoMs);
    }
    return { state, commands: [] };
}
