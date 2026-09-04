/**
 * ГОТОВЫЕ ЗАПИСИ СТИМУЛОВ (задача a382fd2f) — ПРОВОДКА, А НЕ НАЛИЧИЕ ФАЙЛОВ.
 *
 * Сами записи лежат на psy-games.pro и в репозиторий не входят: Tauri вшивает
 * веб-ассеты в каждую из четырёх нативных библиотек, и 4 МБ корпуса дали бы +17 МБ
 * к APK. Поэтому здесь проверяется поведение клиента: берёт запись, если она есть,
 * и честно падает на системный голос, если нет.
 */
declare const __dirname: string;
declare function require(m: string): any;
const fs = require('fs');
const path = require('path');

import { voiceUrl, voiceIndexReady, ensureVoiceIndex } from '@/src/services/voiceSamples';

const код = (п: string) => fs.readFileSync(path.join(__dirname, '../..', п), 'utf8');   // от frontend/

describe('записи стимулов', () => {
  it('🔴 без загруженного указателя адреса нет — молча в тишину не уходим', () => {
    expect(voiceIndexReady('xx')).toBe(false);
    expect(voiceUrl('дом', 'xx')).toBeNull();
  });

  it('сеть молчит — ensureVoiceIndex не роняет игру', async () => {
    (globalThis as { fetch?: unknown }).fetch = () => Promise.reject(new Error('нет сети'));
    await expect(ensureVoiceIndex('zz')).resolves.toBeUndefined();
    expect(voiceUrl('что угодно', 'zz')).toBeNull();
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
