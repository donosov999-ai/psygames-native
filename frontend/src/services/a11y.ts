/**
 * a11y — доступность для скринридеров (VoiceOver / TalkBack), v1.161.0.
 *
 * ЗАЧЕМ. У 62 игр интерфейс собран из голых View/TouchableOpacity. Незрячий
 * человек водит пальцем по экрану, скринридер вслух читает НЕ картинку, а
 * атрибуты accessibility* из кода. Без них он говорит «кнопка» или молчит —
 * играть невозможно. Apple гоняет приложение с включённым VoiceOver на ревью;
 * «непригодно для пользователей с нарушением зрения» — реальная причина отказа.
 *
 * ПОЧЕМУ ХЕЛПЕРЫ, А НЕ АТРИБУТЫ РУКАМИ. Три причины:
 *  1. Единый набор пропов — не забудешь role там, где поставил label.
 *  2. accessibilityState на разных платформах капризен (web понимает не всё) —
 *     нормализация в одном месте.
 *  3. CI-гейт (_local/a11y_audit.py) считает «немые» тачи; хелпер даёт им
 *     распознаваемую форму, поэтому регресс ловится до релиза, а не в ревью.
 *
 * ВАЖНО ПРО ТЕКСТ. TouchableOpacity с дочерним <Text> RN озвучивает сам —
 * такие места мы не трогаем. Хелперы нужны там, где внутри иконка, картинка,
 * фигура или цветной блок: скринридеру взять текст неоткуда.
 */
import { AccessibilityInfo, Platform } from 'react-native';

type Role = 'button' | 'image' | 'header' | 'text' | 'checkbox' | 'radio' | 'adjustable' | 'imagebutton' | 'link' | 'summary' | 'switch';

export interface A11yStateOpts {
  /** Элемент выбран сейчас (карточка, ячейка, режим). */
  selected?: boolean;
  /** Нажатие временно запрещено (пауза, показ ответа). */
  disabled?: boolean;
  /** Для тумблеров и чекбоксов. */
  checked?: boolean;
  /** Дополнение к названию: «строка 3, колонка 4», «занято», «найдено». */
  value?: string;
  /** Что произойдёт по нажатию, если из названия не очевидно. */
  hint?: string;
}

/**
 * Кнопка с иконкой вместо текста. `label` — уже переведённая строка.
 *
 *   <TouchableOpacity {...a11yBtn(t('a11yBack'))}>
 *     <Ionicons name="arrow-back" />
 */
export function a11yBtn(label: string, opts: A11yStateOpts = {}) {
  return build('button', label, opts);
}

/** Ячейка/карточка игрового поля: клетка судоку, карта SET, товар на полке. */
export function a11yCell(label: string, opts: A11yStateOpts = {}) {
  return build('button', label, opts);
}

/** Смысловая картинка (фото глаз в RMET, спрайт питомца). */
export function a11yImage(label: string) {
  return { accessible: true, accessibilityRole: 'image' as Role, accessibilityLabel: label };
}

/** Заголовок экрана — по нему скринридер прыгает ротором. */
export function a11yHeader(label?: string) {
  return { accessibilityRole: 'header' as Role, ...(label ? { accessibilityLabel: label } : null) };
}

/**
 * Декорация: фон, свечение, частицы, дубль иконки рядом с подписью.
 * Убирает элемент из обхода — иначе палец спотыкается о десятки пустых точек.
 */
export const a11yDecor = {
  accessible: false,
  accessibilityElementsHidden: true,
  importantForAccessibility: 'no-hide-descendants' as const,
};

/**
 * Пропы модального окна: скринридер не должен уходить на экран под ним.
 * `accessibilityViewIsModal` — iOS, `importantForAccessibility` — Android.
 */
export const a11yModal = {
  accessibilityViewIsModal: true,
  importantForAccessibility: 'yes' as const,
};

/**
 * Сказать вслух то, что произошло без нажатия: «Верно», «Уровень 4»,
 * «Осталось 3 отличия». Скринридер сам об этом не догадается — изменение
 * цвета или счётчика он не видит.
 *
 * Тихо ничего не делает, если скринридер выключен или мы в вебе.
 */
export function announce(message: string) {
  if (!message) return;
  if (Platform.OS === 'web') return;
  try {
    AccessibilityInfo.announceForAccessibility(message);
  } catch {
    /* на некоторых прошивках метод отсутствует — молча пропускаем */
  }
}

/** Включён ли скринридер прямо сейчас (чтобы не жечь батарею анимациями). */
export async function isScreenReaderOn(): Promise<boolean> {
  if (Platform.OS === 'web') return false;
  try { return await AccessibilityInfo.isScreenReaderEnabled(); } catch { return false; }
}

function build(role: Role, label: string, o: A11yStateOpts) {
  return {
    accessible: true,
    accessibilityRole: role,
    accessibilityLabel: label,
    ...(o.value ? { accessibilityValue: { text: o.value } } : null),
    ...(o.hint ? { accessibilityHint: o.hint } : null),
    ...(o.selected !== undefined || o.disabled !== undefined || o.checked !== undefined
      ? {
          accessibilityState: {
            ...(o.selected !== undefined ? { selected: o.selected } : null),
            ...(o.disabled !== undefined ? { disabled: o.disabled } : null),
            ...(o.checked !== undefined ? { checked: o.checked } : null),
          },
        }
      : null),
  };
}
