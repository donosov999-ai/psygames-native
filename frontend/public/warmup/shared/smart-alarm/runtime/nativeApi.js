class TauriAlarmBridge {
    invoke(command, payload = {}) {
        const invoke = globalThis.__TAURI__?.core?.invoke;
        if (!invoke)
            throw new Error('Tauri native bridge is unavailable');
        return invoke(`plugin:smart-alarm|${command}`, { payload });
    }
    probe() { return this.invoke('probe'); }
    requestPermissions() { return this.invoke('request_permissions'); }
    async upsert(definition) {
        const receipt = await this.invoke('upsert', definition);
        if (receipt.status === 'failed') {
            throw new Error(receipt.adapterMessage ?? `native scheduler rejected ${receipt.occurrenceId}`);
        }
        return receipt;
    }
    cancel(alarmId) { return this.invoke('cancel', { alarmId }); }
    list() { return this.invoke('list'); }
    saveRuntime(alarmId, runtime) {
        return this.invoke('save_runtime', { alarmId, runtimeJson: JSON.stringify(runtime) });
    }
    async loadRuntime(alarmId) {
        const value = await this.invoke('load_runtime', { alarmId });
        return value.runtimeJson ? JSON.parse(value.runtimeJson) : null;
    }
    startAlert(occurrenceId) { return this.invoke('start_alert', { occurrenceId }); }
    stopAlert(occurrenceId, reason) {
        return this.invoke('stop_alert', { occurrenceId, reason });
    }
    armWatchdog(occurrenceId, deadlineWallMs) {
        return this.invoke('arm_watchdog', { occurrenceId, deadlineWallMs });
    }
    takePendingTrigger() { return this.invoke('take_pending_trigger'); }
    recordOutcome(outcome) { return this.invoke('record_outcome', outcome); }
    listOutcomes() { return this.invoke('list_outcomes'); }
    async subscribePendingTriggers(listener) {
        const addPluginListener = globalThis.__TAURI__?.core?.addPluginListener;
        if (addPluginListener) {
            try {
                const handle = await addPluginListener('smart-alarm', 'pending-trigger', listener);
                return () => handle.unregister();
            }
            catch {
                // Desktop builds use the regular Tauri event bus below.
            }
        }
        const listen = globalThis.__TAURI__?.event?.listen;
        if (!listen)
            return async () => { };
        const unlisten = await listen('smart-alarm://pending-trigger', listener);
        return async () => { unlisten(); };
    }
}
class BrowserAlarmBridge {
    definitions = new Map();
    runtimes = new Map();
    outcomes = [];
    activeTones = new Map();
    async probe() {
        return {
            platform: 'web',
            scheduler: 'unsupported',
            exactAlarm: 'unsupported',
            notifications: 'unsupported',
            fullScreenIntent: 'unsupported',
            continuousAudio: 'restricted',
            rebootRestore: 'unsupported',
            selfTest: 'not-applicable',
            userSessionRequired: true,
            notes: ['Browser preview only. Closing this page removes all schedules.'],
        };
    }
    async requestPermissions() {
        return { openedSettings: false, runtimeRequested: false, capabilities: await this.probe() };
    }
    async upsert(definition) {
        this.definitions.set(definition.alarmId, structuredClone(definition));
        return {
            alarmId: definition.alarmId,
            occurrenceId: definition.occurrenceId,
            scheduledForMs: definition.triggerAtMs,
            status: 'scheduled',
            adapterMessage: 'browser preview only',
        };
    }
    async cancel(alarmId) {
        this.definitions.delete(alarmId);
        this.runtimes.delete(alarmId);
    }
    async list() {
        return [...this.definitions.values()].map((value) => structuredClone(value));
    }
    async saveRuntime(alarmId, runtime) {
        this.runtimes.set(alarmId, structuredClone(runtime));
    }
    async loadRuntime(alarmId) {
        const runtime = this.runtimes.get(alarmId);
        return runtime ? structuredClone(runtime) : null;
    }
    async startAlert(occurrenceId) {
        if (this.activeTones.has(occurrenceId))
            return;
        const context = new AudioContext();
        const oscillator = context.createOscillator();
        const gain = context.createGain();
        oscillator.type = 'sine';
        oscillator.frequency.value = 660;
        gain.gain.value = 0.08;
        oscillator.connect(gain).connect(context.destination);
        oscillator.start();
        this.activeTones.set(occurrenceId, { context, oscillator });
    }
    async stopAlert(occurrenceId, reason) {
        const active = this.activeTones.get(occurrenceId);
        if (active) {
            active.oscillator.stop();
            await active.context.close();
            this.activeTones.delete(occurrenceId);
        }
        return {
            accepted: true,
            outcome: {
                alarmId: occurrenceId.split(':')[0] ?? occurrenceId,
                occurrenceId,
                reason,
                failedAttempts: 0,
                snoozes: Number(occurrenceId.split(':s').at(-1) ?? 0) || 0,
                totalRingMs: 0,
                recordedAtMs: Date.now(),
            },
        };
    }
    async armWatchdog(_occurrenceId, _deadlineWallMs) { }
    async takePendingTrigger() { return null; }
    async recordOutcome(outcome) {
        if (this.outcomes.some((entry) => entry.occurrenceId === outcome.occurrenceId && entry.reason === outcome.reason))
            return;
        this.outcomes.push(structuredClone(outcome));
    }
    async listOutcomes() {
        return this.outcomes.map((value) => structuredClone(value));
    }
    async subscribePendingTriggers(_listener) {
        return async () => { };
    }
}
export function createNativeAlarmBridge() {
    return globalThis.__TAURI__?.core?.invoke ? new TauriAlarmBridge() : new BrowserAlarmBridge();
}
/**
 * ПЕРЕВОДЧИК МОСТ → ПРОДУКТ. Единственное место, где имена платформенных фактов
 * (Android-термины моста) становятся именами обещаний продукта (core-модель).
 *
 * 🔴 До 28.08.2026 перевода не было ВООБЩЕ, и слой примирения (reconcileSchedules /
 * deriveDeliveryMode) не был подключён к продукту: 3 из 6 полей расходились
 * именами, наивная подводка молча дала бы undefined в каждом третьем поле —
 * и deriveDeliveryMode уверенно ответил бы 'unavailable' при живой платформе.
 *
 * Карта (слева мост, справа продукт):
 *   exactAlarm        → exactScheduling        — 1:1, точная постановка;
 *   fullScreenIntent  → lockScreenPresentation — 1:1, показ поверх лок-скрина;
 *   scheduler         → nativeFailSafe         — ⚠️ НЕ 1:1 по имени, но честно по
 *     устройству ТЕКУЩЕГО моста: сторож остановки (armWatchdog) живёт в том же
 *     потоке-планировщике (desktop.rs), отдельного факта проба не сообщает.
 *     Если сторож отделится от планировщика — эта строка станет ложью: тогда
 *     расширять пробу, а не подгонять перевод.
 *   userSessionRequired в продукт не переносится: его смысл уже выражен платформой
 *     (web/desktop → 'in-app-simulation' в deriveDeliveryMode).
 */
export function toCapabilityReport(native, probedAtMs) {
    const platform = native.platform === 'macos' || native.platform === 'windows' || native.platform === 'linux'
        ? 'desktop'
        : native.platform;
    return {
        platform,
        exactScheduling: native.exactAlarm,
        notifications: native.notifications,
        lockScreenPresentation: native.fullScreenIntent,
        continuousAudio: native.continuousAudio,
        nativeFailSafe: native.scheduler,
        rebootRestore: native.rebootRestore,
        selfTest: native.selfTest,
        probedAtMs,
        notes: native.notes,
    };
}
