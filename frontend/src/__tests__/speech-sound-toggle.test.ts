/* psygames-speech-sound-toggle · VER 1 · 22.08.2026 */
/**
 * РЕЧЬ СЧИТАЕТСЯ СО ЗВУКОМ — И МОЛЧИТ ЧЕСТНО, А НЕ ВТИХУЮ.
 *
 * 🔴 ЧТО НАШЛОСЬ 22.08.2026. `services/tts.ts` не спрашивал про общий тумблер
 * звука вовсе: человек выключал звук, а упражнение продолжало говорить. Тихий
 * вечерний шаг (`calmHush`) речь тоже не глушил. Плюс у n-back была СВОЯ
 * озвучка мимо сервиса — второй источник правды, до которого починка общего
 * сервиса не доезжала по устройству.
 *
 * ⚠️ ПОЧЕМУ ПРОСТО ЗАГЛУШИТЬ БЫЛО БЫ ХУЖЕ, ЧЕМ ОСТАВИТЬ КАК БЫЛО. Во всех
 * четырёх местах речь — СТИМУЛ, а не украшение: повтори услышанное, вспомни
 * слова, сравни звуки, буква во втором потоке. Молча замолчать значит выдать
 * человеку неиграбельное упражнение без слова о причине. Поэтому правило другое:
 * пока говорить нельзя — упражнение НЕ НАЧИНАЕТСЯ и объясняет, почему.
 *
 * ⚠️ И ПРИЧИН ДВЕ, ЛЕЧАТСЯ ОНИ ПО-РАЗНОМУ. «Нет голоса в системе» — ставить
 * голос; «звук выключен» — тронуть тумблер. Одно сообщение на оба случая
 * отправляло половину людей чинить не то.
 */
declare const __dirname: string;
declare function require(m: string): any;
const { readFileSync } = require('fs');
const { join } = require('path');

const FRONT = join(__dirname, '../..');
const read = (p: string): string => readFileSync(join(FRONT, p), 'utf8') as string;
const code = (src: string): string =>
  src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1');

/** Упражнения, где речь — стимул: без неё играть не во что. */
const SPEECH_GAMES = [
  'app/games/listening-span.tsx',
  'app/games/phoneme-pairs.tsx',
  'app/games/pseudoword-echo.tsx',
];

describe('речь и тумблер звука', () => {
  it('есть что проверять — иначе гейт зелен вслепую', () => {
    expect(SPEECH_GAMES.length).toBe(3);
    expect(code(read('src/services/tts.ts'))).toContain('ttsBlockedReason');
  });

  it('🔴 сервис речи спрашивает про звук, а не только про голос', () => {
    const src = code(read('src/services/tts.ts'));
    expect(src).toContain('soundOn');
    expect(/if \(!soundOn\(\)\) return 'sound-off';/.test(src)).toBe(true);
  });

  it('🔴 второго источника правды про речь больше нет', () => {
    const src = code(read('app/games/n-back.tsx'));
    // своя SpeechSynthesisUtterance = обход сервиса и тумблера
    expect(/new .*SpeechSynthesisUtterance/.test(src)).toBe(false);
    expect(src).toContain("from '@/src/services/tts'");
  });

  it('🔴 каждое речевое упражнение спрашивает ПРИЧИНУ, а не только наличие голоса', () => {
    const missing = SPEECH_GAMES.filter((g) => !code(read(g)).includes('useTtsBlock'));
    expect(missing).toEqual([]);
  });

  it('🔴 старт заблокирован по причине, а не по одному лишь голосу', () => {
    const wrong = SPEECH_GAMES.filter((g) => !/const voiceOk = ttsBlock === null;/.test(code(read(g))));
    expect(wrong).toEqual([]);
  });

  it('🔴 у выключенного звука своё сообщение, а не общее «нет голоса»', () => {
    const silent = SPEECH_GAMES.filter((g) => !code(read(g)).includes('voiceSoundOff'));
    expect(silent).toEqual([]);
  });

  /**
   * Двойной n-back считает итог по ХУДШЕМУ из двух потоков. Немой слуховой поток
   * даёт нули — человек с выключенным звуком проваливал бы уровень, не сделав
   * ничего неверно. Значит без речи двойного режима быть не должно.
   */
  it('🔴 без речи n-back не уходит в двойной режим', () => {
    const src = code(read('app/games/n-back.tsx'));
    expect(src).toContain("setModality(ttsBlock === null ? p.modality : 'single')");
    expect(src).toContain('Math.min(accuracy, audioAccuracy)');   // иначе проверка беспредметна
  });

  it('сообщение про выключенный звук есть во всех двенадцати языках', () => {
    const base = read('src/contexts/LanguageContext.tsx');
    expect(base).toContain('voiceSoundOff:');
    const langs = ['de', 'es', 'fr', 'it', 'pt', 'ja', 'ko', 'zh', 'hi', 'ar'];
    const missing = langs.filter((l) => !read(`src/contexts/translations/${l}.ts`).includes('voiceSoundOff'));
    expect(missing).toEqual([]);
  });
});
