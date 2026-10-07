import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/shell/asset_server.dart';
import 'package:psygames_flutter/shell/game_pet.dart';
import 'package:psygames_flutter/shell/shared_state.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// 🔴 КАРТИНКА ВЕБА ПО ИСХОДНОМУ ИМЕНИ, БЕЗ ХЕША ЭКСПОРТА.
///
/// 📍 Замер 07.10.2026: питомец в шапке нативной игры просил `/assets/images/pet/cat/idle0.webp`,
/// а во вложенной сборке лежит только `assets/web/assets/assets/images/pet/cat/idle0.<хеш>.webp`.
/// Сервер отвечал 404, в шапке 36 игр стоял пустой кружок. Здесь проверяется:
///   · индекс снимает хеш ровно там, где его ставит экспорт, и больше нигде;
///   · КАЖДЫЙ адрес, который просит питомец шапки (все облики × все виды), — настоящий файл
///     веба: имена берутся из исходников `frontend/assets/images/pet`, а не придумываются;
///   · выбор облика `auto` — это кот, а не каталог `auto`.
void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  test('индекс снимает хеш экспорта и не трогает остальное', () {
    final idx = AssetServer.unhashedIndex([
      'assets/web/assets/assets/images/pet/cat/idle0.d51034e45230a94bc1c9d4952a212b9f.webp',
      'assets/web/assets/assets/images/logos/a.0123456789abcdef0123456789abcdef.png',
      'assets/web/index.html',
      'assets/web/_expo/static/js/web/entry-9bfac3d3cb084b4700feb1e8f4b86560.js', // хеш через «-», не наш
      'assets/game_thumbs/span_group.webp',
    ]);
    expect(idx, {
      'assets/images/pet/cat/idle0.webp':
          'assets/web/assets/assets/images/pet/cat/idle0.d51034e45230a94bc1c9d4952a212b9f.webp',
      'assets/images/logos/a.png': 'assets/web/assets/assets/images/logos/a.0123456789abcdef0123456789abcdef.png',
    });
  });

  test('🔴 каждый адрес питомца шапки — настоящий файл веба', () async {
    // Сборка, как её разложил бы экспорт: исходные имена + хеш.
    final src = Directory('../frontend/assets/images/pet');
    expect(src.existsSync(), isTrue);
    final keys = [
      for (final f in src.listSync(recursive: true).whereType<File>())
        if (f.path.endsWith('.webp'))
          'assets/web/assets/assets/images/pet/${f.path.substring(src.path.length + 1).replaceFirst(RegExp(r'\.webp$'), '.0123456789abcdef0123456789abcdef.webp')}',
    ];
    final idx = AssetServer.unhashedIndex(keys);
    final missing = <String>[];
    for (final skin in ['cat', 'robot', 'constellation']) {
      SharedPreferences.setMockInitialValues({'psygames_pet_skin': skin});
      final s = await SharedState.open();
      for (final url in GamePet.frameUrlsForTest(s)) {
        final rel = Uri.parse(url).path.substring(1);
        if (!idx.containsKey(rel)) missing.add(rel);
      }
    }
    expect(missing, isEmpty, reason: 'питомец шапки просит файлы, которых нет в вебе');
  });

  test('выбор облика auto — кот, как resolvePetSkin веба', () async {
    for (final (v, want) in [('auto', 'cat'), ('robot', 'robot'), ('constellation', 'constellation'), ('мусор', 'cat')]) {
      SharedPreferences.setMockInitialValues({'psygames_pet_skin': v});
      expect(GamePet.skin(await SharedState.open()), want, reason: v);
    }
  });

  test('живой сервер отдаёт картинку питомца по имени без хеша (если веб вложен)', () async {
    // ⚠️ flutter_test глушит сеть заглушкой (ответ 400 на всё) — до сервера запрос бы не дошёл.
    HttpOverrides.global = null;
    final server = await AssetServer.start();
    addTearDown(server.stop);
    if (!await server.has('index.html')) {
      markTestSkipped('веб-часть не вложена (flutter/tools/embed-web.sh) — мерить нечего');
      return;
    }
    final client = HttpClient();
    final res = await (await client.getUrl(Uri.parse('${server.origin}/assets/images/pet/cat/idle0.webp'))).close();
    expect([res.statusCode, res.headers.contentType?.mimeType], [200, 'image/webp']);
    client.close(force: true);
  });
}
