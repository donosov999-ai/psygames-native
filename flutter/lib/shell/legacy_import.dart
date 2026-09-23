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
  static const doneKey = 'psygames_legacy_import_v1';

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
    final mine = state.snapshot();
    if (mine.isNotEmpty) {
      await state.set(doneKey, 'skip own=${mine.length}');
      return -1;
    }
    try {
      final files = await _storageFiles(libraryDir);
      if (files.isEmpty) {
        lastReport = 'files=0';
        await state.set(doneKey, lastReport!);
        return 0;
      }
      var taken = 0;
      final from = <String>[];
      for (final f in files) {
        final pairs = _readItemTable(f);
        var here = 0;
        for (final e in pairs.entries) {
          if (!SharedState.owns(e.key)) continue;
          await state.set(e.key, e.value);
          here++;
        }
        if (here > 0) from.add('${f.path.split('/').last}:$here');
        taken += here;
      }
      lastReport = 'files=${files.length} keys=$taken'
          '${from.isEmpty ? '' : ' from=${from.join(',')}'}';
      await state.set(doneKey, lastReport!);
      return taken;
    } catch (e) {
      // ⚠️ Молчать нельзя: «ничего не нашлось» и «упало на чтении» — разные вещи,
      // и вторая читается как первая, если её проглотить.
      lastReport = 'error=$e';
      debugPrint('LegacyImport: $lastReport');
      return 0;
    }
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
