/**
 * Unlock-code service для themed profiles.
 *
 * Поддерживает ДВА формата кодов одновременно (v1.5.0+):
 *
 * 1️⃣ **СТАТИЧЕСКИЕ master-коды** (legacy, v1.0.0+)
 *    - Один код = бессрочно = неограниченные активации
 *    - Хранятся как SHA-256 хеши в HASH_TO_PROFILE
 *    - При утечке → новый релиз приложения с новым хешем
 *    - Примеры: CHESS-NZT-2026, NZT48-FULL-2026, 963Alex963!@#$%^&*() (ODV999)
 *
 * 2️⃣ **ДИНАМИЧЕСКИЕ HMAC-коды** (v1.5.0+) — формат `XXX-YYMMDD-SSSS-CCCCCC`
 *    - Генерируются на лету через `scripts/keygen.mjs`
 *    - Встроенный срок действия (YYMMDD)
 *    - Serial 4 chars для учёта «кому выдан»
 *    - 6 chars HMAC-checksum от секретного ключа
 *    - Пример: EXC-261201-A4F2-1B8C3D — execs до 2026-12-01
 *
 * Денису: список выданных кодов трекай руками в:
 *   /Users/denisonosov/Downloads/PSYGAMES_UNLOCK_CODES.md
 * (gitignored — никогда не коммить плейнтекст-коды).
 *
 * Если SECRET утёк → ВСЕ динамические коды разом инвалидируются.
 * Если статический хеш утёк → только один код. Чтобы заменить:
 *   1. Run: echo -n "NEW-CODE-2026" | shasum -a 256
 *   2. Заменить старый хеш в HASH_TO_PROFILE новым
 *   3. Push → CI rebuild → старый код перестаёт работать
 */

import type { ProfileId } from '@/src/constants/profiles';

// ═══════════════════════════════════════════════════════════════════════
// 1️⃣ СТАТИЧЕСКИЕ master-коды (SHA-256 lookup)
// ═══════════════════════════════════════════════════════════════════════

/**
 * Pre-computed SHA-256 hashes мастер-кодов → profile id.
 * Чтобы найти плейнтекст: см. ~/Downloads/PSYGAMES_UNLOCK_CODES.md
 */
const HASH_TO_PROFILE: Record<string, ProfileId> = {
  '181a5f1b4ae0e79700a224b4a6770ca98fae05a39f20fbcbdfed3cd9164299e0': 'chess',
  '81bdbf9d61587dad83a41259ce6b04dc86010d135153e9064b7734d97030ad29': 'kids',
  '0958fe8bdb5e9267d9f87d943a5ee14f793247cebced66cf6404f962f7790509': 'vasilyeva',
  'f519a522edae1e3a360ed43783df3d6aacfc71391e1ce5dd6833918f0a8bb1a6': 'nzt48',
  '3d12df531b0e90ba81b69d4971282ffde5cdfe2ddb7eb8de6b3d2dcc71f6946a': 'drivers',
  '27399770c0312c74dc7e287a201cf026b3dde1d72c3ff31099a7153d1c2f49fa': 'seniors',
  '2bda5949b24ad3b3d833fe9ef49ee5d2667c11f0809369f263cc4bd274cbb061': 'execs',
  '5935509a20fa445bfb8fe49c49025b985597723df5d52e5650a3908526ca7706': 'students',
  // ODV999 (owner, full access). Same password as NZT staticrypt.
  '259a6084c97548c093d7b305d5ede0d9b2d40457d8eb89bd198bf0465f04ac17': 'odv999',
  // WOMEN (v1.4.0). Code: WOMEN-NZT-2026.
  'ccdc487f4f2f01448d35f68cfe09982cb41c1016b9f1d486b42314a22bd3ad58': 'women',
};

/** Themed profiles that REQUIRE an unlock code. FREE is reachable without. */
export const THEMED_PROFILES_LOCKED: ProfileId[] = [
  'odv999',
  'chess', 'kids', 'vasilyeva', 'nzt48',
  'drivers', 'seniors', 'execs', 'students',
  'women',
];

// ═══════════════════════════════════════════════════════════════════════
// 2️⃣ ДИНАМИЧЕСКИЕ HMAC-коды (v1.5.0+)
// ═══════════════════════════════════════════════════════════════════════

/**
 * ⚠ ВАЖНО: SECRET ДОЛЖЕН точно совпадать с `KEYGEN_SECRET` в
 * `frontend/scripts/keygen.mjs`. При изменении одного — поменять оба
 * и пересобрать CI, иначе ранее выданные динамические коды не пройдут проверку.
 *
 * Этот секрет вшит в JS bundle → теоретически достать reverse-engineerom.
 * Для small commercial — достаточно. Если нужна более серьёзная защита —
 * переходить на серверную валидацию через Supabase Edge Function.
 */
