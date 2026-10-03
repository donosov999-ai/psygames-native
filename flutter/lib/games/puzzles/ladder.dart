library;

import 'dart:convert';

import 'package:flutter/services.dart';

import '../../shell/l10n.dart';
import '../../shell/level_ladder.dart' show LevelStore;
import 'engine.dart';

/// ЛЕСТНИЦЫ СЕМИ СЕТОК ТЭТХЭМА — те же пять ступеней, что у веб-версии.
///
/// Взяты из `frontend/src/games/tatham-bridge/sections/sudoku.ts` строка в строку:
/// параметры отдаются движку как есть, а ступень человек видит подписью. Разойдутся —
/// разойдётся и прогресс: ключ уровня общий с веб-версией
/// (`psygames_puzzles_<режим строчными>_level_<профиль>`).
///
/// ⚠️ ЧТО ОЗНАЧАЮТ БУКВЫ. Хвост параметров — класс сложности САМОГО движка: `de` лёгкая,
/// `dn` обычная, `dh` трудная, `dk` хитрая, `dx` крайняя, `du` запредельная. У Filling
/// классов нет вовсе — его лестница растёт только размером поля.

class PuzzleStep {
  const PuzzleStep(this.title, this.params, [this.parts = const []]);
  final String title;
  final String params;

  /// Имя по частям для языков кроме русского (`games/puzzles/step_title.dart`).
  final List<StepPart> parts;
}

/// Часть имени ступени: ключ словаря с числом/размером `{n}` либо готовый текст.
class StepPart {
  const StepPart({this.key, this.n = '', this.text = ''});
  final String? key;
  final String n;
  final String text;

  static StepPart fromJson(Map<String, dynamic> j) =>
      StepPart(key: j['key'] as String?, n: (j['n'] ?? '') as String, text: (j['text'] ?? '') as String);
}

class PuzzleMode {
  const PuzzleMode({
    required this.engineName,
    required this.titleKey,
    this.descKey,
    required this.steps,
    this.digits = false,
    this.digitLabels = const [],
    this.digitNames = const [],
    this.owner,
    this.dragOnly = false,
    this.secondKey,
    this.arrows = false,
    this.eightWays = false,
    this.pick = false,
    this.pickSecond = false,
    this.secondPickKey,
  });

  /// Стрелки курсора под полем (16 режимов веба, `СТРЕЛОЧНЫЕ`): у «Куба» и «Инерции» ход
  /// делается только ими, у остальных — курсор как запасной ввод к касанию.
  final bool arrows;

  /// Восемь направлений вместо четырёх — диагонали тоже (у «Инерции»).
  final bool eightWays;

  /// Кнопка «Взять» — CURSOR_SELECT под курсором (12 режимов, `ВЫБОР`).
  final bool pick;

  /// Второй выбор — CURSOR_SELECT2 (6 режимов, `ВЫБОР_ВТОРОЙ`).
  final bool pickSecond;

  /// Ключ подписи второго выбора; нет своего — подпись второго действия режима.
  final String? secondPickKey;

  /// Ход делается ТОЛЬКО протяжкой: касание здесь не делает ничего (замер веба 11.09:
  /// «Раскраска карты» 0 тычков из 663, «Колышки» 0 из 297, «Указатели» 0 из 360).
  /// Под доской тогда честная подсказка «тяни», а не «тычок отмечает клетку».
  final bool dragOnly;

  /// Ключ словаря с подписью ВТОРОГО действия (правая кнопка у автора): флажок у
  /// «Сапёра», крестик у японского кроссворда, карандаш у судоку. `null` — второго
  /// действия у режима нет. Подпись называет, что кнопка делает именно здесь.
  final String? secondKey;

  /// Имя игры у автора — им она ищется в движке («Solo», «Light Up»).
  final String engineName;

  /// КЛЮЧ СЛОВАРЯ с названием, а не готовая строка: экран берёт его через
  /// [L.t] и говорит на всех двенадцати языках. Раньше здесь лежал русский
  /// текст — это был долг, а не решение.
  final String titleKey;

  /// Название на языке человека.
  String get title => L.t(titleKey);

