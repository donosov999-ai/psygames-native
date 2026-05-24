#!/usr/bin/env node
/**
 * PsyGames Dynamic Keygen (v1.5.0+)
 *
 * Генерирует динамические коды разблокировки профилей в формате:
 *   PROF-YYMMDD-SSSS-CCCCCC
 *
 *   PROF    — 3-буквенный код профиля (см. PROFILE_CODES ниже)
 *   YYMMDD  — дата истечения (год-месяц-день, по 2 цифры)
 *   SSSS    — 4-символьный serial (случайный hex или указанный, для учёта «кому выдан»)
 *   CCCCCC  — 6-символьный HMAC-SHA256 checksum (первые 6 hex от HMAC(secret, payload))
 *
 * Пример: EXC-261201-A4F2-1B8C3D = execs, действует до 2026-12-01, serial A4F2
 *
 * Использование:
 *   node scripts/keygen.mjs --profile execs --days 90
 *   node scripts/keygen.mjs --profile women --days 30 --count 10 --serial customer42
 *   node scripts/keygen.mjs --interactive
 *
 * ⚠ SECRET ROTATION: если SECRET утёк или меняется — все ранее выданные
 * динамические коды СРАЗУ перестанут работать (CI rebuild + push). Старые
 * статические коды (CHESS-NZT-2026 и т.д.) при этом продолжат работать —
 * они хешируются отдельно (SHA-256 → HASH_TO_PROFILE в unlock.ts).
 */

import crypto from 'node:crypto';
import process from 'node:process';
import readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';

// ─── SHARED SECRET ──────────────────────────────────────────────────────
// ⚠ ВАЖНО: этот же ключ ДОЛЖЕН быть в frontend/src/services/unlock.ts
// → const KEYGEN_SECRET = '...' (точно такой же). Если меняешь здесь —
// меняй там, иначе все выданные коды станут невалидными.
const KEYGEN_SECRET = '01ec6f43615b0a9ba400f1812130ad8b108db3f5485f990ab7c591de10047ab8';

// ─── PROFILE CODE MAPPING ───────────────────────────────────────────────
// 3-буквенный prefix → ProfileId. Изменения здесь = breaking, обязательно
// синхронизировать с PROFILE_CODE_MAP в unlock.ts.
const PROFILE_CODES = {
  ODV: 'odv999',     // 🛠 ODV999 — полный доступ
  CHE: 'chess',      // ♟ Шахматист
  KID: 'kids',       // 🧒 Дети 7-12
  RED: 'vasilyeva',  // 📖 Скорочтение (READing)
  NZT: 'nzt48',      // 💊 NZT-48 полный
  DRV: 'drivers',    // 🚗 Водители
  SEN: 'seniors',    // 👴 50+ профилактика
  EXC: 'execs',      // 💼 Предприниматели
  STD: 'students',   // 🎓 Студенты ЕГЭ
  WOM: 'women',      // 👩 Женщины
  FRE: 'free',       // 🎁 FREE (не требует кода, но для completeness)
};

// ─── CORE ───────────────────────────────────────────────────────────────

/** YYMMDD строкой для даты (UTC, без timezone-сюрпризов) */
function formatDate(date) {
  const yy = String(date.getUTCFullYear() % 100).padStart(2, '0');
  const mm = String(date.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(date.getUTCDate()).padStart(2, '0');
  return `${yy}${mm}${dd}`;
}

/** HMAC-SHA256, hex lowercase, первые N символов */
function hmac(secret, payload, length = 6) {
  return crypto.createHmac('sha256', secret)
    .update(payload)
    .digest('hex')
    .slice(0, length)
    .toUpperCase();
}

/** Сгенерировать случайный 4-char hex serial */
function randomSerial() {
  return crypto.randomBytes(2).toString('hex').toUpperCase();
}

/**
 * Сгенерировать один динамический код.
 * @param {string} profileId — id профиля (chess/kids/...)
 * @param {number} daysValid — сколько дней действует
 * @param {string} [serialOverride] — фиксированный serial (для трекинга клиента)
 * @returns {string} код вида PROF-YYMMDD-SSSS-CCCCCC
 */
export function generateCode(profileId, daysValid, serialOverride = null) {
  // Найти 3-char prefix для этого профиля
  const prefix = Object.entries(PROFILE_CODES).find(([_, id]) => id === profileId)?.[0];
  if (!prefix) {
    throw new Error(`Unknown profile id: ${profileId}. Valid: ${Object.values(PROFILE_CODES).join(', ')}`);
  }

  // Expiry в формате YYMMDD (UTC)
  const expiry = new Date(Date.now() + daysValid * 86400 * 1000);
  const dateStr = formatDate(expiry);

  // Serial 4 chars (если не указан — random hex)
  let serial = (serialOverride || randomSerial()).toUpperCase();
  if (serial.length < 4) serial = serial.padEnd(4, '0');
  if (serial.length > 4) serial = serial.slice(0, 4);
  // Sanitize: только A-Z 0-9
  serial = serial.replace(/[^A-Z0-9]/g, '0');

  const payload = `${prefix}-${dateStr}-${serial}`;
  const checksum = hmac(KEYGEN_SECRET, payload, 6);

  return `${payload}-${checksum}`;
}

// ─── CLI ────────────────────────────────────────────────────────────────

function parseArgs(argv) {
  const args = {};
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--interactive' || a === '-i') { args.interactive = true; continue; }
    if (a === '--help' || a === '-h') { args.help = true; continue; }
    if (a.startsWith('--')) {
      const key = a.slice(2);
      const val = argv[i + 1];
      args[key] = val;
      i++;
    }
  }
  return args;
}

