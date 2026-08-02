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

/** v1.160 (репорт Вали «писала отзыв — пауза не наступила, и теперь я не понимаю,
 *  что за игра»): пока открыто окно отзыва, игра встаёт на паузу — GameShell
 *  показывает оверлей и перехватывает тапы, чтобы не проиграть вслепую. */
export const GAME_PAUSE_EVENT = 'psygames-game-pause';

/**
 * Открыть окно отзыва снаружи виджета.
 *
 * Нужно потому, что плавающая кнопка репорта — обычный слой, а окно правил это
 * Modal: пока правила открыты, кнопка накрыта и до неё не дотянуться (репорт
 * Rulon голосом, v1.171). Возиться с z-порядком двух модалок дороже и хрупче,
 * чем дать правилам собственную точку входа: событие, на которое виджет
 * открывается сам.
 */
export const FEEDBACK_OPEN_EVENT = 'psygames-feedback-open';

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
// v1.166: голосовая заметка рядом с текстом — см. src/services/voiceNote.ts.
const AUDIO_BUCKET = 'feedback-audio';

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
  /** Голосовая заметка: оригинал речи, а не то, что расслышал телефон. */
  audio?: { blob: Blob; seconds: number; mime: string } | null;
  context?: Record<string, unknown>;
}

/**
 * Исход отправки. Раньше возвращался просто boolean, и три разных исхода
 * схлопывались в два: «репорт ушёл, но запись не загрузилась» выглядело ровно
 * как полный успех. Человек видел «спасибо», был уверен, что рассказал голосом,
 * и повторял попытку вслепую (репорт Rulon: «непонятно, ушло или нет»).
 */
export interface SendResult {
  /** Строка в БД создана — репорт у нас. */
  ok: boolean;
  /** Не ушло сейчас, но сохранено и уйдёт при связи. Написанное не пропало. */
  queued: boolean;
  /** Запись была и долетела до хранилища. */
  audioSent: boolean;
  /** Запись была, но НЕ долетела — сказать об этом прямо. */
  audioLost: boolean;
}

/**
 * Ограничить ожидание. Ни у одной загрузки тайм-аута не было, а вложения весят
 * мегабайты: на слабой связи спиннер «Отправка…» висел бесконечно и человек не
 * знал, что делать («подвисает на стадии отправки» — репорт тестировщика,
 * v1.170). Лучше отдать репорт без вложения и честно сказать об этом, чем
 * держать человека у неподвижного экрана.
 */
function withTimeout<T>(p: PromiseLike<T>, ms: number, onTimeout: T): Promise<T> {
  return new Promise<T>((resolve) => {
    let done = false;
    const settle = (v: T) => { if (!done) { done = true; clearTimeout(t); resolve(v); } };
    const t = setTimeout(() => settle(onTimeout), ms);
    // PromiseLike, а не Promise: билдер запроса Supabase — thenable без .catch,
    // поэтому обработчик отказа передаём вторым аргументом then.
    p.then((v) => settle(v), () => settle(onTimeout));
  });
}

const SHOT_UPLOAD_MS = 12000;
const AUDIO_UPLOAD_MS = 25000;   // запись до 3 минут — ей нужно больше
const INSERT_MS = 12000;

