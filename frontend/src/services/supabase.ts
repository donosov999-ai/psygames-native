/**
 * Supabase client for cognitive_sessions cloud sync (F2).
 *
 * Uses the publishable (anon) API key — safe to embed in public client code.
 * Security is enforced server-side via RLS policies on `cognitive_sessions`.
 *
 * Project: personal-nzt (id: iuvvheeocobhiothfgei)
 * Table:   public.cognitive_sessions
 *
 * ═══ v1.170: ЗАПАСНОЙ АДРЕС ДЛЯ РОССИИ ═══
 * Репорт тестировщицы 01.08: «а теперь не отправляется обратная связь без
 * включенного vpn». Домен supabase.co в РФ режется. Последствие тяжелее, чем
 * кажется: отзывы и сессии доезжали ТОЛЬКО с включённым VPN, а канал отзывов —
 * единственный, по которому мы вообще узнаём о проблемах. Сколько сообщений
 * ушло в никуда — посчитать нельзя, их просто нет в базе.
 *
 * Решение: релей sb.asibots.pro на 37.60.245.18 (Caddy). Хост выбран не наугад —
 * он уже держит llm.asibots.pro, поставленный ровно ради обхода той же
 * блокировки, то есть маршрут проверен в бою. Релей проксирует запрос как есть;
 * ключ у клиента публикуемый, права решает RLS — обходного пути к данным он не
 * открывает.
 *
 * Выбор адреса делается ОДИН раз за запуск коротким пробным запросом и
 * запоминается. Прямой адрес остаётся первым: он быстрее и не зависит от
 * нашего сервера. Релей включается, только когда прямой не отвечает.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

export const SUPABASE_URL = 'https://iuvvheeocobhiothfgei.supabase.co';
/** Запасной адрес на случай блокировки прямого (см. шапку). */
export const SUPABASE_RELAY_URL = 'https://sb.asibots.pro';
// Modern publishable key (sb_publishable_*) — recommended over legacy anon JWT.
export const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_A2vJ5DjemTZIKrKX6XGqvQ_WaiuAkk1';

/** Запомненный между запусками выбор — чтобы не пробовать заблокированный адрес каждый раз. */
const PICKED_KEY = 'psygames_supabase_base';
/** Сколько ждём прямой адрес, прежде чем считать его недоступным. */
const PROBE_MS = 4000;

let _client: SupabaseClient | null = null;
let _base = SUPABASE_URL;

function make(base: string): SupabaseClient {
  return createClient(base, SUPABASE_PUBLISHABLE_KEY, {
    auth: { persistSession: false },  // not using auth — RLS handles per-row visibility
  });
}

export function getSupabase(): SupabaseClient {
  if (!_client) _client = make(_base);
  return _client;
}

/** Какой адрес используется сейчас — для отладки и отчётов. */
export function currentSupabaseBase(): string {
  return _base;
}

async function reachable(base: string): Promise<boolean> {
  try {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), PROBE_MS);
    // Любой ответ сервера годится: 401 от /rest/v1/ без токена — это «жив».
    const r = await fetch(`${base}/rest/v1/`, {
      method: 'HEAD',
      headers: { apikey: SUPABASE_PUBLISHABLE_KEY },
      signal: ctl.signal,
    });
    clearTimeout(t);
    return r.status > 0;
  } catch {
    return false;   // таймаут, обрыв, блокировка — всё сюда
  }
}

/**
 * Выбрать рабочий адрес. Вызывается один раз при старте приложения; до её
 * завершения клиент работает на прямом адресе, поэтому ничего не блокируется.
 */
export async function pickSupabaseBase(): Promise<string> {
  try {
    const saved = await AsyncStorage.getItem(PICKED_KEY);
    if (saved === SUPABASE_RELAY_URL) {
      // В прошлый раз прямой был недоступен. Всё равно перепроверяем его:
      // блокировки снимают, и возвращаться на прямой лучше сразу.
      _base = (await reachable(SUPABASE_URL)) ? SUPABASE_URL : SUPABASE_RELAY_URL;
    } else {
      _base = (await reachable(SUPABASE_URL)) ? SUPABASE_URL : SUPABASE_RELAY_URL;
    }
  } catch {
    _base = SUPABASE_URL;
  }
  AsyncStorage.setItem(PICKED_KEY, _base).catch(() => {});
  _client = make(_base);   // пересоздаём клиента под выбранный адрес
  return _base;
}

export const SUPABASE_TABLE = 'cognitive_sessions';
