/* psygames-flutter-story-recall-reference · VER 1 · 30.09.2026 */
/**
 * ВЫГРУЗКА ЭТАЛОНОВ «STORY RECALL» ИЗ ЖИВОГО TS — прогоном `storyStem`,
 * `storyKeys`, `countStoryMatches` (`app/games/story-recall.tsx`) и
 * `readSecondsFor` / `distractorSecondsFor` (`src/services/storyRecallLevels.ts`).
 * Заодно выгружает сами рассказы ассетом: у приложения нет второй копии текстов.
 *
 * Перевыпуск — из `frontend/`:
 *   npx jest --rootDir . --testMatch '**\/scripts\/flutter-story-recall-reference.test.ts'
 */
import { STORIES, storyStem, storyKeys, countStoryMatches } from '@/app/games/story-recall';
import { STORY_MAX_LEVEL, readSecondsFor, distractorSecondsFor } from '@/src/services/storyRecallLevels';

declare function require(id: string): any;
declare const __dirname: string;
const fs = require('fs') as { mkdirSync(p: string, o: { recursive: boolean }): void; writeFileSync(p: string, d: string, e: string): void };
const path = require('path') as { resolve(...p: string[]): string; dirname(p: string): string };
const OUT = path.resolve(__dirname, '../../flutter/test/fixtures/story-recall-reference.json');
const ASSET = path.resolve(__dirname, '../../flutter/assets/vocab/story-recall.json');

describe('эталоны «Story Recall» для переноса на Flutter', () => {
  it('выгружает', () => {
    const levels = Array.from({ length: STORY_MAX_LEVEL + 2 }, (_, i) => i + 0).map((level) => ({
      level,
      read: [30, 32, 35, 20].map((b) => readSecondsFor(b, level)), // 20 — где пол 15 с работает: у рассказов базы 30–35
      d1: distractorSecondsFor(30, level),
      d2: distractorSecondsFor(90, level),
    }));

    const stories = STORIES.map((s, i) => {
      const pick = (lang: 'ru' | 'en') => {
        const kws = lang === 'ru' ? s.keywords_ru : s.keywords_en;
        const text = lang === 'ru' ? s.ru : s.en;
        const keys = storyKeys(kws);
        // Пересказы: весь текст; каждый второй ключ; ключи в верхнем регистре через
        // знаки; пусто; и «шум» — слова, которых в рассказе нет.
        const everyOther = keys.filter((_, k) => k % 2 === 0).join(' ');
        const shouted = keys.map((k) => k.toUpperCase()).join('!,;');
        const answers = [text, everyOther, shouted, '', 'зебра кит zebra whale 0'];
        return {
          stems: kws.map(storyStem),
          keys,
          matches: answers.map((a) => ({ text: a, hits: countStoryMatches(a, kws) })),
        };
      };
      return { index: i, ru: pick('ru'), en: pick('en') };
    });

    const reference = {
      taken: '2026-09-30', tool: 'frontend/scripts/flutter-story-recall-reference.test.ts',
      maxLevel: STORY_MAX_LEVEL, levels, stories,
    };
    fs.mkdirSync(path.dirname(OUT), { recursive: true });
    fs.writeFileSync(OUT, JSON.stringify(reference, null, 1), 'utf8');
    fs.writeFileSync(ASSET, JSON.stringify({ source: 'frontend/app/games/story-recall.tsx STORIES', stories: STORIES }), 'utf8');
    expect(stories.length).toBe(STORIES.length);
  });
});
