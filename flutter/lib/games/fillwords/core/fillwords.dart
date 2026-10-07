/// ЕДИНАЯ ДВЕРЬ В ЯДРО ФИЛВОРДОВ — перенос `frontend/src/games/fillwords/core/index.ts`.
///
/// Экран берёт всё отсюда и не лазит по файлам модуля. Ядро переносится задачей 8e61079a
/// («Слова»): сначала этот файл с API, потом генератор, сессия и слова — со сверкой с
/// живым TS (эталон `flutter/test/fixtures/fillwords-reference.json`). Пока тела не
/// перенесены, функции бросают [UnimplementedError]: API зафиксирован, чтобы экран серии
/// «Корректуры» (f4bb47dc) и задание «филворды» (caaa1596) писались параллельно.
///
/// ИМЕНА — как в TS, латиницей. Кириллические имена веба:
///   `полДлиныЯзыка` → [minWordLenOfLocale] · `ширинаПодПоле` → [widthForField] ·
///   `порядокДляПартии` → [orderForGame] · `допустимыеСлова` → [allowedWords].
///
/// ⚠️ ДВА ОТЛИЧИЯ ОТ ВЕБА, ОБА — ИЗ-ЗА АССЕТОВ:
///   · словарь грузится заранее, асинхронно: [loadWordPool], и передаётся [generateFillwords]
///     аргументом (в TS `generateFillwords(request)` собирал его сам из вшитых JSON);
///   · подписи модуля (`i18n.ts`: modeName, task, rules, levelLine, pass, noDictionary на
///     12 языках) — ассетом с экспортёром, [loadFillwordsStrings]. Слова, которые уже есть
///     в общем словаре (find, btn_hint, label_found, level, start, proofreading), берутся
///     через `L.t`, как и в вебе.
library;

import 'types.dart';

export 'types.dart';

Never _wip() => throw UnimplementedError('fillwords core is being ported: task 8e61079a');

// ─── rng.ts ───

/// Зерно в беззнаковые 32 бита — как `normalizeSeed` веба.
int normalizeSeed(int seed) => _wip();

/// mulberry32 на `Math.imul` — та же последовательность, что в вебе, число в число.
FillwordsRng createRng(int seed) => _wip();

// ─── words.ts ───

const fillwordsMinWord = 3;
const fillwordsMaxWord = 8;

/// Языки, на которых режим предлагается (`FILLWORDS_LOCALES`).
List<String> get fillwordsLocales => _wip();

bool isFillwordsLocale(String locale) => _wip();

/// Пол длины слова у языка (`полДлиныЯзыка`).
int minWordLenOfLocale(String locale) => _wip();

String? normalizeWord(String raw) => _wip();

/// Словарь языка (`wordPool`) — асинхронно, из ассетов.
Future<FillwordsPool> loadWordPool(String locale) => _wip();

List<String> wordsOfLength(FillwordsPool pool, int len) => _wip();

// ─── generator.ts ───

bool areAdjacent(CellIndex a, CellIndex b, int cols, {bool diagonals = true}) => _wip();

FillwordsLevelCfg fillwordsLevel(int level) => _wip();

/// Ширина поля под экран (`ширинаПодПоле`): со списком сбоку или под полем.
double widthForField(double screenWidth, bool listAside) => _wip();

/// Бросает, если пути слов не разбивают поле целиком.
void assertFullCoverage(FillwordsPuzzle puzzle) => _wip();

FillwordsPuzzle generateFillwords(FillwordsRequest request, FillwordsPool pool) => _wip();

// ─── session.ts ───

/// Цвета найденных слов по порядку нахождения (`FILLWORDS_TINTS`), ARGB.
const fillwordsTints = <int>[
  0xFFFCD34D, 0xFF6EE7B7, 0xFF93C5FD, 0xFFD8B4FE, //
  0xFFF9A8D4, 0xFFFDBA74, 0xFFD9F99D, 0xFFCBD5E1,
];

/// Цвет букв (`FILLWORDS_INK`), ARGB.
const fillwordsInk = 0xFF1F2937;

int tintForFoundOrder(int order) => _wip();

FillwordsSession createFillwordsSession(FillwordsPuzzle puzzle, [SubmitOrder order = SubmitOrder.free]) => _wip();

/// Порядок для партии (`порядокДляПартии`): строгий — только при видимом списке.
SubmitOrder orderForGame(SubmitOrder levelOrder, bool listVisible) => _wip();

/// Какие слова сейчас можно сдать (`допустимыеСлова`).
List<int> allowedWords(FillwordsSession session) => _wip();

int lettersLeft(FillwordsSession session) => _wip();

bool isCleared(FillwordsSession session) => _wip();

List<int> unfoundWordIndexes(FillwordsSession session) => _wip();

FillwordsTrace resolveTrace(FillwordsSession session, List<CellIndex> path) => _wip();

({FillwordsSession session, FillwordsTrace trace}) applyTrace(FillwordsSession session, List<CellIndex> path) =>
    _wip();

({FillwordsSession session, FillwordsHint? hint}) takeHint(FillwordsSession session) => _wip();

/// Следующий шаг линии под пальцем: добавить клетку, откатить на шаг или оставить как есть.
List<CellIndex> stepTrace(FillwordsSession session, List<CellIndex> path, CellIndex cell) => _wip();

bool traceIsWalkable(FillwordsSession session, List<CellIndex> path) => _wip();

// ─── i18n.ts ───

/// Подписи модуля на языке [locale] (`getFillwordsStrings`), из ассета.
Future<FillwordsStrings> loadFillwordsStrings(String locale) => _wip();

/// Подстановка `{имя}` в шаблон (`interpolate`).
String interpolate(String template, Map<String, Object> values) => _wip();

/// Подписи модуля филвордов (`FillwordsStrings` веба).
class FillwordsStrings {
  const FillwordsStrings({
    required this.modeName,
    required this.task,
    required this.rules,
    required this.levelLine,
    required this.pass,
    required this.noDictionary,
  });

  final String modeName;
  final String task;
  final String rules;
  final String levelLine;
  final String pass;
  final String noDictionary;
}
