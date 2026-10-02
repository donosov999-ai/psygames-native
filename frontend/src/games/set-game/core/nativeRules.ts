/* psygames-set-game-native-rules · VER 1 · 02.10.2026 */
/**
 * ПРАВИЛА УРОВНЕЙ SET, КОТОРЫХ НЕТ В ВЕБЕ, — лимит ниже восьми секунд с 17-го (задача 7f81fbc6).
 *
 * Лестница росла до 16-го: раскладов 15 к 10-му, лимит на SET 26 → 8 с к 16-му. Восемь секунд
 * были пределом оси, а не игры (правило Дениса 06.09.2026 «потолков нет»): с 17-го лимит
 * сжимается на 5 % за уровень, без нижнего предела.
 *
 * Механика живёт в нативном экране (`flutter/lib/games/set_game/model.dart`, `levelParams`);
 * веб её не повторяет — в приложении игра открывается нативно. Правила веба (`SG_RULES` в
 * `app/games/set-game.tsx`) идут первыми, эти — следом: на 17-м и дальше действует последнее
 * подошедшее. Тексты — `lr_set_game_faster_title|rule|example`.
 */
import type { LevelRule } from '@/src/components/LevelRules';

/** Первый уровень без пола в 8 секунд — на единицу больше `setTimeFloorUntil` в Dart. */
export const SG_FASTER_FROM = 17;

export const SG_NATIVE_RULES: LevelRule[] = [
  { key: 'faster', fromLevel: SG_FASTER_FROM },
];
