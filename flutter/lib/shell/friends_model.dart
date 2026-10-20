import 'dart:async';

import 'package:flutter/foundation.dart';

import 'asset_json.dart';
import 'friends_service.dart';
import 'l10n.dart';

/// 🔴 «ДРУЗЬЯ» НА DART — ЛОГИКА ЭКРАНА И МОДЕЛЬ (задача d6a60b02, вариант Б).
///
/// `FriendsController` повторяет состояние `app/friends.tsx`: свой код, круг и таблица выбранной игры
/// (`undefined` — ещё не спрашивали, `null` — не смогли), набор кода, пять исходов добавления, буфер, разрыв с
/// подтверждением. Сервер — `FriendsServer` (на деле `FriendsService`). Модель — `friendsModelFrom`, те же
/// ключи и развилки, что `friendsModel` веба. Игры таблицы и вид очка — `assets/friends.json` (проба
/// `flutter-friends-asset-fresh`). Сверка — `friends-dart-model.test.tsx`: тот же сервер, те же действия.
class FriendsData {
  FriendsData({required this.j, required this.theme});

  /// `assets/friends.json`.
  final Map<String, Object?> j;

  /// `assets/web_theme.json` — цвета ошибки и успеха строками, как `colors.error` веба.
  final Map<String, Object?> theme;

  List<Map<String, Object?>> get games => [for (final g in (j['games']! as List)) (g as Map).cast<String, Object?>()];
  List<String> get gameIds => [for (final g in games) g['id']! as String];
  bool isRtl(String language) => (j['rtl']! as List).contains(language.split('-').first.toLowerCase());
  String paletteColor(bool dark, String name) => ((theme[dark ? 'dark' : 'light']! as Map)[name]) as String;

  static FriendsData? _cache;
  static Future<FriendsData> load() async =>
      _cache ??= FriendsData(j: await loadJsonAsset('assets/friends.json'), theme: await loadJsonAsset('assets/web_theme.json'));
}

/// Состояние экрана — то же, что `useState` веба.
class FriendsUi {
  bool codeLoaded = false, friendsLoaded = false, rowsLoaded = false;
  String? myCode;
  List<Friend>? friends;
  List<FriendScore>? rows;
  String game;
  String draft = '';
  int draftSeq = 0;
  FriendAdd? added;
  bool sending = false;
  String? copied;
  String? pending;
  bool dropFailed = false;
  FriendsUi(this.game);
}

/// Логика экрана: те же переходы, что колбэки веба (`loadCircle`, `onAdd`, `onDrop`, `onDraft`, `onAsk`).
class FriendsController extends ChangeNotifier {
  FriendsController(this.server, this.data) : ui = FriendsUi(data.gameIds.first);
  final FriendsServer server;
  final FriendsData data;
  final FriendsUi ui;
  int _circle = 0, _table = 0;
  bool _disposed = false;

  void _changed() {
    if (!_disposed) notifyListeners();
  }

  /// `useFocusEffect(loadCircle)`: свой код и круг — заново на каждом показе; таблица — за кругом.
  Future<void> load() async {
    final n = ++_circle;
    await Future.wait([
      server.myInviteCode().then((c) {
        if (n != _circle) return;
        ui
          ..myCode = c
          ..codeLoaded = true;
        _changed();
      }),
      _reloadFriends(n),
      _reloadTable(),
    ]);
  }

  Future<void> _reloadFriends([int? n]) async {
    final f = await server.list();
    if (n != null && n != _circle) return;
    ui
      ..friends = f
      ..friendsLoaded = true;
    _changed();
    // Круг изменился — состав строк тоже (`useEffect([game, friends])`).
    await _reloadTable();
  }

  Future<void> _reloadTable() async {
    final n = ++_table;
    ui
      ..rows = null
      ..rowsLoaded = false;
    _changed();
    final r = await server.top(ui.game);
    if (n != _table) return;
    ui
      ..rows = r
      ..rowsLoaded = true;
    _changed();
  }

