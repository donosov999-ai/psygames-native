/* psygames-fillwords-mode-thumbs · VER 1 · 06.09.2026 */
/**
 * 🔴 КАРТИНКА РЕЖИМА КОРРЕКТУРЫ И ФИЛВОРДОВ — РАЗНАЯ ПОД ПРОФИЛЬ.
 *
 * Та же задача, что у анаграмм: режимы на экране были только словами, и человек
 * не видел, чем «Филворды» отличаются от «Корректурной пробы» — а отличаются они
 * всем: там змейка по полю букв, тут поиск значка в плотном наборе.
 *
 * ⚠️ КАРТА ПРОФИЛЬ → СТИЛЬ БЕРЁТСЯ У АНАГРАММ, А НЕ ПИШЕТСЯ ЗАНОВО. Обе игры мои
 * и обе про слова; две копии карты разошлись бы на первом же новом профиле, и
 * один и тот же человек видел бы в соседних играх разный материал. Копия здесь
 * была бы не независимостью, а будущим расхождением.
 */
import type { ImageSourcePropType } from 'react-native';
import { стильПрофиля, ВСЕ_СТИЛИ, type СтильПревью } from '@/src/games/anagrams/core/modeThumbs';

/** Режимы экрана корректуры — те же ключи, что в `TaskMode`. */
export type РежимКорректуры = 'fillwords' | 'letters';

const КАРТИНКИ: Record<РежимКорректуры, Record<СтильПревью, ImageSourcePropType>> = {
  fillwords: {
    kids: require('../../../../assets/images/fillwords-modes/fillwords__kids.webp'),
    neuro: require('../../../../assets/images/fillwords-modes/fillwords__neuro.webp'),
    light: require('../../../../assets/images/fillwords-modes/fillwords__light.webp'),
    execs: require('../../../../assets/images/fillwords-modes/fillwords__execs.webp'),
    chess: require('../../../../assets/images/fillwords-modes/fillwords__chess.webp'),
    speed: require('../../../../assets/images/fillwords-modes/fillwords__speed.webp'),
    seniors: require('../../../../assets/images/fillwords-modes/fillwords__seniors.webp'),
  },
  letters: {
    kids: require('../../../../assets/images/fillwords-modes/letters__kids.webp'),
    neuro: require('../../../../assets/images/fillwords-modes/letters__neuro.webp'),
    light: require('../../../../assets/images/fillwords-modes/letters__light.webp'),
    execs: require('../../../../assets/images/fillwords-modes/letters__execs.webp'),
    chess: require('../../../../assets/images/fillwords-modes/letters__chess.webp'),
    speed: require('../../../../assets/images/fillwords-modes/letters__speed.webp'),
    seniors: require('../../../../assets/images/fillwords-modes/letters__seniors.webp'),
  },
};

/** Картинка режима под профиль. Никогда не `undefined` — экран не должен пустовать. */
export function превьюРежимаКорректуры(режим: РежимКорректуры, profileId?: string): ImageSourcePropType {
  return КАРТИНКИ[режим][стильПрофиля(profileId)];
}

export const ВСЕ_РЕЖИМЫ_КОРРЕКТУРЫ: РежимКорректуры[] = ['fillwords', 'letters'];
export { ВСЕ_СТИЛИ };
