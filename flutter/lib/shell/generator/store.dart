/// ХРАНЕНИЕ ПУТИ ГЕНЕРАТОРА — СВОИ КЛЮЧИ, ЧУЖИХ НЕ КАСАЕМСЯ.
///
/// 🔴 ОБЩИЙ МОДУЛЬ С 30.09.2026 (звено 2 цепочки генератора, задача 543d853c). Эталон
/// собрал раздел «Судоку» в `games/sudoku/generator/`; ключи там были зашиты под судоку.
/// Теперь имя игры — параметр [GeneratorStore.gameId], а ключи строятся по ТОМУ ЖЕ
/// образцу: у «Судоку» они остались байт в байт прежними (`psygames_sudoku_adaptive_*`),
/// у головоломок встают рядом с их уровнем (`psygames_puzzles_<движок>_adaptive_*`).
///
/// 🔴 ВАРИАНТ В, РЕШЕНИЕ ДЕНИСА 18.09.2026. Прописанные 92 ступени, три дороги и весь
/// прогресс людей на них остаются как есть. Генератор идёт РЯДОМ: свой счётчик, свой
/// рейтинг, свой флаг. Выключили флаг — всё как было, до последнего байта старых ключей.
///
/// Ключи (игра и профиль подставляются как у веб-стороны):
///   · `psygames_<игра>_adaptive_<профиль>`        — состояние игрока (§8.8);
///   · `psygames_<игра>_adaptive_on_<профиль>`     — флаг пути: '1' включено;
///   · `psygames_<игра>_adaptive_shadow_<профиль>` — журнал ТЕНЕВОГО выбора (§10 шаг 2):
///     что генератор выбрал бы, пока игроку выдаётся прежняя задача.
///
/// ⚠️ ЧЕГО ЗДЕСЬ НЕТ НАМЕРЕННО: ни одного обращения к `psygames_<игра>_level_*`. Это не
/// стиль, а требование §9.1 — после сотни адаптивных партий старые ключи обязаны
/// остаться байт в байт прежними; пробы `generator_isolation_test.dart` («Судоку») и
/// `puzzles_generator_test.dart` (головоломки) меряют это.
library;

import 'dart:convert';

import '../shared_state.dart';
import 'contract.dart';

class GeneratorStore {
  GeneratorStore(this.state, {required this.gameId, String? profile})
      : _profile = profile;   // ignore: prefer_initializing_formals — поле приватное, параметр именованный

  final SharedState state;

  /// Имя игры в ключах — то же, что у её уровня (`sudoku`, `puzzles_mines`).
  final String gameId;
  final String? _profile;

  /// Профиль берётся КАЖДЫЙ раз, а не запоминается: человек меняет его на ходу, и
  /// запомненное имя писало бы чужой прогресс до перезапуска.
  String get profile => _profile ?? state.activeProfile;

  String get stateKey => '${SharedState.prefix}${gameId}_adaptive_$profile';
  String get flagKey => '${SharedState.prefix}${gameId}_adaptive_on_$profile';
  String get shadowKey => '${SharedState.prefix}${gameId}_adaptive_shadow_$profile';

  /// Отметка «пилот уже начинался» — чтобы выключить и снова включить путь без потери
  /// счёта побед. Первое включение обнуляет номер (победы лестницы — не победы пилота),
  /// последующие — нет. У «Судоку» ключ прежний: `psygames_sudoku_adaptive_pilot_<профиль>`.
  String get pilotKey => '${SharedState.prefix}${gameId}_adaptive_pilot_$profile';
  bool get pilotStarted => state.get(pilotKey) == '1';
  void markPilotStarted() => state.set(pilotKey, '1');

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

  /// Дописать запись. Журнал ограничен: игра идёт годами, и неограниченный
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
    state.set(pilotKey, '');
  }
}
