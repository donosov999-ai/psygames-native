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
import { getSupabase } from '@/src/services/supabase';

export type FeedbackKind = 'bug' | 'idea' | 'confusion' | 'other';

/** Показывать плавающую кнопку фидбека.
 *  true — на период закрытого теста Google Play (12 тестировщиков).
 *  ⚠️ ПЕРЕД ПУБЛИЧНЫМ РЕЛИЗОМ поставить false (или гейтить тест-каналом),
 *  иначе кнопка будет висеть у всех и польётся мусор. */
export const FEEDBACK_ENABLED = true;

const SHOT_BUCKET = 'feedback-shots';

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
      platform: Platform.OS,
      shot_path,
      context: args.context ?? null,
    };
    const { error } = await supabase.from('app_feedback').insert(row);
    return !error;
  } catch {
    return false;
  }
}
