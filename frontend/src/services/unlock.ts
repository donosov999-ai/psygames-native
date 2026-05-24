/**
 * Unlock-code service for themed profiles.
 *
 * Themed profiles (Chess / Kids / Vasilyeva / NZT-48 / Drivers / Seniors /
 * Execs / Students) require a unique master-code to activate. FREE profile
 * is the default — accessible without any code.
 *
 * Each code maps to exactly one profile_id. Hash is SHA-256 of UPPERCASE
 * trimmed code string. Codes live in this file (hashes, not plaintext).
 *
 * For Денис: list of plaintext codes lives separately in:
 *   /Users/denisonosov/Downloads/Code claude/psygames/UNLOCK_CODES.md
 * (gitignored — never commit plaintext codes).
 *
 * If a code leaks → generate a new one + new release:
 *   1. Run: echo -n "NEW-CODE-2026" | shasum -a 256
 *   2. Replace the old hash in HASH_TO_PROFILE with the new one
 *   3. Push → CI rebuilds → old code stops working
 *   4. Distribute new code to customers via your channel
 */

import type { ProfileId } from '@/src/constants/profiles';

/**
 * Pre-computed SHA-256 hashes of master codes → profile id.
 * To find which plaintext maps here: see UNLOCK_CODES.md (local, not in git).
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
};

/** Themed profiles that REQUIRE an unlock code. FREE is reachable without. */
export const THEMED_PROFILES_LOCKED: ProfileId[] = [
  'odv999',
  'chess', 'kids', 'vasilyeva', 'nzt48',
  'drivers', 'seniors', 'execs', 'students',
];

/**
 * SHA-256 implementation using Web Crypto API (works in browser, RN web,
 * Tauri WebView). Returns lowercase hex.
 */
async function sha256Hex(input: string): Promise<string> {
  const enc = new TextEncoder();
  const buf = await crypto.subtle.digest('SHA-256', enc.encode(input));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Try to unlock a profile with a code. Returns the profile id if the code
 * is valid, otherwise null.
 */
export async function tryUnlock(rawCode: string): Promise<ProfileId | null> {
  const normalized = rawCode.trim().toUpperCase();
  if (normalized.length < 4) return null;
  const hash = await sha256Hex(normalized);
  return HASH_TO_PROFILE[hash] ?? null;
}

/** Check if a profile id is in the themed (locked) set. */
export function requiresUnlock(profileId: ProfileId): boolean {
  return THEMED_PROFILES_LOCKED.includes(profileId);
}
