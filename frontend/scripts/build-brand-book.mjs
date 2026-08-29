#!/usr/bin/env node
/* psygames-build-brand-book · VER 1 · 29.08.2026 */
/**
 * БРЕНД-БУК ПРОФИЛЕЙ — СОБИРАЕТСЯ ИЗ КОДА, А НЕ ПИШЕТСЯ РУКАМИ (задача f74a7f52).
 *
 * 🔴 ЗАЧЕМ ГЕНЕРАТОР, А НЕ ПРОСТО ФАЙЛ. Просьба Дениса 26.08.2026: «для каждого
 * профиля проработать бренд-бук стиля». Документ, набитый руками, устаревает на
 * первом же новом профиле — ровно как устарели три числа тренажёров (задача
 * a3bc11b9, 75/61/48). Здесь книга ЧИТАЕТСЯ ИЗ ТЕХ ЖЕ ФАЙЛОВ, что и приложение:
 * добавили профиль — перегенерировали, и строка появилась сама.
 *
 * ЧТО СОБИРАЕТ (пять носителей стиля, каждый со ссылкой на реальный файл):
 *   палитра  — color профиля (constants/profiles.ts)
 *   фон      — assets/images/profile-bg/*.webp (profileBackgrounds.ts)
 *   вордмарк — assets/images/logos/*.webp + светлая/тёмная плашка (profileLogos.ts)
 *   значок   — assets/images/profiles/*.webp (profileBadges.ts)
 *   карта    — assets/images/level-map-themes/*.webp (profileThemes.json)
 *
 * ⚠️ ЧИТАЕМ ИСХОДНИК РЕГУЛЯРКАМИ, А НЕ ИМПОРТОМ. profiles.ts тянет за собой
 * react-native (`Platform`, `require` картинок) — под node это не грузится.
 * Поэтому здесь разбор текста, и потому же рядом стоит гейт brand-book.test.ts:
 * он ту же полноту проверяет ИМПОРТОМ из приложения. Разбор мог бы промахнуться
 * молча — гейт не даст.
 *
 * ЗАПУСК: node scripts/build-brand-book.mjs   (из frontend/)
 * Пишет ../BRAND_BOOK_PROFILES.md (в .gitignore — документ внутренний).
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const FRONT = join(HERE, '..');
const REPO = join(FRONT, '..');
const read = (rel) => readFileSync(join(FRONT, rel), 'utf8');

// ─────────────────────────── профили ───────────────────────────
const profilesSrc = read('src/constants/profiles.ts');
const defs = [...profilesSrc.matchAll(/const (\w+): ProfileDef = \{([\s\S]*?)\n\};/g)];
const byConst = new Map();
for (const [, name, body] of defs) {
  const grab = (re) => (body.match(re) ?? [])[1];
  byConst.set(name, {
    const: name,
    id: grab(/\bid:\s*'([\w-]+)'/),
    display: grab(/display_name:\s*'([^']+)'/) ?? grab(/person:\s*'([^']+)'/),
    emoji: grab(/emoji:\s*'([^']+)'/),
    color: grab(/color:\s*'(#[0-9a-fA-F]{3,8})'/),
    price: grab(/price_year:\s*(\d+)/),
    tier: grab(/tier:\s*'([^']+)'/),
  });
}
const listed = [...(profilesSrc.match(/export const PROFILES: ProfileDef\[\] = \[([\s\S]*?)\n\];/) ?? [])[1]
  .matchAll(/^\s*(\w+),/gm)].map((m) => m[1]);
const profiles = listed.map((c) => byConst.get(c)).filter(Boolean);
if (profiles.length !== listed.length) throw new Error('разбор профилей потерял записи — проверь регулярку');

// ─────────────────────────── носители стиля ───────────────────────────
const bgSrc = read('src/constants/profileBackgrounds.ts');
const backgrounds = new Map([...bgSrc.matchAll(/^\s{2}([\w-]+):\s*require\('([^']+)'\)/gm)]
  .map((m) => [m[1], m[2].replace('../../', '')]));

const logosSrc = read('src/constants/profileLogos.ts');
const logoIndex = new Map([...(logosSrc.match(/const PROFILE_LOGO: Record<string, number> = \{([\s\S]*?)\};/) ?? [])[1]
  .matchAll(/([\w-]+):\s*(\d+)/g)].map((m) => [m[1], Number(m[2])]));
const plateDark = new Set([...(logosSrc.match(/const PLATE_DARK = new Set\(\[([^\]]*)\]\)/) ?? [])[1]
  .matchAll(/'([\w-]+)'/g)].map((m) => m[1]));

const badgesSrc = read('src/constants/profileBadges.ts');
const badges = new Map([...badgesSrc.matchAll(/^\s{2}([\w-]+):\s*require\('([^']+)'\)/gm)]
  .map((m) => [m[1], m[2].replace('../../', '')]));

const themeSpec = JSON.parse(read('src/constants/profileThemes.json'));
const themes = themeSpec.themes;

// ─────────────────────────── сборка книги ───────────────────────────
const missing = [];
const need = (rel, what) => {
  if (!existsSync(join(FRONT, rel))) missing.push(`${what}: нет файла ${rel}`);
  return rel;
};

const rows = profiles.map((p) => {
  const bg = backgrounds.get(p.id);
  const logoN = logoIndex.get(p.id);
  const logo = logoN === undefined ? null : `assets/images/logos/logo${logoN}.webp`;
  const badge = badges.get(p.id);
  const theme = themes[p.id];
  const art = theme ? `${themeSpec.outDir}/${p.id}.webp` : null;
  if (bg) need(bg, `${p.id} фон`);
  if (logo) need(logo, `${p.id} вордмарк`);
  if (badge) need(badge, `${p.id} значок`);
  if (art) need(art, `${p.id} карта`);
  return { ...p, bg, logo, plate: plateDark.has(p.id) ? 'тёмная' : 'светлая', badge, theme, art };
});

if (missing.length) {
  console.error('🔴 бренд-бук не собран — ассеты пропали:');
  for (const m of missing) console.error('  · ' + m);
  process.exit(1);
}

const link = (rel) => (rel ? `[${rel.split('/').pop()}](frontend/${rel})` : '—');
const cell = (v) => (v ?? '—');

const table = rows.map((r) => [
  `${r.emoji ?? ''} **${r.display}**<br>\`${r.id}\``,
  `\`${cell(r.color)}\``,
  link(r.bg),
  r.logo ? `${link(r.logo)}<br>плашка ${r.plate}` : '—',
  link(r.badge),
  r.theme ? `${link(r.art)}<br>\`${r.theme.effect}\`${r.theme.params ? ' ' + JSON.stringify(r.theme.params) : ''}` : '—',
  r.price ? `${r.price} ₽/год` : (r.tier ?? '—'),
].join(' | ')).map((line) => `| ${line} |`).join('\n');

const noBg = rows.filter((r) => !r.bg).map((r) => r.id);
const noArt = rows.filter((r) => !r.art).map((r) => r.id);
const noLogo = rows.filter((r) => !r.logo).map((r) => r.id);
const noBadge = rows.filter((r) => !r.badge).map((r) => r.id);

const book = `# БРЕНД-БУК ПРОФИЛЕЙ PsyGames

*Автор: Denis Onosov (ODV999) · ⚠️ Информация конфиденциальная*

> 🤖 **Файл собирается скриптом \`frontend/scripts/build-brand-book.mjs\` из тех же
> констант, что читает приложение.** Править руками бессмысленно — следующая
> генерация затрёт. Меняется стиль профиля — меняется код, потом \`node
> scripts/build-brand-book.mjs\`. Полноту сторожит гейт \`brand-book.test.ts\`.

## Зачем он есть

Пять носителей стиля (палитра, фон, вордмарк, значок, карта уровней) заводились
порознь и в разное время. Отсюда обе жалобы 26.08.2026 — «лого херово видно» и
«фоны мрачное» — обе оттого, что элемент выбирался без оглядки на то, НА ЧЁМ он
будет лежать. Эта таблица и есть недостающая оглядка: одна строка — один профиль,
и видно сразу всё, что человек увидит на экране.

## Таблица

| Профиль | Палитра | Фон главной | Вордмарк | Значок | Карта уровней | Цена |
|---|---|---|---|---|---|---|
${table}

## Правила, без которых таблица развалится

**1. Плашка под вордмарком — по самому знаку, а не по яркости.**
По умолчанию светлая: все фоны профилей светлые (яркость 178–241), и тёмный
прямоугольник на светлом снимке читается как заплата. Тёмная остаётся у четырёх —
${[...plateDark].map((x) => `\`${x}\``).join(', ')} — там знак иначе гибнет:
неон несёт свой тёмный ореол, золотой сериф на белом сереет, радуга проваливается,
хром почти исчезает. Правило «темнее 130 → светлая плашка» проверено и отвергнуто:
на logo7 (яркость 71) верно, на logo1 (77) — нет.

**2. Профили без фона: ${noBg.map((x) => `\`${x}\``).join(', ') || '—'}.**
Фон — не украшение, а сцена под тему профиля. Служебным (\`free\` — витрина,
\`whatsnew\` — лента свежего, \`odv999\` — владельца) сцена не нужна: они не
продаются и не имеют «своей» темы. Экран без фона показывает обычную заливку —
это штатный вид, а не пропажа.

**3. Профили без темы карты: ${noArt.map((x) => `\`${x}\``).join(', ') || '—'}.**
Такие профили получают нейтральный арт \`free\` (см. \`themeArtFor\`). Тема — не
картинка на диске, а рецепт: один луг \`${themeSpec.base}\` × фильтр из
\`imageEffects.ts\` = готовый webp на сборке. Добавить тему = дописать строку в
\`profileThemes.json\` и прогнать \`node scripts/build-profile-art.mjs\`.

**4. Один рецепт — разные параметры.** Рецептов в \`imageEffects.ts\` двенадцать, и
на двенадцатый профиль свободным оставался только \`brightness-noise\` — самый
тяжёлый (замер: 225 КБ против 15–92 КБ у прочих). Поэтому тема несёт
необязательное поле \`params\`: \`polyglot\` — тот же \`emboss\`, что у \`execs\`,
но монохромный и вдвое шире, и на экране это другая материя (металл против
гравюры). Проверяется глазами, а не разницей байтов: у бледных артов она мала
(13,6 из 255), а видно их по-разному.

**5. Без вордмарка: ${noLogo.map((x) => `\`${x}\``).join(', ') || '—'} · без значка: ${noBadge.map((x) => `\`${x}\``).join(', ') || '—'}.**
Фолбэк — эмодзи профиля и общий знак \`logo6\` (мозг + надпись).

## Как добавить профиль и не разъехаться

1. \`src/constants/profiles.ts\` — запись профиля (id, эмодзи, \`color\`).
2. \`src/constants/profileBadges.ts\` + \`assets/images/profiles/<id>.webp\` — значок.
3. \`src/constants/profileLogos.ts\` — индекс вордмарка; если знак тонет, добавить id в \`PLATE_DARK\`.
4. \`src/constants/profileThemes.json\` — рецепт карты (+ \`params\`, если рецепт занят), затем \`node scripts/build-profile-art.mjs\`.
5. Фон — по решению: нужен ли профилю свой снимок (см. правило 2).
6. \`node scripts/build-brand-book.mjs\` — обновить эту книгу.

*Собрано ${new Date().toISOString().slice(0, 10)} · профилей ${rows.length} · тем ${Object.keys(themes).length} · фонов ${backgrounds.size} · значков ${badges.size}*
`;

const out = join(REPO, 'BRAND_BOOK_PROFILES.md');
writeFileSync(out, book);
console.log(`✅ ${out}`);
console.log(`   профилей ${rows.length} · со своей темой ${rows.length - noArt.length} · со своим фоном ${rows.length - noBg.length}`);
