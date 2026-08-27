export class FixedOffsetTimeZoneResolver {
    offsetMinutes;
    constructor(offsetMinutes = 0) {
        this.offsetMinutes = offsetMinutes;
    }
    toLocal(epochMs, _timeZone) {
        const date = new Date(epochMs + this.offsetMinutes * 60_000);
        return {
            year: date.getUTCFullYear(),
            month: date.getUTCMonth() + 1,
            day: date.getUTCDate(),
            hour: date.getUTCHours(),
            minute: date.getUTCMinutes(),
        };
    }
    resolveLocal(request) {
        return Date.UTC(request.year, request.month - 1, request.day, request.hour, request.minute)
            - this.offsetMinutes * 60_000;
    }
}
export class FakeCapabilityProbe {
    report;
    constructor(report) {
        this.report = report;
    }
    async probe() { return this.report; }
}
export class FakeAlarmScheduler {
    operations = [];
    receipts = new Map();
    async list() {
        return [...this.receipts.values()];
    }
    async upsert(occurrence, mode) {
        const receipt = {
            alarmId: occurrence.alarmId,
            occurrenceId: occurrence.occurrenceId,
            scheduledForMs: occurrence.scheduledForMs,
            mode,
            status: 'scheduled',
        };
        this.receipts.set(occurrence.occurrenceId, receipt);
        this.operations.push(`upsert:${occurrence.occurrenceId}:${mode}`);
        return receipt;
    }
    async cancel(occurrenceId) {
        this.receipts.delete(occurrenceId);
        this.operations.push(`cancel:${occurrenceId}`);
    }
}
export class FakeAlertController {
    starts = [];
    stops = [];
    watchdogs = [];
    active = new Set();
    armedWatchdogs = new Map();
    async start(occurrenceId) {
        if (this.active.has(occurrenceId))
            return;
        this.active.add(occurrenceId);
        this.starts.push(occurrenceId);
    }
    async stop(occurrenceId, reason) {
        if (!this.active.delete(occurrenceId))
            return;
        this.stops.push({ occurrenceId, reason });
    }
    async armNativeFailSafe(occurrenceId, deadlineWallMs) {
        const existing = this.armedWatchdogs.get(occurrenceId);
        this.armedWatchdogs.set(occurrenceId, deadlineWallMs);
        if (existing === undefined)
            this.watchdogs.push({ occurrenceId, deadlineWallMs });
        else {
            const entry = this.watchdogs.find((item) => item.occurrenceId === occurrenceId);
            if (entry)
                entry.deadlineWallMs = deadlineWallMs;
        }
    }
}
export class FakeAlarmStore {
    states = new Map();
    saves = [];
    async load(alarmId) {
        return this.states.get(alarmId) ?? null;
    }
    async save(state) {
        this.states.set(state.spec.id, state);
        this.saves.push(state);
    }
}
export class FakeMorningPlanSource {
    plan;
    constructor(plan) {
        this.plan = plan;
    }
    async getMorningPlan(_localDateKey) { return this.plan; }
}
export class FakeWeakDomainSource {
    snapshot;
    constructor(snapshot) {
        this.snapshot = snapshot;
    }
    async getWeakDomainSnapshot() { return this.snapshot; }
}
export class FakeChallengeRunner {
    supportedGameIds;
    opens = [];
    closes = [];
    active = new Set();
    constructor(supportedGameIds) {
        this.supportedGameIds = supportedGameIds;
    }
    canRun(gameId) { return this.supportedGameIds.has(gameId); }
    async open(occurrenceId, task) {
        if (!this.canRun(task.gameId))
            throw new Error(`unsupported fake challenge: ${task.gameId}`);
        if (this.active.has(occurrenceId))
            return;
        this.active.add(occurrenceId);
        this.opens.push({ occurrenceId, task });
    }
    async close(occurrenceId) {
        if (!this.active.delete(occurrenceId))
            return;
        this.closes.push(occurrenceId);
    }
}
export class FakePsyGamesBridge {
    mode;
    continued = [];
    constructor(mode = 'absent') {
        this.mode = mode;
    }
    async capability() { return this.mode; }
    async continueMorning(task) {
        if (this.mode === 'absent')
            return false;
        this.continued.push(task);
        return true;
    }
}
export async function applyFakeCommands(adapters, state, commands, mode) {
    for (const command of commands) {
        if (command.type === 'schedule')
            await adapters.scheduler.upsert(command.occurrence, mode);
        else if (command.type === 'start-alert')
            await adapters.alert.start(command.occurrenceId);
        else if (command.type === 'arm-native-fail-safe')
            await adapters.alert.armNativeFailSafe(command.occurrenceId, command.deadlineWallMs);
        else if (command.type === 'open-challenge')
            await adapters.challenge.open(command.occurrenceId, command.task);
        else if (command.type === 'stop-alert') {
            await adapters.alert.stop(command.occurrenceId, command.reason);
            await adapters.challenge.close(command.occurrenceId);
        }
        else if (command.type === 'record-outcome') {
            adapters.outcomes.push(`${command.occurrenceId}:${command.reason}`);
        }
        else if (command.type === 'continue-warmup') {
            await adapters.bridge.continueMorning(command.task);
        }
        else if (command.type === 'persist') {
            await adapters.store.save(command.checkpoint ?? state);
        }
    }
}
export const CAPABILITY_SCENARIOS = {
    'android-ready': {
        platform: 'android',
        exactScheduling: 'available',
        notifications: 'available',
        lockScreenPresentation: 'available',
        continuousAudio: 'available',
        nativeFailSafe: 'available',
        rebootRestore: 'available',
        selfTest: 'passed',
        probedAtMs: 0,
    },
    'android-degraded': {
        platform: 'android',
        exactScheduling: 'permission-required',
        notifications: 'available',
        lockScreenPresentation: 'unknown',
        continuousAudio: 'unknown',
        nativeFailSafe: 'unknown',
        rebootRestore: 'unknown',
        selfTest: 'not-run',
        probedAtMs: 0,
    },
    ios: {
        platform: 'ios',
        exactScheduling: 'unsupported',
        notifications: 'available',
        lockScreenPresentation: 'restricted',
        continuousAudio: 'unsupported',
        nativeFailSafe: 'unsupported',
        rebootRestore: 'available',
        selfTest: 'not-applicable',
        probedAtMs: 0,
    },
    web: {
        platform: 'web',
        exactScheduling: 'unsupported',
        notifications: 'unsupported',
        lockScreenPresentation: 'unsupported',
        continuousAudio: 'unsupported',
        nativeFailSafe: 'unsupported',
        rebootRestore: 'unsupported',
        selfTest: 'not-applicable',
        probedAtMs: 0,
    },
};
