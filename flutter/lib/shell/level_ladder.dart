import 'package:synapse_advisor/synapse_advisor.dart' show Outcome;

import 'game_preset.dart';
import 'lesson.dart';
import 'session_report.dart';
import '../synapse/synapse_feed.dart';

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
    this.sessionType,
    this.sessionMode,
  }) : _store = store;   // ignore: prefer_initializing_formals — поле приватное, а параметр именованный

  final String gameId;

  /*
   * 🔴 КЛЮЧ УРОВНЯ И ТИП ПАРТИИ — НЕ ОДНО И ТО ЖЕ, КОГДА У ИГРЫ МНОГО РЕЖИМОВ.
   * Головоломки держат уровень у каждого режима свой (`puzzles_mines`), «Лаборатория» —
   * у каждого упражнения (`spatial_lab_net`), и так же хранит их веб. А партию веб
   * пишет ОДНИМ типом с режимом рядом: `puzzles` + `Mines`, `spatial_lab` + `net`.
   * Натив отправлял партию под ключом уровня — и в статистике её не было нигде:
   * ни в «Балансе тренировок», ни в карточке игры (разбор жалобы Дениса «статистика
   * не доходит», задача 48298f5f, 30.09.2026). Не задано — партия идёт под [gameId],
   * как у всех игр с одним режимом.
   */
  final String? sessionType;
  final String? sessionMode;

  final LevelStore _store;
  final int failStreakThreshold;
  final int maxLevel;

  int _level = 1;
  int _best = 1;
  int _failStreak = 0;

  int get level => _level;
  int get best => _best;
  int get failStreak => _failStreak;

  /// 🔴 ИСХОД ПАРТИИ — НАРУЖУ, ДЛЯ СТУПЕНИ-ПЕРЕХОДА (задача 4e3d3443).
  ///
  /// Ступень одной лестницы может играться в ДРУГОЙ игре («Кошки», сетки Тэтхэма, боссы
  /// в лестнице «Судоку»). Узнать, прошёл ли человек, можно только здесь: [win]/[fail] зовут
  /// все нативные игры, а `SessionReport` исхода не несёт. Слушателя ставит
  /// `LevelTransition` на время перехода и снимает после; обычной партии он не мешает.
  ///
  /// `lesson` — партия шла с подсмотренным разбором: такую не засчитывает ни своя
  /// лестница, ни чужая, ни победой, ни провалом.
  static void Function(bool passed, bool lesson)? onOutcome;

  /// Итог для экрана БЕЗ своей лестницы («Бездна»): иначе ступень-переход на нём не
  /// узнает, чем кончилась партия. Экраны с лестницей сюда не зовут — это делают [win]/[fail].
  static void reportOutcome(bool passed, {bool lesson = false}) => onOutcome?.call(passed, lesson);

  /// Лестница этой игры стоит: шаг зарядки ([GamePreset.isPreset]) или ступень чужой
  /// лестницы ([GamePreset.isTransit]). Партия при этом уходит в статистику как была.
  static bool get _frozen => GamePreset.isPreset || GamePreset.isTransit;

  Future<void> load() async {
    // Лестницу грузит экран на входе — началась новая партия, и отметка разбора,
    // оставшаяся от ДРУГОЙ игры, её не касается. Подробно — у [win].
    LessonUsed.reset();
    _level = await _store.readInt('$gameId.level') ?? 1;
    _best = await _store.readInt('$gameId.best') ?? _level;
    if (_best < _level) _best = _level;
    // Ступень-переход открывает игру на ЗАДАННОМ уровне (`lvl`), не трогая сохранённый:
    // при переходе лестница не пишет ([win]/[fail]), поэтому уровень меняется только в памяти.
    final lvl = GamePreset.isTransit ? int.tryParse(GamePreset.params['lvl'] ?? '') : null;
    if (lvl != null && lvl >= 1) _level = lvl.clamp(1, maxLevel);
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
  /*
   * 🔴 ПАРТИЯ-ПРЕСЕТ ЛЕСТНИЦУ НЕ ДВИГАЕТ. Нашёл раздел «Пространство» 23.09.2026:
   * в вебе это правило стоит в 53 экранах (`passed = !isPreset && …`), а нативно не
   * было НИ В ОДНОМ — все 14 перенесённых звали `win()/fail()` безусловно. Значит шаг
   * зарядки молча менял личный уровень игрока: вверх при удаче, вниз при провале.
   *
   * Правило поставлено ЗДЕСЬ, а не в экранах: это свойство запуска, а не игры.
   * Записанное в каждом экране, оно будет забыто в следующем.
   *
   * ⚠️ Партия при этом всё равно уходит в статистику — она была, и прятать её
   * нельзя. Не двигается только лестница.
   *
   * 🔴 ОТМЕТКУ РАЗБОРА СЪЕДАЕТ ПАРТИЯ, КОТОРУЮ ОНА НЕ ЗАСЧИТАЛА. Нашёл раздел
   * «Объём памяти» 30.09.2026: [LessonUsed] — одна отметка на всё приложение, а
   * снимали её только экраны, где сброс вписали руками, — сначала один из 49 с
   * разбором. Замер поведением: разбор открыт в Корси → победа в «Матрице памяти»
   * дважды, разбора там не было — уровень стоит. Один взгляд на разбор в любой
   * игре, и лестница ни одной игры не росла до перезапуска, а человек не видел
   * почему. Сброс стоит здесь по той же причине, что и само правило. Партия с
   * разбором по-прежнему не засчитывается — зачётной становится следующая.
   */
  ///
  /// `difficulty` и `details` — для игр, у которых партия несёт больше, чем уровень:
  /// словарь SRS пишет пару языков, число смен языка и точность, как веб-версия.
  /// Не передали — уходит прежнее (`difficulty` = уровень, без `details`), поэтому
  /// остальные экраны это не задевает.
  ///
  /// Возвращает, ЗАСЧИТАНА ли победа лестницей (не пресет и не партия с разбором). По
  /// этому признаку экран решает, пора ли боя с боссом ([BossRound.due]): веха — свойство
  /// засчитанного уровня. Узнать это после вызова иначе нельзя — отметку разбора этот же
  /// вызов и снимает.
  /// 🔴 МЕТКА ШАГА ДОЕЗЖАЕТ В ПАРТИЮ, КАК У ВЕБА (задача 177a13df).
  ///
  /// «Оценка» узнаёт партию своего шага дословно: `sessionFitsStep` (`assessment.ts`)
  /// сверяет `difficulty` и `mode` партии с шагом. Шаг кладёт их в настройки как `diff` и
  /// `mode` (`stepToParams`, `warmup.ts`), а нативная партия уходила с `difficulty` =
  /// уровень и без `mode` — замер 30.09.2026: digit_span и sdmt шаг не опознавал, домен
  /// молча становился «средним, z = 0». Экран, передавший метку сам, — главнее.
  static String? _stepLabel(String key) {
    if (!GamePreset.isPreset) return null;
    final v = GamePreset.params[key];
    return v == null || v.isEmpty ? null : v;
  }

  /// `report: false` — лестница-хозяин ступени-перехода: партию уже записала чужая игра
  /// под своим типом, вторая (нулевая) партия «Судоку» исказила бы статистику.
  Future<bool> win({
    int score = 0,
    int timeSeconds = 0,
    int? errors,
    String? mode,
    String? difficulty,
    Map<String, Object?>? details,
    bool report = true,
  }) async {
    _failStreak = 0;
    final before = _level;
    // Пресет — шаг зарядки, разбор — партия с показанным решением. В обоих
    // случаях лестница меряла бы не человека, поэтому не двигается.
    final lesson = LessonUsed.inRound;
    // Переход тоже не засчитывает: уровень чужой ступени — не уровень этой игры, и босса
    // на «вехе» внутри чужой партии быть не должно ([BossRound.due] смотрит сюда).
    final counted = !_frozen && !lesson;
    LessonUsed.reset();
    if (counted) {
      if (_level < maxLevel) _level += 1;
      if (_level > _best) _best = _level;
      await _save();
    }
    if (report) {
      // Синапсу (852e4b4a): исход и уровень до/после — их знает только лестница.
      SynapseFeed.expect(outcome: lesson ? Outcome.lesson : Outcome.won, level: _level, levelBefore: before);
      await SessionReport.send(
        gameType: sessionType ?? gameId,
        score: score,
        timeSeconds: timeSeconds,
        errors: errors,
        mode: mode ?? _stepLabel('mode') ?? sessionMode,
        difficulty: difficulty ?? _stepLabel('diff') ?? '$_level',
        details: _withLesson(details, lesson),
      );
    }
    reportOutcome(true, lesson: lesson);
    return counted;
  }

  /*
   * 🔴 ПАРТИЯ С РАЗБОРОМ НЕСЁТ `lesson: true` — ОДНИМ МЕСТОМ ДЛЯ ВСЕХ НАТИВНЫХ ЭКРАНОВ
   * (задача 9660186d, 30.09.2026). Уровень такая партия не двигала и раньше, а монеты и
   * серия «чисто» считаются в `saveSession` веба — и флага там не было: итог писал
   * «не засчитывается» и тут же «+100 ×2 · чисто». Читатель — `api.ts` (без ×2, серия не
   * тикается). Экрану ничего делать не нужно: признак берётся из `LessonUsed`.
   */
  static Map<String, Object?>? _withLesson(Map<String, Object?>? details, bool lesson) =>
      lesson ? {...?details, 'lesson': true} : details;

  /// Провал. Опускает уровень только на третий подряд — один промах ничего не стоит.
  ///
  /// ⚠️ Проигранная партия — ТОЖЕ партия: она идёт в статистику и двигает шаг
  /// зарядки так же, как выигранная. Иначе человек, проваливший шаг серии,
  /// застрял бы на нём навсегда.
  ///
  /// `difficulty` и `details` — как у [win]: не переданы — уходит прежнее.
  Future<void> fail({
    int score = 0,
    int timeSeconds = 0,
    int? errors,
    String? mode,
    String? difficulty,
    Map<String, Object?>? details,
    bool report = true,
  }) async {
    final lesson = LessonUsed.inRound;
    final before = _level;
    LessonUsed.reset();   // см. [win]: отметку съедает партия, которую она не засчитала
    if (_frozen || lesson) {
      // Ни пресет, ни переход, ни партия с разбором не копят провалов: иначе три шага зарядки
      // подряд (или три подсмотренных решения) опустили бы личный уровень, который
      // человек в этих партиях и не защищал.
      if (report) {
        SynapseFeed.expect(outcome: lesson ? Outcome.lesson : Outcome.finished, level: _level, levelBefore: before);
        await SessionReport.send(
          gameType: sessionType ?? gameId,
          score: score,
          timeSeconds: timeSeconds,
          errors: errors,
          mode: mode ?? _stepLabel('mode') ?? sessionMode,
          difficulty: difficulty ?? _stepLabel('diff') ?? '$_level',
          details: _withLesson(details, lesson),
        );
      }
      reportOutcome(false, lesson: lesson);
      return;
    }
    _failStreak += 1;
    if (_failStreak >= failStreakThreshold) {
      _failStreak = 0;
      if (_level > 1) _level -= 1;
    }
    await _save();
    if (report) {
      SynapseFeed.expect(outcome: Outcome.finished, level: _level, levelBefore: before);
      await SessionReport.send(
        gameType: sessionType ?? gameId,
        score: score,
        timeSeconds: timeSeconds,
        errors: errors,
        mode: mode ?? _stepLabel('mode') ?? sessionMode,
        difficulty: difficulty ?? _stepLabel('diff') ?? '$_level',
        details: details,
      );
    }
    reportOutcome(false);
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