function printHelp() {
  console.log(`
PsyGames Dynamic Keygen — генератор кодов разблокировки профилей

USAGE:
  node scripts/keygen.mjs --profile <id> --days <N> [--count <N>] [--serial <S>]
  node scripts/keygen.mjs --interactive
  node scripts/keygen.mjs --help

OPTIONS:
  --profile <id>    профиль (одно из: ${Object.values(PROFILE_CODES).join(', ')})
  --days <N>        срок действия в днях (default: 365)
  --count <N>       сколько кодов сгенерировать (default: 1)
  --serial <S>      зафиксировать serial (для учёта «кому выдан», 4 chars)
  --interactive     интерактивный режим (диалог в терминале)
  --help            эта справка

EXAMPLES:
  # Один код для предпринимателя на 90 дней:
  node scripts/keygen.mjs --profile execs --days 90

  # 10 кодов для рекламной акции на 30 дней:
  node scripts/keygen.mjs --profile kids --days 30 --count 10

  # Код с фиксированным serial (для учёта клиента «Анна Петрова» = AP01):
  node scripts/keygen.mjs --profile women --days 60 --serial AP01

FORMAT: PROF-YYMMDD-SSSS-CCCCCC
  PROF    — 3-char код профиля (ODV/CHE/KID/RED/NZT/DRV/SEN/EXC/STD/WOM)
  YYMMDD  — дата истечения (UTC)
  SSSS    — 4-char serial (для учёта)
  CCCCCC  — 6-char HMAC-checksum

Старые статические коды (CHESS-NZT-2026 и т.д.) продолжают работать —
они проверяются отдельно через SHA-256 lookup. Динамические — через HMAC.
`);
}

async function interactiveMode() {
  const rl = readline.createInterface({ input, output });

  const profileList = Object.entries(PROFILE_CODES)
    .map(([k, v]) => `${v} (${k})`)
    .join(', ');

  const profile = await rl.question(`Профиль [${profileList}]:\n> `);
  const daysStr = await rl.question('Срок действия в днях (default 365): ');
  const days = parseInt(daysStr) || 365;
  const countStr = await rl.question('Сколько кодов (default 1): ');
  const count = parseInt(countStr) || 1;
  const serialOverride = await rl.question('Зафиксировать serial (для учёта клиента, оставь пусто для random): ');

  rl.close();

  console.log('\n─── Сгенерированные коды ──────────────────────────\n');
  for (let i = 0; i < count; i++) {
    const serial = serialOverride.trim() || null;
    const code = generateCode(profile.trim(), days, serial);
    console.log(`  ${i + 1}. ${code}`);
  }

  const expiryDate = new Date(Date.now() + days * 86400 * 1000);
  console.log(`\nИстекают: ${expiryDate.toISOString().slice(0, 10)} (через ${days} дн.)`);
  console.log(`Профиль: ${profile.trim()}\n`);
}

async function main() {
  const args = parseArgs(process.argv);

  if (args.help) {
    printHelp();
    return;
  }

  if (args.interactive) {
    await interactiveMode();
    return;
  }

  if (!args.profile) {
    console.error('❌ --profile обязателен. См. --help.');
    process.exit(1);
  }

  const validProfiles = Object.values(PROFILE_CODES);
  if (!validProfiles.includes(args.profile)) {
    console.error(`❌ Unknown profile: ${args.profile}. Valid: ${validProfiles.join(', ')}`);
    process.exit(1);
  }

  const days = parseInt(args.days) || 365;
  const count = parseInt(args.count) || 1;
  const serial = args.serial || null;

  for (let i = 0; i < count; i++) {
    // Если --serial передан И count > 1 → автоматически разные коды (иначе все
    // были бы идентичные). Для serial 'AP01' + count 3 → AP01, AP02, AP03.
    let serialThisIter = serial;
    if (serial && count > 1) {
      // Попытка инкремента: если serial оканчивается на число — увеличиваем
      const m = serial.match(/^(.*?)(\d+)$/);
      if (m) {
        const prefix = m[1];
        const num = parseInt(m[2], 10) + i;
        const numStr = String(num).padStart(m[2].length, '0');
        serialThisIter = (prefix + numStr).slice(0, 4).padEnd(4, '0');
      } else {
        // serial без цифр (напр. 'ANNA') → добавить i к концу
        serialThisIter = (serial.slice(0, 3) + String(i)).slice(0, 4);
      }
    }
    const code = generateCode(args.profile, days, serialThisIter);
    if (count === 1) {
      console.log(code);
    } else {
      console.log(`  ${i + 1}. ${code}`);
    }
  }

  if (count > 1 || process.env.KEYGEN_VERBOSE) {
    const expiryDate = new Date(Date.now() + days * 86400 * 1000);
    console.error(`\n# ${count} код(ов), профиль "${args.profile}", истекают ${expiryDate.toISOString().slice(0, 10)}`);
  }
}

// Guard: запускать main() только если вызван как CLI, не как импорт
import { fileURLToPath } from 'node:url';
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch(err => {
    console.error('❌', err.message);
    process.exit(1);
  });
}
