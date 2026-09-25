/// ЧТЕНИЕ СТАРОГО localStorage ANDROID ПРОВЕРЯЕТСЯ НА НАСТОЯЩЕЙ БАЗЕ CHROMIUM.
///
/// 🔴 Эталон снят не руками и не «похожим» генератором: его пишет настоящий
/// Chromium через Playwright — `flutter/tool/make_leveldb_fixture.mjs`. Браузеру
/// подменено имя узла, поэтому origin в базе ровно тот, под которым работала
/// прежняя линия PsyGames на Android: `tauri.localhost`. Эталонов два — под обе
/// схемы, `http` и `https`; какая из них настоящая, объяснено у цикла в `main`.
///
/// ⚠️ ЭТАЛОН СОДЕРЖИТ И `.ldb`, И `.log` — ЭТО НЕ СЛУЧАЙНОСТЬ. Ключи, дописанные
/// последними, остаются в журнале и в сортированную таблицу ещё не переехали.
/// Ридер, умеющий только таблицы, вернул бы БОЛЬШУЮ ЧАСТЬ прогресса и выглядел бы
/// работающим — а на телефоне у человека пропали бы самые свежие партии. Поэтому
/// ниже отдельно названы ключи из журнала и ключи из таблицы.
library;

import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/shell/chromium_localstorage.dart';

void main() {
  // 🔴 ДВА ЭТАЛОНА — ДВЕ СХЕМЫ ORIGIN, И ВТОРАЯ ВАЖНЕЕ ПЕРВОЙ.
  // На Android прежняя линия идёт через wry, а тот раздаёт страницу классом
  // `WebViewAssetLoader` (wry 0.55.1, src/android/kotlin/RustWebViewClient.kt:21 —
  // Builder без setHttpAllowed). По умолчанию загрузчик обслуживает ТОЛЬКО https,
  // то есть настоящий origin прежней линии — `https://tauri.localhost`.
  // Ключи localStorage привязаны к origin ЦЕЛИКОМ, вместе со схемой: ошибка в
  // одну букву даёт пустой перенос, неотличимый от «данных нет».
  // Оба случая сняты живым Chromium и оба проверены на эмуляторе Android 36.
  for (final name in ['chromium_localstorage', 'chromium_localstorage_https']) {
    group(name, () => _suite(name));
  }
}

void _suite(String fixture) {
  final dir = Directory('test/fixtures/$fixture');
  final expected = jsonDecode(
    File('${dir.path}/expected.json').readAsStringSync(),
  ) as Map<String, dynamic>;
  final origin = expected['origin'] as String;
  final values = (expected['values'] as Map).cast<String, dynamic>();

  late Map<String, String> got;

  setUpAll(() {
    got = ChromiumLocalStorage.read(dir, origin: origin);
  });

  test('эталон на месте и содержит обе половины базы', () {
    final names = dir.listSync().map((e) => e.path.split('/').last).toList();
    expect(names.where((n) => n.endsWith('.ldb')), isNotEmpty,
        reason: 'нет сортированной таблицы — снимите эталон заново: '
            'node flutter/tool/make_leveldb_fixture.mjs');
    expect(names.where((n) => n.endsWith('.log')), isNotEmpty,
        reason: 'нет журнала — половина разбора осталась бы непроверенной');
  });

  test('🔴 прочитаны ВСЕ ключи, которые записывал браузер', () {
    final missing = values.keys.where((k) => !got.containsKey(k)).toList();
    expect(missing, isEmpty,
        reason: 'не найдено ${missing.length} из ${values.length}: $missing');
  });

  test('🔴 значения совпадают байт в байт, включая кириллицу и эмодзи', () {
    values.forEach((k, v) {
      expect(got[k], v as String, reason: 'ключ $k прочитан иначе, чем записан');
    });
  });

  test('🔴 свежие ключи из ЖУРНАЛА не потеряны', () {
    // Эти два записаны последними, вторым запуском браузера, и лежат в `.log`.
    expect(got['psygames_streak_v1'], '9');
    expect(got['psygames_theme'], 'dark');
  });

  test('🔴 крупное значение собрано из нескольких блоков таблицы', () {
    // История партий не помещается в один блок сортированной таблицы: если
    // переход между блоками разобран неверно, строка оборвётся на середине.
    final raw = got['psygames_sessions'];
    expect(raw, isNotNull);
    final list = jsonDecode(raw!) as List;
    expect(list.length, 400);
    expect((list.first as Map)['id'], 's-0');
    expect((list.last as Map)['id'], 's-399');
  });

  test('пустое значение — это пустая строка, а не пропавший ключ', () {
    expect(got.containsKey('psygames_onboarding_picked_nzt48'), isTrue);
    expect(got['psygames_onboarding_picked_nzt48'], '');
  });

  test('балласт прочитан целиком — распаковка блоков не теряет хвосты', () {
    final ballast = (expected['ballast'] as Map).cast<String, dynamic>();
    final count = ballast['count'] as int;
    final length = ballast['length'] as int;
    final found = got.keys.where((k) => k.startsWith('ballast_')).length;
    expect(found, count, reason: 'балластных ключей $found вместо $count');
    expect(got['ballast_0']!.length, length);
    expect(got['ballast_${count - 1}']!.length, length);
  });

  test('чужой origin не отдаёт ничего', () {
    final alien = ChromiumLocalStorage.read(dir, origin: 'http://example.com');
    expect(alien, isEmpty);
  });

  test('каталога нет — пустая карта, а не падение', () {
    final none = ChromiumLocalStorage.read(
      Directory('test/fixtures/there-is-no-such-dir'),
      origin: origin,
    );
    expect(none, isEmpty);
  });
}
