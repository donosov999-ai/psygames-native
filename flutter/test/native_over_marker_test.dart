import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/games/one_line/screen.dart';
import 'package:psygames_flutter/shell/asset_server.dart';
import 'package:psygames_flutter/shell/game_rules.dart';
import 'package:psygames_flutter/shell/hybrid_app.dart';
import 'package:psygames_flutter/shell/level_rules.dart';
import 'package:psygames_flutter/shell/shared_state.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:webview_flutter_platform_interface/webview_flutter_platform_interface.dart' as wv;

import 'hybrid_overlay_route_repro_test.dart' show FakeController, FakeWebViewPlatform, resetHarnessSingletons;

/// 🔴 МЕТКА «ПОВЕРХ СТРАНИЦЫ НАТИВНЫЙ ЭКРАН» — ДЛЯ ЗАСЛОНА ФАНТОМНЫХ ПАРТИЙ (задача 5f9d4ea0).
///
/// Веб-копия игры под нативным экраном стартует сама (SDMT при `wu=1`) и сохранила бы партию,
/// которую человек не играл. Страница отбрасывает такие партии по метке `window.__psyNativeOver`
/// (`frontend/src/services/hostSessions.ts`); ставит её оболочка:
///   · при открытии нативной игры — номер открытия и адрес;
///   · страница перезагрузилась под открытым экраном — метка возвращается вместе с JS хоста;
///   · экран закрыт — метка снимается через 1,5 с ТЕМ ЖЕ номером (веб-копия, размонтируясь на
///     «назад», ещё может сохранить недоигранное), и чужую, более новую метку не трогает.
class _Delegate extends wv.PlatformNavigationDelegate {
  _Delegate(super.params) : super.implementation();
  wv.PageEventCallback? started;
  @override
  Future<void> setOnNavigationRequest(wv.NavigationRequestCallback cb) async {}
  @override
  Future<void> setOnPageStarted(wv.PageEventCallback cb) async => started = cb;
  @override
  Future<void> setOnPageFinished(wv.PageEventCallback cb) async {}
}

class _Platform extends FakeWebViewPlatform {
  final delegates = <_Delegate>[];
  @override
  wv.PlatformNavigationDelegate createPlatformNavigationDelegate(wv.PlatformNavigationDelegateCreationParams p) {
    final d = _Delegate(p);
    delegates.add(d);
    return d;
  }
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  late AssetServer server;
  late SharedState state;
  late _Platform web;

  setUp(() async {
    resetHarnessSingletons();
    SharedPreferences.setMockInitialValues({});
    state = await SharedState.open();
    await GameRules.load();
    await LevelRules.load();
    server = await AssetServer.start();
    web = _Platform();
    wv.WebViewPlatform.instance = web;
  });
  tearDown(() async => server.stop());

  FakeController page() => web.controllers.first;

  testWidgets('🔴 нативная игра открыта — метка стоит; перезагрузка — вернулась; закрыта — снимается тем же номером', (t) async {
    await t.pumpWidget(
      MaterialApp(
        home: HybridApp(state: state, server: server),
      ),
    );
    await t.pump(const Duration(milliseconds: 400));
    page().emit(SharedState.channel, {'op': 'route', 'url': '${server.origin}/games/one-line'});
    for (var i = 0; i < 40 && find.byType(OneLineScreen).evaluate().isEmpty; i++) {
      await t.pump(const Duration(milliseconds: 100));
    }
    expect(find.byType(OneLineScreen), findsOneWidget);
    const mark = 'window.__psyNativeOver="1 /games/one-line";';
    expect(page().js.where((s) => s.contains(mark)), isNotEmpty, reason: 'метка при открытии');

    // Страница перезагрузилась под открытым экраном: JS хоста несёт ту же метку.
    page().js.clear();
    web.delegates.last.started?.call('${server.origin}/games/one-line');
    await t.pump();
    expect(page().js.any((s) => s.contains('window.__psyHostNativeRoutes=') && s.contains(mark)), isTrue);

    // Закрыли — снятие с задержкой и ТЕМ ЖЕ номером; перезагрузка после — уже без метки.
    page().js.clear();
    t.state<NavigatorState>(find.byType(Navigator).first).pop();
    for (var i = 0; i < 10; i++) {
      await t.pump(const Duration(milliseconds: 100));
    }
    expect(find.byType(OneLineScreen), findsNothing);
    final unmark = page().js.where((s) => s.contains('setTimeout') && s.contains('__psyNativeOver')).toList();
    expect(unmark, hasLength(1));
    expect(unmark.single, contains('window.__psyNativeOver===t'));
    expect(unmark.single, contains('("1 /games/one-line")'));
    expect(unmark.single, contains('1500'));
    web.delegates.last.started?.call('${server.origin}/');
    await t.pump();
    expect(page().js.any((s) => s.contains('window.__psyNativeOver=null;')), isTrue);
  });
}
