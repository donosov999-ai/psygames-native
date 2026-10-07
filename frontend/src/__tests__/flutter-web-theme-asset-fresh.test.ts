/* psygames-flutter-web-theme-asset-fresh · VER 1 · 07.10.2026 */
/**
 * ПАЛИТРА ВЕБА ДЛЯ НАТИВНЫХ ГЛАВНЫХ ЭКРАНОВ — ВЫГРУЗКОЙ ИЗ ЖИВОГО TS (задачи 5136754e, 99628ecf).
 *
 * Фон, поверхность, текст и акцент профиля живут в `src/contexts/ThemeContext.tsx`, надетый в
 * магазине акцент — в `src/services/cosmetics.ts`. Оболочка рисует вкладку «Игры» и нижнюю полосу
 * сама, и без этой выгрузки они взяли бы цвета семени Material: замер 07.10 — активная вкладка
 * nzt48 индиго вместо фиолетового `#a855f7`, фон лавандовый вместо `#F5F5F7`. Натив читает
 * `flutter/assets/web_theme.json` (`flutter/lib/shell/web_theme.dart`), второй копии на Dart нет.
 *
 * ⚠️ СТОРОЖ: без WRITE сравнивает и краснеет. Перевыпуск из `frontend/`:
 *   WRITE=1 npx jest -i --runTestsByPath src/__tests__/flutter-web-theme-asset-fresh.test.ts
 */
import { lightTheme, darkTheme, PROFILE_THEME, FALLBACK_PROFILE_THEME } from '@/src/contexts/ThemeContext';
import { COSMETICS, eKey } from '@/src/services/cosmetics';

declare function require(id: string): any;
declare const __dirname: string;
declare const process: { env: Record<string, string | undefined> };
const fs = require('fs') as { readFileSync(p: string, e: string): string; writeFileSync(p: string, d: string, e: string): void; existsSync(p: string): boolean };
const path = require('path') as { resolve(...p: string[]): string };
const OUT = path.resolve(__dirname, '../../../flutter/assets/web_theme.json');

/** Ключ надетой косметики с местом под профиль: натив подставляет свой активный профиль. */
const EQUIPPED_KEY = eKey('{profile}');

function build(): string {
  const accents: Record<string, string> = {};
  for (const c of COSMETICS) if (c.type === 'accent') accents[c.id] = c.value;
  return `${JSON.stringify({
    light: lightTheme,
    dark: darkTheme,
    profiles: PROFILE_THEME,
    fallback: FALLBACK_PROFILE_THEME,
    cosmeticAccents: accents,
    equippedKey: EQUIPPED_KEY,
  }, null, 1)}\n`;
}

describe('flutter/assets/web_theme.json — палитра веба для оболочки', () => {
  it('совпадает с живым TS', () => {
    const now = build();
    if (process.env.WRITE === '1') fs.writeFileSync(OUT, now, 'utf8');
    const was = fs.existsSync(OUT) ? fs.readFileSync(OUT, 'utf8') : '';
    expect({ fresh: was === now, regenerate: 'cd frontend && WRITE=1 npx jest -i --runTestsByPath src/__tests__/flutter-web-theme-asset-fresh.test.ts' })
      .toEqual({ fresh: true, regenerate: expect.any(String) });
  });

  it('ключ надетой косметики — тот же, что пишет магазин', () => {
    expect(EQUIPPED_KEY.replace('{profile}', 'nzt48')).toBe(eKey('nzt48'));
    expect(EQUIPPED_KEY.startsWith('psygames_')).toBe(true); // ключ доезжает до натива мостом (`SharedState.owns`)
  });

  it('у каждого акцента косметики — цвет #rrggbb (натив читает только его)', () => {
    for (const c of COSMETICS) if (c.type === 'accent') expect([c.id, /^#[0-9a-fA-F]{6}$/.test(c.value)]).toEqual([c.id, true]);
    for (const [id, p] of Object.entries(PROFILE_THEME)) expect([id, /^#[0-9a-fA-F]{6}$/.test(p.accent)]).toEqual([id, true]);
  });
});
