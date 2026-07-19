/**
 * appFeedback — внутриигровой фидбек тестировщиков (кнопка в приложении).
 * Паттерн повторяет crashReport: пишем в Supabase, fire-and-forget, сбой
 * отправки не должен ломать игру.
 *
 * MVP (закрытый тест Google Play, 12 тестировщиков): текст + скриншот.
 * Аудио НЕ включаем осознанно — оно требует permission на микрофон в
 * манифесте и вопросов Google про приватность. Следующим шагом: аудио →
 * whisper (brainkit 37.60) → авто-расшифровка.
 *
 * Скриншот: html2canvas по DOM. Работает во ВСЕХ наших сборках, потому что
 * все они webview (Tauri desktop, Tauri Android, web). На чистом React Native
 * (если появится) — просто отвалится в null, фидбек уйдёт без скрина.
 *
 * Приватность: пишем только профиль-метку («Гость»/«NZT-48»), версию,
 * платформу и экран. Ни имени, ни почты, ни личных данных.
 */
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getSupabase } from '@/src/services/supabase';

export type FeedbackKind = 'bug' | 'idea' | 'confusion' | 'other';

/** Показывать плавающую кнопку фидбека.
 *  true — на период закрытого теста Google Play (12 тестировщиков).
 *  ⚠️ ПЕРЕД ПУБЛИЧНЫМ РЕЛИЗОМ поставить false (или гейтить тест-каналом),
 *  иначе кнопка будет висеть у всех и польётся мусор. */
export const FEEDBACK_ENABLED = true;

/** v1.125.0: пользовательская галочка «Чат с разработчиками» в настройках.
 *  Тестировщик может СКРЫТЬ плавающую кнопку, если она мешает (репорт
 *  «кнопка мешается в игре»). По умолчанию видна. Ключ '0' = скрыта. */
const DEVCHAT_KEY = 'psygames_devchat_on';
export async function getDevChatVisible(): Promise<boolean> {
  try { return (await AsyncStorage.getItem(DEVCHAT_KEY)) !== '0'; } catch { return true; }
}
export async function setDevChatVisible(on: boolean): Promise<void> {
  try { await AsyncStorage.setItem(DEVCHAT_KEY, on ? '1' : '0'); } catch {}
}

/** v1.126.0: анонимный ID установки. `person` = метка профиля (все «Гость»
 *  сливаются), поэтому по нему нельзя отличить, СКОЛЬКО разных людей прислали
 *  репорты и не дубль ли это. device_id даёт «сколько установок споткнулось об
 *  одно место» → приоритезация. UUID генерится раз при первом обращении. */
