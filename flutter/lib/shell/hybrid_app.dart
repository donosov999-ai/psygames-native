import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:webview_flutter/webview_flutter.dart';

import '../games/digit_span/screen.dart';
import '../games/choice_rt/screen.dart';
import '../games/flanker/screen.dart';
import '../games/gonogo/screen.dart';
import '../games/inhibition/screen.dart';
import '../games/posner/screen.dart';
import '../games/simon/screen.dart';
import '../games/stop_signal/screen.dart';
import '../games/stroop_emotional/screen.dart';
import '../games/switching_task/screen.dart';
import '../games/targets/screen.dart';
import '../games/dots_connect/screen.dart';
import '../games/memory_matrix/screen.dart';
import '../games/stroop/screen.dart';
import '../games/one_line/screen.dart';
import '../games/deep/screen.dart';
import '../games/fractal/screen.dart';
import '../games/goods_sort/screen.dart';
import '../games/sort_tubes/board.dart' show TubeSkin;
import '../games/cake_sort/board.dart' show CakeSkin;
import '../games/cake_sort/screen.dart';
import '../games/hanoi/screen.dart';
import '../games/tower_london/screen.dart';
import '../games/sort_tubes/screen.dart';
import '../games/mental_rotation/screen.dart';
import '../games/samurai/screen.dart';
import '../games/spatial_hub/screen.dart';
import '../games/spatial_lab/screen.dart';
import '../games/spatial_span/screen.dart';
import '../games/sudoku/modes.dart';
import '../games/cats/screen.dart';
import '../games/sudoku/screen.dart';
import '../games/mahjong/screen.dart';
import '../games/math_slider/screen.dart';
import '../games/math_sprint/screen.dart';
import '../games/number_bonds/screen.dart';
import '../games/ospan/screen.dart';
import '../games/object_tracker/screen.dart';
import '../games/pattern/screen.dart';
import '../games/quick_count/screen.dart';
import '../games/schulte/screen.dart';
import 'asset_server.dart';
import 'l10n.dart';
import '../games/sorting_hub/screen.dart';
import 'hub_screen.dart';
import 'game_pet.dart';
import 'session_report.dart';
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
        '/games/schulte': (s) => SchulteScreen(state: s),
        '/games/mahjong': (s) => MahjongScreen(state: s),
        '/games/math-slider': (s) => MathSliderScreen(state: s),
        '/games/object-tracker': (s) => ObjectTrackerScreen(state: s),
        '/games/quick-count': (s) => QuickCountScreen(state: s),
        '/games/pattern': (s) => PatternScreen(state: s),
        '/games/math-sprint': (s) => MathSprintScreen(state: s),
        '/games/number-bonds': (s) => NumberBondsScreen(state: s),
        '/games/ospan': (s) => OspanScreen(state: s),
        '/games/stroop': (s) => StroopScreen(state: s),
        '/games/flanker': (s) => FlankerScreen(state: s),
        '/games/simon': (s) => SimonScreen(state: s),
        '/games/sudoku': (s) => SudokuScreen(state: s),
        // Режимы той же доски: адрес отличается только хвостом, экран — тот же.
        '/games/sudoku?mode=towers': (s) => SudokuScreen(state: s, mode: SideMode.towers),
        '/games/sudoku?mode=unequal': (s) => SudokuScreen(state: s, mode: SideMode.unequal),
        // «Кошки» (Queens / Star Battle) — первая игра, рождённая сразу нативной:
        // веб-страницы у неё нет вовсе, поэтому перехват не «отнимает» веб-версию,
        // а является единственным входом. Карточку в развилку кладёт координатор.
        '/games/cats': (s) => CatsScreen(state: s),
        // Развилки раздела — на ОБЩЕМ экране каркаса: карточки уже лежат в
        // `assets/hubs.json`, вторая копия начала бы отставать молча.
        '/games/sudoku-hub': (s) => HubScreen(
              state: s,
              hubRoute: '/games/sudoku-hub',
              icon: Icons.apps,
              gradient: const [Color(0xFF3B2F7A), Color(0xFF5B4D9E)],
              isNative: native.containsKey,
            ),
        '/games/puzzles-hub': (s) => HubScreen(
              state: s,
              hubRoute: '/games/puzzles-hub',
              icon: Icons.extension,
              gradient: const [Color(0xFF0F766E), Color(0xFFF59E0B)],
              isNative: native.containsKey,
            ),
        '/games/sudoku-samurai': (s) => SamuraiScreen(state: s),
        '/games/sudoku-fractal': (s) => FractalScreen(state: s),
        '/games/sudoku-fractal-deep': (s) => DeepScreen(state: s),
        '/games/go-no-go': (s) => GoNoGoScreen(state: s),
        '/games/mental-rotation': (s) => MentalRotationScreen(state: s),
        '/games/spatial-span': (s) => SpatialSpanScreen(state: s),
        // Все четыре упражнения лаборатории перенесены, поэтому перехват честен: адрес с
        // `?mode=` попадает в ту же строку карты, и ни один режим не остаётся в вебе.
        '/games/spatial-lab': (s) => SpatialLabScreen(state: s),
        '/games/spatial-hub': (s) => SpatialHubScreen(state: s),
        '/games/goods-sort': (s) => GoodsSortScreen(state: s),
      '/games/water-sort': (s) => SortTubesScreen(
            state: s, gameId: 'water_sort', title: 'Пробирки', skin: TubeSkin.water),
      '/games/ball-sort': (s) => SortTubesScreen(
            state: s, gameId: 'ball_sort', title: 'Сортировка шариков', skin: TubeSkin.balls),
      '/games/nut-sort': (s) => SortTubesScreen(
            state: s, gameId: 'nut_sort', title: 'Сортировка гаек', skin: TubeSkin.nuts),
      '/games/cake-sort': (s) => CakeSortScreen(
            state: s, gameId: 'cake_sort', title: 'Торты', skin: CakeSkin.cake),
      '/games/pizza-sort': (s) => CakeSortScreen(
            state: s, gameId: 'pizza_sort', title: 'Пицца', skin: CakeSkin.pizza),
      '/games/hanoi': (s) => HanoiScreen(state: s),
      '/games/tower-london': (s) => TowerLondonScreen(state: s),
        /*
         * 🔴 РАЗВИЛКА ТОЖЕ ПЕРЕХВАТЫВАЕТСЯ. Она ведёт на восемь игр, из которых
         * все восемь уже нативные: оставь её в вебе — и каждый заход в игру шёл
         * бы через веб-страницу, которую мы всё равно перехватим кадром позже.
         * Какую игру чем открыть, решает оболочка (см. `_openNative`), а не хаб.
         */
        '/games/sorting-hub': (s) =>
            SortingHubScreen(state: s, isNative: native.containsKey),
        '/games/choice-rt': (s) => ChoiceRtScreen(state: s),
        '/games/stop-signal': (s) => StopSignalScreen(state: s),
        '/games/posner': (s) => PosnerScreen(state: s),
        '/games/stroop-emotional': (s) => EmoStroopScreen(state: s),
        '/games/switching-task': (s) => SwitchingTaskScreen(state: s),
        '/games/targets': (s) => TargetsScreen(state: s),
        '/games/inhibition': (s) => InhibitionScreen(state: s),
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
    final noHash = url.split('#').first;
    final qi = noHash.indexOf('?');
    final query = qi < 0 ? '' : noHash.substring(qi);
    var u = qi < 0 ? noHash : noHash.substring(0, qi);
    if (u.endsWith('.html')) u = u.substring(0, u.length - 5);
    final i = u.indexOf('/games/');
    if (i < 0) return null;
    final r = u.substring(i);
    /*
     * 🔴 СНАЧАЛА ИЩЕМ АДРЕС ВМЕСТЕ С ХВОСТОМ, И ТОЛЬКО ПОТОМ БЕЗ НЕГО.
     *
     * Часть игр — это РЕЖИМЫ одного экрана, и отличает их только хвост:
     * `/games/sudoku?mode=towers` — «Небоскрёбы», `?mode=unequal` — «Неравенства»,
     * у каждого своя мини-лестница и свой счётчик. Прежний разбор срезал хвост до
     * поиска, поэтому обе карточки развилки открывали бы ОБЫЧНУЮ судоку: человек
     * жмёт «Небоскрёбы» и получает не ту игру. Игры без режимов это не задевает —
     * для них ключа с хвостом в карте просто нет, и ответ прежний.
     */
    if (query.isNotEmpty && native.containsKey('$r$query')) return '$r$query';
    return native.containsKey(r) ? r : null;
  }

  @override
  State<HybridApp> createState() => _HybridAppState();
}

