#!/usr/bin/env node
// КАРТОЧКИ 42 РЕЖИМОВ ТЭТХЭМА — ИЗ ВЕБ-МОСТА, А НЕ ПЕРЕПИСЫВАНИЕМ.
//
// 🔴 ЗАЧЕМ. Движок один и умеет все 42 игры, но экрану нужна карточка на каждую:
// имя, лестница трудности, подписи клавиш. Первые семь раздел «Судоку» написал
// руками — свои. Остальные 35 принадлежат пяти другим разделам, и писать их по
// одной значило бы: 35 шансов разойтись с веб-версией и 35 мест, где потом
// чинить. Данные УЖЕ лежат в `frontend/src/games/tatham-bridge/sections/*.ts`,
// каждый режим в файле своего владельца (раскладка 16.09.2026 по просьбе Дениса).
//
// 🔴 ЛЕСТНИЦА ЕСТЬ НЕ У ВСЕХ, И ЭТО НЕ ПРОБЕЛ. Замер 23.09.2026: своя лестница
// описана у 14 режимов из 42. У остальных её нет и выдумывать нельзя — трудность
// меряют исполнением, а не назначают. Поэтому такие режимы берут СОБСТВЕННЫЕ
// пресеты движка (`psy_presets`), которые Тэтхэм сам и подобрал; раздел заменит
// их своей лестницей, когда померит.
//
// Запуск: node flutter/tools/embed-puzzle-modes.mjs
import { readFileSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const FLUTTER = join(HERE, '..');
const SECTIONS = join(FLUTTER, '..', 'frontend', 'src', 'games', 'tatham-bridge', 'sections');
const OUT = join(FLUTTER, 'assets', 'puzzles');

/** Объект-литерал из TS читаем вычислением: в значениях есть кавычки и юникод. */
function evalAfter(src, marker) {
  const start = src.indexOf(marker);
  if (start < 0) return null;
  const open = src.indexOf('{', start);
  let depth = 0;
  for (let i = open; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}' && --depth === 0) {
      // Висячая запятая законна в TS и незаконна в JSON — снимаем, как в embed-l10n.
      const body = src.slice(open, i + 1).replace(/,(\s*[}\]])/g, '$1');
      return new Function('return ' + body)();
    }
  }
  return null;
}

const modes = {};
let withLadder = 0;
for (const f of readdirSync(SECTIONS).sort()) {
  if (!f.endsWith('.ts') || f.endsWith('.teach.ts') || f.startsWith('тип')) continue;
  const src = readFileSync(join(SECTIONS, f), 'utf8');
  const section = evalAfter(src, 'export const РАЗДЕЛ');
  const table = evalAfter(src, 'export const РЕЖИМЫ_РАЗДЕЛА');
  if (!table) continue;
  for (const [engineName, m] of Object.entries(table)) {
    const steps = (m['лестница'] ?? []).map((s) => ({ title: s['имя'], params: s['параметры'] }));
    if (steps.length) withLadder++;
    modes[engineName] = {
      engineName,
      // Имя — КЛЮЧ СЛОВАРЯ, а не русская строка: экран возьмёт его через L.t и
      // заговорит на всех двенадцати языках. У семи написанных руками карточек
      // названия были зашиты по-русски — это заодно гасит их долг.
      titleKey: m['имя'],
      // 🔴 КЛЮЧ ПРАВИЛА РЕЖИМА — «чем ходить», строка под доской. Выводится ровно
      // так же, как в вебе (`names.ts`: `КЛЮЧ_ОПИСАНИЯ = КЛЮЧ_ИМЕНИ + 'Desc'`), а
      // не переписывается списком: второй список — второе место разойтись.
      // 📍 Зачем: 24.09.2026 Денис прислал кадр «Мостов» с нативной сборки — над
      // доской пусто, внизу общая на все 42 режима фраза «Тычок отмечает клетку».
      // Для «Мостов» она вдобавок неверна: ход там протяжкой от острова к острову.
      // Два отзыва ровно про это — dd4cda8a и d99eae48.
      descKey: `${m['имя']}Desc`,
      digits: m['цифры'] === true,
      // Что нарисовано на клавише (у «Нежити» это 👻🧛🧟) и КЛЮЧ СЛОВАРЯ с именем
      // для чтеца экрана: значок читается вслух как «эмодзи», и без имени
      // незрячий человек не узнает, какое чудовище ставит.
      digitLabels: (m['знакиЦифр'] ?? []).map((z) => z['знак']),
      digitNames: (m['знакиЦифр'] ?? []).map((z) => z['имя']),
      steps,
      /*
       * 🔴 ОРГАНЫ УПРАВЛЕНИЯ ПЕРЕНОСЯТСЯ ЦЕЛИКОМ, А НЕ ВЫБОРОЧНО.
       *
       * Поймано 24.09.2026. Раздел «Сортировки» целый заход правил веб-половину
       * «Рельсов» и «Мостов»: нашёл, что справка ВРАЛА (рельс кладётся на границу
       * между клетками, а не тапом внутрь), и добавил режиму органы курсора —
       * стрелки и два действия. А оба адреса уже перехвачены нативно, и до
       * телефона эта работа не дошла бы вовсе: нативная карточка несла только имя,
       * цифры и ступени. Половина правок в пустоту — не их ошибка, а моя: перехват
       * включил я, а поля не перенёс.
       *
       * Поэтому здесь ВСЁ, что веб-карточка знает про управление. Появилось новое
       * поле в `sections/*.ts` — оно обязано приехать и сюда; сторожит это проба
       * `flutter/test/mode_card_keeps_web_fields_test.dart`.
       */
      // Стрелки водят курсор по доске (у части режимов ход только курсором).
      arrows: m['стрелки'] === true,
      // Восемь направлений вместо четырёх — по диагонали тоже.
      eightWays: m['восемьНаправлений'] === true,
      // Выбор под курсором делает ход; второй выбор — второе действие.
      pick: m['выбор'] === true,
      pickSecond: m['выборВторой'] === true,
      // Ключи словаря с подписями второго действия.
      secondKey: m['второе'] ?? null,
      secondPickKey: m['имяВторогоВыбора'] ?? null,
      // Ход делается только протяжкой — касание не годится.
      dragOnly: m['толькоПротяжка'] === true,
      // Как игра принимает ввод (тычок, протяжка, клавиши) — как назвал раздел.
      input: m['ввод'] ?? null,
      // Чья игра — чтобы раздел видел свои и не правил чужие.
      owner: section?.['чат'] ?? null,
      hub: section?.['хаб'] ?? null,
    };
  }
}

const names = Object.keys(modes);
if (names.length !== 42) {
  console.error(`🔴 режимов разобрано ${names.length}, а их 42 — сломался разбор, а не мост`);
  process.exit(1);
}
mkdirSync(OUT, { recursive: true });
writeFileSync(join(OUT, 'modes.json'), JSON.stringify(modes, null, 0) + '\n');
console.log(`режимов: ${names.length} · со своей лестницей: ${withLadder} · на пресетах движка: ${names.length - withLadder}`);
const byOwner = {};
for (const m of Object.values(modes)) byOwner[m.owner ?? '—'] = (byOwner[m.owner ?? '—'] ?? 0) + 1;
for (const [o, n] of Object.entries(byOwner).sort((a, b) => b[1] - a[1])) {
  console.log(`  ${String(o).replace('psygames-', '').replace('-claude-mac', '').padEnd(16)} ${n}`);
}
