import 'package:flutter/material.dart';
import 'package:webview_flutter/webview_flutter.dart';

import '../games/digit_span/screen.dart';
import '../games/dots_connect/screen.dart';
import '../games/memory_matrix/screen.dart';
import '../games/one_line/screen.dart';
import '../games/mahjong/screen.dart';
import '../games/math_slider/screen.dart';
import '../games/schulte/screen.dart';
import 'asset_server.dart';
import 'shared_state.dart';

/// ГИБРИД: снаружи Flutter, внутри — НЫНЕШНЕЕ ПРИЛОЖЕНИЕ ЦЕЛИКОМ.
///
/// 🔴 ПОЧЕМУ НЕ СВОЙ СПИСОК ИГР. Первый вариант пилота рисовал собственное меню
/// из перенесённых игр. Для замеров этого хватало, но продукту не годится: у
/// человека пропали бы главная, каталог, питомец, зарядки, статистика — всё, что
/// ещё не перенесено. Поэтому корень — веб-сборка как есть, а Flutter
/// ПЕРЕХВАТЫВАЕТ переход на перенесённые игры и показывает нативный экран.
/// Так переезд идёт по одной игре, и на каждом шаге приложение целое.
///
/// Прогресс общий: [SharedState] вливает снимок в страницу до её кода и ловит
/// каждую запись обратно.
class HybridApp extends StatefulWidget {
  const HybridApp({super.key, required this.state, required this.server});

  final SharedState state;

  /// Раздача вложенной веб-сборки — внутри приложения, см. [AssetServer].
  final AssetServer server;

  /// Игра перенесена → строится нативно. Ключ — путь маршрута веб-сборки.
  static Map<String, Widget Function(SharedState)> get native => {
        '/games/dots-connect': (s) => DotsConnectScreen(state: s),
        '/games/one-line': (s) => OneLineScreen(state: s),
        '/games/digit-span': (s) => DigitSpanScreen(state: s),
        '/games/memory-matrix': (s) => MemoryMatrixScreen(state: s),
        '/games/schulte': (s) => SchulteScreen(state: s),
        '/games/mahjong': (s) => MahjongScreen(state: s),
        '/games/math-slider': (s) => MathSliderScreen(state: s),
      };

  /// Путь маршрута из любого вида ссылки: и `…/games/one-line.html`, и
  /// `file:///…/games/one-line`, и с якорем или запросом.
  static String? routeOf(String url) {
    var u = url.split('#').first.split('?').first;
    if (u.endsWith('.html')) u = u.substring(0, u.length - 5);
    final i = u.indexOf('/games/');
    if (i < 0) return null;
    final r = u.substring(i);
    return native.containsKey(r) ? r : null;
  }

  @override
  State<HybridApp> createState() => _HybridAppState();
}

class _HybridAppState extends State<HybridApp> {
  late final WebViewController _c;
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    _c = WebViewController()
      ..setJavaScriptMode(JavaScriptMode.unrestricted)
      ..addJavaScriptChannel(
        SharedState.channel,
        onMessageReceived: (m) => widget.state.applyFromWeb(m.message),
      )
      ..setNavigationDelegate(NavigationDelegate(
        onNavigationRequest: (req) {
          final route = HybridApp.routeOf(req.url);
          if (route == null) return NavigationDecision.navigate;
          // 🔴 ПЕРЕХВАТ. Веб-версию перенесённой игры не открываем никогда:
          // иначе человек увидел бы старый экран там, где уже есть новый, и
          // прогресс писался бы дважды разными путями.
          _openNative(route);
          return NavigationDecision.prevent;
        },
        onPageStarted: (_) => _c.runJavaScript(widget.state.bootstrapJs()),
        onPageFinished: (_) {
          _c.runJavaScript(widget.state.bootstrapJs());
          if (mounted) setState(() => _loading = false);
        },
      ))
      // 🔴 КОРЕНЬ, А НЕ /index.html. Замер 23.09.2026: по адресу `/index.html`
      // приложение грузится целиком (связка на 29,7 МБ доезжает), но
      // маршрутизатор такого маршрута не знает и показывает «страница не
      // найдена» — в журнале это видно по запросу unmatched.png. Корень он
      // разбирает как главную.
      ..loadRequest(Uri.parse('${widget.server.origin}/'));
  }

  Future<void> _openNative(String route) async {
    final build = HybridApp.native[route];
    if (build == null) return;
    await Navigator.of(context).push(
      MaterialPageRoute(builder: (_) => build(widget.state)),
    );
    // Вернулись из нативной игры — страница обязана перечитать прогресс,
    // иначе на карте уровней останется старое число.
    if (mounted) await _c.runJavaScript(widget.state.bootstrapJs());
  }

  @override
  Widget build(BuildContext context) => Scaffold(
        body: SafeArea(
          child: Stack(
            children: [
              WebViewWidget(controller: _c),
              if (_loading) const Center(child: CircularProgressIndicator()),
            ],
          ),
        ),
      );
}
