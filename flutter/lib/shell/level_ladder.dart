import 'session_report.dart';

/// Лестница уровней игры — перенос хука usePersistentLevel из React-версии.
///
/// 🔴 ОДНО ОТЛИЧИЕ ОТ ОРИГИНАЛА, И ОНО НАМЕРЕННОЕ. В React-версии достигнутое
/// (`best`) хранилось тем же числом, что и текущий уровень, и падало вместе с ним
/// после трёх провалов подряд. Человек терял отметку «я дошёл до 31» за плохой вечер.
/// Здесь достигнутое только растёт: падает текущий уровень, достигнутое остаётся.
///
/// Правила, перенесённые как есть:
///   · победа поднимает текущий уровень на 1 и, если надо, достигнутое;
///   · три провала подряд опускают текущий на 1 (не ниже первого);
///   · выбор уровня человеком (`pick`) не срезает достигнутое.
class LevelLadder {
  LevelLadder({
    required this.gameId,
    required LevelStore store,
    this.failStreakThreshold = 3,
    this.maxLevel = 999,
  }) : _store = store;   // ignore: prefer_initializing_formals — поле приватное, а параметр именованный

  final String gameId;
  final LevelStore _store;
  final int failStreakThreshold;
  final int maxLevel;

  int _level = 1;
  int _best = 1;
  int _failStreak = 0;

  int get level => _level;
  int get best => _best;
  int get failStreak => _failStreak;

  Future<void> load() async {
    _level = await _store.readInt('$gameId.level') ?? 1;
    _best = await _store.readInt('$gameId.best') ?? _level;
    if (_best < _level) _best = _level;
  }

  /// Победа: следующий уровень, достигнутое подтягивается.
  ///
  /// 🔴 И ЗДЕСЬ ЖЕ ПАРТИЯ УХОДИТ В ВЕБ-ПОЛОВИНУ. Лестница — единственное место,
  /// которое зовёт КАЖДАЯ перенесённая игра в конце круга, поэтому отчёт стоит
  /// тут, а не в тридцати шести экранах по отдельности. Без него зарядка не
  /// двигает шаг, а статистика не видит нативных партий вовсе — см.
  /// [SessionReport].
  ///
  /// `score` и `timeSeconds` экран передаёт сам: лестница их не знает и не должна.
  /// Не передал — уедут нули, и это ЧЕСТНЕЕ выдуманного числа: ноль в статистике
  /// виден, а придуманный счёт неотличим от настоящего.
  Future<void> win({int score = 0, int timeSeconds = 0, int? errors, String? mode}) async {
    _failStreak = 0;
    if (_level < maxLevel) _level += 1;
    if (_level > _best) _best = _level;
    await _save();
    await SessionReport.send(
      gameType: gameId,
      score: score,
      timeSeconds: timeSeconds,
      errors: errors,
      mode: mode,
      difficulty: '$_level',
    );
  }

  /// Провал. Опускает уровень только на третий подряд — один промах ничего не стоит.
  ///
  /// ⚠️ Проигранная партия — ТОЖЕ партия: она идёт в статистику и двигает шаг
  /// зарядки так же, как выигранная. Иначе человек, проваливший шаг серии,
  /// застрял бы на нём навсегда.
  Future<void> fail({int score = 0, int timeSeconds = 0, int? errors, String? mode}) async {
    _failStreak += 1;
    if (_failStreak >= failStreakThreshold) {
      _failStreak = 0;
      if (_level > 1) _level -= 1;
    }
    await _save();
    await SessionReport.send(
      gameType: gameId,
      score: score,
      timeSeconds: timeSeconds,
      errors: errors,
      mode: mode,
      difficulty: '$_level',
    );
  }

  /// Человек сам выбрал уровень на карте: достигнутое при этом не срезается.
  Future<void> pick(int level) async {
    _level = level.clamp(1, maxLevel);
    _failStreak = 0;
    if (_level > _best) _best = _level;
    await _save();
  }

  Future<void> _save() async {
    await _store.writeInt('$gameId.level', _level);
    await _store.writeInt('$gameId.best', _best);
  }
}

/// Хранилище уровня. Отдельным интерфейсом, чтобы пробы шли без файлов и без
/// настоящего устройства, а приложение подставляло своё хранилище.
abstract class LevelStore {
  Future<int?> readInt(String key);
  Future<void> writeInt(String key, int value);
}

class MemoryLevelStore implements LevelStore {
  final Map<String, int> _data = {};

  @override
  Future<int?> readInt(String key) async => _data[key];

  @override
  Future<void> writeInt(String key, int value) async => _data[key] = value;
}
