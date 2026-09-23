import 'package:flutter/material.dart';
import 'package:webview_flutter/webview_flutter.dart';

import '../games/digit_span/screen.dart';
import '../games/flanker/screen.dart';
import '../games/simon/screen.dart';
import '../games/dots_connect/screen.dart';
import '../games/memory_matrix/screen.dart';
import '../games/mental_rotation/screen.dart';
import '../games/spatial_hub/screen.dart';
import '../games/spatial_lab/screen.dart';
import '../games/spatial_span/screen.dart';
import '../games/one_line/screen.dart';
import '../games/stroop/screen.dart';
import 'asset_server.dart';
import 'shared_state.dart';
import 'tap_latency.dart';

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
        '/games/stroop': (s) => StroopScreen(state: s),
        '/games/flanker': (s) => FlankerScreen(state: s),
        '/games/simon': (s) => SimonScreen(state: s),
        '/games/mental-rotation': (s) => MentalRotationScreen(state: s),
        '/games/spatial-span': (s) => SpatialSpanScreen(state: s),
        // Все четыре упражнения лаборатории перенесены, поэтому перехват честен: адрес с
        // `?mode=` попадает в ту же строку карты, и ни один режим не остаётся в вебе.
        '/games/spatial-lab': (s) => SpatialLabScreen(state: s),
        '/games/spatial-hub': (s) => SpatialHubScreen(state: s),
      };

  /// ЗАМЕР: открыть ту же игру в НЫНЕШНЕЙ версии на том же устройстве.
  ///
  /// Перехват выключается флагом сборки, и приложение целиком остаётся веб-версией:
  ///   flutter run --dart-define=WEB_ONLY=true
  /// Без этого сравнить отклик двух версий на одном экране невозможно: перенесённая
  /// игра всегда открывается нативно, а замер на РАЗНЫХ играх сравнивал бы разное.
  static const bool webOnly = bool.fromEnvironment('WEB_ONLY');

  /// ЗАМЕР И ПРОВЕРКА РУКАМИ: открыть приложение сразу на нужном маршруте.
  ///
  /// Пустая строка — обычный запуск с главной. Иначе, например:
  ///   flutter run --dart-define=START_ROUTE=/games/stroop
  /// Нужно для замера отклика: обе версии открываются на ОДНОМ экране, без
  /// прохода по меню, который сам по себе ничего не проверяет.
  static const String startRoute = String.fromEnvironment('START_ROUTE');

  /// 🔴 ОТКРЫТЬ ЛЮБОЙ МАРШРУТ ПРИЛОЖЕНИЯ ИЗ НАТИВНОГО ЭКРАНА (добавлено 23.09.2026 разделом
  /// «Пространство» ради развилок). Перенесённый маршрут открывается нативно, НЕ перенесённый —
  /// в WebView, как и раньше.
  ///
  /// ⚠️ ЗАЧЕМ ЭТО ПОНАДОБИЛОСЬ. Развилка — это меню, и половина её карточек ведёт в игры, которые
  /// ещё в вебе: у «Пространства» перенесено пять карточек из девяти. Нативная развилка без
  /// такого хода была бы тупиком — человек нажал бы «Клоцки» и не попал никуда. Правок
  /// `game_shell.dart` при этом НОЛЬ: счёт каркаса держится, тронут только хост гибрида.
  static void Function(String route)? open;

  /// Путь маршрута из любого вида ссылки: и `…/games/one-line.html`, и
  /// `file:///…/games/one-line`, и с якорем или запросом.
  static String? routeOf(String url) {
    if (webOnly) return null;
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
  final _marks = WebMarkTimer();

  @override
  void initState() {
    super.initState();
    _c = WebViewController()
      ..setJavaScriptMode(JavaScriptMode.unrestricted)
      ..addJavaScriptChannel(
        SharedState.channel,
        onMessageReceived: (m) => widget.state.applyFromWeb(m.message),
      )
      ..addJavaScriptChannel(latencyChannel, onMessageReceived: (m) {
        final line = _marks.onMark(m.message);
        // ignore: avoid_print — прибор нарочно пишет в журнал устройства
        if (line != null) print(line);
      })
      ..setOnConsoleMessage((m) {
        // Замеры страницы (ПОКАЗ/ОТКЛИК) уходят в журнал устройства вместе со строками Flutter.
        if (tapLatencyProbe && (m.message.startsWith('ОТКЛИК') || m.message.startsWith('ПОКАЗ'))) {
          // ignore: avoid_print — прибор нарочно пишет в журнал устройства
          print(m.message);
        }
      })
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
          if (tapLatencyProbe) {
            _c.runJavaScript(webTapLatencyJs('Веб/страница'));
            _c.runJavaScript(webStimulusMarkJs());
          }
          if (mounted) setState(() => _loading = false);
        },
      ))
      // 🔴 КОРЕНЬ, А НЕ /index.html. Замер 23.09.2026: по адресу `/index.html`
      // приложение грузится целиком (связка на 29,7 МБ доезжает), но
      // маршрутизатор такого маршрута не знает и показывает «страница не
      // найдена» — в журнале это видно по запросу unmatched.png. Корень он
      // разбирает как главную.
      ..loadRequest(Uri.parse('${widget.server.origin}${HybridApp.startRoute}'));
    HybridApp.open = _open;
    // Перенесённая игра по START_ROUTE: перехват на первой загрузке не срабатывает
    // (это не переход, а первый адрес), поэтому открываем нативный экран сами.
    final first = HybridApp.routeOf('${widget.server.origin}${HybridApp.startRoute}');
    if (first != null) {
      WidgetsBinding.instance.addPostFrameCallback((_) => _openNative(first));
    }
  }

  @override
  void dispose() {
    // Хук снимается вместе с хостом: оставленный, он звал бы мёртвый WebView.
    if (HybridApp.open == _open) HybridApp.open = null;
    super.dispose();
  }

  /// Маршрут из нативного экрана: перенесённый — нативно, остальной — страницей в WebView.
  Future<void> _open(String route) async {
    final native = HybridApp.routeOf('${widget.server.origin}$route');
    if (native != null) {
      await _openNative(native);
      return;
    }
    if (!mounted) return;
    // Возвращаемся к странице и уводим её на нужный адрес: нативные экраны поверх WebView
    // закрываются, иначе человек остался бы смотреть на развилку, под которой уже другая игра.
    Navigator.of(context).popUntil((r) => r.isFirst);
    await _c.loadRequest(Uri.parse('${widget.server.origin}$route'));
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