const KEYGEN_SECRET = '01ec6f43615b0a9ba400f1812130ad8b108db3f5485f990ab7c591de10047ab8';

/** 3-char prefix → ProfileId. Sync с PROFILE_CODES в keygen.mjs. */
const PROFILE_CODE_MAP: Record<string, ProfileId> = {
  ODV: 'odv999',
  CHE: 'chess',
  KID: 'kids',
  RED: 'vasilyeva',
  NZT: 'nzt48',
  DRV: 'drivers',
  SEN: 'seniors',
  EXC: 'execs',
  STD: 'students',
  WOM: 'women',
  FRE: 'free',
};

// ─── SHARED CRYPTO HELPERS ──────────────────────────────────────────────

/** SHA-256 (lowercase hex) через Web Crypto API. */
async function sha256Hex(input: string): Promise<string> {
  const enc = new TextEncoder();
  const buf = await crypto.subtle.digest('SHA-256', enc.encode(input));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/** HMAC-SHA256 hex (lowercase), первые N символов. */
async function hmacSha256Hex(secret: string, message: string, length = 6): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(message));
  const hex = Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  return hex.slice(0, length).toUpperCase();
}

// ─── DYNAMIC CODE VERIFIER ──────────────────────────────────────────────

interface ParsedDynamicCode {
  profile: ProfileId;
  expiry: Date;
  prefix: string;
  dateStr: string;
  serial: string;
  providedChecksum: string;
}

/** Распарсить динамический код. Возвращает null если формат не подходит. */
function parseDynamicCode(raw: string): ParsedDynamicCode | null {
  const parts = raw.split('-');
  if (parts.length !== 4) return null;

  const [prefix, dateStr, serial, providedChecksum] = parts;
  if (prefix.length !== 3) return null;
  if (dateStr.length !== 6 || !/^\d{6}$/.test(dateStr)) return null;
  if (serial.length !== 4 || !/^[A-Z0-9]{4}$/.test(serial)) return null;
  if (providedChecksum.length !== 6 || !/^[A-F0-9]{6}$/.test(providedChecksum)) return null;

  const profile = PROFILE_CODE_MAP[prefix];
  if (!profile) return null;

  const yy = parseInt(dateStr.slice(0, 2), 10);
  const mm = parseInt(dateStr.slice(2, 4), 10);
  const dd = parseInt(dateStr.slice(4, 6), 10);
  if (mm < 1 || mm > 12 || dd < 1 || dd > 31) return null;

  // UTC date — конец дня истечения (00:00 следующего дня)
  const expiry = new Date(Date.UTC(2000 + yy, mm - 1, dd + 1, 0, 0, 0));

  return { profile, expiry, prefix, dateStr, serial, providedChecksum };
}

/**
 * Проверить динамический код. Возвращает ProfileId если код валиден и не истёк,
 * иначе null. Возможные причины null:
 *   - Неправильный формат
 *   - Неизвестный prefix
 *   - HMAC checksum не совпадает (подделан / опечатка)
 *   - Код истёк
 */
async function verifyDynamicCode(raw: string): Promise<ProfileId | null> {
  const parsed = parseDynamicCode(raw);
  if (!parsed) return null;

  // Проверка срока действия
  if (Date.now() >= parsed.expiry.getTime()) return null;

  // Пересчёт HMAC
  const payload = `${parsed.prefix}-${parsed.dateStr}-${parsed.serial}`;
  const expectedChecksum = await hmacSha256Hex(KEYGEN_SECRET, payload, 6);

  return parsed.providedChecksum === expectedChecksum ? parsed.profile : null;
}

// ═══════════════════════════════════════════════════════════════════════
// 🚪 ENTRY POINT
// ═══════════════════════════════════════════════════════════════════════

/**
 * Попытаться разблокировать профиль кодом. Сначала проверяется как
 * статический master-код (SHA-256 lookup), потом как динамический HMAC-код.
 * Возвращает ProfileId если код валиден, иначе null.
 */
