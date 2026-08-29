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
        /**
         * Д11 ревью 27.08.2026: параметр overlap был МЁРТВЫМ — объявлен в
         * контракте, прокинут из расписания, и не читался ни разу: при осеннем
         * повторе часа всегда брался ранний матч. Теперь политика читается:
         * 'earlier' — первый, иначе — последний. Модель пока допускает только
         * 'earlier' (model.ts), но движок больше не игнорирует контракт.
         */
        const выбрать = (matches) => (request.overlap === 'earlier' ? matches[0] : matches[matches.length - 1]) ?? null;
        if (exact.length > 0)
            return выбрать(exact);
        if (request.gap !== 'next-valid')
            return null;
        // DST gaps are normally one hour. The wider bound also handles historic
        // offset jumps without silently moving an alarm to another day.
        for (let minute = 1; minute <= 180; minute += 1) {
            const shifted = shiftedLocal(request, minute);
            const matches = this.findMatches(shifted);
            if (matches.length > 0)
                return выбрать(matches);
        }
        return null;
    }
    /**
     * Д10 ревью 27.08.2026: было — линейный перебор 2161 смещения (±18 часов по
     * минуте), formatToParts на каждом; в DST-дыре resolveLocal повторяет это до
     * 180 раз — до ~389 000 вызовов на одно вычисление, в UI-потоке.
     *
     * Стало — схождение по фактическому смещению зоны (2 шага Ньютона по сути:
     * off(t) читается из самой зоны) плюс узкое окно ±2 часа шагом 15 минут
     * вокруг сошедшегося кандидата — оно и ловит второй матч осеннего повтора
     * (переходы бывают 30/45-минутные, шаг 15 покрывает). Вызовов toLocal:
     * ~19 вместо 2161 на запрос. Семантика та же: ВСЕ совпадения, по возрастанию.
     */
    findMatches(request) {
        const wanted = request;
        const approximate = Date.UTC(request.year, request.month - 1, request.day, request.hour, request.minute);
        const смещение = (t) => {
            const л = this.toLocal(t, request.timeZone);
            return Date.UTC(л.year, л.month - 1, л.day, л.hour, л.minute) - t;
        };
        const якорь1 = approximate - смещение(approximate);
        const якорь2 = approximate - смещение(якорь1);
        const кандидаты = new Set();
        for (const якорь of [якорь1, якорь2]) {
            for (let м = -120; м <= 120; м += 15)
                кандидаты.add(якорь + м * 60_000);
        }
        const matches = [];
        for (const candidate of кандидаты) {
            if (candidate < 0)
                continue;
            if (compareLocal(this.toLocal(candidate, request.timeZone), wanted) === 0)
                matches.push(candidate);
        }
        matches.sort((left, right) => left - right);
        return matches;
    }
}
