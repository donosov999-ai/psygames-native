import 'dart:async';
import 'dart:io';

import 'package:flutter/foundation.dart' show debugPrint, kDebugMode, visibleForTesting;
import 'package:flutter/services.dart' show AssetManifest, rootBundle;
import 'package:flutter/widgets.dart' show AppLifecycleListener;

/// Раздаёт вложенную в приложение веб-сборку по http://127.0.0.1 — ВНУТРИ самого
/// приложения, без сети и без чужих серверов.
///
/// 🔴 ПОЧЕМУ НЕ file://, ХОТЯ ЭТО ПРОЩЕ. Замер 23.09.2026: гибрид с
/// `loadFlutterAsset` поднялся, ошибок в журнале не дал — и не записал НИ ОДНОГО
/// ключа через мост, то есть веб-часть не ожила. Из `file://` у страницы нет
/// настоящего источника: `localStorage` в WKWebView там запрещён, а на нём
/// держится весь прогресс приложения. Локальный адрес даёт источник, и всё
/// поведение становится таким же, как в нынешней версии.
///
/// ⚠️ Порт берём нулевой — систему просим выдать свободный. Фиксированный порт
/// однажды окажется занят чужой программой, и приложение встретит человека
/// белым экраном.
class AssetServer {
  AssetServer._(this._server, this.port);

  /*
   * 🔴 iOS ОТБИРАЕТ СЛУШАЮЩИЙ СОКЕТ У ПРИЛОЖЕНИЯ В ФОНЕ — СЕРВЕР ОБЯЗАН ПОДНИМАТЬСЯ ЗАНОВО.
   *
   * 📍 Скриншоты Дениса 07.10.2026, TestFlight 2.56.13. В 2:52 вкладка «Игры» с картинками; затем
   * переход в другое приложение (отправить скриншот); в 2:54 на экране питомца весь текст на месте,
   * а картинок нет ни одной: ни кота, ни трёх обликов. Apple TN2277 «Networking and Multitasking»:
   * у приостановленного приложения система может забрать ресурсы слушающего сокета, и после
   * возврата он «мёртв» — соединения к нему не проходят. Страница уже загружена и живёт, текст
   * рисует; а каждая НОВАЯ картинка (раздача `no-store`) идёт в мёртвый порт и остаётся пустой.
   * ⚠️ Симулятор так не делает (замер 07.10: в фоне порт молчит, после возврата снова 200) — на
   * нём дефект не воспроизводится, поэтому проба `asset_server_revive_test.dart` отбирает сокет сама.
   *
   * Поэтому при каждом возврате приложения ([reviveOnResume]) сервер проверяет себя запросом к
   * себе же и, если не ответил, встаёт заново на ТОМ ЖЕ порту: порт — это origin страницы, а на
   * origin у WebKit заведён `localStorage`.
   */
  HttpServer _server;
  final int port;
  bool _alive = true;

  String get origin => 'http://127.0.0.1:$port';

  /// ИМЯ БЕЗ ХЕША → ФАЙЛ СБОРКИ (`assets/images/pet/cat/idle0.webp` →
  /// `assets/web/assets/assets/images/pet/cat/idle0.<хеш>.webp`).
  ///
  /// 📍 Замер 07.10.2026 по вложенной сборке: питомец в шапке нативной игры (`game_pet.dart`)
  /// с 23.09 просил `/assets/images/pet/<облик>/<вид>0.webp`, а такого файла нет — экспорт веба
  /// кладёт картинки под хешированными именами. Сервер честно отвечал 404, `errorBuilder`
  /// рисовал пустоту, и в шапке 36 перенесённых игр стоял пустой кружок. Нативу нужен способ
  /// назвать картинку веба по её исходному пути — вот он: при промахе файл ищется по имени
  /// без хеша. Хеш — 32 шестнадцатеричных знака перед расширением, как пишет экспорт Expo.
  static Map<String, String> unhashedIndex(Iterable<String> keys) {
    final re = RegExp(r'^' + RegExp.escape('$_root/assets/') + r'(.+)\.[0-9a-f]{32}\.(\w+)$');
    return {
      for (final k in keys)
        if (re.firstMatch(k) case final m?) '${m.group(1)}.${m.group(2)}': k,
    };
  }

