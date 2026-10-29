/* psygames-feedback-dialog · VER 1 · 28.08.2026 */
/**
 * ДИАЛОГ С РАЗРАБОТЧИКОМ — лента «мои сообщения ⇄ наши ответы», как в мессенджере.
 *
 * ЗАЧЕМ. Репорт NZT-48 26.08: «а где окно диалогов? я не вижу?» — расшифровка
 * Дениса 28.08: человек ждал ЧАТ с разработчиком, где видны его отзывы и наши
 * ответы. Блок «Починили по твоим отзывам» показывал только починенное и только
 * разово; вопрос без починки уходил в пустоту.
 *
 * УСТРОЙСТВО. Одна таблица app_feedback уже несёт обе стороны разговора:
 *   · моё сообщение — message (или транскрипт голосового);
 *   · ответ разработчика — dev_reply/dev_replied_at (ответ без починки)
 *     и fix_note/fixed_in_version/fixed_at (ответ-починка).
 * RPC psygames_my_dialog отдаёт ленту по device_id (та же модель приватности,
 * что у psygames_my_fixed_feedback: устройство видит только своё).
 */
import { getSupabase } from '@/src/services/supabase';
import { getDeviceId } from '@/src/services/appFeedback';

export interface DialogRow {
  id: string;
  created_at: string;
  message: string;
  transcript: string | null;
  game_id: string | null;
  has_audio: boolean;
  status: string;
  fixed_in_version: string | null;
  fix_note: string | null;
  fixed_at: string | null;
  dev_reply: string | null;
  dev_replied_at: string | null;
}

export interface DialogBubble {
  key: string;
  who: 'me' | 'dev';
  text: string;
  at: string;
  /** Версия починки — бейдж на ответе-починке; null у простого ответа. */
  fixedIn: string | null;
  gameId: string | null;
  /** Статус моего сообщения (app_feedback.status); у ответов — null. */
  status: string | null;
}

/**
 * ДОШЛО ЛИ И ЧТО С НИМ — подпись под моим сообщением (задача 3a7f4077, отзыв NZT-48 11.10:
 * «мои последние отчёты дошли или нет — я не вижу»). Статусы таблицы на 29.10: new — получено
 * (у всех уже заведена задача), in_progress — в работе, fixed/done — исправлено, wontfix —
 * рассмотрено (объяснение — в ответе разработчика). Неизвестный статус — без подписи.
 */
export function dialogStatusLabel(t: (key: string) => string, status: string | null): string | null {
  switch (status) {
    case 'new': return `✓ ${t('feedbackStatusReceived')}`;
    case 'in_progress': return `🔧 ${t('feedbackStatusInWork')}`;
    case 'fixed': case 'done': return `✅ ${t('feedbackStatusFixed')}`;
    case 'wontfix': return t('feedbackStatusReviewed');
    default: return null;
  }
}

/** Текст моего сообщения: голос без текста показываем честной заглушкой. */
function myText(r: DialogRow): string {
  const t = (r.message || '').trim();
  if (t && t !== '[голосом, без текста]') return t;
  const tr = (r.transcript || '').trim();
  if (tr && !tr.startsWith('[')) return tr;
  return '';   // подпись «голосовое» добавит экран по has_audio
}

/** Развернуть строки таблицы в хронологическую ленту пузырей. */
export function toBubbles(rows: DialogRow[]): DialogBubble[] {
  const out: DialogBubble[] = [];
  for (const r of rows) {
    out.push({ key: `${r.id}-me`, who: 'me', text: myText(r), at: r.created_at, fixedIn: null, gameId: r.game_id, status: r.status ?? null });
    if (r.dev_reply) {
      out.push({ key: `${r.id}-reply`, who: 'dev', text: r.dev_reply, at: r.dev_replied_at || r.created_at, fixedIn: null, gameId: r.game_id, status: null });
    }
    if (r.fixed_in_version && r.fix_note) {
      out.push({ key: `${r.id}-fix`, who: 'dev', text: r.fix_note, at: r.fixed_at || r.created_at, fixedIn: r.fixed_in_version, gameId: r.game_id, status: null });
    }
  }
  // Лента по времени СОБЫТИЙ: ответ-починка встаёт туда, когда случился, а не под репортом.
  return out.sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0));
}

/** Лента диалога этого устройства. Пустой массив — нормальный результат. */
export async function getMyDialog(): Promise<DialogBubble[]> {
  try {
    const supabase = getSupabase();
    if (!supabase) return [];
    const deviceId = await getDeviceId();
    if (!deviceId) return [];
    const { data, error } = await supabase.rpc('psygames_my_dialog', {
      p_device_id: deviceId,
      p_limit: 60,
    });
    if (error || !Array.isArray(data)) return [];
    return toBubbles(data as DialogRow[]);
  } catch {
    return [];
  }
}
