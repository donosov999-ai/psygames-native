/**
 * ЖИВАЯ ЗАПИСЬ ПЕРЕД МАШИННОЙ — И АВТОРЫ НА ЭКРАНЕ.
 *
 * Отчёт a4a2a0f4: «надо языковую модель менять, это не вытягивает, даже
 * английский очень криво произносит». Ответом стала не другая синтезирующая
 * модель, а записи живых людей из Викисловаря. Ломается это в двух местах,
 * и оба молчаливые:
 *
 *  1. ПОРЯДОК. Если машинная запись окажется первой, всё выглядит рабочим —
 *     звук есть, — а Денис слышит ровно то, на что жаловался. Проверяем
 *     адресом: у слова с живой записью он обязан вести в /voice-live.
 *
 *  2. АВТОРСТВО. CC BY и CC BY-SA разрешают распространять записи при одном
 *     условии — назвать автора. Уже был случай: уведомление BSD-3 о шахматных
 *     фигурах жило константой и НИ РАЗУ не показывалось, то есть требование
 *     формально не выполнялось. Проверяем, что список приезжает на экран.
 */
import { VOICE_LIVE, VOICE_LIVE_COUNTS, VOICE_LIVE_CREDITS } from '@/src/constants/voiceLive.generated';
import { VOICE_INDEX } from '@/src/constants/voiceIndex.generated';
import { voiceUrl, voiceIsLive } from '@/src/services/voiceSamples';

declare function require(m: string): any;
declare const __dirname: string;

describe('живой голос', () => {
  it('🔴 слово с живой записью звучит живой, а не машинной', () => {
    const промахи: string[] = [];
    for (const lang of Object.keys(VOICE_LIVE)) {
      for (const слово of Object.keys(VOICE_LIVE[lang]!)) {
        const url = voiceUrl(слово, lang);
        if (!url || !url.includes('/voice-live/')) промахи.push(`${lang}/${слово} → ${url}`);
      }
    }
    expect(промахи.slice(0, 5)).toEqual([]);
  });

  it('🔴 слово без живой записи не немеет: остаётся машинная', () => {
    // берём язык, где живых записей нет вовсе, и слово из машинного корпуса
    const без = Object.keys(VOICE_INDEX).find((l) => !VOICE_LIVE_COUNTS[l]);
    expect(`язык без живых записей: ${без ?? 'нет'}`).not.toBe('язык без живых записей: нет');
    const слово = Object.keys(VOICE_INDEX[без!]!)[0]!;
    const url = voiceUrl(слово, без!);
    expect(url).toContain('/voice/');
    expect(voiceIsLive(слово, без!)).toBe(false);
  });

  it('🔴 покрытие не съёжилось молча', () => {
    expect(VOICE_LIVE_COUNTS.ru).toBeGreaterThanOrEqual(200);
    expect(VOICE_LIVE_COUNTS.de).toBeGreaterThanOrEqual(200);
    expect(VOICE_LIVE_COUNTS.en).toBeGreaterThanOrEqual(200);
  });

  it('🔴 авторы не пустые и ДОХОДЯТ ДО ЭКРАНА, а не лежат константой', () => {
    expect(VOICE_LIVE_CREDITS.length).toBeGreaterThan(20);
    const пустые = VOICE_LIVE_CREDITS.filter((к) => !к.author || !к.license || !к.count);
    expect(пустые).toEqual([]);
    const fs = require('fs');
    const path = require('path');
    const экран: string = fs.readFileSync(path.join(__dirname, '../../app/sources.tsx'), 'utf8');
    expect(экран).toContain('VOICE_LIVE_CREDITS');
    expect(экран).toContain('к.author');
  });
});