  Map<String, String>? _unhashed;
  Future<String?> _byUnhashed(String rel) async {
    try {
      _unhashed ??= unhashedIndex((await AssetManifest.loadFromAssetBundle(rootBundle)).listAssets());
    } catch (_) {
      _unhashed = const {};
    }
    return _unhashed![rel];
  }

  static const _root = 'assets/web';

  static Future<AssetServer> start() async {
    /*
     * 🔴 ПОРТ ПОСТОЯННЫЙ, А НЕ СЛУЧАЙНЫЙ. Origin страницы — это `http://127.0.0.1:<порт>`,
     * и корзина `localStorage` у WebKit заводится НА ORIGIN. Случайный порт означал
     * бы новую пустую корзину при каждом запуске: прогресс держится только мостом в
     * общую память, и любой его пробел становится потерей. Занят — берём следующий из
     * списка, и только когда заняты все, отдаём выбор системе.
     */
    HttpServer? bound;
    for (final p in const [47355, 47356, 47357, 47358]) {
      try {
        bound = await HttpServer.bind(InternetAddress.loopbackIPv4, p);
        break;
      } on SocketException {
        continue;
      }
    }
    final server = bound ?? await HttpServer.bind(InternetAddress.loopbackIPv4, 0);
    final self = AssetServer._(server, server.port);
    unawaited(self._serve());
    return self;
  }

  Future<void> _serve() async {
    final server = _server;
    try {
      await for (final req in server) {
        try {
          await _answer(req);
        } catch (_) {
          req.response.statusCode = HttpStatus.internalServerError;
          await req.response.close();
        }
      }
    } catch (_) {
      // Поток сокета оборвался ошибкой — сокет отобран; ниже он помечается мёртвым.
    }
    if (identical(server, _server)) _alive = false;
  }

  /// Отвечает ли сервер сам себе. Любой ответ — жив; отказ соединения или молчание — мёртв.
  Future<bool> _answers() async {
    final client = HttpClient()..connectionTimeout = const Duration(seconds: 1);
    try {
      final req = await client.getUrl(Uri.parse('$origin$_probe')).timeout(const Duration(seconds: 2));
      final res = await req.close().timeout(const Duration(seconds: 2));
      await res.drain<void>();
      return true;
    } catch (_) {
      return false;
    } finally {
      client.close(force: true);
    }
  }

  static const _probe = '/__psy_alive';

  /// Сервер жив — `true` сразу. Мёртв — встать заново на том же порту (до 5 попыток).
  /// Возвращает, отвечает ли сервер после проверки.
  Future<bool> ensureAlive() async {
    if (_alive && await _answers()) return true;
    try {
      await _server.close(force: true);
    } catch (_) {}
    for (var i = 0; i < 5; i++) {
      try {
        _server = await HttpServer.bind(InternetAddress.loopbackIPv4, port);
        _alive = true;
        unawaited(_serve());
        if (kDebugMode) debugPrint('[asset-server] socket re-bound on port $port');
        return true;
      } on SocketException {
        await Future<void>.delayed(const Duration(milliseconds: 200));
      }
    }
    return false;
  }

  AppLifecycleListener? _lifecycle;

  /// Проверять себя при каждом возврате приложения из фона (см. шапку класса).
  void reviveOnResume() {
    _lifecycle ??= AppLifecycleListener(onResume: () => unawaited(ensureAlive()));
  }

  /// Пробам: сокет отобран, как iOS делает у приложения в фоне. [silent] — сервер об этом не узнал
  /// (поток сокета не закрылся): тогда отличить живой от мёртвого может только запрос к себе.
  @visibleForTesting
  Future<void> debugDropSocket({bool silent = false}) async {
    await _server.close(force: true);
    await Future<void>.delayed(const Duration(milliseconds: 20));
    if (silent) _alive = true;
  }

