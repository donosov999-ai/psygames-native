import 'dart:io';

import 'package:flutter/widgets.dart' show AppLifecycleState;
import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/shell/asset_server.dart';

/// 🔴 СЕРВЕР КАРТИНОК ВСТАЁТ ЗАНОВО, ЕСЛИ iOS ОТОБРАЛ У НЕГО СОКЕТ.
///
/// 📍 Скриншот Дениса 07.10.2026 (TestFlight 2.56.13): после возврата в приложение на экране
/// питомца текст на месте, а картинок нет ни одной. Apple TN2277: у приостановленного приложения
/// система может забрать слушающий сокет. Симулятор этого не делает, поэтому проба отбирает сокет
/// сама ([AssetServer.debugDropSocket]) и меряет: порт тот же (это origin страницы и её
/// `localStorage`), и ответы снова идут.
void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  Future<int?> code(String origin, String path) async {
    final client = HttpClient()..connectionTimeout = const Duration(seconds: 1);
    try {
      final res = await (await client.getUrl(Uri.parse('$origin$path'))).close();
      await res.drain<void>();
      return res.statusCode;
    } catch (_) {
      return null;
    } finally {
      client.close(force: true);
    }
  }

  late AssetServer server;
  setUp(() async {
    HttpOverrides.global = null; // стучимся по петле в свой же сервер
    server = await AssetServer.start();
  });
  tearDown(() => server.stop());

  test('живой сервер проверку проходит и не пересоздаётся', () async {
    final origin = server.origin;
    expect(await server.ensureAlive(), isTrue);
    expect(server.origin, origin);
    expect(await code(origin, '/__psy_alive'), 204);
  });

  test('🔴 сокет отобран — запросы не проходят; после проверки сервер на том же порту и отвечает', () async {
    final origin = server.origin;
    await server.debugDropSocket();
    await Future<void>.delayed(const Duration(milliseconds: 50));
    expect(await code(origin, '/__psy_alive'), isNull, reason: 'мёртвый порт — как у Дениса после возврата');
    expect(await server.ensureAlive(), isTrue);
    expect(server.origin, origin, reason: 'тот же порт — тот же origin и тот же localStorage');
    expect(await code(origin, '/__psy_alive'), 204);
    // Обычная раздача снова идёт: на нет файла с расширением — честный 404, не тишина.
    expect(await code(origin, '/assets/__нет__.webp'), 404);
  });

  testWidgets('🔴 возврат приложения из фона сам поднимает отобранный сокет', (t) async {
    final origin = server.origin;
    // Всё — в настоящем времени: сокет и его поток живут вне поддельных часов каркаса.
    await t.runAsync(() async {
      server.reviveOnResume();
      for (final s in [AppLifecycleState.inactive, AppLifecycleState.hidden, AppLifecycleState.paused]) {
        t.binding.handleAppLifecycleStateChanged(s);
      }
      await server.debugDropSocket();
      await Future<void>.delayed(const Duration(milliseconds: 50));
      expect(await code(origin, '/__psy_alive'), isNull);
      for (final s in [AppLifecycleState.hidden, AppLifecycleState.inactive, AppLifecycleState.resumed]) {
        t.binding.handleAppLifecycleStateChanged(s);
      }
      for (var i = 0; i < 40 && await code(origin, '/__psy_alive') != 204; i++) {
        await Future<void>.delayed(const Duration(milliseconds: 100));
      }
      expect(await code(origin, '/__psy_alive'), 204, reason: 'после возврата раздача снова отвечает на том же порту');
    });
  });

  test('🔴 приложение включает проверку при старте (main.dart)', () {
    final main = File('lib/main.dart').readAsStringSync();
    final start = main.indexOf('AssetServer.start()');
    expect(start, greaterThan(0));
    expect(main.indexOf('server.reviveOnResume()', start), greaterThan(start));
  });

  test('🔴 сокет отобран молча (сервер не заметил) — проверка стучится к себе и всё равно поднимает', () async {
    final origin = server.origin;
    await server.debugDropSocket(silent: true);
    expect(await code(origin, '/__psy_alive'), isNull);
    expect(await server.ensureAlive(), isTrue);
    expect(await code(origin, '/__psy_alive'), 204);
  });

  test('отобран дважды подряд — встаёт оба раза', () async {
    for (var i = 0; i < 2; i++) {
      await server.debugDropSocket();
      await Future<void>.delayed(const Duration(milliseconds: 50));
      expect(await server.ensureAlive(), isTrue, reason: 'круг $i');
      expect(await code(server.origin, '/__psy_alive'), 204, reason: 'круг $i');
    }
  });
}
