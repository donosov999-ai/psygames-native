import 'dart:convert';
import 'dart:io';
import 'dart:typed_data';

import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/shell/legacy_import.dart';
import 'package:psygames_flutter/shell/shared_state.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:sqlite3/sqlite3.dart';

/// 🔴 ПРОГРЕСС ПРЕЖНЕЙ ВЕРСИИ ОБЯЗАН ПЕРЕЕХАТЬ В ГИБРИД.
///
/// Повод — 23.09.2026, живьём на iPhone: гибрид встал поверх прежнего приложения и
/// показал нули (уровень 1, тренировок 0, все шкалы 0, «заброшен — две недели без
/// тренировок»). Данные не стёрты: прежняя сборка держала их в `localStorage`
/// WKWebView с origin `tauri://localhost`, а гибрид открывает страницу со своего
/// `http://127.0.0.1:<порт>` — другая корзина в том же контейнере.
///
/// Проба строит ПОДДЕЛКУ той корзины — настоящий sqlite с таблицей `ItemTable` и
/// значениями в UTF-16LE, как их пишет WebKit, — и требует, чтобы ключи доехали.
void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  /// Как WebKit: и ключ, и значение лежат двоичными блобами в UTF-16LE.
  Uint8List utf16(String s) {
    final b = BytesBuilder();
    for (final u in s.codeUnits) {
      b.addByte(u & 0xff);
      b.addByte((u >> 8) & 0xff);
    }
    return b.toBytes();
  }

  Directory fakeStore(Map<String, String> items, {bool utf8Values = false}) {
    final root = Directory.systemTemp.createTempSync('legacy-store-');
    final dir = Directory('${root.path}/WebKit/WebsiteData/Default/aa/bb/LocalStorage')
      ..createSync(recursive: true);
    final db = sqlite3.open('${dir.path}/localstorage.sqlite3');
    db.execute('CREATE TABLE ItemTable (key BLOB UNIQUE ON CONFLICT REPLACE, value BLOB NOT NULL ON CONFLICT FAIL)');
    final st = db.prepare('INSERT INTO ItemTable (key, value) VALUES (?, ?)');
    for (final e in items.entries) {
      st.execute([utf16(e.key), utf8Values ? e.value.codeUnits : utf16(e.value)]);
    }
    st.dispose();
    db.dispose();
    return root;
  }

  Future<SharedState> emptyState() async {
    SharedPreferences.setMockInitialValues({});
    return SharedState.open();
  }

  test('🔴 прогресс прежней версии доезжает целиком и не искажается', () async {
    final store = fakeStore({
      'psygames_sudoku_level_nzt48': '17',
      'psygames_points_nzt48': '2480',
      'psygames_pet_nzt48': '{"stage":"Импульс","trainings":112}',
      'language': 'ru',
      'чужой_ключ': 'не наш, брать нельзя',
    });
    final state = await emptyState();
    final taken = await LegacyImport.seedIfEmpty(state, libraryDir: store);

    expect(taken, 4, reason: 'должны доехать три ключа psygames_* и language');
    expect(state.get('psygames_sudoku_level_nzt48'), '17');
    expect(state.get('psygames_points_nzt48'), '2480');
    // 🔴 Кириллица внутри значения — та самая проверка на UTF-16: наивное чтение
    // как UTF-8 дало бы строку с нулями между буквами, и она выглядела бы данными.
    expect(state.get('psygames_pet_nzt48'), '{"stage":"Импульс","trainings":112}');
    expect(state.get('language'), 'ru');
    expect(state.get('чужой_ключ'), isNull, reason: 'чужие ключи не наше дело');
    store.deleteSync(recursive: true);
  });

  test('🔴 свой ключ НЕ затирается, а соседние всё равно доезжают', () async {
    /*
     * 🔴 ПОЧЕМУ НЕ «ОТСТУПИТЬ ЦЕЛИКОМ». Так и было в 2.55.5: есть хоть один свой
     * ключ `psygames_*` — перенос пропускался весь. На телефоне Дениса это отменило
     * его: гибрид один раз открылся БЕЗ переноса, веб-часть записала служебные ключи
     * (язык, профиль, заготовка питомца), и свежая установка стала выглядеть как
     * «у него уже есть прогресс». Статистика осталась пустой.
     * Мера правильная — не «пусто ли всё», а «есть ли ИМЕННО ЭТОТ ключ».
     */
    final store = fakeStore({
      'psygames_sudoku_level_nzt48': '17',
      'psygames_points_nzt48': '2480',
    });
    SharedPreferences.setMockInitialValues({'psygames_sudoku_level_nzt48': '3'});
    final state = await SharedState.open();
    final taken = await LegacyImport.seedIfEmpty(state, libraryDir: store);

    /*
     * ⚠️ ОЖИДАНИЕ ИЗМЕНИЛОСЬ 24.09.2026, И ЭТО РЕШЕНИЕ, А НЕ ПОДГОНКА. Раньше
     * здесь стояло «наигранное в гибриде дороже» — уровень оставался 3, хотя в
     * прежней версии человек дошёл до 17. Кадр Дениса показал, чем это кончается:
     * 515 партий и «Lv 0, Новичок». Для лестницы и счётчиков верное правило —
     * БОЛЬШЕЕ из двух: оно не отнимает ни старого, ни нового.
     */
    expect(taken, 2, reason: 'уровень поднимается до прежнего, очки доезжают');
    expect(state.get('psygames_sudoku_level_nzt48'), '17',
        reason: 'прежний уровень выше — забирать его у человека нельзя');
    expect(state.get('psygames_points_nzt48'), '2480', reason: 'свободный ключ перенесён');
    store.deleteSync(recursive: true);
  });

  test('🔴 ПУСТАЯ ЗАГОТОВКА ЗАМЕНЯЕТСЯ — на ней и потерялась статистика', () async {
    /*
     * 📍 Денис 24.09.2026: «статистика пустая по-прежнему». Уровни вернулись, а
     * история партий — нет. Веб-часть успевает записать `psygames_sessions`
     * ПУСТЫМ массивом до переноса (первое же чтение журнала пишет его обратно),
     * и перенос видел «ключ уже есть» — оставляя пустоту вместо 581 партии.
     *
     * Наполненное не трогаем ни при каких условиях: наигранное в гибриде дороже.
     */
    final store = fakeStore({
      'psygames_sessions': '[{"id":"1","game_type":"sudoku"},{"id":"2","game_type":"hanoi"}]',
      'psygames_points_nzt48': '2480',
      'psygames_sudoku_level_nzt48': '17',
    });
    SharedPreferences.setMockInitialValues({
      'psygames_sessions': '[]',                 // заготовка — обязана замениться
      'psygames_sudoku_level_nzt48': '3',        // наигранное — обязано устоять
    });
    final state = await SharedState.open();
    final taken = await LegacyImport.seedIfEmpty(state, libraryDir: store);

    // Три: история партий, очки и уровень (последний — по большему из двух).
    expect(taken, 3, reason: 'должны доехать история партий, очки и уровень');
    expect(state.get('psygames_sessions'), contains('"game_type":"sudoku"'),
        reason: 'пустой массив остался на месте истории — ровно та потеря статистики');
    expect(state.get('psygames_sudoku_level_nzt48'), '17',
        reason: 'прежний уровень выше нынешнего — возвращаем его');
    store.deleteSync(recursive: true);
  });

  test('🔴 пустой заход НЕ последний: отметка ставится только при удаче', () async {
    /*
     * 🔴 Одна неудачная попытка запирала перенос навсегда: отметка ставилась и на
     * нуле, и починка до такого телефона не доезжала уже никогда. Теперь ноль —
     * это попытка, а не ответ; попытки считаются и кончаются на пятой.
     */
    final empty = Directory.systemTemp.createTempSync('legacy-empty-');
    final state = await emptyState();
    expect(await LegacyImport.seedIfEmpty(state, libraryDir: empty), 0);
    expect(state.get(LegacyImport.doneKey), isNull,
        reason: 'на пустом заходе отметка «готово» ставиться не должна');
    expect(state.get(LegacyImport.triesKey), '1', reason: 'попытка обязана считаться');

    // Следующий запуск ПРОБУЕТ снова — и теперь данные на месте.
    final store = fakeStore({'psygames_points_nzt48': '2480'});
    expect(await LegacyImport.seedIfEmpty(state, libraryDir: store), 1,
        reason: 'вторая попытка обязана забрать прогресс');
    expect(state.get('psygames_points_nzt48'), '2480');
    expect(state.get(LegacyImport.doneKey), isNotNull, reason: 'удача — теперь отметка');
    expect(await LegacyImport.seedIfEmpty(state, libraryDir: store), -1,
        reason: 'после удачи второй раз не ходим');
    empty.deleteSync(recursive: true);
    store.deleteSync(recursive: true);
  });

  test('пустые заходы не длятся вечно — пятый последний', () async {
    final empty = Directory.systemTemp.createTempSync('legacy-empty2-');
    final state = await emptyState();
    for (var i = 0; i < LegacyImport.maxEmptyTries; i++) {
      expect(await LegacyImport.seedIfEmpty(state, libraryDir: empty), 0);
    }
    expect(await LegacyImport.seedIfEmpty(state, libraryDir: empty), -1,
        reason: 'обход контейнера на каждом запуске вечно — это расход без толку');
    empty.deleteSync(recursive: true);
  });

  test('значения в UTF-8 тоже читаются — раскладка у версий iOS разная', () async {
    final store = fakeStore({'psygames_points_nzt48': '900'}, utf8Values: true);
    final state = await emptyState();
    expect(await LegacyImport.seedIfEmpty(state, libraryDir: store), 1);
    expect(state.get('psygames_points_nzt48'), '900');
    store.deleteSync(recursive: true);
  });

  test('🔴 СТАРАЯ история СЛИВАЕТСЯ с новой, а не выбирается одна из двух', () async {
    /*
     * 📍 Денис 24.09.2026: «у меня новая статистика есть, а старой нет». На его
     * телефоне журнал уже НЕ пустой — там партии, сыгранные в гибриде. Правило
     * «пустую заготовку заменяем» ему не помогает: значение наполнено. А заменить
     * целиком нельзя — потеряются новые партии. Значит слить.
     */
    final store = fakeStore({
      'psygames_sessions':
          '[{"id":"old1","game_type":"sudoku"},{"id":"old2","game_type":"hanoi"},{"id":"same","game_type":"schulte"}]',
    });
    SharedPreferences.setMockInitialValues({
      'psygames_sessions':
          '[{"id":"same","game_type":"schulte"},{"id":"new1","game_type":"stroop"}]',
    });
    final state = await SharedState.open();
    final taken = await LegacyImport.seedIfEmpty(state, libraryDir: store);

    expect(taken, 1, reason: 'журнал обязан считаться перенесённым');
    final rows = (jsonDecode(state.get('psygames_sessions')!) as List)
        .map((e) => (e as Map)['id'] as String)
        .toList();
    expect(rows, ['old1', 'old2', 'same', 'new1'],
        reason: 'старые записи вперёд, новые следом, повтор по id выкинут');
    store.deleteSync(recursive: true);
  });

  test('настройки-массивы НЕ сливаются — иначе вернётся убранное', () async {
    // Массивом лежат и настройки: порядок серий, список выбранных игр. Слить их
    // значило бы вернуть человеку то, что он сам убрал.
    final store = fakeStore({'psygames_playlists_override': '["a","b","c"]'});
    SharedPreferences.setMockInitialValues({'psygames_playlists_override': '["a"]'});
    final state = await SharedState.open();
    await LegacyImport.seedIfEmpty(state, libraryDir: store);
    expect(state.get('psygames_playlists_override'), '["a"]',
        reason: 'настройка не журнал: чужой список назад не возвращаем');
    store.deleteSync(recursive: true);
  });

  test('🔴 ОЧКИ И УРОВНИ — ПО БОЛЬШЕМУ: 515 партий не бывает у «Новичка»', () async {
    /*
     * 📍 Кадр Дениса 24.09.2026 после возврата истории: 515 партий, 8,1 часа в
     * игре — и «65 очков, Lv 0, Новичок». История вернулась, а очки и уровни нет:
     * они в ОТДЕЛЬНЫХ ключах, и гибрид успел записать туда свои маленькие числа.
     *
     * Сложить нельзя (очки тратятся в магазине), оставить новое — потерять всё
     * накопленное. Берём БОЛЬШЕЕ: оно не отнимает того, что уже есть.
     */
    final store = fakeStore({
      'psygames_tokens_v1': '{"nzt48":4820,"women":300}',
      'psygames_sudoku_level_nzt48': '34',
      'psygames_hanoi_level_nzt48': '2',
    });
    SharedPreferences.setMockInitialValues({
      'psygames_tokens_v1': '{"nzt48":65}',        // наиграно в гибриде
      'psygames_sudoku_level_nzt48': '1',          // лестница сброшена
      'psygames_hanoi_level_nzt48': '9',           // а здесь новое БОЛЬШЕ старого
    });
    final state = await SharedState.open();
    await LegacyImport.seedIfEmpty(state, libraryDir: store);

    final tokens = jsonDecode(state.get('psygames_tokens_v1')!) as Map;
    expect(tokens['nzt48'], 4820, reason: 'накопленные очки обязаны вернуться');
    expect(tokens['women'], 300, reason: 'профиль, которого в гибриде нет, доезжает целиком');
    expect(state.get('psygames_sudoku_level_nzt48'), '34', reason: 'уровень вернулся');
    expect(state.get('psygames_hanoi_level_nzt48'), '9',
        reason: 'новое больше старого — забирать у человека нельзя');
    store.deleteSync(recursive: true);
  });

  test('серия дней НЕ берётся по максимуму — там даты, а не счёт', () async {
    // Взять «большую» серию значило бы нарисовать дни, которых не было.
    final store = fakeStore({'psygames_streak_v1': '{"nzt48":{"last":"2026-1-1","streak":40}}'});
    SharedPreferences.setMockInitialValues(
        {'psygames_streak_v1': '{"nzt48":{"last":"2026-9-24","streak":1}}'});
    final state = await SharedState.open();
    await LegacyImport.seedIfEmpty(state, libraryDir: store);
    expect(state.get('psygames_streak_v1'), contains('"streak":1'),
        reason: 'серия остаётся нынешней: её дни настоящие');
    store.deleteSync(recursive: true);
  });

  // ── ANDROID: корзина Chromium, а не WebKit ─────────────────────────────────
  //
  // 🔴 Ветка Android проверяется НА НАСТОЯЩЕЙ БАЗЕ, снятой Chromium
  // (flutter/tool/make_leveldb_fixture.mjs). Иначе единственным способом её
  // замерить остался бы живой телефон, а без замера «перенос не работает»
  // и «переносить нечего» выглядят одинаково.

  /// Раскладывает эталон туда, где его ищет Android-WebView.
  Directory androidStore() {
    final root = Directory.systemTemp.createTempSync('legacy-android-');
    final dst = Directory('${root.path}/app_webview/Default/Local Storage/leveldb')
      ..createSync(recursive: true);
    final src = Directory('test/fixtures/chromium_localstorage');
    for (final f in src.listSync().whereType<File>()) {
      f.copySync('${dst.path}/${f.path.split('/').last}');
    }
    return root;
  }

  test('🔴 Android: прогресс забирается из базы Chromium', () async {
    final store = androidStore();
    final state = await emptyState();

    final taken = await LegacyImport.seedIfEmpty(state, libraryDir: store);

    expect(taken, greaterThan(0), reason: 'из LevelDB не взято ничего');
    expect(state.get('psygames_profile'), 'nzt48');
    expect(state.get('psygames_tokens_v1'), '4212');
    // Ключи из журнала предзаписи — самые свежие, их терять нельзя.
    expect(state.get('psygames_theme'), 'dark');
    // Кириллица и эмодзи — проверка кодировки значения.
    expect(state.get('psygames_nickname'), 'Денис · кот Маркиз 🐈');
    // История партий целиком, а не обрывком.
    final sessions = jsonDecode(state.get('psygames_sessions')!) as List;
    expect(sessions.length, 400);
    store.deleteSync(recursive: true);
  });

  test('🔴 Android: чужие ключи не берутся', () async {
    final store = androidStore();
    final state = await emptyState();
    await LegacyImport.seedIfEmpty(state, libraryDir: store);

    // В эталоне лежат 120 балластных и один чужой ключ — все они в том же
    // origin, и отсечь их обязан перенос, а не разбор базы.
    expect(state.get('ballast_0'), isNull);
    expect(state.get('unrelated_cookie_banner'), isNull);
    store.deleteSync(recursive: true);
  });

  test('🔴 Android: origin `https` тоже забирается — это настоящая схема Tauri', () async {
    // wry раздаёт страницу через `WebViewAssetLoader`, а он по умолчанию
    // обслуживает ТОЛЬКО https. Уберут `https://tauri.localhost` из списка
    // origin — перенос на живом телефоне вернёт ноль и будет выглядеть как
    // «переносить нечего». Эталон снят живым Chromium по https.
    final root = Directory.systemTemp.createTempSync('legacy-android-https-');
    final dst = Directory('${root.path}/app_webview/Default/Local Storage/leveldb')
      ..createSync(recursive: true);
    for (final f in Directory('test/fixtures/chromium_localstorage_https')
        .listSync()
        .whereType<File>()) {
      f.copySync('${dst.path}/${f.path.split('/').last}');
    }
    final state = await emptyState();

    final taken = await LegacyImport.seedIfEmpty(state, libraryDir: root);

    expect(taken, greaterThan(0), reason: 'origin https не прочитан');
    expect(state.get('psygames_nickname'), 'Денис · кот Маркиз 🐈');
    expect(state.get('psygames_theme'), 'dark');
    root.deleteSync(recursive: true);
  });

  test('Android: в журнале переноса видно, ОТКУДА взяты ключи', () async {
    final store = androidStore();
    final state = await emptyState();
    await LegacyImport.seedIfEmpty(state, libraryDir: store);

    expect(LegacyImport.lastReport, contains('leveldb@tauri.localhost'),
        reason: 'без имени источника непонятно, сработала ли ветка Android');
    store.deleteSync(recursive: true);
  });
}
