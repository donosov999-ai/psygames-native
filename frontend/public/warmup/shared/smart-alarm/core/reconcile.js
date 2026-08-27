import { deriveDeliveryMode } from './model.js';
function sameReceipt(receipt, desired, mode) {
    return receipt.status === 'scheduled'
        && receipt.alarmId === desired.alarmId
        && receipt.occurrenceId === desired.occurrenceId
        && receipt.scheduledForMs === desired.scheduledForMs
        && receipt.mode === mode;
}
/**
 * Cold-start reconciliation is deterministic and idempotent. The platform's
 * receipt list is evidence; a stale JavaScript checkpoint never starts sound.
 */
export function reconcileSchedules(desired, observed, capabilities) {
    const mode = deriveDeliveryMode(capabilities);
    const actions = [];
    const issues = [];
    const desiredIds = new Set(desired.map((entry) => entry.occurrence.occurrenceId));
    if (mode === 'unavailable') {
        for (const receipt of observed) {
            actions.push({ type: 'cancel', alarmId: receipt.alarmId, occurrenceId: receipt.occurrenceId });
        }
        if (desired.length > 0)
            issues.push('platform delivery is unavailable; existing receipts were cancelled and no alarm was scheduled');
        return { mode, actions, issues };
    }
    for (const receipt of observed) {
        if (!desiredIds.has(receipt.occurrenceId)) {
            actions.push({ type: 'cancel', alarmId: receipt.alarmId, occurrenceId: receipt.occurrenceId });
        }
    }
    for (const entry of desired) {
        const matches = observed.filter((receipt) => sameReceipt(receipt, entry.occurrence, mode));
        if (matches.length === 0) {
            actions.push({ type: 'upsert', occurrence: entry.occurrence, mode });
            continue;
        }
        for (let index = 1; index < matches.length; index += 1) {
            const duplicate = matches[index];
            if (duplicate)
                actions.push({ type: 'cancel', alarmId: duplicate.alarmId, occurrenceId: duplicate.occurrenceId });
        }
    }
    if (mode !== 'real-alarm' && capabilities.platform === 'android') {
        issues.push(`Android is degraded to ${mode}; real-alarm requirements or self-test are incomplete`);
    }
    if (capabilities.platform === 'ios') {
        issues.push('iOS contract is notification-only; opening the challenge requires a notification tap');
    }
    return { mode, actions, issues };
}