export async function sendFeedback(args: SendArgs): Promise<SendResult> {
  const hadAudio = !!args.audio?.blob;
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
        const ok = await withTimeout(
          supabase.storage.from(SHOT_BUCKET)
            .upload(name, args.shot, { contentType: 'image/jpeg', upsert: false })
            .then(({ error }: any) => !error),
          SHOT_UPLOAD_MS, false,
        );
        if (ok) shot_path = name;
      } catch {}
    }

    // 1b) Голосовая заметка — тем же правилом: не загрузилась, репорт всё равно
    // уходит. Но исход ОБЯЗАН вернуться наверх: если запись не долетела, а мы
    // показали «спасибо», человек уверен, что рассказал о проблеме голосом, —
    // и никто никогда не узнает, что до нас доехал только текст.
    let audio_path: string | null = null;
    if (args.audio?.blob) {
      try {
        const { extFor } = await import('@/src/services/voiceNote');
        const name = `${new Date().toISOString().slice(0, 10)}/${Math.random().toString(36).slice(2)}.${extFor(args.audio.mime)}`;
        const ok = await withTimeout(
          supabase.storage.from(AUDIO_BUCKET)
            .upload(name, args.audio.blob, { contentType: args.audio.mime, upsert: false })
            .then(({ error }: any) => !error),
          AUDIO_UPLOAD_MS, false,
        );
        if (ok) audio_path = name;
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
      audio_path,
      context: {
        ...(args.context ?? {}),
        viewport: detectViewport(),
        ...(args.audio ? { audio_seconds: args.audio.seconds } : null),
      },
    };
    const insertFailed = await withTimeout(
      supabase.from('app_feedback').insert(row).then(({ error }: any) => !!error),
      INSERT_MS, true,   // не ответили вовремя — считаем недоставленным и кладём в очередь
    );
    if (insertFailed) {
      await queueFeedback(row);
      // Запись уже в хранилище и путь уехал в очередь вместе со строкой —
      // с точки зрения человека голос не потерян, просто ждёт связи.
      return { ok: false, queued: true, audioSent: !!audio_path, audioLost: hadAudio && !audio_path };
    }
    flushFeedbackQueue();   // связь есть — дошлём то, что копилось
    return { ok: true, queued: false, audioSent: !!audio_path, audioLost: hadAudio && !audio_path };
  } catch {
    return { ok: false, queued: false, audioSent: false, audioLost: hadAudio };
  }
}

/**
 * v1.170: очередь недоставленных отзывов.
 *
 * ЗАЧЕМ. Репорт тестировщицы: «не отправляется обратная связь без включенного
 * vpn». Раньше неудачная отправка означала, что написанное ПРОПАЛО — человек
 * набрал текст, нажал отправить, получил отказ и потерял сообщение. Для канала,
 * по которому мы единственным способом узнаём о проблемах, это недопустимо.
 * Запасной адрес (см. supabase.ts) закрывает блокировку, очередь закрывает
 * всё остальное: нет сети в метро, самолётный режим, упал сервер.
 *
 * В очередь кладём строку целиком, ВМЕСТЕ с shot_path/audio_path. В v1.170 эти
 * два поля здесь отбрасывались «чтобы не хранить вложения» — ошибка: сами файлы
 * в эту структуру никогда не попадали, тут лежат только пути, а файлы к этому
 * моменту УЖЕ загружены в хранилище. Отбрасывая путь, мы выкидывали
 * единственную ссылку на существующую запись: голос оставался в бакете
 * сиротой, а до нас доезжал текст без него.
 */
const FEEDBACK_QUEUE_KEY = 'psygames_feedback_queue';
const QUEUE_MAX = 20;

async function queueFeedback(row: Record<string, unknown>): Promise<void> {
  try {
    const AsyncStorage = (await import('@react-native-async-storage/async-storage')).default;
    const raw = await AsyncStorage.getItem(FEEDBACK_QUEUE_KEY);
    const list: Record<string, unknown>[] = raw ? JSON.parse(raw) : [];
    list.push(row);
    await AsyncStorage.setItem(FEEDBACK_QUEUE_KEY, JSON.stringify(list.slice(-QUEUE_MAX)));
  } catch { /* не смогли сохранить — хуже уже не сделаем */ }
}

/** Дослать накопившееся. Тихо: человек про очередь ничего не знает. */
export async function flushFeedbackQueue(): Promise<number> {
  try {
    const AsyncStorage = (await import('@react-native-async-storage/async-storage')).default;
    const raw = await AsyncStorage.getItem(FEEDBACK_QUEUE_KEY);
    const list: Record<string, unknown>[] = raw ? JSON.parse(raw) : [];
    if (!list.length) return 0;
    const supabase = getSupabase();
    const left: Record<string, unknown>[] = [];
    let sent = 0;
    for (const row of list) {
      const { error } = await supabase.from('app_feedback').insert(row);
      if (error) { left.push(row); } else { sent++; }
    }
    await AsyncStorage.setItem(FEEDBACK_QUEUE_KEY, JSON.stringify(left));
    return sent;
  } catch {
    return 0;
  }
}
