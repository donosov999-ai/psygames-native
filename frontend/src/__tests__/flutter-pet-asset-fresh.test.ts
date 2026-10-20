/* psygames-flutter-pet-asset-fresh · VER 1 · 20.10.2026 */
/**
 * ДАННЫЕ «ПИТОМЦА» ДЛЯ МОДЕЛИ НА DART — ВЫГРУЗКОЙ ИЗ ЖИВОГО TS (задача d6a60b02, вариант Б).
 *
 * Модель экрана (`lib/shell/pet_model.dart`) переносит правила кодом, а таблицы берёт отсюда: цвета и
 * порядок шкал, разделы → шкалы, цена кормления, окно памяти кормлений, кадры портрета по облику,
 * действию и вещи (`petRenderSpec`), лакомство и рот (`ЛАКОМСТВО`, `ротНаКадре`), пул простой реплики
 * по языкам (`simpleLinePool`). Ключи словаря, которые Dart зовёт переменной (стадии, вид заботы), —
 * в `textKeys` для `embed-l10n.mjs`.
 *
 * ⚠️ ЭТО СТОРОЖ: без WRITE сравнивает и краснеет, если данные поменяли, а ассет нет.
 * Перевыпуск — из `frontend/`:
 *   WRITE=1 npx jest -i --runTestsByPath src/__tests__/flutter-pet-asset-fresh.test.ts
 * и затем `node flutter/tools/embed-l10n.mjs`.
 */
import { petRenderSpec, type PetAccessory, type PetSkin } from '@/src/components/pet/PetSprite';
import { ЛАКОМСТВО, ротНаКадре } from '@/src/components/pet/PetTreat';
import { CATEGORY_TO_SKILL, PET_FED_WINDOW_DAYS, PET_FEED_COST } from '@/src/services/pet';
import { petLineLanguages, simpleLinePool } from '@/src/services/petLines';
import { RU_TRAININGS, SKILL_COLORS, SKILL_ORDER } from '@/src/services/petScreen';
import { RTL_LANGS } from '@/src/services/rtl';

declare function require(id: string): any;
declare const __dirname: string;
declare const process: { env: Record<string, string | undefined> };
const fs = require('fs') as { readFileSync(p: string, e: string): string; writeFileSync(p: string, d: string, e: string): void; existsSync(p: string): boolean };
const path = require('path') as { resolve(...p: string[]): string };
const OUT = path.resolve(__dirname, '../../../flutter/assets/pet.json');

/** Адреса кадров — сборки (`/assets/…`): в jest это относительный путь с именем рабочей папки. */
const clean = (v: any): any => {
  if (typeof v === 'string') return v.replace(/^(?:\.\.\/)+(?:.*?frontend\/)?/, '/');
  if (Array.isArray(v)) return v.map(clean);
  if (v && typeof v === 'object' && Object.getPrototypeOf(v) === Object.prototype) {
    return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, clean(x)]));
  }
  return v;
};

const SKINS: PetSkin[] = ['cat', 'robot', 'constellation'];
const STATES = ['idle', 'groom', 'wiggle', 'eat'] as const;
const ACCESSORIES: PetAccessory[] = ['party_hat', 'bow', 'glasses', 'bow_tie'];

function build(): string {
  const data = {
    skillColors: SKILL_COLORS,
    skillOrder: SKILL_ORDER,
    categoryToSkill: CATEGORY_TO_SKILL,
    feedCost: PET_FEED_COST,
    fedWindowDays: PET_FED_WINDOW_DAYS,
    accessories: ACCESSORIES,
    specs: Object.fromEntries(SKINS.map((sk) => [sk, Object.fromEntries(STATES.map((st) => [st, Object.fromEntries(
      [['none', null] as const, ...ACCESSORIES.map((a) => [a, a] as const)].map(([k, a]) => [k, clean(petRenderSpec(sk, st, a, null))]),
    )]))])),
    treat: Object.fromEntries(SKINS.map((sk) => [sk, { emoji: ЛАКОМСТВО[sk] ?? '🍪', mouth: ротНаКадре(sk) }])),
    simpleLines: Object.fromEntries(petLineLanguages().map((l) => [l, simpleLinePool(l)])),
    // Русские формы «тренировка» (`ruTrainings`): одна, несколько, много.
    ruTrainings: RU_TRAININGS,
    // Языки справа налево — стрелка «назад» (`isRTLLang`).
    rtl: RTL_LANGS,
    textKeys: ['petStage1', 'petStage2', 'petStage3',
      ...['hungry', 'overfed', 'dirty', 'lonely', 'neglected'].map((r) => `petLook_${r}`)],
  };
  return `${JSON.stringify(data, null, 1)}\n`;
}

describe('flutter/assets/pet.json — свежая выгрузка данных «Питомца»', () => {
  it('совпадает с живым TS', () => {
    const now = build();
    if (process.env.WRITE === '1') fs.writeFileSync(OUT, now, 'utf8');
    const was = fs.existsSync(OUT) ? fs.readFileSync(OUT, 'utf8') : '';
    expect({ fresh: was === now, regenerate: 'cd frontend && WRITE=1 npx jest -i --runTestsByPath src/__tests__/flutter-pet-asset-fresh.test.ts' })
      .toEqual({ fresh: true, regenerate: expect.any(String) });
  });

  it('кадры — адресами сборки; у каждого облика есть покой без вещи', () => {
    const data = JSON.parse(build());
    expect(JSON.stringify(data)).not.toMatch(/\.\.\/|frontend\//);
    for (const sk of SKINS) expect(data.specs[sk].idle.none.uris.length).toBeGreaterThan(0);
    expect(data.simpleLines.en.length).toBeGreaterThan(5);
  });
});
