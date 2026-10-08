/* psygames-schulte-level-rules · VER 1 · 02.10.2026 */
/**
 * ПРАВИЛА УРОВНЕЙ ШУЛЬТЕ ДЛЯ НАТИВНОЙ ПОЛОВИНЫ — ось «скорость» с 19-го уровня (задача 7f81fbc6).
 *
 * К 18-му уровню у таблицы заняты все оси, что растут сеткой и правилом: размер, обратный ход,
 * буквы и смесь, цвет Горбова, позднее правило и убегающие клетки. С 19-го на таблицу даётся
 * время, с каждым уровнем на 4 % меньше, без нижнего предела — правило Дениса 06.09.2026
 * «потолков нет».
 *
 * Механика живёт в нативном экране (`flutter/lib/games/schulte/model.dart`,
 * `schulteTimeLimitSec`). Веб-экран Шульте её не повторяет: в приложении Шульте открывается
 * нативно. Здесь — только таблица «с какого уровня какое правило объявлять», из которой
 * собирается `flutter/assets/level_rules.json`. Тексты — ключи словаря
 * `lr_schulte_table_timelimit_title|rule|example`.
 */
import type { LevelRule } from '@/src/components/LevelRules';

/** Первый уровень с временем на таблицу — то же число, что `schulteTimeLimitFrom` в Dart. */
export const SCHULTE_TIME_LIMIT_FROM = 19;

export const SCHULTE_RULES: LevelRule[] = [
  { key: 'timelimit', fromLevel: SCHULTE_TIME_LIMIT_FROM },
];
