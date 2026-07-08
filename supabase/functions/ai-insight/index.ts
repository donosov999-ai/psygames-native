// ai-insight (v1) — единая Edge Function для трёх мест ИИ-анализа в PsyGames:
// assessment (раз в 3 мес, 12-доменный профиль), daily_verdict (карточка «Мозг
// сегодня» после зарядки), weekly_digest (недельный обзор на /statistics).
//
// Секрет ANTHROPIC_API_KEY задаётся ОТДЕЛЬНО (supabase secrets set) — Денис
// заводит ключ сам на console.anthropic.com, я его никогда не вижу и не храню.
// Без ключа функция отвечает 503 {error:'not_configured'} — клиент тихо
// показывает свой rule-based fallback (brainTodayVerdict/buildRecommendations),
// экран никогда не ломается из-за отсутствующего/невалидного ключа.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const ANTHROPIC_KEY = Deno.env.get("ANTHROPIC_API_KEY");
const MODEL = "claude-haiku-4-5-20251001";
const MAX_PAYLOAD_BYTES = 6000;   // анти-абьюз: не даём раздувать промпт/счёт

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...CORS } });
}

// Границы тона — ОДИНАКОВЫЕ для всех kind. Ребёнок/50+ получают свой регистр,
// но диагностический запрет и «сравнивай только с собой» действуют всегда.
function systemPrompt(lang: string, tone: string): string {
  const isRu = lang === "ru";
  const banned = isRu
    ? "СДВГ, деменция, диагноз, расстройство, патология, лечение, врач, болезнь, снижение когнитивных функций"
    : "ADHD, dementia, diagnosis, disorder, pathology, treatment, doctor, disease, cognitive decline";
  const toneLine = tone === "kid"
    ? "Audience: a CHILD. Simple words, short sentences, playful, emoji OK, only praise + one light challenge, zero worry or comparison to other kids."
    : tone === "senior"
      ? "Audience: an ADULT 50+. Respectful, matter-of-fact, no baby talk, no patronizing praise. Practical everyday relevance is welcome (remembering names, focus while driving)."
      : "Audience: a general adult user. Direct, data-first, no fluff, no motivational-poster language.";
  return [
    "You are a concise cognitive-training coach embedded in the PsyGames app.",
    toneLine,
    `Respond ONLY in language code "${lang}".`,
    "Use ONLY the numbers and facts given in the user message's data — never invent or estimate numbers not present there.",
    `NEVER use clinical/diagnostic vocabulary in any language, including: ${banned}. This app is not a medical tool.`,
    "Compare the player only to THEIR OWN history/baseline — never to \"average people\" or population norms.",
    "Give AT MOST one concrete suggestion, phrased as an invitation, not a command or a warning.",
    "Output plain text only: no markdown, no bullet lists, no headers, no quotes around the text.",
  ].join("\n");
}

function userPrompt(kind: string, payload: unknown): string {
  const data = JSON.stringify(payload);
  if (kind === "assessment") {
    return `Player just finished the quarterly 12-domain cognitive assessment. Data (domain z-scores, percentiles, trend vs previous assessment if any): ${data}\nWrite 4-6 sentences: how the domains relate to each other (e.g. a strong domain that might be masking a weaker one, or two domains that reinforce each other), then one concrete game suggestion by name.`;
  }
  if (kind === "daily_verdict") {
    return `Player just finished today's warm-up. Data (today's total score, personal median of last sessions, delta %, streak days, per-game breakdown for today): ${data}\nWrite 2-3 sentences: how today compares to their own baseline, referencing at least one specific game/number from the data.`;
  }
  return `Weekly summary of the player's own activity (games played, unique domains touched, streaks, any weekday pattern in their own data): ${data}\nWrite 3-5 sentences: what stood out this week compared to their own recent history, and one concrete suggestion for next week.`;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  if (!ANTHROPIC_KEY) return json({ error: "not_configured" }, 503);

  const raw = await req.text();
  if (raw.length > MAX_PAYLOAD_BYTES) return json({ error: "payload_too_large" }, 413);

  let body: any;
  try { body = JSON.parse(raw); } catch { return json({ error: "bad_json" }, 400); }
  const kind = String(body?.kind || "");
  if (!["assessment", "daily_verdict", "weekly_digest"].includes(kind)) return json({ error: "bad_kind" }, 400);
  const lang = /^[a-z]{2}$/.test(body?.lang) ? body.lang : "en";
  const tone = ["kid", "senior", "default"].includes(body?.tone) ? body.tone : "default";
  if (!body?.payload || typeof body.payload !== "object") return json({ error: "missing_payload" }, 400);

  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 20000);
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": ANTHROPIC_KEY, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 350,
        system: systemPrompt(lang, tone),
        messages: [{ role: "user", content: userPrompt(kind, body.payload) }],
      }),
      signal: ctrl.signal,
    });
    clearTimeout(timer);
    if (!r.ok) {
      const errText = await r.text().catch(() => "");
      return json({ error: "upstream_error", detail: errText.slice(0, 300) }, 502);
    }
    const data = await r.json();
    const message = data?.content?.[0]?.text;
    if (typeof message !== "string" || !message.trim()) return json({ error: "empty_response" }, 502);
    return json({ message: message.trim() });
  } catch (e) {
    return json({ error: "request_failed", detail: String((e as any)?.message || e).slice(0, 200) }, 502);
  }
});
