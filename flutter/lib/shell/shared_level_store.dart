import 'dart:convert';

import 'level_ladder.dart';
import 'shared_state.dart';

/// Хранилище уровней ПОВЕРХ общей памяти — то самое место, где сходятся
/// перенесённая игра и игра, открытая в WebView.
///
/// 🔴 ИМЕНА КЛЮЧЕЙ БЕРУТСЯ У ВЕБ-СТОРОНЫ, А НЕ ПРИДУМЫВАЮТСЯ ЗАНОВО.
/// Лестница внутри себя зовёт ключи «игра.level» и «игра.best», а на диске они
/// обязаны лежать как `psygames_<игра>_level_<профиль>` — ровно так их пишет
/// frontend/src/hooks/usePersistentLevel.ts:64. Разойдутся имена — прогресс
/// разъедется молча: обе половины будут работать, показывая разные уровни.
///
/// `best` у веб-стороны нет вовсе (там достигнутое падало вместе с уровнем, и мы
/// это намеренно изменили). Он кладётся в то же пространство отдельным ключом:
/// веб его просто не читает, а перенос на Flutter его подхватит.
class SharedLevelStore implements LevelStore, StarsStore {
  SharedLevelStore(this.state, {String? profile})
      : _profile = profile;   // ignore: prefer_initializing_formals — поле приватное, параметр именованный

  final SharedState state;

  /// Задаётся только в пробах. В приложении профиль берётся из общей памяти
  /// КАЖДЫЙ раз, а не запоминается при создании: человек меняет профиль на ходу,
  /// и запомненное имя писало бы уровни в чужой ключ до перезапуска.
  final String? _profile;

  String get profile => _profile ?? state.activeProfile;

  /// «dots_connect.level» → psygames_dots_connect_level_nzt48
  String _map(String key) {
    final dot = key.lastIndexOf('.');
    if (dot < 0) return '${SharedState.prefix}${key}_$profile';
    final game = key.substring(0, dot);
    final what = key.substring(dot + 1);
    return '${SharedState.prefix}${game}_${what}_$profile';
  }

  @override
  Future<int?> readInt(String key) async {
    final raw = state.get(_map(key));
    if (raw == null) return null;
    return int.tryParse(raw);
  }

  @override
  Future<void> writeInt(String key, int value) async => state.set(_map(key), '$value');

  /// Звёзды — `psygames_<игра>_stars_<профиль>` JSON `{уровень: звёзды}`, как `levelStars.ts` веба.
  @override
  Future<Map<int, int>> readStars(String gameId) async => decodeLevelStars(state.get(_map('$gameId.stars')));

  @override
  Future<void> writeStars(String gameId, Map<int, int> stars) async =>
      state.set(_map('$gameId.stars'), encodeLevelStars(stars));
}

/// Запись звёзд веба (`levelStars.ts`): JSON `{"уровень": звёзды}`. Битая или пустая — без звёзд.
Map<int, int> decodeLevelStars(String? raw) {
  if (raw == null) return const {};
  try {
    final m = (jsonDecode(raw) as Map).cast<String, Object?>();
    return {
      for (final e in m.entries)
        if (int.tryParse(e.key) != null && e.value is num) int.parse(e.key): (e.value as num).toInt(),
    };
  } catch (_) {
    return const {};
  }
}

String encodeLevelStars(Map<int, int> stars) => jsonEncode({for (final e in stars.entries) '${e.key}': e.value});
