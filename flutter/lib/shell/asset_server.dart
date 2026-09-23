import 'dart:async';
import 'dart:io';

import 'package:flutter/foundation.dart' show debugPrint, kDebugMode;
import 'package:flutter/services.dart' show rootBundle;

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

  final HttpServer _server;
  final int port;

  String get origin => 'http://127.0.0.1:$port';

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
    await for (final req in _server) {
      try {
        await _answer(req);
      } catch (_) {
        req.response.statusCode = HttpStatus.internalServerError;
        await req.response.close();
      }
    }
  }

  Future<void> _answer(HttpRequest req) async {
    var path = Uri.decodeComponent(req.uri.path);
    if (path.endsWith('/')) path += 'index.html';
    if (path == '/index.html' || path.isEmpty) path = '/index.html';

    var key = '$_root$path';
    var data = await _read(key);

    // Маршруты без расширения — это страницы: /games/one-line → games/one-line.html.
    if (data == null && !path.contains('.')) {
      data = await _read('$key.html');
      if (data != null) key = '$key.html';
    }
    // Чего нет вовсе — отдаём главную, как это делает одностраничное приложение.
    if (data == null) {
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

  Future<void> stop() => _server.close(force: true);
}
