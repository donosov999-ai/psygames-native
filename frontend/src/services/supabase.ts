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
/**
 * Как выбран адрес — для КОНТЕКСТА РЕПОРТА, а не для логики.
 *
 * 🔴 ЗАЧЕМ. Тестировщица написала «работает только с впн» ТРИ РАЗА: 01.08 на
 * v1.165, 05.08 на v1.183 и 18.08 на v1.203. После первого раза сделан релей —
 * и он не помог, а понять почему было НЕЧЕМ: `currentSupabaseBase()` написан
 * «для отладки и отчётов» и не вызывался нигде. Три жалобы подряд, и ни одной
 * цифры с её телефона. Теперь каждый репорт несёт, каким адресом он доехал.
 */
let _how: 'direct' | 'relay-cached' | 'relay-probed' | 'direct-cached' | 'unknown' = 'unknown';

function make(base: string): SupabaseClient {
  return createClient(base, SUPABASE_PUBLISHABLE_KEY, {
    auth: { persistSession: false },  // not using auth — RLS handles per-row visibility
  });
}

function activate(base: string): void {
  _base = base;
  _client = make(base);
}

/**
 * Сохранённый relay — рабочий last-known-good, а не подсказка, которую можно
 * игнорировать. В заблокированной сети приложение должно использовать его
 * сразу и перепроверять прямой адрес уже фоном.
 */
export function preferredSupabaseBase(saved: string | null): string {
  return saved === SUPABASE_RELAY_URL ? SUPABASE_RELAY_URL : SUPABASE_URL;
}

export function getSupabase(): SupabaseClient {
  if (!_client) _client = make(_base);
  return _client;
}

/** Какой адрес используется сейчас — для отладки и отчётов. */
export function currentSupabaseBase(): string {
  return _base;
}

/**
 * КЛИЕНТ НА ВТОРОМ АДРЕСЕ — для повторной попытки, а не для смены выбора.
 *
 * 🔴 ЗАЧЕМ. 20.08.2026 отчёт тестировщицы приехал ЧЕРЕЗ РЕЛЕЙ, а заливка её
 * голосовой заметки (15 299 байт — живая речь, у немых поток 235 байт/с) упала
 * с `Failed to fetch`; скриншот — тем же. Строка в базу прошла, файлы нет.
 *
 * Проверено вручную: релей проносит заливку 15 КБ так же, как прямой адрес
 * (оба 200), предполётный запрос на обоих одинаков, ограничения тела на релее
 * нет. Значит дело не в адресе, а в том, что попытка была ОДНА: сеть моргнула —
 * запись потеряна навсегда, и человек при этом видит «спасибо».
 *
 * ⚠️ ВЫБОР АДРЕСА ЭТА ФУНКЦИЯ НЕ МЕНЯЕТ. Один неудачный файл — не основание
 * переучивать всё приложение: выбор делается пробой при запуске и переживает
 * перезапуск, а здесь нужна ровно вторая попытка другим маршрутом.
 */
export function altSupabase(): SupabaseClient {
  return make(_base === SUPABASE_RELAY_URL ? SUPABASE_URL : SUPABASE_RELAY_URL);
}

/** Куда пойдёт вторая попытка — для следа в репорте. */
export function altBaseName(): 'direct' | 'relay' {
  return _base === SUPABASE_RELAY_URL ? 'direct' : 'relay';
}

/** Сетевой след для контекста репорта: каким адресом и почему. */
export function supabaseNetInfo(): { base: 'direct' | 'relay'; how: string } {
  return { base: _base === SUPABASE_RELAY_URL ? 'relay' : 'direct', how: _how };
}

async function reachable(base: string): Promise<boolean> {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), PROBE_MS);
  try {
    // /auth/v1/health отвечает 200 — единственная точка, которая НЕ даёт 401.
    // Это важно не для логики (нам хватило бы любого ответа), а для консоли:
    // 401 браузер печатает как «Failed to load resource», и смоук-тест, который
    // валит сборку на любой ошибке в консоли, честно уронил релиз v1.170.
    // Проба обязана быть бесшумной.
    const r = await fetch(`${base}/auth/v1/health`, {
      headers: { apikey: SUPABASE_PUBLISHABLE_KEY },
      signal: ctl.signal,
    });
    return r.ok;
  } catch {
    return false;   // таймаут, обрыв, блокировка — всё сюда
  } finally {
    clearTimeout(t);
  }
}

/**
 * Выбрать рабочий адрес после первого рендера. Last-known relay активируется
 * сразу; без сохранённого выбора direct проверяется с ограниченным таймаутом.
 */
export async function pickSupabaseBase(): Promise<string> {
  let saved: string | null = null;
  try {
    saved = await AsyncStorage.getItem(PICKED_KEY);
  } catch {
    _how = 'unknown';
    activate(SUPABASE_URL);
    return _base;
  }

  if (preferredSupabaseBase(saved) === SUPABASE_RELAY_URL) {
    // Не заставляем пользователя из заблокированной сети ждать тот же таймаут
    // на каждом запуске. Relay активен сразу; возврат на direct — фоновый.
    _how = 'relay-cached';
    activate(SUPABASE_RELAY_URL);
    void reachable(SUPABASE_URL).then((directWorks) => {
      if (!directWorks) return;
      _how = 'direct';
      activate(SUPABASE_URL);
      AsyncStorage.setItem(PICKED_KEY, SUPABASE_URL).catch(() => {});
    });
    return _base;
  }

  const directOk = await reachable(SUPABASE_URL);
  _how = directOk ? 'direct' : 'relay-probed';
  activate(directOk ? SUPABASE_URL : SUPABASE_RELAY_URL);
  AsyncStorage.setItem(PICKED_KEY, _base).catch(() => {});
  return _base;
}

export const SUPABASE_TABLE = 'cognitive_sessions';
