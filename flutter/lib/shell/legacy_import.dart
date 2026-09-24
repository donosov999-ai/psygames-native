library;

import 'dart:convert';
import 'dart:io';

import 'package:flutter/foundation.dart' show debugPrint;
import 'package:path_provider/path_provider.dart';
import 'package:sqlite3/sqlite3.dart';

import 'shared_state.dart';

/// 🔴 ПРОГРЕСС ПРЕЖНЕЙ ВЕРСИИ — ЗАБРАТЬ, А НЕ ПОТЕРЯТЬ.
///
/// ЧТО СЛУЧИЛОСЬ 23.09.2026. Гибрид приехал в TestFlight на БОЕВОМ идентификаторе
/// `com.psygames.app` — то есть заменил собой прежнее приложение. И человек увидел
/// пустоту: уровень 1, тренировок 0, все четыре шкалы по нулю, «заброшен — две
/// недели без тренировок». Денис: «прогресс скинулся полностью».
///
/// 🔴 ПОЧЕМУ. Данные НЕ стёрты. Прежняя сборка — Tauri 2: тот же WKWebView, но
/// страница в нём открыта с origin `tauri://localhost`. Гибрид раздаёт ту же
/// сборку со своего `http://127.0.0.1:<порт>`. Origin другой — значит и корзина
/// `localStorage` другая, хотя контейнер приложения ОДИН И ТОТ ЖЕ: обновление
/// через TestFlight контейнер сохраняет.
///
/// Отсюда и починка: файлы прежней корзины лежат тут же, в
/// `Library/WebKit/WebsiteData/**`, и читаются обычным sqlite — это наш же
/// контейнер, никакой песочницы между ними нет.
///
/// ⚠️ ОБЛАКО ЭТУ ДЫРУ НЕ ЗАКРЫВАЕТ, И ВРАТЬ ОБ ЭТОМ НЕЛЬЗЯ. В Supabase партии
/// действительно есть (581 у NZT-48, 2190 у «Гостя» на 24.09.2026), но политика
/// `cog_sessions_anon_insert` даёт анониму ТОЛЬКО запись: чтение разрешено роли
/// `authenticated`, которой у приложения нет. Открыть чтение анониму значило бы
/// отдать чужие партии любому с публичным ключом — этого не делаем.
///
/// ⚠️ ПЕРЕНОС ОДНОРАЗОВЫЙ И НИЧЕГО НЕ ЗАТИРАЕТ. Если в общей памяти уже есть хоть
/// один ключ `psygames_*`, перенос не трогает НИЧЕГО: иначе он затёр бы то, что
/// человек наиграл уже в гибриде.
class LegacyImport {
  /// Ключ-отметка: перенос отрабатывает один раз, даже если ничего не нашёл.
  ///
  /// ⚠️ НОМЕР В КЛЮЧЕ — НЕ УКРАШЕНИЕ. Отметка `_v1` уже проставлена на телефонах,
  /// где перенос ОТКАЗАЛСЯ по слишком строгому условию (сборка 2.55.5: «в памяти
  /// есть свои ключи» → пропуск). Оставь номер прежним — починка до тех телефонов
  /// не доедет никогда, потому что отметка стоит. Поменял поведение — подними номер.
  static const doneKey = 'psygames_legacy_import_v5';

  /// Сколько раз пробовать, если перенос НИЧЕГО не нашёл.
  ///
  /// 🔴 ОДНА НЕУДАЧНАЯ ПОПЫТКА НЕ ИМЕЕТ ПРАВА БЫТЬ ПОСЛЕДНЕЙ. Отметка ставилась
  /// даже когда перенос вернул ноль ключей — и починка до такого телефона уже не
  /// доезжала никогда. Замер 24.09.2026: Денис «статистика пустая по-прежнему»,
  /// хотя перенос в сборке был. Теперь ноль — это НЕ конец: отметка ставится
  /// только при удаче, а пустые заходы считаются и прекращаются на пятом (чтобы
  /// не обходить контейнер на каждом запуске вечно).
  static const maxEmptyTries = 5;
  /// Счёт пустых попыток привязан к НОМЕРУ переноса: подняли номер — счёт
  /// начинается заново, иначе новая починка сразу упрётся в старый лимит.
  static const triesKey = '${doneKey}_tries';

