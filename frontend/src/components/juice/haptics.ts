import * as Haptics from 'expo-haptics';
import { Platform } from 'react-native';
import {
  sndTap as _sfxTap, sndCorrect as _sfxCorrect, sndWrong as _sfxError,
  vibrate, hapticEnabledNow,
} from '@/src/services/feedback';
import { emitGameEvent } from '@/src/services/gameEvents';

/**
 * Хаптик-обёртки: вибрация + звук одним вызовом.
 *
 * ЧТО БЫЛО СЛОМАНО (репорт Rulon голосом, v1.171: «вибрацию включил, но её не
 * было»). Здесь стоял гард `if (Platform.OS === 'web') return`, а Android-сборка
 * у нас — Tauri, то есть WebView, и для React Native это ровно `web`. Значит
 * вибрация была выключена именно на той платформе, где её ждут, и молча: тумблер
 * в настройках сохранялся как ни в чём не бывало. Вдобавок `expo-haptics`
 * вызывался вообще без оглядки на этот тумблер — на нативе «выкл» тоже не
 * выключал бы, просто это было не разглядеть за первым багом.
 *
 * КАК СЕЙЧАС. Веб (в т.ч. наш Android) — Vibration API; натив — expo-haptics.
 * Настройка проверяется на обоих путях. Длительности подобраны так, чтобы
 * различаться на ощупь: касание едва заметно, ошибка — заметно длиннее.
 */

/** Натив может бросить даже синхронно — отсюда двойная страховка. */
function native(fn: () => Promise<unknown>) {
  if (!hapticEnabledNow()) return;
  try { fn().catch(() => {}); } catch { /* no-op */ }
}

/** Лёгкое касание: нажатие кнопки, выбор карточки. */
export function hapticTap() {
  _sfxTap();
  if (Platform.OS === 'web') { vibrate(12); return; }
  native(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light));
}

/** Смена фазы, заметное событие без оценки «верно/неверно». */
export function hapticMedium() {
  if (Platform.OS === 'web') { vibrate(28); return; }
  native(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium));
}

/** Успех: два коротких — на ощупь отличается от ошибки. */
export function hapticSuccess() {
  _sfxCorrect();
  /**
   * 🔴 ОТСЮДА ОТВЕТ ИГРЫ ПРИХОДИТ В КАРКАС БЕСПЛАТНО.
   *
   * `hapticSuccess` уже стоит в 33 играх на верном ходу — значит серия в шапке
   * и реакция питомца достаются им без единой правки. `silent: true`, потому
   * что звук здесь уже сыгран строкой выше: без признака игрок услышал бы его
   * дважды (эту ошибку я и допустил, добавив `sndCorrect()` рядом с хаптиком
   * в четырёх играх семейства — исправлено там же).
   */
  emitGameEvent({ kind: 'good', silent: true });
  if (Platform.OS === 'web') { vibrate([14, 60, 14]); return; }
  native(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success));
}

/** Ошибка: одно длинное. */
export function hapticError() {
  _sfxError();
  emitGameEvent({ kind: 'bad', silent: true });
  if (Platform.OS === 'web') { vibrate(90); return; }
  native(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error));
}
