#!/usr/bin/env node
/**
 * a11y-audit — гейт доступности: ловит «немые» кнопки до релиза.
 *
 * ЗАЧЕМ. Скринридер (VoiceOver/TalkBack) читает не картинку, а атрибуты
 * accessibility*. TouchableOpacity/Pressable, внутри которого только иконка,
 * картинка или цветной блок, он озвучивает как пустую кнопку — играть нельзя,
 * а Apple снимает такое с ревью. Один раз это уже прилетело от Google
 * (16К-выравнивание) — узнавать о блокерах от площадки дороже, чем от CI.
 *
 * ЧТО СЧИТАЕТ НАРУШЕНИЕМ. Тач без accessibilityLabel/accessible, у которого
 * нет дочернего <Text> (текст RN озвучивает сам) и который не помечен
 * декорацией. Всё остальное пропускаем — цель гейта не набить метрику,
 * а не дать появиться новой немой кнопке.
 *
 * Запуск: node scripts/a11y-audit.mjs   (из frontend/)
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = process.cwd();
const DIRS = ['app', 'src/components'];
const TAGS = ['TouchableOpacity', 'Pressable', 'TouchableHighlight', 'TouchableWithoutFeedback'];

function walk(dir, out = []) {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (p.endsWith('.tsx')) out.push(p);
  }
  return out;
}

/** [start, конецОткрывающегоТега, конецБлока] для каждого <tag …>…</tag>. */
function blocks(s, tag) {
  const out = [];
  const re = new RegExp(`<${tag}\\b`, 'g');
  let m;
  while ((m = re.exec(s))) {
    const i = m.index;
    let depth = 0, oe = -1;
    for (let j = i; j < s.length; j++) {
      const c = s[j];
      if (c === '{') depth++;
      else if (c === '}') depth--;
      else if (c === '>' && depth === 0) { oe = j; break; }
    }
    if (oe === -1) continue;
    if (s[oe - 1] === '/') { out.push([i, oe, oe + 1]); continue; }
    let d = 0, k = oe;
    for (;;) {
      const o = s.indexOf(`<${tag}`, k + 1);
      const c = s.indexOf(`</${tag}>`, k + 1);
      if (c === -1) { out.push([i, oe, oe + 1]); break; }
      if (o !== -1 && o < c) { d++; k = o; }
      else if (d === 0) { out.push([i, oe, c + tag.length + 3]); break; }
      else { d--; k = c; }
    }
  }
  return out;
}

/**
 * Есть ли в теле кнопки текст, который человек услышит как СЛОВО.
 *
 * Считаем произносимым: вызов перевода `t('…')`, любая подстановка `{…}` со смыслом
 * (имя игры, число очков — их читает сам RN) и буквы длиннее одной. Не считаем:
 * значки-стрелки, эмодзи, одиночные цифры и знаки препинания. «↺ 1» и «✕» — не подпись.
 */
function speakable(body) {
  if (/\bt\(/.test(body)) return true;                    // переведённая строка
  const texts = [...body.matchAll(/<Text[^>]*>([\s\S]*?)<\/Text>/g)].map((m) => m[1]);
  for (const raw of texts) {
    // ⚠️ Подстановка `{…}` — это ЖИВОЕ значение: цифра клавиши, буква, имя уровня.
    // Скринридер прочитает его как есть, и это нормально. Первая версия проверки
    // вырезала подстановки и ругалась на всё подряд — 123 срабатывания, из них
    // подавляющее большинство на исправном коде. Гейт, падающий на исправном, хуже
    // отсутствия гейта: его отключат целиком вместе с настоящими находками.
    if (/\{[^}]+\}/.test(raw)) return true;
    if (/[\p{L}]{2,}/u.test(raw.replace(/<[^>]*>/g, ' '))) return true;   // настоящее слово
  }
  return false;
}

/** Что именно там за символы — чтобы в отчёте было видно, о чём речь. */
function symbolsOf(body) {
  const texts = [...body.matchAll(/<Text[^>]*>([\s\S]*?)<\/Text>/g)].map((m) => m[1]);
  return texts.map((x) => x.replace(/\s+/g, ' ').trim().slice(0, 18)).filter(Boolean).join(' | ') || '(пусто)';
}

const bad = [];
for (const d of DIRS) {
  for (const f of walk(join(ROOT, d))) {
    const s = readFileSync(f, 'utf8');
    for (const tag of TAGS) {
      for (const [st, oe, be] of blocks(s, tag)) {
        const head = s.slice(st, oe + 1);
        const body = s.slice(oe + 1, be);
        if (/accessibilityLabel|accessible=|a11yDecor|a11yBtn|a11yCell|\.\.\.rest|\{\.\.\.props\}/.test(head)) continue;
        const line = s.slice(0, st).split('\n').length;
        if (/<Text[\s>]/.test(body)) {
          // Дочерний текст — ещё не подпись. Гейт зачитывал ЛЮБОЙ <Text> как «озвучится
          // само», и кнопка сброса с содержимым «↺ 1» проходила проверку зелёной, а
          // скринридер произносил символ вместо действия. Замечено при аудите Sonnet 4.6
          // 12.08.2026; проверено — так и есть, строка пропуска стояла без разбора
          // содержимого. Значит проверять надо, ЧТО именно в тексте.
          if (!speakable(body)) {
            bad.push(`${relative(ROOT, f)}:${line}  <${tag}> подпись из символов: ${symbolsOf(body)}`);
          }
          continue;
        }
        bad.push(`${relative(ROOT, f)}:${line}  <${tag}> без подписи`);
      }
    }
  }
}

if (bad.length) {
  console.error(`\n❌ a11y: ${bad.length} кнопок без подписи для скринридера\n`);
  for (const b of bad) console.error('   ' + b);
  console.error('\nПочини так: accessibilityRole="button" accessibilityLabel={t(\'a11y…\')}');
  console.error('Если элемент декоративный и тапов не ловит — {...a11yDecor} из @/src/services/a11y\n');
  process.exit(1);
}
console.log('✅ a11y: кнопок без подписи нет');