const DEVICE_KEY = 'psygames_device_id';
export async function getDeviceId(): Promise<string> {
  try {
    const existing = await AsyncStorage.getItem(DEVICE_KEY);
    if (existing) return existing;
    const rnd = (globalThis as any).crypto?.randomUUID?.() as string | undefined;
    const id: string = rnd || `d-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
    await AsyncStorage.setItem(DEVICE_KEY, id);
    return id;
  } catch {
    return 'unknown';
  }
}

const SHOT_BUCKET = 'feedback-shots';

/**
 * Реальная площадка, а не Platform.OS. Все наши сборки — webview, поэтому
 * Platform.OS для Tauri-APK из Google Play возвращает 'web' ровно так же, как
 * для вкладки Chrome на десктопе. Из-за этого репорт «лого поверх системных
 * иконок» (чисто телефонный баг) пришёл с меткой platform=web и потребовал
 * отдельного расследования. Различаем по Tauri-шеллу и user-agent.
 */
function detectPlatform(): string {
  if (Platform.OS !== 'web') return Platform.OS; // нативная сборка, если появится
  if (typeof window === 'undefined') return 'web';
  const w = window as any;
  const tauri = !!(w.__TAURI__ || w.__TAURI_INTERNALS__);
  const ua = typeof navigator !== 'undefined' ? navigator.userAgent : '';
  const mobile = /Android/i.test(ua) ? 'android' : /iPhone|iPad|iPod/i.test(ua) ? 'ios' : null;
  if (tauri) return mobile ? `tauri-${mobile}` : 'tauri-desktop';
  return mobile ? `web-${mobile}` : 'web';
}

/**
 * Условия отображения: ширина экрана и масштаб текста. Три бага вёрстки
 * («текст в столбик», «кнопка в 3 строки», «прокрутка на пол-экрана») оказались
 * одним дефектом, видимым только на узком экране с крупным системным шрифтом —
 * тестировщику пришлось это объяснять словами. Теперь приезжает само.
 */
function detectViewport(): Record<string, unknown> | null {
  try {
    if (typeof window === 'undefined') return null;
    const probe = document.createElement('div');
    probe.style.cssText = 'position:absolute;visibility:hidden;font-size:16px;';
    probe.textContent = 'M';
    document.body.appendChild(probe);
    const px = parseFloat(getComputedStyle(probe).fontSize) || 16;
    probe.remove();
    return {
      w: window.innerWidth,
      h: window.innerHeight,
      dpr: window.devicePixelRatio,
      // >1 — система/браузер увеличивает текст (Android «Размер шрифта», zoom, min font size)
      fontScale: Math.round((px / 16) * 100) / 100,
      ua: (typeof navigator !== 'undefined' ? navigator.userAgent : '').slice(0, 300),
    };
  } catch {
    return null;
  }
}

/** Снять скриншот текущего экрана. null — если не webview или что-то пошло не так. */
export async function captureScreenshot(): Promise<Blob | null> {
  try {
    if (typeof document === 'undefined' || !document.body) return null;
    const html2canvas = (await import('html2canvas')).default;
    const canvas = await html2canvas(document.body, {
      logging: false,
      useCORS: true,
      // scale 1 — скрин лёгкий (не ретина): для «где непонятно» хватает,
      // а 12 тестировщиков не зальют лишние мегабайты.
      scale: 1,
      backgroundColor: null,
    });
    return await new Promise<Blob | null>((resolve) =>
      canvas.toBlob((b) => resolve(b), 'image/jpeg', 0.75)
    );
  } catch {
    return null;   // скрин — бонус, не блокер отправки
  }
}

interface SendArgs {
  kind: FeedbackKind;
  message: string;
  screen?: string;
  gameId?: string;
  shot?: Blob | null;
  context?: Record<string, unknown>;
}

/** Отправить фидбек. true = долетело (строка в БД создана). */
export async function sendFeedback(args: SendArgs): Promise<boolean> {
  try {
    const supabase = getSupabase();
    const person = (globalThis as any).__psygames_active_person as string | undefined;

    let app_version: string | null = null;
    try {
      const Constants = (await import('expo-constants')).default;
      app_version = (Constants.expoConfig?.version || '').slice(0, 32) || null;
    } catch {}

    // 1) Скриншот в приватный бакет (если снялся). Ошибка загрузки не отменяет фидбек.
    let shot_path: string | null = null;
    if (args.shot) {
      try {
        const name = `${new Date().toISOString().slice(0, 10)}/${Math.random().toString(36).slice(2)}.jpg`;
        const { error } = await supabase.storage
          .from(SHOT_BUCKET)
          .upload(name, args.shot, { contentType: 'image/jpeg', upsert: false });
        if (!error) shot_path = name;
      } catch {}
    }

    // 2) Сам фидбек
    const row = {
      person: person || null,
      kind: args.kind,
      message: args.message.slice(0, 4000),
      screen: (args.screen || '').slice(0, 200) || null,
      game_id: (args.gameId || '').slice(0, 64) || null,
      app_version,
      platform: detectPlatform(),
      device_id: await getDeviceId(),
      shot_path,
      context: { ...(args.context ?? {}), viewport: detectViewport() },
    };
    const { error } = await supabase.from('app_feedback').insert(row);
    return !error;
  } catch {
    return false;
  }
}
