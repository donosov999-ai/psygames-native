function assertSafeMs(value, field) {
    if (!Number.isSafeInteger(value) || value < 0)
        throw new RangeError(`${field} must be a non-negative safe integer`);
}
export function validateLocalTime(time) {
    if (!Number.isInteger(time.hour) || time.hour < 0 || time.hour > 23)
        throw new RangeError('hour must be 0..23');
    if (!Number.isInteger(time.minute) || time.minute < 0 || time.minute > 59)
        throw new RangeError('minute must be 0..59');
}
export function validateWeeklySchedule(schedule) {
    validateLocalTime(schedule.time);
    if (!schedule.timeZone.trim())
        throw new RangeError('timeZone is required');
    if (schedule.weekdays.length === 0)
        throw new RangeError('at least one weekday is required');
    const unique = new Set();
    for (const weekday of schedule.weekdays) {
        if (!Number.isInteger(weekday) || weekday < 0 || weekday > 6)
            throw new RangeError('weekday must be 0..6');
        if (unique.has(weekday))
            throw new RangeError('weekdays must be unique');
        unique.add(weekday);
    }
}
export function addLocalDays(date, days) {
    if (!Number.isInteger(days))
        throw new RangeError('days must be an integer');
    const shifted = new Date(Date.UTC(date.year, date.month - 1, date.day + days));
    return {
        year: shifted.getUTCFullYear(),
        month: shifted.getUTCMonth() + 1,
        day: shifted.getUTCDate(),
    };
}
export function weekdayForLocalDate(date) {
    return new Date(Date.UTC(date.year, date.month - 1, date.day)).getUTCDay();
}
export function localDateKey(date) {
    const pad = (value) => String(value).padStart(2, '0');
    return `${date.year}-${pad(date.month)}-${pad(date.day)}`;
}
export function nextWeeklyOccurrence(spec, nowMs, resolver) {
    assertSafeMs(nowMs, 'nowMs');
    if (!spec.enabled)
        throw new Error('disabled alarms do not have a next occurrence');
    validateWeeklySchedule(spec.schedule);
    const localNow = resolver.toLocal(nowMs, spec.schedule.timeZone);
    const startDate = { year: localNow.year, month: localNow.month, day: localNow.day };
    const allowed = new Set(spec.schedule.weekdays);
    for (let dayOffset = 0; dayOffset <= 7; dayOffset += 1) {
        const date = addLocalDays(startDate, dayOffset);
        if (!allowed.has(weekdayForLocalDate(date)))
            continue;
        const candidate = resolver.resolveLocal({
            ...date,
            ...spec.schedule.time,
            timeZone: spec.schedule.timeZone,
            gap: spec.schedule.dstGap,
            overlap: spec.schedule.dstOverlap,
        });
        if (candidate === null)
            continue;
        assertSafeMs(candidate, 'resolved occurrence');
        if (candidate <= nowMs)
            continue;
        const dateKey = localDateKey(date);
        return {
            alarmId: spec.id,
            occurrenceId: `${spec.id}:${dateKey}`,
            localDateKey: dateKey,
            scheduledForMs: candidate,
            snoozeIndex: 0,
        };
    }
    throw new Error('unable to resolve the next weekly occurrence within seven days');
}
export function snoozedOccurrence(current, nowMs, delayMs) {
    assertSafeMs(nowMs, 'nowMs');
    if (!Number.isSafeInteger(delayMs) || delayMs <= 0)
        throw new RangeError('delayMs must be a positive safe integer');
    const scheduledForMs = nowMs + delayMs;
    assertSafeMs(scheduledForMs, 'snooze scheduledForMs');
    const snoozeIndex = current.snoozeIndex + 1;
    return {
        ...current,
        occurrenceId: `${current.alarmId}:${current.localDateKey}:s${snoozeIndex}`,
        scheduledForMs,
        snoozeIndex,
    };
}