class _HybridAppState extends State<HybridApp> {
  late final WebViewController _c;
  bool _loading = true;

  /// Какой нативный экран сейчас открыт поверх страницы.
  ///
  /// ⚠️ Нужен из-за того, что перехват теперь идёт по СМЕНЕ АДРЕСА: страница
  /// может сообщить об одном и том же маршруте дважды (`replaceState` после
  /// `pushState` — обычное дело у роутера), и без этого поля поверх экрана
  /// открылся бы его же двойник.
  String? _openedRoute;
  final _marks = WebMarkTimer();

  /// Сообщение от веб-половины. Кроме записи в общую память здесь одно особое
  /// действие: смена ЯЗЫКА должна доехать до нативных экранов сразу.
  ///
  /// ⚠️ Иначе получается тихое расхождение: человек переключил язык в настройках
  /// (они пока в вебе), веб-половина заговорила по-новому, а перенесённые экраны
  /// остались на старом словаре до перезапуска приложения — и это читается как
  /// «перевод сломан», хотя перевод на месте.
  Future<void> _fromWeb(String message) async {
    // 🔴 СМЕНА МАРШРУТА ВНУТРИ СТРАНИЦЫ — ЕДИНСТВЕННЫЙ РАБОЧИЙ ПЕРЕХВАТ.
    //
    // `onNavigationRequest` ниже ловит только настоящую загрузку документа, а
    // приложение ходит по экранам через History API, и WebView о таком переходе
    // не сообщает. Замер раздела «Зарядки» 23.09.2026 на симуляторе: перенесённые
    // экраны открывались ВЕБ-версиями, то есть перехват не работал ни разу.
    // Делегат оставлен: он нужен для внешних ссылок и первой загрузки.
    try {
      final m = jsonDecode(message);
      if (m is Map && m['op'] == 'route') {
        final route = HybridApp.routeOf('${m['url']}');
        if (route != null && route != _openedRoute) _openNative(route);
        return;
      }
    } catch (_) {
      // не наше сообщение — ниже разберёт общая память
    }
    final was = L.locale;
    await widget.state.applyFromWeb(message);
    final now = L.resolve(widget.state.language);
    if (now != was) {
      await L.load(now);
      if (mounted) setState(() {});
    }
  }

