#!/usr/bin/env node
// ДАТЫ КАЛЕНДАРЯ СЕРИИ НА 12 ЯЗЫКАХ — ШАБЛОНАМИ ICU, А НЕ ВТОРОЙ РЕАЛИЗАЦИЕЙ (d6a60b02, вариант Б).
//
// Веб-календарь (`frontend/app/streak-calendar.tsx`) пишет «месяц год», узкие дни недели и дату для
// чтения вслух через `Intl.DateTimeFormat` — это ICU с данными CLDR. Пакета `intl` во Flutter нет, и
// второй набор правил разошёлся бы с первым в падежах («октябрь» / «октября»), порядке и знаках
// («2026年10月»). Поэтому шаблоны снимаются с того же ICU, на котором строится эталон веба, и Dart
// только подставляет число и год (`lib/shell/streak_calendar_model.dart`).
//
// ⚠️ ВНЕ ПРОВЕРКИ CI «Сгенерированное совпадает»: строки зависят от версии ICU у Node (CLDR меняет
// формы между выпусками), а Node на раннере не тот, что на маке, — проверка краснела бы не по делу.
// Пересобирать вручную вместе с эталоном: `node flutter/tools/embed-calendar.mjs` и
// `WRITE=1 npx jest progress-pages-host-model` — на одном и том же Node.
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const screen = readFileSync(join(HERE, '..', '..', 'frontend', 'app', 'streak-calendar.tsx'), 'utf8');
const m = /const LOCALES: Record<string, string> = (\{[\s\S]*?\});/.exec(screen);
if (!m) throw new Error('нет LOCALES в streak-calendar.tsx');
const LOCALES = new Function(`return ${m[1]}`)();

const YEAR = 2026;
const DAY = 17;
const out = { node: process.versions.node, icu: process.versions.icu, locales: {} };
for (const [lang, locale] of Object.entries(LOCALES)) {
  const num = new Intl.NumberFormat(locale, { useGrouping: false });
  const digits = [...Array(10)].map((_, i) => num.format(i)).join('');
  const y = num.format(YEAR);
  const d = num.format(DAY);
  const one = (s, token, value) => {
    const i = s.indexOf(value);
    if (i < 0 || s.indexOf(value, i + 1) >= 0) throw new Error(`${lang}: «${value}» не один раз в «${s}»`);
    return s.slice(0, i) + token + s.slice(i + value.length);
  };
  const monthYear = [];
  const spoken = [];
  for (let month = 0; month < 12; month++) {
    monthYear.push(one(new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric' }).format(new Date(YEAR, month, 1)), '{y}', y));
    spoken.push(one(one(new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'long', year: 'numeric' })
      .format(new Date(YEAR, month, DAY)), '{y}', y), '{d}', d));
  }
  // Понедельник 01.01.2024 и шесть дней за ним — как у веба.
  const weekdays = [...Array(7)].map((_, i) => new Intl.DateTimeFormat(locale, { weekday: 'narrow' }).format(new Date(2024, 0, 1 + i)));
  out.locales[lang] = { digits, monthYear, spoken, weekdays };
}
writeFileSync(join(HERE, '..', 'assets', 'calendar_locales.json'), `${JSON.stringify(out, null, 1)}\n`, 'utf8');
console.log(`языков: ${Object.keys(out.locales).length} (Node ${out.node}, ICU ${out.icu}) → assets/calendar_locales.json`);
