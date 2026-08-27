import { createAlarmRuntime, transitionAlarm, validateFailSafePolicy, validateSnoozePolicy, } from '../core/index.js';
import { nextWeeklyOccurrence } from '../core/schedule.js';
import { LAB_ALARM_TASKS, selectAlarmTask } from '../core/taskSelector.js';
import { IntlTimeZoneResolver } from '../runtime/timeZone.js';
const MINUTE = 60_000;
function alarmId(nowMs) {
    return `alarm-${nowMs.toString(36)}`;
}
function taskPolicy(mode) {
    if (mode === 'weak-domain')
        return { mode: 'weak-domain', maxAssessmentAgeMs: 90 * 24 * 60 * MINUTE };
    if (mode === 'schulte_table' || mode === 'choice_rt')
        return { mode: 'fixed', gameId: mode };
    return { mode: 'first-warmup' };
}
export function selectTaskForOccurrence(spec, occurrence, nowMs, context = {}) {
    return selectAlarmTask({
        spec,
        morningPlan: context.morningPlan ?? {
            localDateKey: occurrence.localDateKey,
            steps: [{
                    gameId: 'schulte_table',
                    route: '/games/schulte',
                    difficulty: 'easy',
                    estimatedDurationSec: 60,
                    settings: { size: 3, mode: 'numbers' },
                }],
        },
        weakDomain: context.weakDomain ?? null,
        registry: LAB_ALARM_TASKS,
        allowedGameIds: new Set(['schulte_table', 'choice_rt']),
        safeFallbackGameId: 'schulte_table',
        nowMs,
        selectionSeed: occurrence.occurrenceId,
        snoozeCount: occurrence.snoozeIndex,
    });
}
export function createAlarmEnvelope(draft, nowMs = Date.now()) {
    const id = draft.id ?? alarmId(nowMs);
    if (!/^[A-Za-z0-9._-]{1,80}$/.test(id))
        throw new RangeError('alarm id must be 1..80 safe characters');
    if (!Number.isInteger(draft.maxRingMinutes) || draft.maxRingMinutes < 1 || draft.maxRingMinutes > 30) {
        throw new RangeError('maxRingMinutes must be 1..30');
    }
    if (!Number.isInteger(draft.snoozeMinutes) || draft.snoozeMinutes < 1 || draft.snoozeMinutes > 30) {
        throw new RangeError('snoozeMinutes must be 1..30');
    }
    const label = draft.label.trim() || 'Wake up';
    if ([...label].length > 80)
        throw new RangeError('label must be at most 80 characters');
    const spec = {
        id,
        enabled: draft.enabled,
        schedule: {
            time: { hour: draft.hour, minute: draft.minute },
            weekdays: [...draft.weekdays],
            timeZone: draft.timeZone,
            dstGap: 'next-valid',
            dstOverlap: 'earlier',
        },
        taskPolicy: taskPolicy(draft.taskMode),
        failSafe: {
            maxFailedAttempts: draft.maxFailedAttempts,
            maxContinuousRingMs: draft.maxRingMinutes * MINUTE,
            maxTotalRingMs: draft.maxRingMinutes * MINUTE,
        },
        snooze: {
            maxSnoozes: draft.maxSnoozes,
            delayMs: draft.snoozeMinutes * MINUTE,
            escalation: 'none',
            maxTierIncrease: 0,
        },
    };
    validateFailSafePolicy(spec.failSafe);
    validateSnoozePolicy(spec.snooze);
    // Disabled definitions still retain their next wall-time intention so the UI
    // can toggle them back on without reconstructing or losing the draft.
    const occurrence = nextWeeklyOccurrence({ ...spec, enabled: true }, nowMs, new IntlTimeZoneResolver());
    const task = selectTaskForOccurrence(spec, occurrence, nowMs);
    return { label, spec, task, occurrence };
}
export function definitionFromEnvelope(envelope, occurrence = envelope.occurrence, accumulatedRingMs = 0) {
    if (!Number.isSafeInteger(accumulatedRingMs) || accumulatedRingMs < 0) {
        throw new RangeError('accumulatedRingMs must be a non-negative safe integer');
    }
    const payload = { ...envelope, occurrence };
    const totalRemainingMs = Math.max(1, envelope.spec.failSafe.maxTotalRingMs - accumulatedRingMs);
    return {
        alarmId: envelope.spec.id,
        occurrenceId: occurrence.occurrenceId,
        triggerAtMs: occurrence.scheduledForMs,
        localDateKey: occurrence.localDateKey,
        hour: envelope.spec.schedule.time.hour,
        minute: envelope.spec.schedule.time.minute,
        weekdays: envelope.spec.schedule.weekdays,
        timeZone: envelope.spec.schedule.timeZone,
        label: envelope.label,
        watchdogDurationMs: Math.min(envelope.spec.failSafe.maxContinuousRingMs, totalRemainingMs),
        enabled: envelope.spec.enabled,
        payloadJson: JSON.stringify(payload),
    };
}
export function parseEnvelope(definition) {
    const value = JSON.parse(definition.payloadJson);
    if (!value.spec || !value.task || !value.occurrence || typeof value.label !== 'string') {
        throw new Error(`alarm ${definition.alarmId} has an invalid payload`);
    }
    if (value.spec.id !== definition.alarmId)
        throw new Error('alarm payload id mismatch');
    return value;
}
function occurrenceFromTrigger(envelope, trigger) {
    return {
        alarmId: envelope.spec.id,
        occurrenceId: trigger.occurrenceId,
        localDateKey: trigger.occurrenceId.split(':')[1] ?? envelope.occurrence.localDateKey,
        scheduledForMs: trigger.scheduledForMs,
        snoozeIndex: trigger.occurrenceId.includes(':s')
            ? Number(trigger.occurrenceId.split(':s').at(-1) ?? 0)
            : 0,
    };
}
export class AlarmSession {
    bridge;
    callbacks;
    taskContext;
    state = null;
    envelope = null;
    tickHandle = null;
    constructor(bridge, callbacks, taskContext = {}) {
        this.bridge = bridge;
        this.callbacks = callbacks;
        this.taskContext = taskContext;
    }
    snapshot() { return this.state ? structuredClone(this.state) : null; }
    async start(definition, trigger) {
        this.clearTicker();
        this.envelope = parseEnvelope(definition);
        const occurrence = occurrenceFromTrigger(this.envelope, trigger);
        const persisted = await this.bridge.loadRuntime(this.envelope.spec.id);
        const reusable = persisted?.phase === 'scheduled'
            && persisted.spec.id === this.envelope.spec.id
            && persisted.occurrence?.occurrenceId === occurrence.occurrenceId
            && persisted.occurrence.scheduledForMs === occurrence.scheduledForMs
            && persisted.task !== null;
        let armedState;
        if (reusable && persisted) {
            armedState = persisted;
            this.envelope = {
                ...this.envelope,
                spec: persisted.spec,
                occurrence: persisted.occurrence ?? occurrence,
                task: persisted.task ?? this.envelope.task,
            };
        }
        else {
            const task = selectTaskForOccurrence(this.envelope.spec, occurrence, trigger.firedAtMs, this.taskContext);
            this.envelope = { ...this.envelope, occurrence, task };
            const initial = createAlarmRuntime(this.envelope.spec);
            armedState = transitionAlarm(initial, { type: 'arm', occurrence, task }).state;
        }
        this.state = armedState;
        await this.bridge.saveRuntime(this.envelope.spec.id, armedState);
        const nowWallMs = Math.max(trigger.firedAtMs, trigger.scheduledForMs);
        const triggered = transitionAlarm(armedState, {
            type: 'trigger',
            occurrenceId: occurrence.occurrenceId,
            scheduledForMs: occurrence.scheduledForMs,
            wallMs: nowWallMs,
            monoMs: Math.max(0, Math.round(performance.now())),
        });
        await this.apply(triggered);
        this.tickHandle = globalThis.setInterval(() => void this.tick(), 1_000);
    }
    async recover(definition) {
        const persisted = await this.bridge.loadRuntime(definition.alarmId);
        if (!persisted)
            return;
        this.envelope = parseEnvelope(definition);
        this.state = persisted;
        if (persisted.pendingSafety) {
            await this.apply(transitionAlarm(persisted, { type: 'recover-pending' }));
            return;
        }
        if (persisted.phase === 'challenge' && persisted.ringingStartedWallMs !== null) {
            await this.apply(transitionAlarm(persisted, {
                type: 'recover-active',
                wallMs: Date.now(),
                monoMs: Math.max(0, Math.round(performance.now())),
            }));
            this.tickHandle = globalThis.setInterval(() => void this.tick(), 1_000);
        }
    }
    async passed() { await this.transitionTimed('challenge-passed'); }
    async failed() { await this.transitionTimed('challenge-failed'); }
    async snooze() { await this.transitionTimed('snooze'); }
    async escape() { await this.transitionTimed('escape'); }
    dispose() { this.clearTicker(); }
    async tick() {
        if (!this.state || this.state.phase !== 'challenge')
            return;
        if (await this.reconcileNativeTerminal())
            return;
        await this.apply(transitionAlarm(this.state, {
            type: 'tick',
            wallMs: Date.now(),
            monoMs: Math.max(0, Math.round(performance.now())),
        }));
    }
    async transitionTimed(type) {
        if (!this.state)
            return;
        if (await this.reconcileNativeTerminal())
            return;
        await this.apply(transitionAlarm(this.state, {
            type,
            wallMs: Date.now(),
            monoMs: Math.max(0, Math.round(performance.now())),
        }));
    }
    async apply(result) {
        if (!this.envelope)
            throw new Error('alarm session has no envelope');
        this.state = result.state;
        let nativeOverride = false;
        for (const command of result.commands) {
            /**
             * Д7 ревью 27.08.2026: `schedule` тоже глушится нативным терминалом.
             * Раньше глушились только record-outcome и continue-warmup, а снуз
             * ПРОДОЛЖАЛ выполняться: состояние уже fail-safe-stopped, но OS-alarm
             * на +N минут заряжался — сохранённый runtime и заряженный будильник
             * расходились, и через N минут звонил «никто».
             */
            if (nativeOverride && (command.type === 'record-outcome' || command.type === 'continue-warmup' || command.type === 'schedule'))
                continue;
            if (command.type === 'stop-alert') {
                const stopped = await this.bridge.stopAlert(command.occurrenceId, command.reason);
                if (stopped.outcome.reason !== command.reason) {
                    this.state = reconcileNativeTerminal(this.state, stopped.outcome);
                    nativeOverride = true;
                }
                this.callbacks.onStopped(stopped.outcome.reason, this.state);
                continue;
            }
            const принят = await this.applyCommand(command, this.state);
            if (принят === 'native-terminal')
                return;
        }
        this.callbacks.onState(this.state);
        if (this.state.phase !== 'challenge')
            this.clearTicker();
    }
    async applyCommand(command, resultState) {
        if (!this.envelope)
            return undefined;
        if (command.type === 'persist') {
            await this.bridge.saveRuntime(this.envelope.spec.id, command.checkpoint ?? resultState);
        }
        else if (command.type === 'schedule') {
            const scheduledEnvelope = {
                ...this.envelope,
                occurrence: command.occurrence,
                task: resultState.task ?? this.envelope.task,
            };
            await this.bridge.upsert(definitionFromEnvelope(scheduledEnvelope, command.occurrence, resultState.accumulatedRingMs));
            this.envelope = scheduledEnvelope;
            this.callbacks.onSnoozed(resultState);
        }
        else if (command.type === 'arm-native-fail-safe') {
            /**
             * Д8 ревью 27.08.2026: реджект на терминальном occurrence никем не
             * ловился. arm-native-fail-safe идёт ПЕРЕД start-alert, поэтому один
             * голый reject пропускал И сигнал, И открытие задачи — экран замирал.
             * Отказ здесь означает одно из двух: нативная сторона уже закрыла этот
             * occurrence (штатно — сверяемся и принимаем её терминал) либо мост
             * сломан (не штатно — тогда пишем отказ, но задачу всё равно открываем:
             * лучше задача без сторожа, чем звонок без кнопки).
             */
            try {
                await this.bridge.armWatchdog(command.occurrenceId, command.deadlineWallMs);
            }
            catch (error) {
                // ⚠️ Не через reconcileNativeTerminal(): тот работает только в фазе
                // challenge, а сюда реджект приходит ДО неё — терминал ищем напрямую.
                // Принятый терминал ОБРЫВАЕТ весь apply: оставшиеся команды (включая
                // open-challenge) принадлежат ветке, которой больше нет.
                if (await this.adoptNativeTerminal(command.occurrenceId))
                    return 'native-terminal';
                console.error('smart-alarm: armWatchdog отказал вне терминала', error);
            }
        }
        else if (command.type === 'start-alert') {
            try {
                await this.bridge.startAlert(command.occurrenceId);
            }
            catch (error) {
                if (await this.adoptNativeTerminal(command.occurrenceId))
                    return 'native-terminal';
                console.error('smart-alarm: startAlert отказал вне терминала', error);
            }
        }
        else if (command.type === 'open-challenge') {
            this.callbacks.onChallenge(command.task, resultState);
        }
        else if (command.type === 'record-outcome') {
            await this.bridge.recordOutcome({
                alarmId: this.envelope.spec.id,
                occurrenceId: command.occurrenceId,
                reason: command.reason,
                failedAttempts: command.failedAttempts,
                snoozes: command.snoozes,
                totalRingMs: command.totalRingMs,
                recordedAtMs: Date.now(),
            });
        }
        else if (command.type === 'continue-warmup') {
            this.callbacks.onContinueWarmup?.(command.task, resultState);
        }
    }
    clearTicker() {
        if (this.tickHandle !== null)
            globalThis.clearInterval(this.tickHandle);
        this.tickHandle = null;
    }
    /**
     * Д8: принять нативный терминал ПО КОНКРЕТНОМУ occurrence, без оглядки на
     * фазу. Нужен реджектам armWatchdog/startAlert — они приходят до фазы
     * challenge, где общий reconcileNativeTerminal() отказывается работать.
     */
    async adoptNativeTerminal(occurrenceId) {
        const outcome = (await this.bridge.listOutcomes().catch(() => []))
            .find((candidate) => candidate.occurrenceId === occurrenceId);
        if (!outcome || !this.state)
            return false;
        this.state = reconcileNativeTerminal(this.state, outcome);
        this.clearTicker();
        this.callbacks.onStopped(outcome.reason, this.state);
        this.callbacks.onState(this.state);
        return true;
    }
    async reconcileNativeTerminal() {
        if (!this.state?.occurrence || this.state.phase !== 'challenge')
            return false;
        const occurrenceId = this.state.occurrence.occurrenceId;
        const outcome = (await this.bridge.listOutcomes())
            .find((candidate) => candidate.occurrenceId === occurrenceId);
        if (!outcome)
            return false;
        this.state = reconcileNativeTerminal(this.state, outcome);
        this.clearTicker();
        this.callbacks.onStopped(outcome.reason, this.state);
        this.callbacks.onState(this.state);
        return true;
    }
}
function reconcileNativeTerminal(state, outcome) {
    const phase = outcome.reason === 'passed'
        ? 'dismissed'
        : outcome.reason === 'escape'
            ? 'escaped'
            : outcome.reason === 'adapter-error' || outcome.reason === 'clock-error'
                ? 'error-stopped'
                : outcome.reason === 'dispose'
                    ? 'disposed'
                    : 'fail-safe-stopped';
    return {
        ...state,
        phase,
        failedAttempts: Math.max(state.failedAttempts, outcome.failedAttempts),
        snoozeCount: Math.max(state.snoozeCount, outcome.snoozes),
        accumulatedRingMs: Math.max(state.accumulatedRingMs, outcome.totalRingMs),
        ringingStartedWallMs: null,
        ringingStartedMonoMs: null,
        alertActive: false,
        stopIssued: true,
        stopReason: outcome.reason,
        pendingSafety: null,
        revision: state.revision + 1,
    };
}