  /// Правило режима на языке человека, либо `null`, если его нет.
  ///
  /// ⚠️ ПРОМАХ СЛОВАРЯ МОЛЧАЛИВ: `L.t` при отсутствии ключа возвращает САМ КЛЮЧ,
  /// а не падает — человек увидел бы на экране `puzzlesBridgesDesc`. Поэтому
  /// сверяем с ключом и отдаём `null`, чтобы экран показал общую фразу.
  String? get rule {
    final k = descKey;
    if (k == null || k.isEmpty) return null;
    final t = L.t(k);
    return (t == k || t.isEmpty) ? null : t;
  }

  /// Какому разделу принадлежит режим — чтобы владелец видел свои и не правил чужие.
  final String? owner;

  /// КЛЮЧ СЛОВАРЯ с правилом игры — то, что человек читает в справке.
  ///
  /// 🔴 До 24.09.2026 нативный экран головоломок не показывал правил ВОВСЕ: доска
  /// и всё. У сорока двух игр правила разные, и половина из них не угадывается с
  /// доски — «Рельсы» человек полтора часа пытался поворачивать, хотя поворота в
  /// игре нет. Ключ ведётся правилом именования `<ключ названия>Desc`.
  final String? descKey;
  final List<PuzzleStep> steps;

  /// Нужен ли ряд цифр: у Singles ввод только тычками.
  final bool digits;

  /// Подписи клавиш, если цифры значат не себя. У «Нежити» 1/2/3 — это призрак,
  /// вампир и зомби (порядок из `undead.c:1931`), и голые цифры не говорили,
  /// какое чудовище ставят.
  final List<String> digitLabels;

  /// Ключи словаря с именами знаков — для чтеца экрана. Значок читается вслух
  /// как «эмодзи», и без имени незрячий человек не узнает, что ставит.
  final List<String> digitNames;

  /// Ключ прогресса: тот же, что пишет веб-версия (`puzzles.tsx`: нижний регистр, пробелы → `_`).
  ///
  /// 🔴 02.10.2026 (сверка 138f7818): здесь был только нижний регистр, и у четырёх режимов с
  /// пробелом в имени — Light Up, Train Tracks, Black Box, Same Game — натив писал
  /// `puzzles_light up`, а веб `puzzles_light_up`: прогресс из веба не читался. Проба сравнивала
  /// ключ натива с правилом самого натива и потому молчала.
  String get levelKey => 'puzzles_${engineName.toLowerCase().replaceAll(RegExp(r'\s+'), '_')}';

  /// Прежний нативный ключ (с пробелом) — только чтобы перенести уже набранный на нём прогресс.
  String? get legacyLevelKey => engineName.contains(' ') ? 'puzzles_${engineName.toLowerCase()}' : null;
}

/// Перенести уровень со старого нативного ключа ([PuzzleMode.legacyLevelKey]) на общий с вебом:
/// берётся БОЛЬШЕЕ из двух — ни прогресс из веба, ни набранный нативно с 30.09 не теряются.
Future<void> migrateLegacyLevel(PuzzleMode mode, LevelStore store) async {
  final old = mode.legacyLevelKey;
  if (old == null) return;
  for (final what in const ['level', 'best']) {
    final was = await store.readInt('$old.$what');
    if (was == null) continue;
    final now = await store.readInt('${mode.levelKey}.$what');
    if (now == null || now < was) await store.writeInt('${mode.levelKey}.$what', was);
  }
}

/// ВСЕ 42 РЕЖИМА — ИЗ АССЕТА, СОБРАННОГО ИЗ ВЕБ-МОСТА.
///
/// 🔴 ПОЧЕМУ НЕ СПИСКОМ В КОДЕ. Первые семь карточек были написаны руками —
/// свои у раздела «Судоку». Остальные 35 принадлежат пяти другим разделам, и
/// писать их по одной значило бы 35 шансов разойтись с веб-версией. Данные уже
/// лежат в `frontend/src/games/tatham-bridge/sections/*.ts`, каждый режим в
/// файле своего владельца; `flutter/tools/embed-puzzle-modes.mjs` собирает их в
/// `assets/puzzles/modes.json`.
///
/// 📍 И РАСХОЖДЕНИЕ УЖЕ БЫЛО, хотя карточек было всего семь. Сверка 23.09.2026:
/// у «Судоку Тэтхэма» первая ступень называлась «простая» в Dart и «начальная»
/// в вебе, у «Нежити» три ступени — «трудная» против «хитрой». Параметры те же,
/// то есть трудность одна, а слово человек видит разное в зависимости от того,
/// какая половина рисует. Источник — веб-сторона: её текст видит большинство.
///
/// ⚠️ У 28 режимов из 42 своей лестницы нет, и выдумывать её нельзя — трудность
/// меряют исполнением. Такие берут СОБСТВЕННЫЕ пресеты движка (`psy_presets`),
/// подобранные автором; раздел заменит их своей, когда померит.
class PuzzleModes {
  PuzzleModes._();

