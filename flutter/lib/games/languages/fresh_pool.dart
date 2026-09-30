/// ЗАПАС НЕВИДАННОГО — перенос `frontend/src/services/freshPool.ts` ДО ЗНАКА.
///
/// 🔴 ПОЧЕМУ НЕ ВЗЯТ ГОТОВЫЙ ИЗ «ПАР СЛОВ». В `lib/games/word_pairs/model.dart`
/// уже есть `pickFreshFrom`, но он тасует `List.shuffle(Random)` — а веб тасует
/// своим Фишером–Йетсом с `Math.floor(rng() * (i + 1))`. На одной и той же очереди
/// случайных чисел они дают РАЗНЫЙ порядок, и сверить перенос с эталоном живого TS
/// тем тасованием нельзя: проба «совпало» была бы невозможна, «не совпало» —
/// неизбежна. Здесь порядок обращений к случайности тот же, что в вебе, поэтому
/// эталон `semantic-sort-reference.json` сверяется до слова.
///
/// ⚠️ ХРАНЯТСЯ КЛЮЧИ, А НЕ НОМЕРА: номер переезжает при любой правке материала.
/// Ключ хранилища совпадает с вебом (`psygames_fresh_<pool>_<профиль>`) — запас
/// один на обе половины гибрида, и слово, виденное в веб-партии, не вернётся в
/// нативной.
library;

import 'dart:convert';

import '../../shell/shared_state.dart';

String freshPoolKey(String pool, String? profileId) => 'psygames_fresh_${pool}_${profileId ?? 'guest'}';

List<T> _shuffled<T>(List<T> items, double Function() rng) {
  final a = [...items];
  for (var i = a.length - 1; i > 0; i -= 1) {
    final j = (rng() * (i + 1)).floor();
    final t = a[i];
    a[i] = a[j];
    a[j] = t;
  }
  return a;
}

/// Чистый отбор: сначала невиданное; не хватило — круг сброшен, добираем из
/// остального, но НИКОГДА не берём одно и то же дважды в одной раздаче.
({List<T> picked, List<String> seen, bool wrapped}) pickFreshWeb<T>(
  List<T> items,
  int count,
  List<String> seen,
  String Function(T) keyOf,
  double Function() rng,
) {
  final n = count < 0 ? 0 : (count > items.length ? items.length : count);
  if (n == 0) return (picked: <T>[], seen: [...seen], wrapped: false);
  final seenSet = seen.toSet();
  final unseen = _shuffled([for (final it in items) if (!seenSet.contains(keyOf(it))) it], rng);
  final picked = unseen.take(n).toList();
  if (picked.length == n) {
    return (picked: picked, seen: [...seen, ...picked.map(keyOf)], wrapped: false);
  }
  final taken = picked.map(keyOf).toSet();
  final rest = _shuffled([for (final it in items) if (!taken.contains(keyOf(it))) it], rng);
  final filled = [...picked, ...rest.take(n - picked.length)];
  return (picked: filled, seen: filled.map(keyOf).toList(), wrapped: true);
}

/// Виденное из общей памяти. Порченая запись партию не роняет — «не видел ничего».
List<String> readSeen(SharedState state, String pool) {
  final raw = state.get(freshPoolKey(pool, state.activeProfile));
  if (raw == null) return const [];
  try {
    final v = jsonDecode(raw);
    return v is List ? [for (final x in v) if (x is String) x] : const [];
  } catch (_) {
    return const [];
  }
}

Future<void> writeSeen(SharedState state, String pool, List<String> seen) =>
    state.set(freshPoolKey(pool, state.activeProfile), jsonEncode(seen));
