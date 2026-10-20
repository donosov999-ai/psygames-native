/* psygames-flutter-switcher-asset-fresh · VER 1 · 20.10.2026 */
/**
 * ДАННЫЕ ПЕРЕКЛЮЧАТЕЛЯ ПРОФИЛЕЙ ДЛЯ МОДЕЛИ НА DART — ВЫГРУЗКОЙ ИЗ ЖИВОГО TS (задача d6a60b02, вариант Б).
 *
 * Модель листа (`lib/shell/switcher_model.dart`) переносит правила кодом (`isSwitchable`, доступ, кошельки,
 * карточка профиля), а то, чего нет в `assets/profiles.json`, берёт отсюда: ярус профиля (`tier`), значок,
 * источник продающей фразы, значки разделов игр, цвета бейджей (`textOn`). Ключи словаря, которые Dart
 * зовёт переменной (`profileName_<id>`, `profileDesc_<id>`), — в `textKeys` для `embed-l10n.mjs`.
 *
 * ⚠️ ЭТО СТОРОЖ: без WRITE сравнивает и краснеет, если данные поменяли, а ассет нет.
 * Перевыпуск — из `frontend/`:
 *   WRITE=1 npx jest -i --runTestsByPath src/__tests__/flutter-switcher-asset-fresh.test.ts
 * и затем `node flutter/tools/embed-l10n.mjs`.
 */
import { CATEGORY_EMOJI } from '@/src/components/ProfileSwitcherModal';
import { PROFILES, isSwitchable } from '@/src/constants/profiles';
import { profileBadge } from '@/src/constants/profileBadges';
import { assetUri } from '@/src/services/hostScreens';
import { textOn } from '@/src/services/onGradientText';

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
    profiles: PROFILES.map((p) => ({
      id: p.id,
      tier: p.tier ?? null,
      switchable: isSwitchable(p),
      badge: clean(assetUri(profileBadge(p.id))),
      hookSource: p.sales_hook_source ?? null,
      hookSourceEn: p.sales_hook_source_en ?? null,
    })),
    categoryEmoji: CATEGORY_EMOJI,
    // Бейджи ярусов и кнопка «Открыть» окна кода: цвет текста — `textOn` фона.
    trialBadge: { bg: '#22c55e', fg: textOn('#22c55e') },
    ownerBadge: { bg: '#6b7280', fg: '#fff' },
    unlockFg: textOn('#10b981'),
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

  it('значки — адресами сборки; владелец в выбор не входит', () => {
    const data = JSON.parse(build());
    expect(JSON.stringify(data)).not.toMatch(/\.\.\/|frontend\//);
    expect(data.profiles.find((p: any) => p.id === 'odv999').switchable).toBe(false);
    for (const p of data.profiles) if (p.badge !== null) expect(p.badge).toMatch(/^\/assets\/images\//);
  });
});
