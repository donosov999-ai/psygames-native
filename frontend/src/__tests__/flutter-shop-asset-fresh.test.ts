/* psygames-flutter-shop-asset-fresh · VER 1 · 20.10.2026 */
/**
 * ДАННЫЕ «МАГАЗИНА» ДЛЯ МОДЕЛИ НА DART — ВЫГРУЗКОЙ ИЗ ЖИВОГО TS (задача d6a60b02, вариант Б).
 *
 * Модель экрана (`lib/shell/shop_model.dart`) переносит правила кодом (`abilityButtons`, `cosmeticRow`,
 * `shopItems`, `cosmeticName`, `peekWager`), а таблицы берёт отсюда: вкладки и разделы, способности,
 * товары с образцом-квадратом (`swatchOf`; у звука цвет — акцент строки, здесь он `null`), имена профилей
 * для арта профиля, цифры профиля по умолчанию, ставка, языки справа налево. Ключи словаря, которые
 * Dart зовёт переменной (`nameKey`, `descKey`, `labelKey`, `titleKey`), читает `embed-l10n.mjs`.
 *
 * ⚠️ ЭТО СТОРОЖ: без WRITE сравнивает и краснеет, если данные поменяли, а ассет нет.
 * Перевыпуск — из `frontend/`:
 *   WRITE=1 npx jest -i --runTestsByPath src/__tests__/flutter-shop-asset-fresh.test.ts
 * и затем `node flutter/tools/embed-l10n.mjs`.
 */
import { SHOP_CATS, SHOP_SECTIONS, swatchOf } from '../../app/shop';
import { ABILITIES } from '@/src/services/abilities';
import { COSMETICS } from '@/src/services/cosmetics';
import { WAGER_DAYS, WAGER_PRIZE, WAGER_STAKE } from '@/src/services/wager';
import { defaultStyleForProfile } from '@/src/constants/digitThemes';
import { PROFILES } from '@/src/constants/profiles';
import { RTL_LANGS } from '@/src/services/rtl';

declare function require(id: string): any;
declare const __dirname: string;
declare const process: { env: Record<string, string | undefined> };
const fs = require('fs') as { readFileSync(p: string, e: string): string; writeFileSync(p: string, d: string, e: string): void; existsSync(p: string): boolean };
const path = require('path') as { resolve(...p: string[]): string };
const OUT = path.resolve(__dirname, '../../../flutter/assets/shop.json');

/** Адреса картинок — сборки (`/assets/…`): в jest это относительный путь с именем рабочей папки. */
const clean = (v: any): any => {
  if (typeof v === 'string') return v.replace(/^(?:\.\.\/)+(?:.*?frontend\/)?/, '/');
  if (Array.isArray(v)) return v.map(clean);
  if (v && typeof v === 'object' && Object.getPrototypeOf(v) === Object.prototype) {
    return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, clean(x)]));
  }
  return v;
};

const PROFILE_ART = new Set(['theme', 'background', 'badge']);

function build(): string {
  const data = {
    cats: SHOP_CATS.map(([id, icon, labelKey]) => ({ id, icon, labelKey })),
    sections: SHOP_SECTIONS.map(([type, titleKey]) => ({ type, titleKey })),
    abilities: ABILITIES.map((a) => ({ id: a.id, icon: a.icon, nameKey: a.nameKey, descKey: a.descKey, cost: a.cost, max: a.max })),
    cosmetics: COSMETICS.map((c) => ({
      id: c.id, type: c.type, value: c.value, cost: c.cost, nameKey: c.nameKey, descKey: c.descKey,
      // Арт профиля зовётся именем профиля (`cosmeticName`); нет профиля — ключом.
      ...(PROFILE_ART.has(c.type) ? { profileName: PROFILES.find((p) => p.id === c.value)?.display_name ?? null } : {}),
      swatch: clean(swatchOf(c, null as unknown as string)),
    })),
    // Свои цифры профиля не продаются (`shopItems`): стиль по умолчанию у каждого профиля и без профиля.
    digitDefaults: Object.fromEntries(PROFILES.map((p) => [p.id, defaultStyleForProfile(p.id)])),
    digitFallback: defaultStyleForProfile(undefined),
    wager: { stake: WAGER_STAKE, days: WAGER_DAYS, prize: WAGER_PRIZE },
    rtl: RTL_LANGS,
  };
  return `${JSON.stringify(data, null, 1)}\n`;
}

describe('flutter/assets/shop.json — свежая выгрузка данных «Магазина»', () => {
  it('совпадает с живым TS', () => {
    const now = build();
    if (process.env.WRITE === '1') fs.writeFileSync(OUT, now, 'utf8');
    const was = fs.existsSync(OUT) ? fs.readFileSync(OUT, 'utf8') : '';
    expect({ fresh: was === now, regenerate: 'cd frontend && WRITE=1 npx jest -i --runTestsByPath src/__tests__/flutter-shop-asset-fresh.test.ts' })
      .toEqual({ fresh: true, regenerate: expect.any(String) });
  });

  it('у каждого товара — образец; картинки — адресами сборки', () => {
    const data = JSON.parse(build());
    expect(JSON.stringify(data)).not.toMatch(/\.\.\/|frontend\//);
    for (const c of data.cosmetics) {
      expect(c.swatch.kind).toEqual(expect.any(String));
      if (c.swatch.kind === 'image' || c.swatch.kind === 'digits') expect(c.swatch.uri).toMatch(/^\/assets\/images\//);
    }
    expect(data.cats[0]).toEqual({ id: null, icon: 'apps', labelKey: 'a11yCatAll' });
  });
});
