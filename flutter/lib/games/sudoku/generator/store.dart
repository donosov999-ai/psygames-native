/// ХРАНЕНИЕ ПУТИ ГЕНЕРАТОРА — СВОИ КЛЮЧИ, ЧУЖИХ НЕ КАСАЕМСЯ.
///
/// 🔴 ВАРИАНТ В, РЕШЕНИЕ ДЕНИСА 18.09.2026. Прописанные 92 ступени, три дороги и весь
/// прогресс людей на них остаются как есть. Генератор идёт РЯДОМ: свой счётчик, свой
/// рейтинг, свой флаг. Выключили флаг — всё как было, до последнего байта старых ключей.
///
/// Ключи (профиль подставляется как у веб-стороны):
///   · `psygames_sudoku_adaptive_<профиль>`      — состояние игрока (§8.8);
///   · `psygames_sudoku_adaptive_on_<профиль>`   — флаг пути: '1' включено;
///   · `psygames_sudoku_adaptive_shadow_<профиль>` — журнал ТЕНЕВОГО выбора (§10 шаг 2):
///     что генератор выбрал бы, пока игроку выдаётся прежняя задача.
///
/// ⚠️ ЧЕГО ЗДЕСЬ НЕТ НАМЕРЕННО: ни одного обращения к `psygames_sudoku_level_*`. Это не
/// стиль, а требование §9.1 — после сотни адаптивных партий старые ключи обязаны
/// остаться байт в байт прежними, и проба `generator_isolation_test.dart` это меряет.
library;

import 'dart:convert';

import '../../../shell/shared_state.dart';
import 'contract.dart';

class GeneratorStore {
  GeneratorStore(this.state, {String? profile})
      : _profile = profile;   // ignore: prefer_initializing_formals — поле приватное, параметр именованный

  final SharedState state;
  final String? _profile;

  /// Профиль берётся КАЖДЫЙ раз, а не запоминается: человек меняет его на ходу, и
  /// запомненное имя писало бы чужой прогресс до перезапуска.
  String get profile => _profile ?? state.activeProfile;

  String get stateKey => '${SharedState.prefix}sudoku_adaptive_$profile';
  String get flagKey => '${SharedState.prefix}sudoku_adaptive_on_$profile';
  String get shadowKey => '${SharedState.prefix}sudoku_adaptive_shadow_$profile';

  /// Включён ли путь генератора. По умолчанию — НЕТ: пилот за флагом (§10 шаг 3).
  bool get enabled => state.get(flagKey) == '1';

  void setEnabled(bool on) => state.set(flagKey, on ? '1' : '0');

  AdaptiveState load() => AdaptiveState.decode(state.get(stateKey));

  void save(AdaptiveState s) => state.set(stateKey, s.encode());

  /// Журнал теневого выбора: строки «что выбрал бы генератор» рядом с тем, что реально
  /// выдала прописанная лестница. Это и есть замер §10 шага 2 — сравнение заявленной и
  /// фактической трудности, снятое на живых партиях, а не в лаборатории.
  List<Map<String, Object?>> shadowLog() {
    final raw = state.get(shadowKey);
    if (raw == null || raw.isEmpty) return [];
    try {
      return (jsonDecode(raw) as List).cast<Map<String, Object?>>();
    } catch (_) {
      return [];
    }
  }

  /// Дописать запись. Журнал ограничен: партия «Судоку» идёт годами, и неограниченный
  /// список однажды упёрся бы в размер хранилища у живого человека.
  void appendShadow(Map<String, Object?> row, {int limit = 200}) {
    final rows = shadowLog()..add(row);
    if (rows.length > limit) rows.removeRange(0, rows.length - limit);
    state.set(shadowKey, jsonEncode(rows));
  }

  /// Стереть путь генератора целиком — откат пилота без следов.
  /// Прописанные уровни не трогаются: их ключей здесь нет.
  void reset() {
    state.set(stateKey, '');
    state.set(shadowKey, '');
    state.set(flagKey, '0');
  }
}
