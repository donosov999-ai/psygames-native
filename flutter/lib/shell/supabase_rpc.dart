import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'dart:math';

import 'package:flutter/foundation.dart' show visibleForTesting;

import 'shared_state.dart';

/// ВЫЗОВ ФУНКЦИЙ SUPABASE С DART — ТО ЖЕ, ЧТО `supabase.rpc` ВЕБА (задача d6a60b02, вариант Б).
///
/// Адреса и ключ — те же, что в `frontend/src/services/supabase.ts` (проба `supabase_rpc_test` сверяет с
/// файлом): прямой адрес проекта и свой ретранслятор `sb.asibots.pro` для сетей, где прямой закрыт. Ключ —
/// публикуемый (`sb_publishable_…`): он и так лежит в веб-сборке, доступ к строкам решает RLS.
///
/// Какой адрес брать, решил и сохранил веб (`pickSupabaseBase` → `psygames_supabase_base`): Dart читает
/// его из общей памяти, чтобы оба ходили одним путём. Обрыв сети — одна попытка через другой адрес; если
/// он ответил, выбор запоминается так же, как у веба.
class SupabaseRpc {
  SupabaseRpc(this.state, {RpcTransport? transport, this.timeout = const Duration(seconds: 12)}) : _send = transport ?? _ioPost;

  static const direct = 'https://iuvvheeocobhiothfgei.supabase.co';
  static const relay = 'https://sb.asibots.pro';
  static const publishableKey = 'sb_publishable_A2vJ5DjemTZIKrKX6XGqvQ_WaiuAkk1';
  static const baseKey = 'psygames_supabase_base';

  final SharedState state;
  final RpcTransport _send;
  final Duration timeout;

  /// `preferredSupabaseBase`: сохранён ретранслятор — он, иначе прямой.
  String get base => state.get(baseKey) == relay ? relay : direct;

  /// Вызов функции: `ok` — сервер ответил 2xx (у supabase-js нет `error`), `data` — разобранное тело.
  /// Обрыв сети на обоих адресах — `ok: false`, как `error` у supabase-js.
  Future<({bool ok, Object? data})> call(String fn, Map<String, Object?> args) async {
    final first = base;
    try {
      return await _post(first, fn, args);
    } on Exception {
      // обрыв, таймаут, закрытая сеть — пробуем другой адрес
    }
    final alt = first == relay ? direct : relay;
    try {
      final r = await _post(alt, fn, args);
      unawaited(state.set(baseKey, alt));
      return r;
    } on Exception {
      return (ok: false, data: null);
    }
  }

  /// Один запрос по адресу [base] без запасного — для пробы транспорта на локальном сервере.
  @visibleForTesting
  Future<({bool ok, Object? data})> postTo(String base, String fn, Map<String, Object?> args) => _post(base, fn, args);

  Future<({bool ok, Object? data})> _post(String base, String fn, Map<String, Object?> args) async {
    final res = await _send(Uri.parse('$base/rest/v1/rpc/$fn'), {
      'apikey': publishableKey,
      'authorization': 'Bearer $publishableKey',
      'content-type': 'application/json',
    }, jsonEncode(args)).timeout(timeout);
    final ok = res.status >= 200 && res.status < 300;
    Object? data;
    final text = utf8.decode(res.body);
    if (text.isNotEmpty) {
      try {
        data = jsonDecode(text);
      } catch (_) {
        data = text;
      }
    }
    return (ok: ok, data: ok ? data : null);
  }
}

/// Транспорт запроса: POST по адресу с заголовками и телом → код ответа и тело. Пробы подставляют свой.
typedef RpcTransport = Future<({int status, List<int> body})> Function(Uri url, Map<String, String> headers, String body);

Future<({int status, List<int> body})> _ioPost(Uri url, Map<String, String> headers, String body) async {
  final client = HttpClient();
  try {
    final req = await client.postUrl(url);
    headers.forEach(req.headers.set);
    req.add(utf8.encode(body));
    final res = await req.close();
    final bytes = <int>[for (final chunk in await res.toList()) ...chunk];
    return (status: res.statusCode, body: bytes);
  } finally {
    client.close();
  }
}

/// Идентификатор игрока таблиц — `getPlayerId` веба: сохранённый, иначе новый UUID v4 и запись.
Future<String> playerIdOf(SharedState state, {Random? random}) async {
  const key = 'psygames_leaderboard_player_id';
  final stored = state.get(key);
  if (stored != null && stored.isNotEmpty) return stored;
  final r = random ?? Random.secure();
  final b = [for (var i = 0; i < 16; i++) r.nextInt(256)];
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  final h = [for (final x in b) x.toRadixString(16).padLeft(2, '0')].join();
  final id = '${h.substring(0, 8)}-${h.substring(8, 12)}-${h.substring(12, 16)}-${h.substring(16, 20)}-${h.substring(20)}';
  await state.set(key, id);
  return id;
}
