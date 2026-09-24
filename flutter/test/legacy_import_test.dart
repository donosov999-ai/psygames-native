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

    expect(taken, 1, reason: 'один ключ занят, второй обязан доехать');
    expect(state.get('psygames_sudoku_level_nzt48'), '3', reason: 'наигранное в гибриде дороже');
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

    expect(taken, 2, reason: 'должны доехать история партий и очки');
    expect(state.get('psygames_sessions'), contains('"game_type":"sudoku"'),
        reason: 'пустой массив остался на месте истории — ровно та потеря статистики');
    expect(state.get('psygames_sudoku_level_nzt48'), '3',
        reason: 'наигранное в гибриде затирать нельзя');
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
}