  Future<void> _answer(HttpRequest req) async {
    var path = Uri.decodeComponent(req.uri.path);
    if (path == _probe) {
      req.response.statusCode = HttpStatus.noContent;
      await req.response.close();
      return;
    }
    if (path.endsWith('/')) path += 'index.html';
    if (path == '/index.html' || path.isEmpty) path = '/index.html';

    var key = '$_root$path';
    var data = await _read(key);

    // Маршруты без расширения — это страницы: /games/one-line → games/one-line.html.
    final file = path.split('/').last.contains('.');
    // Файл веба по исходному имени, без хеша экспорта (см. [unhashedIndex]).
    if (data == null && file) {
      final hashed = await _byUnhashed(path.substring(1));
      if (hashed != null) {
        data = await _read(hashed);
        if (data != null) key = hashed;
      }
    }
    if (data == null && !file) {
      data = await _read('$key.html');
      if (data != null) key = '$key.html';
    }
    /*
     * 🔴 ПОДМЕНА ФАЙЛА ГЛАВНОЙ СТРАНИЦЕЙ — ЭТО МОЛЧАЛИВАЯ ПРОПАЖА КАРТИНКИ.
     *
     * 📍 Отчёт Дениса 24.09.2026 (71a0c36e): «верхний тулбар пострадал у всех
     * профилей, картинки пропали — логотипы, и плюс питомец в верхнем правом
     * углу тоже». В отчёте НОЛЬ ошибок в журнале и ноль кодов 404 — потому что
     * на запрос `.webp` уходила главная страница с кодом 200. Браузер её не
     * декодирует, картинка остаётся пустой, и никто ничего не узнаёт.
     *
     * Запас «отдадим главную» нужен только АДРЕСАМ одностраничного приложения
     * (/games/one-line). У запроса с расширением честный ответ один — 404: он
     * попадает в журнал страницы, и пропажа перестаёт быть тихой.
     */
    if (data == null && !file) {
      data = await _read('$_root/index.html');
      key = '$_root/index.html';
    }
    if (data == null) {
      req.response.statusCode = HttpStatus.notFound;
      await req.response.close();
      return;
    }

    if (kDebugMode) debugPrint('[раздача] ${req.uri.path} → $key (${data.length} б)');
    req.response.headers.contentType = _type(key);
    req.response.headers.set('Cache-Control', 'no-store');
    req.response.add(data);
    await req.response.close();
  }

  /// Есть ли файл во ВЛОЖЕННОЙ сборке (а не на диске): пробам нужно знать, что
  /// мерить, а лежащий рядом файл, не перечисленный в pubspec, приложению не виден.
  Future<bool> has(String rel) async => await _read('$_root/$rel') != null;

  /// ОТПЕЧАТОК ВЛОЖЕННОЙ СБОРКИ — имя связки из `index.html`.
  ///
  /// 🔴 Имена файлов веб-сборки хешированы: новая сборка — новые имена. Если
  /// WebView оставил у себя СТАРУЮ страницу, она будет просить файлы, которых
  /// в новой сборке уже нет, — и каждая такая картинка станет пустым местом.
  /// Отпечаток нужен, чтобы заметить смену сборки и сбросить кэш ОДИН раз, а не
  /// на каждом запуске (сброс на каждом стоит лишней загрузки 30 МБ).
  Future<String> fingerprint() async {
    final data = await _read('$_root/index.html');
    if (data == null) return '';
    final html = String.fromCharCodes(data);
    final m = RegExp(r'entry-([a-f0-9]{8,})\.js').firstMatch(html);
    return m?.group(1) ?? '${data.length}';
  }

  Future<List<int>?> _read(String key) async {
    try {
      final d = await rootBundle.load(key);
      return d.buffer.asUint8List(d.offsetInBytes, d.lengthInBytes);
    } catch (_) {
      return null;
    }
  }

  static ContentType _type(String key) {
    final ext = key.contains('.') ? key.split('.').last.toLowerCase() : '';
    switch (ext) {
      case 'html':
        return ContentType.html;
      case 'js':
        return ContentType('application', 'javascript', charset: 'utf-8');
      case 'css':
        return ContentType('text', 'css', charset: 'utf-8');
      case 'json':
        return ContentType('application', 'json', charset: 'utf-8');
      case 'png':
        return ContentType('image', 'png');
      case 'jpg':
      case 'jpeg':
        return ContentType('image', 'jpeg');
      case 'svg':
        return ContentType('image', 'svg+xml');
      case 'webp':
        return ContentType('image', 'webp');
      case 'ttf':
        return ContentType('font', 'ttf');
      case 'woff':
        return ContentType('font', 'woff');
      case 'woff2':
        return ContentType('font', 'woff2');
      case 'mp3':
        return ContentType('audio', 'mpeg');
      case 'wav':
        return ContentType('audio', 'wav');
      case 'ico':
        return ContentType('image', 'x-icon');
      default:
        return ContentType.binary;
    }
  }

  Future<void> stop() {
    _lifecycle?.dispose();
    _lifecycle = null;
    return _server.close(force: true);
  }
}
