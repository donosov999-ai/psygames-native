import 'shared_state.dart';
import 'supabase_rpc.dart';

/// Сервер «Друзей» — пять вызовов `services/friends.ts`.
abstract interface class FriendsServer {
  Future<String?> myInviteCode();
  Future<List<Friend>?> list();
  Future<List<FriendScore>?> top(String gameId);
  Future<FriendAdd> add(String code);
  Future<bool> remove(String friendId);
}

/// СЕРВИС «ДРУЗЕЙ» НА DART — ПЕРЕНОС `frontend/src/services/friends.ts` (задача d6a60b02, вариант Б).
///
/// Те же пять функций сервера и тот же разбор ответа: «не смогли спросить» (`null`) отличается от «пусто»,
/// у добавления пять исходов. Сверка — эталон `friends-dart-service.test.ts`: настоящий сервис веба и
/// supabase-js с подставной сетью; здесь те же запросы и тот же итог (`test/friends_service_test.dart`).
class FriendsService implements FriendsServer {
  FriendsService(this.state, this.rpc);
  final SharedState state;
  final SupabaseRpc rpc;

  static const codeLen = 6;
  static const myCodeKey = 'psygames_friends_my_code';

  /// `normalizeCode`: пробелы, дефисы и регистр — тот же код.
  static String normalize(String raw) => raw.replaceAll(RegExp('[^0-9a-zA-Z]'), '').toUpperCase();
  static bool complete(String raw) => normalize(raw).length == codeLen;

  /// Мой код. `null` — спросить не вышло; экран говорит «нет связи», а не молчит.
  @override
  Future<String?> myInviteCode() async {
    final cached = state.get(myCodeKey);
    if (cached != null && cached.isNotEmpty) return cached;
    final r = await rpc.call('psygames_my_invite_code', {'p_player_id': await playerIdOf(state)});
    if (!r.ok || !_truthy(r.data)) return null;
    final code = _str(r.data);
    await state.set(myCodeKey, code);
    return code;
  }

  /// Пять исходов добавления: `added` (с другом), `not-found`, `self`, `full` (с пределом круга), `offline`.
  @override
  Future<FriendAdd> add(String raw) async {
    final code = normalize(raw);
    if (code.length != codeLen) return const FriendAdd('not-found');
    final r = await rpc.call('psygames_add_friend', {'p_player_id': await playerIdOf(state), 'p_code': code});
    if (!r.ok) return const FriendAdd('offline');
    final data = r.data;
    final row = data is List ? (data.isEmpty ? null : data.first) : data;
    final m = row is Map ? row : const {};
    switch (_str(m['reason'] ?? '')) {
      case 'added':
        return FriendAdd('added', id: _str(m['f_id']), name: _str(m['f_name'] ?? ''));
      case 'self':
        return const FriendAdd('self');
      case 'full':
        final n = m['circle_max'] is num ? m['circle_max'] as num : num.tryParse('${m['circle_max']}');
        return FriendAdd('full', max: n == null || n.isNaN ? 0 : n);
      default:
        // `not-found`, `bad-code` и старый сервер без `reason` — для человека одно: код не подошёл.
        return const FriendAdd('not-found');
    }
  }

  /// Круг друзей. `null` — не смогли спросить.
  @override
  Future<List<Friend>?> list() async {
    final r = await rpc.call('psygames_friends_list', {'p_player_id': await playerIdOf(state)});
    if (!r.ok || !_truthy(r.data) || r.data is! List) return null;
    return [
      for (final x in r.data! as List)
        if (x is Map) Friend(id: _str(x['f_id']), name: _str(x['f_name'] ?? ''), since: _str(x['since'])),
    ];
  }

  /// Таблица игры среди своих. `null` — не смогли спросить.
  @override
  Future<List<FriendScore>?> top(String gameId) async {
    final r = await rpc.call('psygames_friends_top', {'p_player_id': await playerIdOf(state), 'p_game_id': gameId});
    if (!r.ok || !_truthy(r.data) || r.data is! List) return null;
    return [
      for (final x in r.data! as List)
        if (x is Map)
          FriendScore(
            id: _str(x['f_id']),
            name: _str(x['f_name'] ?? ''),
            score: x['score'] is num ? x['score'] as num : (num.tryParse('${x['score']}') ?? double.nan),
            updatedAt: _str(x['updated_at']),
            isMe: _truthy(x['is_me']),
          ),
    ];
  }

  /// Разрыв взаимен — как и добавление.
  @override
  Future<bool> remove(String friendId) async {
    final r = await rpc.call('psygames_remove_friend', {'p_player_id': await playerIdOf(state), 'p_friend_id': friendId});
    return r.ok;
  }
}

/// `String(x)` веба для того, что пришло с сервера.
String _str(Object? v) => v == null ? 'null' : (v is num && v == v.truncate() && v.isFinite ? '${v.toInt()}' : '$v');
bool _truthy(Object? v) => !(v == null || v == false || v == '' || v == 0);

class Friend {
  const Friend({required this.id, required this.name, required this.since});
  final String id, name, since;
  Map<String, Object?> toJson() => {'id': id, 'name': name, 'since': since};
}

class FriendScore {
  const FriendScore({required this.id, required this.name, required this.score, required this.updatedAt, required this.isMe});
  final String id, name, updatedAt;
  final num score;
  final bool isMe;
  Map<String, Object?> toJson() => {'id': id, 'name': name, 'score': score, 'updatedAt': updatedAt, 'isMe': isMe};
}

/// Исход добавления — `AddResult` веба.
class FriendAdd {
  const FriendAdd(this.kind, {this.id, this.name, this.max});
  final String kind;
  final String? id, name;
  final num? max;
  Map<String, Object?> toJson() => {
    'kind': kind,
    if (kind == 'added') 'friend': {'id': id, 'name': name},
    if (kind == 'full') 'max': max,
  };
}

/// ЧТО РИСОВАТЬ — `friendsView` веба: «друзей нет», «никто из них не играл» и «не смогли спросить» — три
/// разных сообщения. [friends]/[rows]: `null` — не смогли, [loaded] `false` — ещё не спрашивали.
String friendsViewKind({required bool friendsLoaded, List<Friend>? friends, required bool rowsLoaded, List<FriendScore>? rows}) {
  if (!friendsLoaded || !rowsLoaded) return 'loading';
  if (friends == null) return 'offline';
  if (friends.isEmpty) return 'no-friends';
  if (rows == null) return 'offline';
  if (rows.where((r) => !r.isMe).isEmpty) return 'nobody-played';
  return 'rows';
}
