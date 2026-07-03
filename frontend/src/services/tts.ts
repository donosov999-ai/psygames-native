/**
 * tts — озвучка слов через Web Speech API (speechSynthesis). Без аудиофайлов:
 * системные голоса ОС (web/WKWebView-Tauri/Android WebView). Паттерн проверен
 * в проде dual n-back (speakLetter). Полиглот TIER 2: фонемы / псевдослова /
 * listening span.
 *
 * ⚠️ Наличие голоса конкретного языка зависит от ОС юзера — перед стартом
 * упражнения проверять ttsAvailable(lang) и честно показывать заглушку, если
 * голоса нет (НЕ молчать беззвучно).
 */

// Коды языков приложения (LanguageContext) → BCP-47 для голосов ОС.
const BCP47: Record<string, string> = {
  en: 'en-US', ru: 'ru-RU', es: 'es-ES', pt: 'pt-BR',
  de: 'de-DE', zh: 'zh-CN', hi: 'hi-IN',
};

function synth(): SpeechSynthesis | null {
  if (typeof window === 'undefined') return null;
  return (window as any).speechSynthesis || null;
}

/** Есть ли синтез вообще + голос под язык (или хотя бы generic). */
export function ttsAvailable(lang: string): boolean {
  const s = synth();
  if (!s) return false;
  const target = (BCP47[lang] || lang).slice(0, 2).toLowerCase();
  const voices = s.getVoices();
  // На части платформ getVoices() пуст до первого speak — считаем «есть синтез = попробуем».
  if (!voices.length) return true;
  return voices.some((v) => v.lang.toLowerCase().startsWith(target));
}

function pickVoice(lang: string): SpeechSynthesisVoice | null {
  const s = synth();
  if (!s) return null;
  const full = (BCP47[lang] || lang).toLowerCase();
  const short = full.slice(0, 2);
  const voices = s.getVoices();
  return voices.find((v) => v.lang.toLowerCase() === full)
    || voices.find((v) => v.lang.toLowerCase().startsWith(short))
    || null;
}

/** Прервать текущую озвучку (переход между раундами/уход с экрана). */
export function ttsCancel(): void {
  try { synth()?.cancel(); } catch {}
}

/**
 * Произнести текст; резолвится по окончании (для последовательностей в listening span).
 * rate: 0.8 помедленнее для учащихся, 1 норма.
 */
export function speak(text: string, lang: string, rate = 0.9): Promise<void> {
  return new Promise((resolve) => {
    const s = synth();
    if (!s) { resolve(); return; }
    try {
      s.cancel();
      const utt = new (window as any).SpeechSynthesisUtterance(text);
      utt.lang = BCP47[lang] || lang;
      const v = pickVoice(lang);
      if (v) utt.voice = v;
      utt.rate = rate;
      utt.volume = 1;
      let done = false;
      const finish = () => { if (!done) { done = true; resolve(); } };
      utt.onend = finish;
      utt.onerror = finish;
      // страховка: onend не всегда стреляет на WKWebView — таймаут по длине текста
      setTimeout(finish, 1500 + text.length * 120);
      s.speak(utt);
    } catch { resolve(); }
  });
}

/** Произнести список слов по очереди с паузой между ними. */
export async function speakSequence(words: string[], lang: string, gapMs = 600, rate = 0.9): Promise<void> {
  for (const w of words) {
    await speak(w, lang, rate);
    await new Promise((r) => setTimeout(r, gapMs));
  }
}
