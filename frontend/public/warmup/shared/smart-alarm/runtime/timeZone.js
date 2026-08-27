const formatterCache = new Map();
function formatter(timeZone) {
    const cached = formatterCache.get(timeZone);
    if (cached)
        return cached;
    const created = new Intl.DateTimeFormat('en-CA', {
        timeZone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hourCycle: 'h23',
    });
    formatterCache.set(timeZone, created);
    return created;
}
function numericPart(parts, type) {
    const value = parts.find((part) => part.type === type)?.value;
    if (!value || !/^\d+$/.test(value))
        throw new Error(`Intl did not provide ${type}`);
    return Number(value);
}
function compareLocal(left, right) {
    const fields = ['year', 'month', 'day', 'hour', 'minute'];
    for (const field of fields) {
        const difference = left[field] - right[field];
        if (difference !== 0)
            return Math.sign(difference);
    }
    return 0;
}
function shiftedLocal(request, minutes) {
    const shifted = new Date(Date.UTC(request.year, request.month - 1, request.day, request.hour, request.minute + minutes));
    return {
        ...request,
        year: shifted.getUTCFullYear(),
        month: shifted.getUTCMonth() + 1,
        day: shifted.getUTCDate(),
        hour: shifted.getUTCHours(),
        minute: shifted.getUTCMinutes(),
    };
}
export class IntlTimeZoneResolver {
    toLocal(epochMs, timeZone) {
        if (!Number.isSafeInteger(epochMs) || epochMs < 0)
            throw new RangeError('epochMs must be a non-negative safe integer');
        const parts = formatter(timeZone).formatToParts(epochMs);
        return {
            year: numericPart(parts, 'year'),
            month: numericPart(parts, 'month'),
            day: numericPart(parts, 'day'),
            hour: numericPart(parts, 'hour'),
            minute: numericPart(parts, 'minute'),
        };
    }
    resolveLocal(request) {
        const exact = this.findMatches(request);
        if (exact.length > 0)
            return exact[0] ?? null;
        if (request.gap !== 'next-valid')
            return null;
        // DST gaps are normally one hour. The wider bound also handles historic
        // offset jumps without silently moving an alarm to another day.
        for (let minute = 1; minute <= 180; minute += 1) {
            const shifted = shiftedLocal(request, minute);
            const matches = this.findMatches(shifted);
            if (matches.length > 0)
                return matches[0] ?? null;
        }
        return null;
    }
    findMatches(request) {
        const wanted = request;
        const approximate = Date.UTC(request.year, request.month - 1, request.day, request.hour, request.minute);
        const matches = [];
        for (let offsetMinutes = -18 * 60; offsetMinutes <= 18 * 60; offsetMinutes += 1) {
            const candidate = approximate + offsetMinutes * 60_000;
            if (candidate < 0)
                continue;
            if (compareLocal(this.toLocal(candidate, request.timeZone), wanted) === 0)
                matches.push(candidate);
        }
        matches.sort((left, right) => left - right);
        return matches;
    }
}
