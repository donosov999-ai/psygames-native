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

import { soundOn } from '@/src/services/feedback';

import { voiceUrl } from '@/src/services/voiceSamples';

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
/**
 * ПОЧЕМУ РЕЧЬ СЕЙЧАС НЕВОЗМОЖНА — ОДИН ОТВЕТ НА ВСЕ УПРАЖНЕНИЯ.
 *
 * 🔴 ЧТО НАШЛОСЬ 22.08.2026. Речь не спрашивала про общий тумблер звука вовсе:
 * человек выключал звук — а упражнение продолжало говорить. Тихий вечерний шаг
 * (`calmHush`) её тоже не глушил.
 *
 * ⚠️ И ПОЧЕМУ ПРОСТО ЗАГЛУШИТЬ БЫЛО БЫ ХУЖЕ. Во всех четырёх местах речь — это
 * СТИМУЛ, а не украшение: повтори услышанное, вспомни слова, сравни звуки,
 * буква во втором потоке n-back. Молча замолчать значит отдать человеку
 * неиграбельное упражнение без единого слова о причине. Поэтому здесь не
 * «говорить или нет», а ПРИЧИНА, по которой нельзя, — экран покажет её и не
 * даст начать.
 *
 * Причины две, и лечатся они по-разному: голоса нет в системе (ставить голос)
 * против звук выключен самим человеком (включить тумблер). Одно сообщение на
 * оба случая отправило бы половину людей чинить не то.
 */
export type TtsBlock = 'sound-off' | 'no-voice' | null;

export function ttsBlockedReason(lang: string): TtsBlock {
  if (!soundOn()) return 'sound-off';
  if (!ttsAvailable(lang)) return 'no-voice';
  return null;
}

/**
 * 🔴 СНАЧАЛА ЗАПИСЬ, ПОТОМ СИНТЕЗ. Если для стимула есть готовый файл (см.
 * `voiceSamples`), играем его: звук одинаков на всех устройствах и не зависит от
 * того, какие голоса поставил производитель телефона. Файла нет — работаем как
 * раньше, системным голосом.
 *
 * ⚠️ Проигрывание файла живёт ТОЛЬКО в вебе и вебвью (а приложение и есть вебвью
 * на всех платформах). На чистом React Native `Audio` нет — там сразу синтез.
 */
function сыграть(url: string, rate: number): Promise<boolean> {
  return new Promise((resolve) => {
    if (typeof window === 'undefined' || typeof (window as any).Audio !== 'function') { resolve(false); return; }
    try {
      const a = new (window as any).Audio(url);
      a.playbackRate = rate < 0.6 ? 0.6 : rate > 1.6 ? 1.6 : rate;
      let готово = false;
      const конец = (ок: boolean) => { if (!готово) { готово = true; resolve(ок); } };
      a.onended = () => конец(true);
      a.onerror = () => конец(false);
      // Страховка: событие «кончилось» не приходит, если файл не начался играть.
      setTimeout(() => конец(готово), 6000);
      const p = a.play();
      if (p && typeof p.catch === 'function') p.catch(() => конец(false));
    } catch { resolve(false); }
  });
}

export async function speak(text: string, lang: string, rate = 0.9): Promise<void> {
  const url = voiceUrl(text, lang);
  if (url && await сыграть(url, rate)) return;
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