  static Map<String, PuzzleMode> _all = const {};

  static Map<String, PuzzleMode> get all => _all;

  /// Загрузить карточки. Зовётся один раз при старте экрана головоломок.
  static Future<void> load({AssetBundle? bundle}) async {
    if (_all.isNotEmpty) return;
    final raw = await (bundle ?? rootBundle).loadString('assets/puzzles/modes.json');
    final data = jsonDecode(raw) as Map<String, dynamic>;
    _all = data.map((key, v) {
      final m = v as Map<String, dynamic>;
      return MapEntry(
        key,
        PuzzleMode(
          engineName: m['engineName'] as String,
          titleKey: m['titleKey'] as String,
          descKey: m['descKey'] as String?,
          digits: m['digits'] == true,
          digitLabels: ((m['digitLabels'] as List?) ?? const []).cast<String>(),
          digitNames: ((m['digitNames'] as List?) ?? const []).cast<String>(),
          steps: ((m['steps'] as List?) ?? const [])
              .map((s) => PuzzleStep(
                    (s as Map<String, dynamic>)['title'] as String,
                    s['params'] as String,
                    [for (final p in (s['parts'] as List?) ?? const []) StepPart.fromJson(p as Map<String, dynamic>)],
                  ))
              .toList(),
          owner: m['owner'] as String?,
          dragOnly: m['dragOnly'] == true,
          // В вебе у четырёх режимов признак стоит голым `true` — своей подписи раздел
          // им не дал, и веб пишет общую «Второе действие» (puzzles.tsx, `?? 'puzzleSecondAction'`).
          arrows: m['arrows'] == true,
          eightWays: m['eightWays'] == true,
          pick: m['pick'] == true,
          pickSecond: m['pickSecond'] == true,
          secondPickKey: m['secondPickKey'] as String?,
          secondKey: switch (m['secondKey']) {
            final String k when k.isNotEmpty => k,
            true => 'puzzleSecondAction',
            _ => null,
          },
        ),
      );
    });
  }

  /// Только для проб: подставить карточки без ассета.
  static void useForTest(Map<String, PuzzleMode> modes) => _all = modes;
}

/// СТУПЕНИ РЕЖИМА: своя лестница, а нет своей — меню самого движка.
///
/// 🔴 ПОВОД, 23.09.2026. Своя лестница есть у 14 режимов из 42. Остальные 28 шли
/// с пустым списком, а экран лез в него индексом — `steps[(level-1).clamp(0, -1)]`.
/// Это не «ступеней нет», это падение на открытии: 28 режимов из 42 нельзя было
/// открыть вовсе. Перехват `/games/puzzles` поэтому и стоял выключенным.
///
/// 🔴 И ПОЧЕМУ НЕ ПРИДУМЫВАТЬ ЛЕСТНИЦУ САМИМ. Трудность у этих игр уже размечена
/// автором — меню пресетов внутри самого движка. Замер по всем 42: своя лестница
/// 14 · пресеты движка 28 · без того и другого 0. Брать готовую разметку дешевле,
/// чем назначать свою по названию, и она заведомо играбельна.
List<PuzzleStep> resolveSteps(PuzzleMode mode, TathamEngine engine, int gameIndex) {
  if (mode.steps.isNotEmpty) return mode.steps;
  final presets = engine.presetsOf(gameIndex);
  if (presets.isNotEmpty) {
    return presets.map((p) => PuzzleStep(p.name, p.params)).toList();
  }
  // Последний рубеж: пустые параметры — «как решит сам движок». Ни один из 42
  // режимов сюда сегодня не попадает, но пустой экран игроку показывать нельзя,
  // если следующая версия канона лишит игру и пресетов.
  return const [PuzzleStep('', '')];
}