  /// Итог последнего переноса — МАШИННОЙ строкой, а не фразой.
  ///
  /// ⚠️ Нарочно без русского текста: это сообщение разработчику, а не подпись в
  /// интерфейсе. Фраза здесь была бы зашитым текстом на одном языке из двенадцати
  /// (гейт `ui_text_debt_does_not_grow`), да ещё и в том месте, где переводить
  /// нечего: числа читаются одинаково на всех языках.
  /// Вид: `files=3 keys=57 from=localstorage.sqlite3:57` либо `error=<причина>`.
  static String? lastReport;

  /// Забрать прогресс прежней версии, если своего ещё нет.
  ///
  /// Возвращает число перенесённых ключей; −1 — «не требовалось».
  static Future<int> seedIfEmpty(SharedState state, {Directory? libraryDir}) async {
    if (state.get(doneKey) != null) return -1;
    final tries = int.tryParse(state.get(triesKey) ?? '0') ?? 0;
    if (tries >= maxEmptyTries) return -1;
    try {
      final files = await _storageFiles(libraryDir);
      if (files.isEmpty) {
        lastReport = 'files=0 try=${tries + 1}';
        await state.set(triesKey, '${tries + 1}');
        return 0;
      }
      var taken = 0;
      var skipped = 0;
      final from = <String>[];
      for (final f in files) {
        final pairs = _readItemTable(f);
        var here = 0;
        for (final e in pairs.entries) {
          if (!SharedState.owns(e.key)) continue;
          // 🔴 ТОЛЬКО ОТСУТСТВУЮЩЕЕ. Прежняя редакция отказывалась целиком, если в
          // общей памяти был ХОТЬ ОДИН ключ `psygames_*`, — и это отменило перенос у
          // Дениса: 2.55.4 без переноса один раз открылась, веб-часть записала свои
          // служебные ключи (язык, профиль, заготовку питомца), и свежая установка
          // стала выглядеть как «у него уже есть прогресс». Правильная мера — не
          // «пусто ли всё», а «есть ли ИМЕННО ЭТОТ ключ»: чужое не затирается, своё
          // не мешает.
          /*
           * 🔴 ПУСТАЯ ЗАГОТОВКА — НЕ «СВОИ ДАННЫЕ», И ИМЕННО НА НЕЙ ПОТЕРЯЛАСЬ
           * СТАТИСТИКА.
           *
           * 📍 Денис 24.09.2026: «статистика пустая по-прежнему». Уровни
           * вернулись, а история партий — нет. Причина: веб-часть успевает
           * записать `psygames_sessions` пустым массивом ДО переноса (первое же
           * чтение журнала пишет его обратно), и перенос честно видит «ключ уже
           * есть» — и оставляет пустоту вместо 581 партии.
           *
           * Поэтому проверяется не наличие ключа, а НАПОЛНЕНИЕ: пустой массив,
           * пустой объект, пустая строка и ноль — это заготовка, её заменяем.
           * Всё, где есть содержимое, не трогаем ни при каких условиях.
           */
          final mine = state.get(e.key);
          if (mine != null && !_blank(mine)) {
            // Журнал партий — не «занято», а «есть что слить».
            final merged = mergeKeys.contains(e.key)
                ? _merge(e.value, mine)
                : (_isCounter(e.key) ? _biggest(e.value, mine) : null);
            if (merged == null || merged == mine) {
              skipped++;
              continue;
            }
            await state.set(e.key, merged);
            here++;
            continue;
          }
          if (_blank(e.value)) {
            skipped++;
            continue;
          }
          await state.set(e.key, e.value);
          here++;
        }
        if (here > 0) from.add('${f.path.split('/').last}:$here');
        taken += here;
      }
      lastReport = 'files=${files.length} keys=$taken kept=$skipped'
          '${from.isEmpty ? '' : ' from=${from.join(',')}'}';
      if (taken > 0) {
        await state.set(doneKey, lastReport!);
      } else {
        // Ничего не взяли — это ещё не ответ: контейнер мог быть не готов.
        await state.set(triesKey, '${tries + 1}');
      }
      return taken;
    } catch (e) {
      // ⚠️ Молчать нельзя: «ничего не нашлось» и «упало на чтении» — разные вещи,
      // и вторая читается как первая, если её проглотить.
      lastReport = 'error=$e';
      debugPrint('LegacyImport: $lastReport');
      return 0;
    }
  }

