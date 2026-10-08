/// ЕДИНАЯ ДВЕРЬ В ЯДРО ФИЛВОРДОВ — перенос `frontend/src/games/fillwords/core/index.ts`.
///
/// Экран берёт всё отсюда и не лазит по файлам модуля. Перенос — задача 8e61079a («Слова»),
/// сверка с живым TS — `flutter/test/fillwords_reference_test.dart` по эталону
/// `flutter/test/fixtures/fillwords-reference.json`. На ядре стоят серия «Корректуры»
/// (f4bb47dc) и задание «филворды» (caaa1596).
///
/// ИМЕНА — как в TS, латиницей:
///   `полДлиныЯзыка` → [minWordLenOfLocale] · `ширинаПодПоле` → [widthForField] ·
///   `порядокДляПартии` → [orderForGame] · `допустимыеСлова` → [allowedWords] ·
///   `диагонали` → `diagonals` · `ПорядокСдачи` → [SubmitOrder].
///
/// ⚠️ ДВА ОТЛИЧИЯ ОТ ВЕБА, ОБА — ИЗ-ЗА АССЕТОВ:
///   · словарь грузится заранее, асинхронно: [loadWordPool], и передаётся [generateFillwords]
///     аргументом (в TS `generateFillwords(request)` собирал его сам из вшитых JSON);
///   · подписи модуля (`i18n.ts`) — ассетом: [loadFillwordsStrings].
library;

export 'generator.dart'
    show areAdjacent, assertFullCoverage, fillwordsLevel, generateFillwords, widthForField;
export 'rng.dart' show createRng, normalizeSeed;
export 'session.dart'
    show
        allowedWords,
        applyTrace,
        createFillwordsSession,
        fillwordsInk,
        fillwordsTints,
        isCleared,
        lettersLeft,
        orderForGame,
        resolveTrace,
        stepTrace,
        takeHint,
        tintForFoundOrder,
        traceIsWalkable,
        unfoundWordIndexes;
export 'strings.dart' show FillwordsStrings, fillwordsUiLocales, interpolate, loadFillwordsStrings;
export 'types.dart';
export 'words.dart'
    show
        fillwordsLocales,
        fillwordsMaxWord,
        fillwordsMinWord,
        isFillwordsLocale,
        loadWordPool,
        minWordLenOfLocale,
        normalizeWord,
        wordsOfLength;
