function xorshift32(seed) {
    let state = seed >>> 0 || 0x9e3779b9;
    return () => {
        state ^= state << 13;
        state ^= state >>> 17;
        state ^= state << 5;
        return state >>> 0;
    };
}
export function shuffledRange(size, seed) {
    if (!Number.isInteger(size) || size < 2 || size > 36)
        throw new RangeError('size must be 2..36');
    const values = Array.from({ length: size }, (_, index) => index + 1);
    const random = xorshift32(seed);
    for (let index = values.length - 1; index > 0; index -= 1) {
        const target = random() % (index + 1);
        const value = values[index];
        values[index] = values[target];
        values[target] = value;
    }
    return values;
}
export function createSchulteChallenge(task, nowMs) {
    const configuredSize = Number(task.settings.size ?? 3);
    const side = Number.isInteger(configuredSize) ? Math.min(4, Math.max(3, configuredSize)) : 3;
    return {
        kind: 'schulte',
        cells: shuffledRange(side * side, task.seed),
        next: 1,
        errors: 0,
        startedAtMs: nowMs,
        completedAtMs: null,
    };
}
export function pressSchulteCell(state, value, nowMs) {
    if (state.completedAtMs !== null)
        return state;
    if (value !== state.next)
        return { ...state, errors: state.errors + 1 };
    const completed = value === state.cells.length;
    return {
        ...state,
        next: state.next + 1,
        completedAtMs: completed ? nowMs : null,
    };
}
export function createChoiceTrials(task) {
    const configuredTrials = Number(task.settings.trials ?? 10);
    const count = Number.isInteger(configuredTrials) ? Math.min(12, Math.max(6, configuredTrials)) : 10;
    const random = xorshift32(task.seed);
    return Array.from({ length: count }, () => ({
        direction: random() % 2 === 0 ? 'left' : 'right',
        delayMs: 450 + (random() % 551),
    }));
}
export function median(values) {
    if (values.length === 0)
        throw new RangeError('median requires at least one value');
    const sorted = [...values].sort((left, right) => left - right);
    const middle = Math.floor(sorted.length / 2);
    const value = sorted[middle];
    if (value === undefined)
        throw new Error('median index is missing');
    if (sorted.length % 2 === 1)
        return value;
    const previous = sorted[middle - 1];
    if (previous === undefined)
        throw new Error('median pair is missing');
    return (previous + value) / 2;
}
