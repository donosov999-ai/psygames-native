/**
 * Библиотека фоновой музыки: файлы на месте, формат тот, что играет везде,
 * генератор «трёх нот» не вернулся.
 *
 * ЗАЧЕМ. Отзыв тестера дословно: «Музыка 3 ноты) или убрать пока или какие нить
 * бесплатные треки сделать». Музыка синтезировалась на лету — четыре аккорда
 * чистыми синусами. Теперь это настоящие треки, и сломать это можно тихо:
 * удалить файл (плеер молча не запустится), перекодировать в opus ради веса
 * (перестанет играть на macOS), вернуть генератор «на время».
 *
 * ⚠️ ПОЧЕМУ MP3, А НЕ OPUS. Opus легче почти вдвое — 5 МБ против 7.8. Но в
 * WKWebView на macOS он воспроизводится ненадёжно, а десктопная сборка живёт
 * именно там. Экономия трёх мегабайт не стоит молчащей музыки у части людей.
 */
declare const __dirname: string;
declare function require(m: string): any;
const { readFileSync, existsSync, statSync } = require('fs');
const { join } = require('path');

const MUSIC_DIR = join(__dirname, '../../assets/audio/music');
const SERVICE = join(__dirname, '../services/music.ts');
const FEEDBACK = join(__dirname, '../services/feedback.ts');

/** Треки, сгенерированные Lyria 3 Pro 13.08.2026 (см. шапку music.ts). */
const EXPECTED = ['breathing', 'evening', 'focus-pulse', 'morning', 'soft-piano', 'warm-strings'];

describe('библиотека фоновой музыки', () => {
  const src: string = readFileSync(SERVICE, 'utf8');

  it('есть что проверять — иначе тест зелен вслепую', () => {
    expect(EXPECTED.length).toBeGreaterThanOrEqual(5);
    expect(src).toContain('export const TRACKS');
  });

  it('каждый трек из библиотеки лежит файлом', () => {
    const missing = EXPECTED.filter((id) => !existsSync(join(MUSIC_DIR, `${id}.mp3`)));
    expect(missing).toEqual([]);
  });

  it('библиотека объявляет ровно эти треки — ни лишних, ни забытых', () => {
    const declared = [...src.matchAll(/id:\s*'([a-z-]+)'/g)].map((m) => m[1]).sort();
    expect(declared).toEqual([...EXPECTED].sort());
  });

  it('файлы не пустые и не подозрительно лёгкие', () => {
    // Две минуты в 96 кбит/с — примерно 1.4 МБ. Меньше 300 КБ значит обрезок.
    const tiny = EXPECTED
      .map((id) => ({ id, kb: Math.round(statSync(join(MUSIC_DIR, `${id}.mp3`)).size / 1024) }))
      .filter((x) => x.kb < 300)
      .map((x) => `${x.id}: ${x.kb} КБ`);
    expect(tiny).toEqual([]);
  });

  it('формат mp3, а не opus — иначе замолчит на macOS', () => {
    const notMp3 = [...src.matchAll(/audio\/music\/[a-z-]+\.([a-z0-9]+)/g)]
      .map((m) => m[1])
      .filter((ext) => ext !== 'mp3');
    expect(notMp3).toEqual([]);
  });

  it('генератор «трёх нот» не вернулся', () => {
    const fb: string = readFileSync(FEEDBACK, 'utf8');
    expect(/MUSIC_CHORDS|midiToFreq/.test(fb)).toBe(false);
    // и музыка теперь идёт через отдельный сервис
    expect(fb).toContain("from '@/src/services/music'");
  });

  it('громкость фона тихая — музыка играет ПОД упражнением', () => {
    const m = src.match(/const VOLUME = ([\d.]+);/);
    expect(m).not.toBeNull();
    const v = Number(m![1]);
    expect(`громкость ${v}`).toBe(`громкость ${Math.min(v, 0.35)}`);
  });
});