export async function tryUnlock(rawCode: string): Promise<ProfileId | null> {
  const trimmed = rawCode.trim();
  if (trimmed.length < 4) return null;
  // Native-safe: Web Crypto (crypto.subtle) отсутствует на нативном RN (iOS/Android).
  // Коды сейчас выключены (UNLOCK_CODES_ENABLED=false); при возврате монетизации
  // на нативе понадобится expo-crypto. Пока — graceful null вместо краша.
  if (typeof crypto === 'undefined' || !crypto.subtle) return null;
  const upper = trimmed.toUpperCase();

  // 1️⃣ Статический master-код — UPPERCASE-хеш (legacy: CHESS-NZT-2026 формат
  //     где user мог ввести в любом регистре, всё приводится к UPPERCASE).
  const upperHash = await sha256Hex(upper);
  if (HASH_TO_PROFILE[upperHash]) {
    return HASH_TO_PROFILE[upperHash];
  }

  // 1.5️⃣ Статический master-код — case-sensitive хеш (v1.13.1 fix).
  //      Для паролей с lowercase символами (типа 963Alex963!@#$%^&*())
  //      где UPPERCASE-приведение ломает хеш. Если код реально mixed-case —
  //      пользователь должен ввести точно как есть.
  if (trimmed !== upper) {
    const rawHash = await sha256Hex(trimmed);
    if (HASH_TO_PROFILE[rawHash]) {
      return HASH_TO_PROFILE[rawHash];
    }
  }

  // 2️⃣ Динамический HMAC-код (формат XXX-YYMMDD-SSSS-CCCCCC, всё uppercase)
  return await verifyDynamicCode(upper);
}

/**
 * v1.15.0: ГЛОБАЛЬНЫЙ ФЛАГ запроса кодов.
 *
 * false = ВСЕ профили открыты без кода (этап отладки процессов до монетизации).
 * true  = коммерческий режим — themed-профили требуют master-код.
 *
 * Чтобы включить платный доступ обратно — поменять на `true` + пересобрать.
 * Вся инфраструктура (хеши, keygen, HMAC) сохранена и сразу заработает.
 * UI код-кнопок («🔑 Ввести код», 🔒-замки, pricing, Corporate Pack) тоже
 * гейтится этим флагом — при false они скрыты.
 */
export const UNLOCK_CODES_ENABLED = false;

/**
 * v1.16.0: профили, ОТКРЫТЫЕ без кода на этапе free-trial (до монетизации).
 *
 * Денис 30.05.2026: «открой не все, а 3-5 самых востребованных, чтобы
 * могли оценить больше» → выбран набор «5 массовых» (самые широкие
 * аудитории + флагман-namesake). Аналитики использования ещё нет —
 * набор по размеру рынка/позиционированию.
 *
 * Остальные themed-профили (chess/vasilyeva/drivers/execs) и ODV999
 * показываются под замком «скоро» (без код-входа, т.к. UNLOCK_CODES_ENABLED=false).
 * ODV999 (владелец, все 48 игр) под замком намеренно — не светить полный
 * доступ в публичной trial-сборке.
 *
 * Когда включим монетизацию (UNLOCK_CODES_ENABLED=true) — этот список
 * перестаёт влиять: гейтинг возвращается к THEMED_PROFILES_LOCKED + коды.
 */
export const TRIAL_OPEN_PROFILES: ProfileId[] = [
  'nzt48',     // 💊 флагман — namesake всего каталога
  'women',     // 🌸 Микро-релакс — макс. retention (казуал)
  'kids',      // 🧒 Дети 7-12 — масс-маркет (родители)
  'seniors',   // 👴 50+ профилактика — большой растущий сегмент
  'students',  // 🎓 Студенты PRO — большой международный (ЕГЭ/GMAT/GRE)
  'polyglot',  // 🗣 Языки/Полиглот — массовый рынок изучающих языки
];

/**
 * Профиль требует разблокировки (показывается под замком)?
 *
 * - FREE — всегда открыт (no-code sampler).
 * - Этап free-trial (UNLOCK_CODES_ENABLED=false): открыты только
 *   TRIAL_OPEN_PROFILES, остальные themed (включая ODV999) — под замок.
 * - Коммерческий режим (UNLOCK_CODES_ENABLED=true): все themed требуют код.
 */
export function requiresUnlock(profileId: ProfileId): boolean {
  if (profileId === 'free') return false;
  if (!UNLOCK_CODES_ENABLED) {
    // Free-фаза (v1, путь A): открыты ВСЕ профили, замков нет (Apple 2.1 — без «скоро»-тупиков).
    // Монетизация позже через Apple IAP → вернуть гейтинг:
    //   return !TRIAL_OPEN_PROFILES.includes(profileId);  // или THEMED_PROFILES_LOCKED
    return false;
  }
  return THEMED_PROFILES_LOCKED.includes(profileId);
}

/**
 * Профиль закрыт именно как «скоро / после запуска» (а не «введите код»)?
 * true только на этапе free-trial для не-trial профилей — UI должен показать
 * нейтральный замок без поля ввода кода (кодов сейчас нет).
 */
export function isComingSoon(profileId: ProfileId): boolean {
  return !UNLOCK_CODES_ENABLED && requiresUnlock(profileId);
}
