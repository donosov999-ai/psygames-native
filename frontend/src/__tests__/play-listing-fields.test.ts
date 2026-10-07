/* psygames-play-listing-fields · VER 1 · 07.10.2026 */
/**
 * КАРТОЧКА PLAY: КАЖДОЕ ПОЛЕ ИЗ СВОЕГО РАЗДЕЛА ФАЙЛА.
 *
 * `.github/scripts/update_listings.js` заливает `store/google-play/listing-*.md` в Play при
 * правке в main. До 07.10.2026 краткое описание бралось как «первый блок короче 80 знаков»,
 * и под заголовком им оказывался «Запасной» заголовок: живая карточка en-US и ru-RU
 * показывала запасной заголовок вместо краткого описания, de-DE — «PsyGames: Konzentration».
 * Замер — чтение листинга Play API 07.10.2026.
 */
declare const __dirname: string;
declare function require(id: string): any;

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '../../..');
// Скрипт лежит вне frontend/: babel jest вставил бы в него `@babel/runtime`, которого оттуда
// не видно. Исполняем исходник как есть, в песочнице, — ровно то, что запустит CI.
const vm = require('vm');
const mod: { exports: any } = { exports: {} };
vm.runInNewContext(fs.readFileSync(path.join(ROOT, '.github/scripts/update_listings.js'), 'utf8'), {
  require: (m: string) => ({ fs, path } as any)[m] ?? (() => { throw new Error(`не ждали require('${m}')`); })(),
  module: mod,
  exports: mod.exports,
  console,
  process: { env: {} },
});
const { extract, LANG_MAP } = mod.exports;

const blocksUnder = (src: string, header: RegExp): string[] => {
  const m = header.exec(src);
  if (!m) return [];
  const rest = src.slice(m.index + m[0].length);
  const next = /^## /m.exec(rest);
  const part = next ? rest.slice(0, next.index) : rest;
  return [...part.matchAll(/```\n([\s\S]*?)\n```/g)].map((b) => b[1].trim());
};

describe('карточка Play: поля из своих разделов', () => {
  for (const suffix of Object.keys(LANG_MAP)) {
    it(`listing-${suffix}.md`, () => {
      const src: string = fs.readFileSync(path.join(ROOT, `store/google-play/listing-${suffix}.md`), 'utf8');
      const d = extract(src);
      const titles = blocksUnder(src, /^## 1\. .*$/m);
      const shorts = blocksUnder(src, /^## 2\. .*$/m);
      const fulls = blocksUnder(src, /^## 3\. .*$/m);
      expect(titles.length).toBeGreaterThan(0);
      expect(shorts.length).toBeGreaterThan(0);
      expect(fulls.length).toBeGreaterThan(0);
      expect(d.title).toBe(titles[0]);
      expect(d.shortDescription).toBe(shorts[0]);
      expect(d.fullDescription).toBe(fulls[0]);
      // Запасной заголовок не должен уехать кратким описанием.
      expect(titles).not.toContain(d.shortDescription);
      expect(d.title.length).toBeLessThanOrEqual(30);
      expect(d.shortDescription.length).toBeLessThanOrEqual(80);
      expect(d.fullDescription.length).toBeLessThanOrEqual(4000);
    });
  }
});
