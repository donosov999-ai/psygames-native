/**
 * ИИ-разбор статистики (v1.115.0) — тонкий клиент к Edge Function `ai-insight`.
 *
 * Архитектура: клиент считает КОМПАКТНЫЙ агрегат (не сырой дамп сессий) → шлёт в
 * Edge Function → та вызывает Anthropic → текст кэшируется в AsyncStorage (ключ
 * зависит от kind — день/дата ассессмента/ISO-неделя) → при любой ошибке/таймауте/
 * отсутствии ключа на сервере — вызывающий экран ДОЛЖЕН показать свой rule-based
 * fallback (comboBonus/brainTodayVerdict/buildRecommendations уже существуют для
 * этого — этот сервис никогда не бросает, только возвращает null).
 *
 * Тон подбирается по профилю (kids/seniors получают отдельный регистр — см.
 * системный промпт в самой функции), чтобы не звучать клинически с ребёнком
 * или свысока со взрослым 50+.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from '@/src/services/supabase';

export type InsightKind = 'assessment' | 'daily_verdict' | 'weekly_digest';
export type ProfileTone = 'kid' | 'senior' | 'default';

const TIMEOUT_MS = 12000;

export function toneForProfile(profileId: string | undefined): ProfileTone {
  if (profileId === 'kids') return 'kid';
  if (profileId === 'seniors') return 'senior';
  return 'default';
}

function isoWeekKey(d: Date = new Date()): string {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((t.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${t.getUTCFullYear()}-W${week}`;
}
export function dayKey(d: Date = new Date()): string {
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

function cacheKey(kind: InsightKind, profileId: string, cacheSlot: string): string {
  return `psygames_ai_insight_${kind}_${profileId}_${cacheSlot}`;
}

/**
 * Получить ИИ-текст с кэшем. cacheSlot — «на что кэшировать»: dayKey() для
 * daily_verdict, assessment.date для assessment, isoWeekKey() для weekly_digest.
 * Возвращает null молча при любой проблеме (нет ключа на сервере, сеть, таймаут) —
 * вызывающий код показывает свой rule-based fallback, экран никогда не ломается.
 */
export async function getAiInsight(
  kind: InsightKind,
  profileId: string,
  cacheSlot: string,
  lang: string,
  tone: ProfileTone,
  payload: Record<string, any>,
): Promise<string | null> {
  const key = cacheKey(kind, profileId, cacheSlot);
  try {
    const cached = await AsyncStorage.getItem(key);
    if (cached) return cached;
  } catch {}

  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    const res = await fetch(`${SUPABASE_URL}/functions/v1/ai-insight`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: SUPABASE_PUBLISHABLE_KEY, Authorization: `Bearer ${SUPABASE_PUBLISHABLE_KEY}` },
      body: JSON.stringify({ kind, lang, tone, payload }),
      signal: ctrl.signal,
    });
    clearTimeout(timer);
    if (!res.ok) return null;   // включая 503 «ключ не настроен на сервере» — тихий fallback
    const data = await res.json().catch(() => null);
    const message = data?.message;
    if (typeof message !== 'string' || !message.trim()) return null;
    AsyncStorage.setItem(key, message).catch(() => {});
    return message;
  } catch {
    return null;   // сеть/таймаут — тихий fallback, экран не должен об этом знать
  }
}

export { isoWeekKey };
