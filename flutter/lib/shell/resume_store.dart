import 'dart:convert';

import 'shared_state.dart';

/// НЕЗАКОНЧЕННАЯ ПАРТИЯ — ОБЩИЙ СЛОЙ ДЛЯ ПЕРЕНЕСЁННЫХ ЭКРАНОВ.
///
/// 🔴 ЧТО ПОТЕРЯЛОСЬ ПРИ ПЕРЕНОСЕ. В вебе продолжение партии — общий слой
/// (`frontend/src/services/resume.ts`), и его зовут одиннадцать экранов. Замер
/// 23.09.2026: из восьми таких экранов, уже перенесённых на Flutter, продолжение
/// сохранил РОВНО ОДИН — «Бездна», и то потому, что раздел написал его себе сам.
/// Остальные семь — судоку, самурай, фрактал, маджонг, ханой, торты, товары —
/// молча вернулись к тому, ради чего слой и делали: играешь двадцать минут,
/// сворачиваешь приложение, и доска начинается заново.
///
/// 🔴 ФОРМАТ СОВПАДАЕТ С ВЕБ-СТОРОНОЙ ДО БАЙТА, И ЭТО НЕ ВЕЖЛИВОСТЬ. Пока идёт
/// переезд, одну и ту же игру человек может открыть и нативно, и в WebView
/// (например, до вливания ветки раздела). Разойдётся ключ или конверт — партия,
/// сохранённая одной половиной, не откроется другой, и виноватым будет выглядеть
/// «сломанное сохранение», а не разъехавшийся формат.
///   ключ:     psygames_resume_<играId>_<профиль>
///   конверт:  {"v": <версия схемы>, "savedAt": <мс epoch>, "state": <своё>}
///   срок:     30 суток, дальше запись считается протухшей и стирается
///
/// ⚠️ СЛОЙ НЕ ЗНАЕТ ПРАВИЛ ИГР — как и веб-версия. Что класть в `state`, решает
/// игра; здесь только конверт, срок и версия. Версию игра поднимает САМА, когда
/// меняет состав состояния: иначе старая запись прочитается новым кодом и даст
/// доску, которой не бывает.
///
/// ⚠️ И НЕ ПУТАТЬ С [SessionReport]: там ЗАКОНЧЕННАЯ партия (очки, время, исход),
/// здесь ровно наоборот — то, что человек ещё не доиграл.
class ResumeStore {
  ResumeStore(this._state, this.gameId, this.schemaVersion);

  final SharedState _state;

  /// Имя игры — то же, что у веб-версии и у лестницы уровней.
  final String gameId;

  /// Версия состава состояния. Не совпала с записанной — запись выбрасывается.
  final int schemaVersion;

  /// Тот же срок, что у веб-стороны (`RESUME_MAX_AGE_MS`).
  static const maxAge = Duration(days: 30);

  String get _key => '${SharedState.prefix}resume_${gameId}_${_state.activeProfile}';

  /// Сохранить незаконченную партию. Пустое состояние не пишем: запись без
  /// содержимого выглядит как «есть что продолжить», а продолжать нечего.
  Future<void> save(Map<String, Object?> state) async {
    if (state.isEmpty) return;
    await _state.set(_key, jsonEncode({
      'v': schemaVersion,
      'savedAt': DateTime.now().millisecondsSinceEpoch,
      'state': state,
    }));
  }

  /// Прочитать. Возвращает null и ЧИСТИТ запись, если она чужой версии,
  /// просрочена или разобралась с ошибкой — чтобы битая запись не висела вечно.
  Future<Map<String, Object?>?> load() async {
    final raw = _state.get(_key);
    if (raw == null) return null;
    try {
      final env = jsonDecode(raw) as Map<String, dynamic>;
      final saved = env['savedAt'];
      if (env['v'] != schemaVersion || saved is! int) {
        await clear();
        return null;
      }
      final age = DateTime.now().millisecondsSinceEpoch - saved;
      if (age > maxAge.inMilliseconds) {
        await clear();
        return null;
      }
      final state = env['state'];
      if (state is! Map) {
        await clear();
        return null;
      }
      return state.cast<String, Object?>();
    } catch (_) {
      await clear();
      return null;
    }
  }

  /// Партия доиграна — продолжать нечего.
  Future<void> clear() => _state.remove(_key);
}
