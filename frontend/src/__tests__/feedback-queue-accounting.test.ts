/* psygames-feedback-queue-accounting-gate · VER 1 · 26.08.2026 */
/**
 * НЕДОШЕДШИЕ ОТЗЫВЫ ДОЛЖНЫ СЧИТАТЬСЯ, А НЕ ИСЧЕЗАТЬ.
 *
 * 🔴 ЗАЧЕМ. Требование Дениса 26.08.2026: «конвейер должен быть единый, чтобы если
 * что-то сломается — не умирало тихо, а падало громко». Разбор показал, что тише
 * всего умирала именно очередь отзывов:
 *   · строка ложилась в очередь БЕЗ времени постановки — доехав через трое суток,
 *     она выглядела свежей, и по данным нельзя было понять, что связь рвалась;
 *   · при переполнении `slice(-QUEUE_MAX)` молча ВЫБРАСЫВАЛ самые старые, а
 *     человек видел «сохранено, дошлём» — сообщение переставало существовать;
 *   · причина отказа не сохранялась: повторные неудачи неразличимы.
 *
 * ⚠️ ЭТОТ ГЕЙТ ЧИТАЕТ ИСХОДНИК, А НЕ ГОНЯЕТ ОЧЕРЕДЬ. Очередь живёт на
 * AsyncStorage и в Supabase, поднимать их в jest ради проверки «поле пишется» —
 * дороже пользы. Здесь сторожится ровно то, что легко потерять при следующей
 * правке: что учёт вообще есть и что счётчик потерянных обнуляется ТОЛЬКО после
 * подтверждённой доставки.
 */
declare const __dirname: string;
declare function require(id: string): any;
const fs = require('fs');
const path = require('path');

const SRC = fs.readFileSync(
  path.resolve(__dirname, '..', 'services', 'appFeedback.ts'),
  'utf8',
) as string;

/** Исходник без комментариев: рассказ про учёт не считается учётом. */
const code: string = SRC.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');

describe('очередь отзывов: недошедшее считается', () => {
  it('есть что проверять — очередь и досылка на месте', () => {
    expect(code).toMatch(/FEEDBACK_QUEUE_KEY/);
    expect(code).toMatch(/flushFeedbackQueue/);
  });

  it('🔴 строка получает время постановки в очередь', () => {
    // Без него отзыв, пролежавший трое суток, доедет как свежий.
    expect(code).toMatch(/queued_at/);
  });

  it('🔴 задержка доставки и число попыток доезжают до базы', () => {
    expect(code).toMatch(/queued_seconds/);
    expect(code).toMatch(/queue_attempts/);
  });

  it('🔴 выброшенные при переполнении СЧИТАЮТСЯ, а не исчезают', () => {
    expect(code).toMatch(/FEEDBACK_DROPPED_KEY/);
    expect(code).toMatch(/queue_dropped_total/);
    // Обрезка обязана быть замечена: если `slice` есть, а счётчика рядом нет —
    // значит вернулась тихая потеря.
    const flushIdx = code.indexOf('function queueFeedback');
    const chunk = code.slice(flushIdx, flushIdx + 1400);
    expect(chunk).toMatch(/slice\(-QUEUE_MAX\)/);
    expect(chunk).toMatch(/FEEDBACK_DROPPED_KEY/);
  });

  it('🔴 счётчик потерянных обнуляется ТОЛЬКО после подтверждённой доставки', () => {
    /**
     * Самое хрупкое место. Обнулить счётчик сразу после чтения — соблазнительно
     * и коротко, но тогда при неудачной досылке цифра исчезнет вместе с ней, и
     * потери снова станут невидимы. Сброс обязан стоять ПОСЛЕ флага, который
     * ставится только в ветке успеха.
     */
    const flush = code.slice(code.indexOf('export async function flushFeedbackQueue'));
    const setZero = flush.indexOf(`setItem(FEEDBACK_DROPPED_KEY, '0')`);
    const flagSet = flush.indexOf('droppedReported = true');
    expect(setZero).toBeGreaterThan(-1);
    expect(flagSet).toBeGreaterThan(-1);
    expect(setZero).toBeGreaterThan(flagSet);
    expect(flush).toMatch(/if \(droppedReported\)/);
  });

  it('🔴 причина последнего отказа хранится при строке', () => {
    expect(code).toMatch(/queue_last_error/);
  });
});
