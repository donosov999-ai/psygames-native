// MVP-шаринг результата (v1.116.0) — без сервера и картинки, готовый текст в системный
// Share Sheet. RN Share — уже часть 'react-native', новая зависимость не нужна.
// Web/Tauri: RN Share не гарантированно работает в вебвью → приоритет navigator.share,
// фоллбек — копия текста в буфер (Clipboard API есть в любом современном вебвью).
import { Share, Platform } from 'react-native';

export type ShareOutcome = 'shared' | 'copied' | 'failed';

export async function shareResult(message: string, title?: string): Promise<ShareOutcome> {
  try {
    if (Platform.OS === 'web') {
      const nav: any = typeof navigator !== 'undefined' ? navigator : null;
      if (nav?.share) {
        await nav.share({ text: message, title });
        return 'shared';
      }
      if (nav?.clipboard?.writeText) {
        await nav.clipboard.writeText(message);
        return 'copied';
      }
      return 'failed';
    }
    const result = await Share.share({ message, title });
    return result.action === Share.dismissedAction ? 'failed' : 'shared';
  } catch {
    return 'failed';
  }
}
