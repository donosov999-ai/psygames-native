/* psygames-alert · VER 1 · 21.08.2026 */
/**
 * СООБЩЕНИЯ, КОТОРЫЕ ЧЕЛОВЕК И ПРАВДА УВИДИТ.
 *
 * 🔴 ЧТО БЫЛО СЛОМАНО. `Alert` из react-native-web — БУКВАЛЬНО пустой метод:
 *
 *     class Alert { static alert() {} }
 *
 * Android у нас — это WebView с той же веб-сборкой, значит все 22 вызова
 * `Alert.alert` в приложении не показывали НИЧЕГО ни на телефоне, ни в вебе, ни
 * на десктопе. Молча: ни ошибки, ни следа.
 *
 * Проверено исполнением 21.08.2026: нажатие «Проверить обновления» в настройках
 * не давало ни окна, ни текста, ни перехваченного `window.alert` — человек
 * тыкал кнопку и не узнавал ничего. Туда же ушли подтверждение копирования кода
 * прогресса, исход импорта и просьба разрешить уведомления.
 *
 * ⚠️ ПОЧЕМУ ПОДМЕНА, А НЕ ПРАВКА 22 МЕСТ. Вызовы написаны верно — сломан
 * получатель. Достаточно поменять, ОТКУДА берётся `Alert`, и все места
 * оживают разом; заодно нельзя случайно починить одно и забыть остальные.
 *
 * ⚠️ ПОЧЕМУ НЕ СВОЙ КРАСИВЫЙ ДИАЛОГ. Он потребовал бы состояния на каждом
 * экране и очереди сообщений. Родное окно браузера некрасиво, но видно — а
 * сейчас выбор стоит между «некрасиво» и «невидимо».
 */
import { Alert as NativeAlert, Platform } from 'react-native';

export interface AlertButton {
  text?: string;
  onPress?: () => void;
  style?: 'default' | 'cancel' | 'destructive';
}

/** Что показать человеку: заголовок и текст под ним. */
export function alertText(title: string, message?: string): string {
  return [title, message].filter((x) => !!x && String(x).trim()).join('\n\n');
}

/**
 * Кнопка действия среди переданных. `cancel` — отказ, действие ищем среди
 * остальных: именно его выполнит «ОК» в окне браузера.
 */
export function actionButton(buttons?: AlertButton[]): AlertButton | null {
  if (!buttons || !buttons.length) return null;
  return buttons.find((b) => b.style !== 'cancel') ?? null;
}

export function cancelButton(buttons?: AlertButton[]): AlertButton | null {
  if (!buttons || !buttons.length) return null;
  return buttons.find((b) => b.style === 'cancel') ?? null;
}

/**
 * Окно браузера показывает только «ОК» и «Отмена», а подписи у кнопок свои.
 * Дописываем строку с расшифровкой — иначе человек жмёт «ОК», не зная, что
 * именно случится.
 */
export function confirmText(title: string, message: string | undefined, buttons: AlertButton[]): string {
  const act = actionButton(buttons);
  const base = alertText(title, message);
  return act?.text ? `${base}\n\n«OK» — ${act.text}` : base;
}

export const Alert = {
  alert(title: string, message?: string, buttons?: AlertButton[]): void {
    // Настоящий нативный слой (если приложение когда-нибудь пойдёт не вебом).
    if (Platform.OS !== 'web') {
      NativeAlert.alert(title, message, buttons as any);
      return;
    }
    const w: any = typeof window !== 'undefined' ? window : null;
    const act = actionButton(buttons);
    const cancel = cancelButton(buttons);

    // Две кнопки и больше — это вопрос, а не сообщение.
    if (act && cancel && typeof w?.confirm === 'function') {
      if (w.confirm(confirmText(title, message, buttons!))) act.onPress?.();
      else cancel.onPress?.();
      return;
    }
    w?.alert?.(alertText(title, message));
    // Одна кнопка — её действие всё равно должно случиться: человек «ОК» нажал.
    act?.onPress?.();
  },
};