  /// Нажатие оболочки — те же действия, что `registerScreenActions('/friends')` веба (кроме «назад»).
  Future<void> act(String action, [List<Object?> args = const []]) async {
    switch (action) {
      case 'copied':
        ui.copied = args.isNotEmpty && args[0] == true ? 'ok' : 'fail';
        _changed();
      case 'draft':
        final v = FriendsService.normalize('${args.isEmpty ? '' : args[0] ?? ''}');
        ui
          ..draft = v.length > FriendsService.codeLen ? v.substring(0, FriendsService.codeLen) : v
          ..added = null
          ..draftSeq = args.length > 1 && args[1] is num ? (args[1]! as num).toInt() : 0;
        _changed();
      case 'add':
        if (!FriendsService.complete(ui.draft) || ui.sending) return;
        ui
          ..sending = true
          ..added = null;
        _changed();
        final res = await server.add(ui.draft);
        ui
          ..added = res
          ..sending = false;
        if (res.kind == 'added') ui.draft = '';
        _changed();
        if (res.kind == 'added') await _reloadFriends();
      case 'game':
        final id = args.isEmpty ? null : args[0];
        if (id is! String || !data.gameIds.contains(id) || id == ui.game) return;
        ui.game = id;
        await _reloadTable();
      case 'ask':
        ui
          ..pending = '${args.isEmpty ? '' : args[0]}'
          ..dropFailed = false;
        _changed();
      case 'cancel':
        ui.pending = null;
        _changed();
      case 'drop':
        ui
          ..pending = null
          ..dropFailed = false;
        _changed();
        final ok = await server.remove('${args.isEmpty ? '' : args[0]}');
        if (ok) {
          await _reloadFriends();
        } else {
          ui.dropFailed = true;
          _changed();
        }
    }
  }

  @override
  void dispose() {
    _disposed = true;
    super.dispose();
  }
}

/// `toUpperCase` веба: JS поднимает «ß» в «SS», Dart оставляет как есть.
String jsUpper(String s) => s.toUpperCase().replaceAll('ß', 'SS');

/// Очко по виду из выгрузки — те же выражения, что `FORMAT` веба (`toFixed(1)`, `Math.round`).
String friendsScore(String format, num s) => switch (format) {
  'seconds' => '${_toFixed1(s)}s',
  'back' => '${_jsNum(s)}-back',
  'ms' => '${_jsRound(s)} ms',
  _ => '${_jsRound(s)}',
};

/// `Math.round`: половина — вверх (к +∞), не от нуля. Дробная часть `x - floor(x)` у double точна.
int _jsRound(num s) {
  final f = s.floor();
  return s - f >= 0.5 ? f + 1 : f;
}

/// `toFixed(1)`: у `toStringAsFixed` Dart то же правило — точное двоичное значение, ровно посередине — большее
/// (образцы веба на `3.25`, `2.5`, `12.45`, `0.05` сверяет проба).
String _toFixed1(num s) => s.toDouble().toStringAsFixed(1);

String _jsNum(num v) => v is double && v == v.truncateToDouble() && v.isFinite ? '${v.toInt()}' : '$v';