  /// 🔴 ЖУРНАЛЫ СЛИВАЮТСЯ, А НЕ ЗАМЕНЯЮТСЯ — ИНАЧЕ ВЫБОР «СТАРОЕ ИЛИ НОВОЕ».
  ///
  /// 📍 Денис 24.09.2026: «у меня новая статистика есть, а старой нет». На его
  /// телефоне `psygames_sessions` уже НЕ пустой — там партии, сыгранные в
  /// гибриде. Правило «пустую заготовку заменяем» ему не поможет: значение
  /// наполнено, и перенос честно его не трогает. А заменить целиком нельзя —
  /// потеряются новые партии.
  ///
  /// Вся история лежит в ОДНОМ ключе массивом, поэтому здесь единственный верный
  /// ответ — слить: старые записи вперёд (они и по времени раньше), новые следом,
  /// повторы выкинуть по `id`.
  ///
  /// ⚠️ СПИСОК ИМЕНной, а не «сливаем все массивы». Массивом лежат и настройки —
  /// порядок серий, список выбранных игр. Слить их значило бы вернуть человеку
  /// то, что он убрал.
  static const mergeKeys = {'psygames_sessions'};

  /// 🔴 СЧЁТЧИКИ БЕРУТСЯ ПО МАКСИМУМУ — СЛИТЬ ИХ НЕЛЬЗЯ, А ВЫБРАТЬ НАДО.
  ///
  /// 📍 Денис 24.09.2026, кадр «Статистики» после возврата истории: 515 партий,
  /// 8,1 часа в игре — и при этом «65 очков, Lv 0, Новичок». История вернулась,
  /// а очки и уровни нет: они лежат в ОТДЕЛЬНЫХ ключах, и в гибриде уже успели
  /// записаться своими маленькими значениями.
  ///
  /// Сложить их нельзя (очки тратятся в магазине, сумма соврала бы), а оставить
  /// новое — значит потерять всё накопленное. Верный ответ для счётчика и
  /// лестницы один: БОЛЬШЕЕ из двух. Оно никогда не отнимает у человека того,
  /// что у него уже есть.
  ///
  /// ⚠️ Серия дней (`psygames_streak_v1`) сюда НЕ входит нарочно: там лежат даты,
  /// и взять «большую» серию значило бы нарисовать человеку дни, которых не было.
  static bool _isCounter(String key) =>
      key == 'psygames_tokens_v1' || key.contains('_level_') || key.contains('_best_');

  /// Большее из двух: число или карта «профиль → число».
  static String? _biggest(String oldRaw, String newRaw) {
    final a = num.tryParse(oldRaw.trim());
    final b = num.tryParse(newRaw.trim());
    if (a != null && b != null) return (a > b ? oldRaw : newRaw).trim();
    try {
      final ma = jsonDecode(oldRaw);
      final mb = jsonDecode(newRaw);
      if (ma is! Map || mb is! Map) return null;
      final out = <String, Object?>{...mb.cast<String, Object?>()};
      ma.forEach((k, v) {
        final mine = out[k];
        if (v is num && mine is num) {
          if (v > mine) out[k] = v;
        } else {
          out[k] ??= v;
        }
      });
      return jsonEncode(out);
    } catch (_) {
      return null;
    }
  }

  /// Слияние двух журналов. Возвращает null, если слить нечем (не массивы).
  static String? _merge(String oldRaw, String newRaw) {
    try {
      final a = jsonDecode(oldRaw);
      final b = jsonDecode(newRaw);
      if (a is! List || b is! List) return null;
      final seen = <String>{};
      final out = <Object?>[];
      for (final row in [...a, ...b]) {
        // Ключ повтора — `id`, а без него вся запись: пропустить повтор лучше,
        // чем показать человеку одну и ту же партию дважды.
        final key = row is Map && row['id'] != null ? 'id:${row['id']}' : jsonEncode(row);
        if (!seen.add(key)) continue;
        out.add(row);
      }
      return jsonEncode(out);
    } catch (_) {
      return null;
    }
  }

  /// Пустая заготовка: нечего терять, можно заменить.
  static bool _blank(String v) {
    final t = v.trim();
    return t.isEmpty || t == '[]' || t == '{}' || t == 'null' || t == '0';
  }

