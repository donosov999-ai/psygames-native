/* psygames-speech-sound-toggle · VER 2 · 22.08.2026 */
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
jest.mock('@/src/services/feedback', () => ({ soundOn: jest.fn(() => true) }));
import { ttsBlockedReason } from '@/src/services/tts';
import { soundOn } from '@/src/services/feedback';

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

  /**
   * 🔴 ПОЧЕМУ ЗДЕСЬ ГОНЯЕТСЯ ФУНКЦИЯ, А НЕ ИЩЕТСЯ СТРОЧКА В ИСХОДНИКЕ.
   * Прежняя редакция сверяла текст `if (!soundOn()) return 'sound-off';` глазами
   * регулярки — и ровно поэтому НЕ ЗАМЕТИЛА, когда 22.08.2026 из сервиса убрали
   * СОСЕДНЮЮ ветку про отсутствие голоса: буква про звук на месте, гейт зелёный,
   * а половина причины пропала. Поэтому обе ветки теперь проверяются вызовом.
   */
  describe('🔴 обе причины молчания различаются вызовом, а не текстом исходника', () => {
    const withVoices = (langs: string[] | null) => {
      const w = (globalThis as any).window || ((globalThis as any).window = {});
      w.speechSynthesis = langs === null ? undefined
        : { getVoices: () => langs.map((l) => ({ lang: l })) };
    };
    const setSound = (on: boolean) => (soundOn as jest.Mock).mockReturnValue(on);
    afterEach(() => { withVoices(['en-US']); setSound(true); });

    it('звук включён и голос языка есть — молчать не из-за чего', () => {
      withVoices(['en-US']); setSound(true);
      expect(ttsBlockedReason('en')).toBe(null);
    });

    it('звук выключен — причина «звук», человеку нужен тумблер', () => {
      withVoices(['en-US']); setSound(false);
      expect(ttsBlockedReason('en')).toBe('sound-off');
    });

    it('голоса языка нет — причина «голос», человеку нужен голос в системе', () => {
      withVoices(['de-DE']); setSound(true);
      expect(ttsBlockedReason('en')).toBe('no-voice');
    });

    it('синтеза нет вовсе — тоже «голос», а не тишина без объяснения', () => {
      withVoices(null); setSound(true);
      expect(ttsBlockedReason('en')).toBe('no-voice');
    });

    /**
     * Порядок причин — не вкусовщина. Когда сломано И то и другое, называть надо
     * ТУ, что человек чинит сам одним нажатием. Отправить его ставить системный
     * голос, когда у него просто выключен звук, — это отправить чинить не то.
     */
    it('сломано и то и другое — называется тумблер, он ближе к руке', () => {
      withVoices(['de-DE']); setSound(false);
      expect(ttsBlockedReason('en')).toBe('sound-off');
    });
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