  @override
  void initState() {
    super.initState();
    // 🔴 ПРИЁМНИК ПАРТИЙ. Перенесённая игра не хранит партию сама — она отдаёт
    // результат сюда, а здесь он уходит в ТУ ЖЕ `saveSession` веб-половины,
    // которую зовёт непереносённая игра. Одна реализация на обе половины:
    // вторая разошлась бы с первой молча (см. SessionReport).
    //
    // ⚠️ Страница может быть ещё не готова — например, человек открыл нативный
    // экран сразу со старта. Веб-сторона на этот случай копит отчёты в очередь
    // и разбирает её, когда регистрирует приёмник; здесь просто отдаём.
    // Питомец в шапке нативных игр берёт кадры из вложенной веб-сборки —
    // они там уже лежат, класть их второй раз в ассеты Flutter значило бы
    // 4,2 МБ впустую.
    PetHost.state = widget.state;
    PetHost.origin = widget.server.origin;
    SessionReport.sink = (json) async {
      await _c.runJavaScript('window.__psySaveSession && window.__psySaveSession($json);');
    };
    _c = WebViewController()
      ..setJavaScriptMode(JavaScriptMode.unrestricted)
      ..addJavaScriptChannel(
        SharedState.channel,
        onMessageReceived: (m) => _fromWeb(m.message),
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
    SessionReport.sink = null;
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
    _openedRoute = route;
    final result = await Navigator.of(context).push(
      MaterialPageRoute(builder: (_) => build(widget.state)),
    );
    _openedRoute = null;
    // 🔴 СТРАНИЦА ПОД НАМИ ОСТАЛАСЬ НА АДРЕСЕ ИГРЫ. Перехват срабатывает ПОСЛЕ
    // того, как роутер уже сменил адрес, — значит под нативным экраном веб-половина
    // стоит на той же игре. Не вернуть её назад — человек, закрыв нативный экран,
    // увидит веб-версию той же игры, то есть ровно то, что перехват и должен был
    // предотвратить.
    // ⚠️ Возврат делаем ТОЛЬКО если адрес всё ещё игровой: пока человек играл,
    // страница могла уехать сама (например, зарядка перевела шаг).
    if (mounted) {
      await _c.runJavaScript(
        "if (String(location.pathname).indexOf('$route') >= 0) history.back();",
      );
    }
    // Вернулись из нативной игры — страница обязана перечитать прогресс,
    // иначе на карте уровней останется старое число.
    if (mounted) await _c.runJavaScript(widget.state.bootstrapJs());
    /*
     * 🔴 РАЗВИЛКА ВЕРНУЛА ВЫБРАННЫЙ МАРШРУТ. Перенесённую игру открываем
     * нативно, остальные — в веб-половине: хаб про это ничего не знает и знать
     * не должен, иначе он станет второй оболочкой.
     */
    if (!mounted || result is! HubCardTap) return;
    final next = result.route;
    if (HybridApp.native.containsKey(next)) {
      await _openNative(next);
    } else {
      await _c.loadRequest(Uri.parse('${widget.server.origin}$next'));
    }
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
