/* psygames-flutter-switcher-asset-fresh · VER 2 · 21.10.2026 */
/**
 * ДАННЫЕ ПЕРЕКЛЮЧАТЕЛЯ ПРОФИЛЕЙ ДЛЯ МОДЕЛИ НА DART — ВЫГРУЗКОЙ ИЗ ЖИВОГО TS (задача d6a60b02, вариант Б).
 *
 * Модель листа (`lib/shell/switcher_model.dart`) берёт отсюда то, чего нет в `assets/profiles.json`:
 * значок профиля. Ключи словаря, которые Dart зовёт переменной (`profileName_<id>`,
 * `profileDesc_<id>`), — в `textKeys` для `embed-l10n.mjs`. С 21.10.2026 (d5e5814a) ярусов, замков и
 * окна кода нет: все профили открыты всем.
 *
 * ⚠️ ЭТО СТОРОЖ: без WRITE сравнивает и краснеет, если данные поменяли, а ассет нет.
 * Перевыпуск — из `frontend/`:
 *   WRITE=1 npx jest -i --runTestsByPath src/__tests__/flutter-switcher-asset-fresh.test.ts
 * и затем `node flutter/tools/embed-l10n.mjs`.
 */
import { PROFILES } from '@/src/constants/profiles';
import { profileBadge } from '@/src/constants/profileBadges';
import { assetUri } from '@/src/services/hostScreens';

declare function require(id: string): any;
declare const __dirname: string;
declare const process: { env: Record<string, string | undefined> };
const fs = require('fs') as { readFileSync(p: string, e: string): string; writeFileSync(p: string, d: string, e: string): void; existsSync(p: string): boolean };
const path = require('path') as { resolve(...p: string[]): string };
const OUT = path.resolve(__dirname, '../../../flutter/assets/switcher.json');

/** Адреса картинок — сборки (`/assets/…`): в jest это относительный путь с именем рабочей папки. */
const clean = (v: any): any => (typeof v === 'string' ? v.replace(/^(?:\.\.\/)+(?:.*?frontend\/)?/, '/') : v);

function build(): string {
  const data = {
    profiles: PROFILES.map((p) => ({ id: p.id, badge: clean(assetUri(profileBadge(p.id))) })),
    textKeys: PROFILES.flatMap((p) => [`profileName_${p.id}`, `profileDesc_${p.id}`]),
  };
  return `${JSON.stringify(data, null, 1)}\n`;
}

describe('flutter/assets/switcher.json — свежая выгрузка данных переключателя профилей', () => {
  it('совпадает с живым TS', () => {
    const now = build();
    if (process.env.WRITE === '1') fs.writeFileSync(OUT, now, 'utf8');
    const was = fs.existsSync(OUT) ? fs.readFileSync(OUT, 'utf8') : '';
    expect({ fresh: was === now, regenerate: 'cd frontend && WRITE=1 npx jest -i --runTestsByPath src/__tests__/flutter-switcher-asset-fresh.test.ts' })
      .toEqual({ fresh: true, regenerate: expect.any(String) });
  });

  it('значки — адресами сборки; в выборе все профили', () => {
    const data = JSON.parse(build());
    expect(JSON.stringify(data)).not.toMatch(/\.\.\/|frontend\//);
    expect(data.profiles.map((p: any) => p.id)).toEqual(PROFILES.map((p) => p.id));
    for (const p of data.profiles) if (p.badge !== null) expect(p.badge).toMatch(/^\/assets\/images\//);
  });
});