/// Модель «Друзей» — та же, что `friendsModel` веба. [primary] — `colors.primary` строкой; [dark] — тёмная
/// ли тема (цвета ошибки и успеха).
Map<String, Object?> friendsModelFrom(FriendsData d, FriendsUi s, {required String language, required String primary, required bool dark}) {
  final games = {for (final g in d.games) g['id']: g};
  final g = games[s.game]!;
  final gameName = L.t(g['nameKey']! as String);
  final view = friendsViewKind(friendsLoaded: s.friendsLoaded, friends: s.friends, rowsLoaded: s.rowsLoaded, rows: s.rows);
  final a = s.added;
  final code = s.codeLoaded ? s.myCode : null;
  final friends = s.friends;
  return {
    'v': 1,
    'title': L.t('friendsTitle'),
    'back': L.t('a11yBack'),
    'backIcon': d.isRtl(language) ? 'chevron-forward' : 'chevron-back',
    'primary': primary,
    'error': d.paletteColor(dark, 'error'),
    'success': d.paletteColor(dark, 'success'),
    'meBg': '${primary}18',
    'my': {
      'label': jsUpper(L.t('friendsMyCode')),
      'state': !s.codeLoaded
          ? 'loading'
          : code == null
          ? 'offline'
          : 'code',
      'offline': L.t('friendsCodeOffline'),
      'code': code,
      'shown': code == null || code.isEmpty
          ? null
          : '${code.substring(0, code.length < 3 ? code.length : 3)} ${code.length < 3 ? '' : code.substring(3)}',
      'copy': L.t('copy'),
      'copied': s.copied == null ? null : {'ok': s.copied == 'ok', 'text': s.copied == 'ok' ? L.t('copied') : L.t('copyManually')},
      'hint': L.t('friendsMyCodeHint'),
    },
    'add': {
      'label': jsUpper(L.t('friendsAddTitle')),
      'a11y': L.t('friendsAddTitle'),
      'draft': s.draft,
      'seq': s.draftSeq,
      'placeholder': L.t('friendsCodePlaceholder'),
      'btn': L.t('friendsAddBtn'),
      'ready': FriendsService.complete(s.draft) && !s.sending,
      'sending': s.sending,
      'note': switch (a?.kind) {
        'added' => {'ok': true, 'text': L.t('friendsAdded').replaceFirst('{name}', a!.name ?? '')},
        'not-found' => {'ok': false, 'text': L.t('friendsNotFound')},
        'self' => {'ok': false, 'text': L.t('friendsSelfCode')},
        'full' => {'ok': false, 'text': L.t('friendsCircleFull').replaceFirst('{n}', _jsNum(a!.max ?? 0))},
        'offline' => {'ok': false, 'text': L.t('friendsAddOffline')},
        _ => null,
      },
    },
    'table': {
      'title': L.t('friendsTableTitle'),
      'chips': [
        for (final x in d.games) {'id': x['id'], 'label': L.t(x['nameKey']! as String), 'on': x['id'] == s.game},
      ],
      'kind': view,
      'empty': switch (view) {
        'offline' => L.t('friendsViewOffline'),
        'no-friends' => L.t('friendsViewNoFriends'),
        'nobody-played' => L.t('friendsViewNobodyPlayed').replaceFirst('{game}', gameName),
        _ => null,
      },
      'rows': view == 'rows'
          ? [
              for (final (i, r) in s.rows!.indexed)
                {
                  'id': r.id,
                  'rank': '${i + 1}',
                  'me': r.isMe,
                  'name': r.isMe ? '${r.name} · ${L.t('friendsMe')}' : r.name,
                  'score': friendsScore(g['format']! as String, r.score),
                },
            ]
          : const <Object?>[],
    },
    'scoresOnly': L.t('friendsScoresOnly'),
    'circle': friends != null && friends.isNotEmpty
        ? {
            'title': L.t('friendsCircle').replaceFirst('{n}', '${friends.length}'),
            'remove': L.t('friendsRemove'),
            'rows': [
              for (final f in friends)
                {'id': f.id, 'name': f.name, 'pending': s.pending == f.id, 'warn': L.t('friendsRemoveMutual').replaceFirst('{name}', f.name)},
            ],
            'confirm': L.t('friendsRemoveConfirm'),
            'cancel': L.t('btn_cancel'),
            'failed': s.dropFailed ? L.t('friendsRemoveFailed') : null,
          }
        : null,
  };
}

/// Вход на экран — `useFocusEffect` веба: на каждом показе свой код и круг спрашиваются заново.
/// Ставит оболочка по адресу страницы.
final friendsEntry = ValueNotifier<int>(0);
void enterFriends() => friendsEntry.value++;
