/**
 * ГОТОВЫЕ ЗАПИСИ СТИМУЛОВ (задача a382fd2f) — ПРОВОДКА, А НЕ НАЛИЧИЕ ФАЙЛОВ.
 *
 * Сами записи лежат на psy-games.pro и в репозиторий не входят: Tauri вшивает
 * веб-ассеты в каждую из четырёх нативных библиотек, и 4 МБ корпуса дали бы +17 МБ
 * к APK. Поэтому здесь проверяется поведение клиента: берёт запись, если она есть,
 * и честно падает на системный голос, если нет.
 */
import { voiceUrl, voiceIndexReady, ensureVoiceIndex } from '@/src/services/voiceSamples';
import { VOICE_INDEX, VOICE_INDEX_COUNTS } from '@/src/constants/voiceIndex.generated';

declare const __dirname: string;
declare function require(m: string): any;

// Файлы читаем через require: гейт типов в CI гоняет свой tsconfig без типов node.
const fs = require('fs');
const path = require('path');

const код = (п: string) => fs.readFileSync(path.join(__dirname, '../..', п), 'utf8');   // от frontend/

describe('записи стимулов', () => {
  it('🔴 у неизвестного языка записей нет — молча в тишину не уходим', () => {
    expect(voiceIndexReady('xx')).toBe(false);
    expect(voiceUrl('дом', 'xx')).toBeNull();
  });

  it('ensureVoiceIndex ничего не грузит и не роняет игру', async () => {
    await expect(ensureVoiceIndex('zz')).resolves.toBeUndefined();
    expect(voiceUrl('что угодно', 'zz')).toBeNull();
  });

  /**
   * 🔴 УКАЗАТЕЛЬ В БАНДЛЕ, ЗВУК СНАРУЖИ — И ЭТО НЕ ПРОИЗВОЛ. Замер 04.09.2026:
   * у psy-games.pro НЕТ заголовков CORS, значит `fetch` указателя из приложения
   * браузер заблокировал бы, и озвучка молча осталась бы на системном голосе.
   * Тег `Audio` CORS не требует — поэтому 4 МБ звука снаружи, 50 КБ указателя внутри.
   */
  it('🔴 в указателе не меньше 150 записей на каждый из семи языков', () => {
    const мало = Object.entries(VOICE_INDEX_COUNTS).filter(([, n]) => n < 150).map(([л, n]) => `${л}:${n}`);
    expect(мало).toEqual([]);
    expect(Object.keys(VOICE_INDEX_COUNTS).length).toBeGreaterThanOrEqual(7);
  });

  it('🔴 адрес записи ведёт на сайт, а не в бандл', () => {
    const слово = Object.keys(VOICE_INDEX.ru!)[0]!;
    const url = voiceUrl(слово, 'ru');
    expect(url).toMatch(/^https:\/\/psy-games\.pro\/voice\/ru\/[0-9a-f]{16}\.opus$/);
  });

  it('слова, которого нет в корпусе, — нет и адреса (падаем на системный голос)', () => {
    expect(voiceUrl('такогословаточнонет', 'ru')).toBeNull();
  });

  it('счётчики не врут про содержимое указателя', () => {
    for (const [язык, n] of Object.entries(VOICE_INDEX_COUNTS)) {
      expect(`${язык}: ${Object.keys(VOICE_INDEX[язык] ?? {}).length}`).toBe(`${язык}: ${n}`);
    }
  });

  it('🔴 tts берёт запись ПЕРЕД синтезом, а не вместо фолбэка', () => {
    const src = код('src/services/tts.ts');
    // Порядок важен: сперва ищем файл, и только при неудаче — системный голос.
    const i = src.indexOf('voiceUrl(text, lang)');
    const j = src.indexOf('SpeechSynthesisUtterance');
    expect(i).toBeGreaterThan(0);
    expect(j).toBeGreaterThan(i);
    expect(src).toContain('if (url && await сыграть(url, rate)) return;');
  });

  it('🔴 указатель тянется ДО партии, а не внутри пробы', () => {
    for (const игра of ['phoneme-pairs', 'listening-span', 'dictation']) {
      const src = код(`app/games/${игра}.tsx`);
      expect(`${игра}: ${src.includes('ensureVoiceIndex')}`).toBe(`${игра}: true`);
      // Внутри обработчика пробы вызова быть не должно — только в эффекте по языку.
      expect(src).toMatch(/useEffect\(\(\) => \{ ensureVoiceIndex/);
    }
  });

  it('корпус НЕ лежит в бандле — иначе APK вырастет на 17 МБ', () => {
    const внутри = path.join(__dirname, '../../assets/voice');
    expect(fs.existsSync(внутри)).toBe(false);
  });

  it('генератор корпуса на месте и объясняет, почему без букв', () => {
    const скрипт = код('../scripts/gen_voice_samples.py');
    expect(скрипт).toContain('gpt-audio-mini');
    expect(скрипт).toContain('БУКВЫ n-back СЮДА НЕ ВХОДЯТ');
    // Сверка сказанного с заказанным — то, без чего в корпус уехали бы приветствия.
    expect(скрипт).toContain('def годен');
  });
});
