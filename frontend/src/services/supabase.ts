/**
 * Supabase client for cognitive_sessions cloud sync (F2).
 *
 * Uses the publishable (anon) API key — safe to embed in public client code.
 * Security is enforced server-side via RLS policies on `cognitive_sessions`
 * (set up by colleague-Claude in the personal-nzt project).
 *
 * Project: personal-nzt (id: iuvvheeocobhiothfgei)
 * Owner:   Денис
 * Table:   public.cognitive_sessions
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://iuvvheeocobhiothfgei.supabase.co';
// Modern publishable key (sb_publishable_*) — recommended over legacy anon JWT.
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_A2vJ5DjemTZIKrKX6XGqvQ_WaiuAkk1';

let _client: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient {
  if (!_client) {
    _client = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
      auth: { persistSession: false },  // not using auth — RLS handles per-row visibility
    });
  }
  return _client;
}

export const SUPABASE_TABLE = 'cognitive_sessions';
