import 'dart:convert';
import 'dart:io';
import 'dart:math';

import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/shell/friends_service.dart';
import 'package:psygames_flutter/shell/shared_state.dart';
import 'package:psygames_flutter/shell/supabase_rpc.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// 🔴 СЕРВИС «ДРУЗЕЙ» НА DART = СЕРВИС ВЕБА (задача d6a60b02, вариант Б).
///
/// Эталон — `friends-dart-service.test.ts`: настоящий `services/friends.ts` и supabase-js с подставной
/// сетью. Здесь подставная сеть отвечает теми же заготовками, и Dart обязан послать те же запросы (адрес,
/// метод, ключ, тело) и прийти к тому же итогу и той же памяти. Настоящий сервер не трогается.
void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  final fx = (jsonDecode(File('test/fixtures/friends_dart_service.json').readAsStringSync()) as Map).cast<String, Object?>();

  for (final c in (fx['cases']! as List).cast<Map<String, Object?>>()) {
    test('🔴 ${c['name']}: ${c['call']} — те же запросы и тот же итог', () async {
      final storage = <String, Object>{
        'psygames_leaderboard_player_id': fx['player']! as String,
        ...((c['storage'] as Map?) ?? const {}).cast<String, Object>(),
      };
      SharedPreferences.setMockInitialValues(storage);
      final state = await SharedState.open();
      final replies = [...(c['replies']! as List)];
      final sent = <({Uri url, Map<String, String> headers, String body})>[];
      final rpc = SupabaseRpc(
        state,
        transport: (url, headers, body) async {
          sent.add((url: url, headers: headers, body: body));
          final r = replies.isEmpty ? 'network' : replies.removeAt(0);
          if (r == 'network') throw const SocketException('fetch failed');
          final m = (r as Map).cast<String, Object?>();
          return (status: m['status']! as int, body: m['body'] == null ? const <int>[] : utf8.encode(jsonEncode(m['body'])));
        },
      );
      final s = FriendsService(state, rpc);
      final args = (c['args']! as List);
      final Object? result = switch (c['call']) {
        'getMyInviteCode' => await s.myInviteCode(),
        'addFriendByCode' => (await s.add(args[0]! as String)).toJson(),
        'listFriends' => (await s.list())?.map((f) => f.toJson()).toList(),
        'friendsTop' => (await s.top(args[0]! as String))?.map((f) => f.toJson()).toList(),
        'removeFriend' => await s.remove(args[0]! as String),
        _ => throw StateError('${c['call']}'),
      };
      expect(jsonDecode(jsonEncode(result)), c['result'], reason: 'итог');
      final want = (c['requests']! as List).cast<Map<String, Object?>>();
      final network = (c['replies']! as List).contains('network');
      // Обрыв сети: веб на этом сдаётся, Dart пробует ещё и ретранслятор — первый запрос тот же.
      expect(sent.length, network ? want.length + 1 : want.length, reason: 'число запросов');
      for (final (i, w) in want.indexed) {
        final r = sent[i];
        expect(r.url.toString(), w['url']);
        expect(w['method'], 'POST');
        final h = (w['headers']! as Map).cast<String, Object?>();
        expect(r.headers['apikey'], h['apikey']);
        expect(r.headers['authorization'], h['authorization']);
        expect(r.headers['content-type']?.split(';').first, (h['content-type'] as String?)?.split(';').first);
        expect(jsonDecode(r.body), w['body'], reason: 'тело');
      }
      if (network) expect(sent.last.url.toString(), startsWith(SupabaseRpc.relay), reason: 'вторая попытка — ретранслятор');
      final after = (c['after']! as Map).cast<String, Object?>();
      expect(state.get(FriendsService.myCodeKey), after[FriendsService.myCodeKey], reason: 'свой код в памяти');
    });
  }

  test('адреса и ключ — те же, что у веба (`supabase.ts`)', () {
    final ts = File('../frontend/src/services/supabase.ts').readAsStringSync();
    String constant(String name) => RegExp("export const $name = '([^']+)'").firstMatch(ts)!.group(1)!;
    expect(SupabaseRpc.direct, constant('SUPABASE_URL'));
    expect(SupabaseRpc.relay, constant('SUPABASE_RELAY_URL'));
    expect(SupabaseRpc.publishableKey, constant('SUPABASE_PUBLISHABLE_KEY'));
    expect(SupabaseRpc.publishableKey, startsWith('sb_publishable_'), reason: 'только публикуемый ключ');
  });

  test('адрес — выбор веба; обрыв — ретранслятор, и выбор запоминается; оба закрыты — «нет связи»', () async {
    SharedPreferences.setMockInitialValues({SupabaseRpc.baseKey: SupabaseRpc.relay});
    var state = await SharedState.open();
    final hosts = <String>[];
    var rpc = SupabaseRpc(
      state,
      transport: (url, headers, body) async {
        hosts.add(url.host);
        return (status: 200, body: utf8.encode('"OK"'));
      },
    );
    expect((await rpc.call('f', {})).data, 'OK');
    expect(hosts, ['sb.asibots.pro'], reason: 'веб выбрал ретранслятор — Dart идёт туда же');

    SharedPreferences.setMockInitialValues({});
    state = await SharedState.open();
    hosts.clear();
    rpc = SupabaseRpc(
      state,
      transport: (url, headers, body) async {
        hosts.add(url.host);
        if (url.host != 'sb.asibots.pro') throw const SocketException('blocked');
        return (status: 200, body: utf8.encode('[1]'));
      },
    );
    expect((await rpc.call('f', {})).data, [1]);
    expect(hosts, ['iuvvheeocobhiothfgei.supabase.co', 'sb.asibots.pro']);
    await Future<void>.delayed(Duration.zero);
    expect(state.get(SupabaseRpc.baseKey), SupabaseRpc.relay, reason: 'следующий вызов — сразу ретранслятором');

    rpc = SupabaseRpc(state, transport: (url, headers, body) async => throw const SocketException('down'));
    expect(await rpc.call('f', {}), (ok: false, data: null));
  });

  test('свой транспорт dart:io шлёт POST с ключом и телом и читает ответ (локальный сервер)', () async {
    final server = await HttpServer.bind(InternetAddress.loopbackIPv4, 0);
    addTearDown(() => server.close(force: true));
    final got = <String, Object?>{};
    server.listen((req) async {
      got['path'] = req.uri.path;
      got['method'] = req.method;
      got['apikey'] = req.headers.value('apikey');
      got['body'] = await utf8.decodeStream(req);
      req.response
        ..statusCode = 200
        ..headers.contentType = ContentType.json
        ..write(
          jsonEncode([
            {'f_id': 'f1'},
          ]),
        );
      await req.response.close();
    });
    SharedPreferences.setMockInitialValues({});
    final state = await SharedState.open();
    final rpc = SupabaseRpc(state);
    // Привязка проб подменяет HttpClient (любой ответ — 400): здесь нужен настоящий, к своему 127.0.0.1.
    final r = await HttpOverrides.runWithHttpOverrides(
      () => rpc.postTo('http://127.0.0.1:${server.port}', 'psygames_friends_list', {'p_player_id': 'p'}),
      _RealHttp(),
    );
    expect(r.ok, isTrue);
    expect(r.data, [
      {'f_id': 'f1'},
    ]);
    expect(got, {
      'path': '/rest/v1/rpc/psygames_friends_list',
      'method': 'POST',
      'apikey': SupabaseRpc.publishableKey,
      'body': '{"p_player_id":"p"}',
    });
  });

  test('игрок без идентификатора получает UUID v4 и хранит его', () async {
    SharedPreferences.setMockInitialValues({});
    final state = await SharedState.open();
    final id = await playerIdOf(state, random: Random(7));
    expect(id, matches(RegExp(r'^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$')));
    expect(await playerIdOf(state), id, reason: 'второй раз — тот же');
  });
}

class _RealHttp extends HttpOverrides {}
