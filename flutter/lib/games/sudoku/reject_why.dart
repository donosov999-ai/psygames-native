/// ПОЧЕМУ ЦИФРА НЕ ПОДОШЛА — перенос `rejectionReason` (`frontend/src/services/sudoku-core.ts`).
///
/// 🔴 ПОВОД — три ночных отчёта Вали 22.08 («удаляю программу»): неверная цифра оставалась в
/// клетке без объяснения, рос только счётчик (сверка «веб против натива» 138f7818, строка 122).
///
/// Три честных ответа, как у веба (сверка бит в бит — эталон `sudoku-rules-reference.json`, поле
/// `why` у неверных ходов, выгрузка живого `rejectionReason`):
///   1. нарушено БАЗОВОЕ правило (строка, столбец, квадрат; у «кривых блоков» — их ОБЛАСТЬ, не
///      квадрат 3×3, которого на доске нет) — молчим: конфликт человек видит сам;
///   2. ДОКАЗУЕМО нарушено правило варианта (включая показанные подсказки — метки чётности,
///      точки, суммы сэндвича, линии: натив держит их в той же `isValid`) — называем именно его;
///      у режима «Киллер» — правило киллера;
///   3. доказать вину нечем — так и говорим: конфликт не местный, смотри строку, столбец и
///      квадрат целиком. ⚠️ Первая редакция веба тут винила вариант — замер 22.08: ложных
///      обвинений в сэндвиче 100 %, кропки 95,7 %, термометре 95,2 %. Уверенно неправильное
///      объяснение хуже молчания.
library;

import 'rules.dart';

/// Полные правила вариантов — ключи веб-словаря (`sudokuRule` + суффикс варианта,
/// `VARIANT_KEY_SUFFIX` в sudoku-core.ts). Списком — чтобы `tools/embed-l10n.mjs` их собрал.
const sudokuRuleKeys = <String>[
  'sudokuRuleDiagonal', 'sudokuRuleAntiknight', 'sudokuRuleHyper', 'sudokuRuleNonconsec',
  'sudokuRuleJigsaw', 'sudokuRuleAntiking', 'sudokuRuleEvenodd', 'sudokuRuleKropki',
  'sudokuRuleSandwich', 'sudokuRuleThermo', 'sudokuRuleArrow', 'sudokuRuleThermocage',
  'sudokuRuleUnequal', 'sudokuRuleTowers', 'sudokuRuleSandparity', 'sudokuRuleThermoknight',
  'sudokuRuleKillerdiag', 'sudokuRuleWhisper', 'sudokuRuleRenban', 'sudokuRuleRegionsum',
  'sudokuRulePalindrome', 'sudokuRuleBetween', 'sudokuRuleLockout', 'sudokuRuleXv', 'sudokuRuleArgyle', 'sudokuRuleLittlekiller', 'sudokuRuleXsums',
  'sdkRule_friends', 'sudokuKillerRule', 'sudokuWhyNotLocal',
];

/// Ключ полного правила варианта; null — у варианта правила в словаре нет.
String? variantRuleKey(String variant) {
  if (variant == 'none') return null;
  if (variant == 'friends') return 'sdkRule_friends';   // как у веба: одна строка «🐱 рядом с 🐭»
  if (variant == 'killer') return 'sudokuKillerRule';   // режим «Киллер»: у веба вариант 'none' + группы
  final key = 'sudokuRule${variant[0].toUpperCase()}${variant.substring(1)}';
  return sudokuRuleKeys.contains(key) ? key : null;
}

/// Ключ словаря с причиной отказа цифры `v` в клетке (`r`, `c`) или null — молчим
/// (нарушено базовое правило: конфликт виден на доске). Звать для цифры НЕ по решению.
String? rejectionKey(
  List<List<int>> grid,
  int r,
  int c,
  int v, {
  required int n,
  required int br,
  required int bc,
  required String variant,
  BoardGeometry? geometry,
}) {
  final test = [for (final row in grid) [...row]];
  test[r][c] = 0;
  // 1. Базовое правило. У «кривых блоков» база — строка, столбец и ОБЛАСТЬ (07.10: веб сверял
  //    стандартный квадрат 3×3 и молчал на конфликте в квадрате, которого на доске нет).
  final base = variant == 'jigsaw'
      ? isValid(test, r, c, v, n, br, bc, variant: 'jigsaw', geometry: BoardGeometry(regions: geometry?.regions))
      : isValid(test, r, c, v, n, br, bc);
  if (!base) return null;
  // 2. Правило варианта нарушено доказуемо — называем его; `isValid` с геометрией держит и
  //    показанные подсказки (`overlayOk`). Киллер у натива — вариант 'killer' (у веба — 'none' с
  //    группами; ответ один и тот же — `sudokuKillerRule`, сверено эталоном).
  if (variant != 'none' && !isValid(test, r, c, v, n, br, bc, variant: variant, geometry: geometry)) {
    return variantRuleKey(variant) ?? 'sudokuWhyNotLocal';
  }
  // 3. Вину доказать нечем — честно.
  return 'sudokuWhyNotLocal';
}
