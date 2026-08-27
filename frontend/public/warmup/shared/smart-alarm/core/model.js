const isAvailable = (state) => state === 'available';
/**
 * Product wording is derived from observed capability, never from an OS name or
 * version string. iOS remains notification-only in this prototype contract.
 */
export function deriveDeliveryMode(report) {
    if (report.platform === 'web' || report.platform === 'desktop')
        return 'in-app-simulation';
    if (report.platform === 'ios') {
        return isAvailable(report.notifications) ? 'notification-only' : 'unavailable';
    }
    if (report.platform !== 'android')
        return 'unavailable';
    const realAlarmReady = [
        report.exactScheduling,
        report.notifications,
        report.lockScreenPresentation,
        report.continuousAudio,
        report.nativeFailSafe,
        report.rebootRestore,
    ].every(isAvailable) && report.selfTest === 'passed';
    if (realAlarmReady)
        return 'real-alarm';
    if (isAvailable(report.notifications))
        return 'notification-only';
    return 'unavailable';
}
export function createAlarmRuntime(spec) {
    return {
        spec,
        phase: 'idle',
        occurrence: null,
        task: null,
        failedAttempts: 0,
        snoozeCount: 0,
        accumulatedRingMs: 0,
        ringingStartedWallMs: null,
        ringingStartedMonoMs: null,
        lastMonoMs: null,
        alertActive: false,
        stopIssued: false,
        stopReason: null,
        pendingSafety: null,
        revision: 0,
    };
}
