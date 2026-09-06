/* psygames-anagrams-mode-thumbs · VER 1 · 06.09.2026 */
/**
 * 🔴 КАРТИНКА РЕЖИМА — РАЗНАЯ ПОД ПРОФИЛЬ.
 *
 * 📍 Просьба Дениса 06.09.2026: «где есть картинки — делать их красивыми и
 * разными под разные профили». У анаграмм четыре режима, и на экране настройки
 * они были только словами в переключателе: человек выбирал «Квадрат слов», не
 * видя, что это рамка из букв, а «Кроссворд» — что это пересечение слов.
 *
 * ⚠️ ПОЧЕМУ ЗДЕСЬ, А НЕ В ОБЩЕМ РЕЕСТРЕ ПРЕВЬЮ. `constants/gameThumbs.ts` держит
 * ОДНУ картинку на игру каталога, и её показывает `GameCard` — общий компонент.
 * Режимов там нет вовсе: в каталоге анаграммы одна карточка. Плюс гейт
 * `game-thumbs` справедливо роняет прогон на файлах, лежащих в `gamethumbs/`
 * мимо реестра, — проверено, он покраснел на первой же попытке положить их туда.
 * Поэтому набор режимов живёт своей папкой `assets/images/anagram-modes/`.
 *
 * ⚠️ СТИЛЕЙ СЕМЬ, А ПРОФИЛЕЙ ТРИНАДЦАТЬ, И ЭТО НАМЕРЕННО. Рисовать по картинке
 * на профиль значило бы 4 × 13 = 52 файла ради различий, которых человек не
 * заметит: «Реакция ПРО» и «Скорочтение PRO» просят одного и того же — ощущения
 * скорости. Профили сведены в семь материальных решений; неизвестный профиль
 * получает светлое, а не пустоту.
 */
import type { ImageSourcePropType } from 'react-native';

/** Режимы анаграмм — те же ключи, что в переключателе на экране настройки. */
export type РежимАнаграмм = 'classic' | 'square' | 'all' | 'cross';

/** Материальные решения. Одно на несколько профилей — см. шапку. */
export type СтильПревью = 'kids' | 'neuro' | 'light' | 'execs' | 'chess' | 'speed' | 'seniors';

/**
 * Профиль → стиль. Ключи — `ProfileId` из `constants/profiles.ts`; тип оттуда
 * намеренно НЕ импортируется: это чужой файл общего слоя, и жёсткая связь
 * заставляла бы править картинки при каждом новом профиле. Неизвестный ключ
 * просто уходит в запасной стиль.
 */
const СТИЛЬ_ПРОФИЛЯ: Record<string, СтильПревью> = {
  kids: 'kids',              // Дети 7-12 — яркий пластик, высокий контраст
  chess: 'chess',            // Шахматист — орех и мрамор, музейный свет
  seniors: 'seniors',        // 50+ — крафт и терракота, крупные формы
  execs: 'execs',            // Предприниматели — графит и латунь
  drivers: 'speed',          // Реакция ПРО — бирюза, следы движения
  vasilyeva: 'speed',        // Скорочтение PRO — то же ощущение рывка
  students: 'speed',         // Студенты — темп
  nzt48: 'neuro',            // NZT-48 — неон
  odv999: 'neuro',           // ODV999 — неон
  polyglot: 'light',         // Полиглот — светлая бумага
  women: 'light',
  whatsnew: 'light',
  free: 'light',             // Стандарт — светлый минимализм
};

/** Запасной стиль: профиль неизвестен или ещё не выбран. */
export const СТИЛЬ_ПО_УМОЛЧАНИЮ: СтильПревью = 'light';

const КАРТИНКИ: Record<РежимАнаграмм, Record<СтильПревью, ImageSourcePropType>> = {
  classic: {
    kids: require('../../../../assets/images/anagram-modes/classic__kids.webp'),
    neuro: require('../../../../assets/images/anagram-modes/classic__neuro.webp'),
    light: require('../../../../assets/images/anagram-modes/classic__light.webp'),
    execs: require('../../../../assets/images/anagram-modes/classic__execs.webp'),
    chess: require('../../../../assets/images/anagram-modes/classic__chess.webp'),
    speed: require('../../../../assets/images/anagram-modes/classic__speed.webp'),
    seniors: require('../../../../assets/images/anagram-modes/classic__seniors.webp'),
  },
  square: {
    kids: require('../../../../assets/images/anagram-modes/square__kids.webp'),
    neuro: require('../../../../assets/images/anagram-modes/square__neuro.webp'),
    light: require('../../../../assets/images/anagram-modes/square__light.webp'),
    execs: require('../../../../assets/images/anagram-modes/square__execs.webp'),
    chess: require('../../../../assets/images/anagram-modes/square__chess.webp'),
    speed: require('../../../../assets/images/anagram-modes/square__speed.webp'),
    seniors: require('../../../../assets/images/anagram-modes/square__seniors.webp'),
  },
  all: {
    kids: require('../../../../assets/images/anagram-modes/all__kids.webp'),
    neuro: require('../../../../assets/images/anagram-modes/all__neuro.webp'),
    light: require('../../../../assets/images/anagram-modes/all__light.webp'),
    execs: require('../../../../assets/images/anagram-modes/all__execs.webp'),
    chess: require('../../../../assets/images/anagram-modes/all__chess.webp'),
    speed: require('../../../../assets/images/anagram-modes/all__speed.webp'),
    seniors: require('../../../../assets/images/anagram-modes/all__seniors.webp'),
  },
  cross: {
    kids: require('../../../../assets/images/anagram-modes/cross__kids.webp'),
    neuro: require('../../../../assets/images/anagram-modes/cross__neuro.webp'),
    light: require('../../../../assets/images/anagram-modes/cross__light.webp'),
    execs: require('../../../../assets/images/anagram-modes/cross__execs.webp'),
    chess: require('../../../../assets/images/anagram-modes/cross__chess.webp'),
    speed: require('../../../../assets/images/anagram-modes/cross__speed.webp'),
    seniors: require('../../../../assets/images/anagram-modes/cross__seniors.webp'),
  },
};

/** Стиль профиля; неизвестный профиль получает запасной, а не пустоту. */
export function стильПрофиля(profileId?: string): СтильПревью {
  return (profileId && СТИЛЬ_ПРОФИЛЯ[profileId]) || СТИЛЬ_ПО_УМОЛЧАНИЮ;
}

/** Картинка режима под профиль. Никогда не `undefined` — экран не должен пустовать. */
export function превьюРежима(режим: РежимАнаграмм, profileId?: string): ImageSourcePropType {
  return КАРТИНКИ[режим][стильПрофиля(profileId)];
}

/** Все режимы и все стили — для проб. */
export const ВСЕ_РЕЖИМЫ: РежимАнаграмм[] = ['classic', 'square', 'all', 'cross'];
export const ВСЕ_СТИЛИ: СтильПревью[] = ['kids', 'neuro', 'light', 'execs', 'chess', 'speed', 'seniors'];
export const ПРОФИЛИ_СО_СТИЛЕМ = СТИЛЬ_ПРОФИЛЯ;