  /// Файлы `localStorage` WebKit внутри нашего же контейнера.
  ///
  /// Имя и глубина у разных версий iOS разные — поэтому обходим вглубь и берём по
  /// признаку, а не по одному ожидаемому пути. Список отсортирован по размеру:
  /// самая полная корзина разбирается первой.
  static Future<List<File>> _storageFiles(Directory? libraryDir) async {
    final roots = <Directory>[];
    if (libraryDir != null) {
      roots.add(libraryDir);                    // подделка для пробы
    } else {
      try {
        roots.add(await getLibraryDirectory());
      } catch (_) {
        // не iOS/macOS — переносить неоткуда
      }
    }
    final out = <File>[];
    for (final root in roots) {
      final webkit = Directory('${root.path}/WebKit');
      if (!webkit.existsSync()) continue;
      for (final e in webkit.listSync(recursive: true, followLinks: false)) {
        if (e is! File) continue;
        final name = e.path.split('/').last;
        if (name.endsWith('.localstorage') || name.startsWith('localstorage.sqlite3')) {
          if (name.endsWith('-wal') || name.endsWith('-shm')) continue;
          out.add(e);
        }
      }
    }
    out.sort((a, b) => b.lengthSync().compareTo(a.lengthSync()));
    return out;
  }

  /// Пары ключ→значение из таблицы `ItemTable`.
  ///
  /// ⚠️ ЗНАЧЕНИЕ ЛЕЖИТ ДВОИЧНЫМ БЛОБОМ. WebKit пишет строки в UTF-16LE, и наивное
  /// чтение как UTF-8 даёт строку с нулями между буквами — тихо испорченные данные,
  /// которые выглядят как данные. Поэтому разбираем оба вида.
  static Map<String, String> _readItemTable(File f) {
    final out = <String, String>{};
    Database? db;
    try {
      db = sqlite3.open(f.path, mode: OpenMode.readOnly, uri: false);
      final rows = db.select('SELECT key, value FROM ItemTable');
      for (final r in rows) {
        final k = _text(r['key']);
        final v = _text(r['value']);
        if (k == null || v == null) continue;
        out[k] = v;
      }
    } catch (_) {
      // Не наш файл или другая раскладка таблиц — это не беда, просто пропускаем.
    } finally {
      db?.dispose();
    }
    return out;
  }

  /// Разбор блоба в строку: выбираем ту раскладку, что даёт ОСМЫСЛЕННЫЙ текст.
  ///
  /// 🔴 ПРИЗНАК «НУЛИ МЕЖДУ БУКВАМИ» НЕ РАБОТАЕТ, ПРОВЕРЕНО. Первая редакция считала
  /// нулевые байты на нечётных местах и решала по их доле. На строке
  /// `{"stage":"Импульс","trainings":112}` доля вышла 25 из 32 — порога не хватило,
  /// и значение уехало в общую память вперемешку с нулями, ВЫГЛЯДЯ данными. Кириллица
  /// в UTF-16 нулей не даёт вовсе (0x18 0x04), так что признак ломается тем сильнее,
  /// чем больше в строке русского, — то есть ровно на наших данных.
  ///
  /// Поэтому раскладки СРАВНИВАЮТСЯ: разбираем обеими и берём ту, где меньше мусора
  /// (управляющих символов и замен U+FFFD). Это замер, а не догадка о формате.
  static String? _text(Object? cell) {
    if (cell is String) return cell;
    if (cell is! List<int>) return null;
    final bytes = cell;
    if (bytes.isEmpty) return '';

    String? asUtf16;
    if (bytes.length.isEven) {
      final units = <int>[];
      for (var i = 0; i + 1 < bytes.length; i += 2) {
        units.add(bytes[i] | (bytes[i + 1] << 8));
      }
      asUtf16 = String.fromCharCodes(units);
    }
    String? asUtf8;
    try {
      asUtf8 = utf8.decode(bytes);
    } catch (_) {
      asUtf8 = null;
    }
    if (asUtf16 == null) return asUtf8;
    if (asUtf8 == null) return asUtf16;
    return _junk(asUtf16) <= _junk(asUtf8) ? asUtf16 : asUtf8;
  }

  /// Доля символов, которых в нормальном тексте не бывает.
  static double _junk(String s) {
    if (s.isEmpty) return 0;
    var bad = 0;
    for (final c in s.codeUnits) {
      final ok = c == 9 || c == 10 || c == 13 || (c >= 32 && c != 0xFFFD);
      if (!ok) bad++;
    }
    return bad / s.length;
  }
}
