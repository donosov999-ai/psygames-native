/* psygames-mahjong-native-rules · VER 1 · 02.10.2026 */
/**
 * ПРАВИЛА УРОВНЕЙ МАДЖОНГА, КОТОРЫХ НЕТ В ВЕБЕ, — время на доску с 29-го уровня (задача 7f81fbc6).
 *
 * К 28-му у доски на верху всё, что растёт раскладкой: пять слоёв, полный набор 72 пары,
 * 12 колонок, одна перетасовка. Свободна ось «скорость»: с 29-го на доску даётся время, с
 * каждым уровнем на 4 % меньше, без нижнего предела (правило Дениса 06.09.2026 «потолков нет»).
 *
 * Механика живёт в нативном экране (`flutter/lib/games/mahjong/model.dart`,
 * `mahjongTimeLimitSec`); веб её не повторяет — в приложении маджонг открывается нативно.
 * Правила веба (`MAHJONG_RULES` в `app/games/mahjong.tsx`) идут первыми, эти — следом: на 29-м
 * и дальше действует последнее подошедшее. Тексты — `lr_mahjong_timelimit_title|rule|example`.
 */
import type { LevelRule } from '@/src/components/LevelRules';

/** Первый уровень со временем на доску — то же число, что `mahjongTimeLimitFrom` в Dart. */
export const MJ_TIME_LIMIT_FROM = 29;

export const MJ_NATIVE_RULES: LevelRule[] = [
  { key: 'timelimit', fromLevel: MJ_TIME_LIMIT_FROM },
];
