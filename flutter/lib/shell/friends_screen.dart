import 'dart:async';

import 'package:flutter/foundation.dart' show ValueListenable;
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import 'app_look.dart';
import 'collection_model.dart' show hexOf;
import 'feedback_fab.dart' show FabRules;
import 'friends_model.dart';
import 'friends_service.dart';
import 'info_screens.dart' show ModelPage, circleBack;
import 'ion_icon.dart';
import 'profiles.dart';
import 'screen_ui.dart';
import 'shared_state.dart';
import 'stats_model.dart' show activeProfileOf;
import 'supabase_rpc.dart';
import 'web_theme.dart';

/// «ДРУЗЬЯ» ПО МОДЕЛИ ВЕБА (задача 7bb8035b; правило 4e679f41).
///
/// Сервер, нормализацию кода, правило «что рисовать» (`friendsView`: пять состояний таблицы) и
/// исходы добавления держит веб под оболочкой (`app/friends.tsx`), сюда приходят готовые строки.
/// Нажатия — действия веба: набор кода, «Добавить», чип игры, крестик (только открывает
/// подтверждение), «Разорвать», «Отмена», «назад». Своё у оболочки одно — буфер обмена: у скрытой
/// страницы нет фокуса, и `navigator.clipboard` ей откажет; итог уходит вебу действием `copied`.
/// Размеры — из `styles` веб-экрана.
///
/// 🔴 ЭКРАН ЖИВЁТ НА DART (задача d6a60b02, вариант Б): сервер — `FriendsService` (свой вызов Supabase тем же
/// путём, что выбрал веб, `supabase_rpc.dart`), логика — `FriendsController`, модель — `friendsModelFrom`.
/// Страница не нужна: свой код и круг спрашиваются на каждом входе (`enterFriends` по адресу страницы).
/// Буфер — сам. Вебу уходит только «назад». Без общей памяти или если данные не загрузились — как раньше,
/// по модели страницы.
class FriendsScreen extends StatefulWidget {
  const FriendsScreen({super.key, this.state, this.ownModel = true, this.server});
  static const route = '/friends';

  /// Общая память. Нет — экран рисует модель страницы.
  final SharedState? state;

  /// Жить на Dart (вариант Б). Пробы рисунка по модели веба выключают.
  final bool ownModel;

  /// Сервер — пробы подставляют свой; нет — `FriendsService` через Supabase.
  final FriendsServer? server;

  @override
  State<FriendsScreen> createState() => _FriendsScreenState();
}

typedef _M = Map<String, Object?>;
_M _map(Object? v) => v is Map ? Map<String, Object?>.from(v) : const {};
List<_M> _list(Object? v) => v is List ? [for (final x in v) _map(x)] : const [];
String _s(Object? v) => v == null ? '' : '$v';

class _FriendsScreenState extends State<FriendsScreen> {
  final _field = TextEditingController();
  final _page = ScreenUi.model(FriendsScreen.route);
  final _own = ValueNotifier<Map<String, Object?>?>(null);
  FriendsController? _c;
  bool _failed = false;
  Timer? _debounce;

  bool get _ownOn => widget.ownModel && widget.state != null && !_failed;
  ValueListenable<Map<String, Object?>?> get _model => _ownOn ? _own : _page;

  /// Номер последнего набора. Нормализованный код веба встаёт в поле, только когда модель ответила
  /// именно на него: иначе ответ на «a» затёр бы уже набранное «ab».
  int _seq = 0;

  @override
  void initState() {
    super.initState();
    _page.addListener(_sync);
    _own.addListener(_sync);
    _sync();
    final s = widget.state;
    if (!widget.ownModel || s == null) return;
    s.writes.addListener(_onWrite);
    friendsEntry.addListener(_onEnter);
    FriendsData.load().then(
      (d) {
        if (!mounted) return;
        _c = FriendsController(widget.server ?? FriendsService(s, SupabaseRpc(s)), d)..addListener(_refresh);
        // Вход случился раньше, чем данные загрузились, — спрашиваем сразу.
        if (friendsEntry.value > 0) unawaited(_c!.load());
        _refresh();
      },
      onError: (Object e) {
        debugPrint('FriendsScreen: own data failed, using the page model ($e)');
        if (mounted) setState(() => _failed = true);
      },
    );
  }

  void _onEnter() => unawaited(_c?.load());

  void _onWrite() {
    _debounce?.cancel();
    _debounce = Timer(const Duration(milliseconds: 200), _refresh);
  }

  /// Модель из состояния контроллера; акцент и тема — профиля экрана, как `colors` веба.
  void _refresh() {
    final s = widget.state, c = _c;
    if (!mounted || s == null || c == null) return;
    try {
      final pid = activeProfileOf(Profiles.current, s).id;
      _own.value = friendsModelFrom(
        c.data,
        c.ui,
        language: s.language,
        primary: hexOf(WebTheme.accent(s, profile: pid).toARGB32()),
        dark: AppLook.isDark(s),
      );
    } catch (e) {
      debugPrint('FriendsScreen: own model failed, using the page model ($e)');
      setState(() => _failed = true);
    }
  }

  @override
  void dispose() {
    _page.removeListener(_sync);
    _own.removeListener(_sync);
    widget.state?.writes.removeListener(_onWrite);
    friendsEntry.removeListener(_onEnter);
    _debounce?.cancel();
    _c?.dispose();
    _own.dispose();
    _field.dispose();
    super.dispose();
  }

  void _sync() {
    final add = _map(_model.value?['add']);
    if (add.isEmpty || add['seq'] != _seq) return;
    final draft = _s(add['draft']);
    if (_field.text == draft) return;
    _field.value = TextEditingValue(text: draft, selection: TextSelection.collapsed(offset: draft.length));
  }

  void _act(String action, [List<Object?> args = const []]) {
    final c = _c;
    if (_ownOn && c != null && action != 'back') {
      unawaited(c.act(action, args));
      return;
    }
    ScreenUi.act(FriendsScreen.route, action, args);
  }

  Future<void> _copy(String code) async {
    var ok = true;
    try {
      await Clipboard.setData(ClipboardData(text: code));
    } catch (_) {
      ok = false;
    }
    _act('copied', [ok]);
  }

  @override
  Widget build(BuildContext context) => ModelPage(
    route: FriendsScreen.route,
    screenKey: 'friends-screen',
    own: _ownOn ? _own : null,
    builder: (context, m) {
      final web = WebTheme.of(context);
      final primary = cssColor(m['primary'], Theme.of(context).colorScheme.primary);
      final error = cssColor(m['error'], const Color(0xFFFF3B30));
      final success = cssColor(m['success'], const Color(0xFF34C759));
      final mono = Theme.of(context).platform == TargetPlatform.iOS ? 'Menlo' : 'monospace';
      final my = _map(m['my']);
      final add = _map(m['add']);
      final table = _map(m['table']);
      final circle = m['circle'] is Map ? _map(m['circle']) : null;

      Widget card(List<Widget> children, {String? key}) => Container(
        key: key == null ? null : ValueKey(key),
        padding: const EdgeInsets.all(14),
        decoration: BoxDecoration(
          color: web.surface,
          border: Border.all(color: web.border),
          borderRadius: BorderRadius.circular(14),
        ),
        child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, spacing: 8, children: children),
      );
      Widget label(Object? text) => Text(
        _s(text),
        style: TextStyle(fontSize: 12.5, letterSpacing: 0.4, fontWeight: FontWeight.w700, color: web.textSecondary),
      );
      Widget note(String text, Color color) => Text(
        text,
        style: TextStyle(fontSize: 13, height: 18 / 13, fontWeight: FontWeight.w700, color: color),
      );
      Widget hint(Object? text) => Text(
        _s(text),
        style: TextStyle(fontSize: 12.5, height: 18 / 12.5, color: web.textSecondary),
      );
      Widget section(Object? text) => Padding(
        padding: const EdgeInsets.only(top: 8),
        child: Text(
          _s(text),
          style: TextStyle(fontSize: 15, fontWeight: FontWeight.w800, color: web.text),
        ),
      );
      Widget spinner(Color color, {double margin = 0}) => Padding(
        padding: EdgeInsets.symmetric(vertical: margin),
        child: Center(
          child: SizedBox.square(dimension: 20, child: CircularProgressIndicator(strokeWidth: 2.5, color: color)),
        ),
      );
      Widget button(String key, {required Color color, required Widget child, VoidCallback? onTap, double opacity = 1}) =>
          Semantics(
            button: true,
            enabled: onTap != null,
            child: GestureDetector(
              key: ValueKey(key),
              behavior: HitTestBehavior.opaque,
              onTap: onTap,
              child: Opacity(
                opacity: opacity,
                child: Container(
                  constraints: const BoxConstraints(minHeight: 48),
                  padding: const EdgeInsets.symmetric(horizontal: 14),
                  decoration: BoxDecoration(color: color, borderRadius: BorderRadius.circular(10)),
                  child: Center(child: child),
                ),
              ),
            ),
          );
      const white = TextStyle(color: Colors.white, fontWeight: FontWeight.w800, fontSize: 15);

      // ── Мой код ──
      final code = my['code'];
      final copied = my['copied'] is Map ? _map(my['copied']) : null;
      final myCard = card(key: 'friends-my', [
        label(my['label']),
        switch (my['state']) {
          'loading' => spinner(primary, margin: 12),
          'offline' => Text(
            _s(my['offline']),
            style: TextStyle(fontSize: 13, height: 19 / 13, fontWeight: FontWeight.w600, color: error),
          ),
          _ => SelectableText(
            _s(my['shown']),
            key: const ValueKey('friends-code'),
            textAlign: TextAlign.center,
            style: TextStyle(
              fontSize: 32,
              fontWeight: FontWeight.w900,
              letterSpacing: 4,
              color: web.text,
              fontFamily: mono,
              fontFeatures: const [FontFeature.tabularFigures()],
            ),
          ),
        },
        if (my['state'] == 'code') ...[
          button(
            'friends-copy',
            color: primary,
            onTap: code is String ? () => _copy(code) : null,
            child: Row(
              mainAxisSize: MainAxisSize.min,
              spacing: 7,
              children: [
                const IonIcon('copy-outline', size: 17, color: Colors.white),
                Text(_s(my['copy']), style: white),
              ],
            ),
          ),
          if (copied != null) note(_s(copied['text']), copied['ok'] == true ? success : web.textSecondary),
          hint(my['hint']),
        ],
      ]);

      // ── Чужой код ──
      final ready = add['ready'] == true;
      final added = add['note'] is Map ? _map(add['note']) : null;
      final addCard = card(key: 'friends-add', [
        label(add['label']),
        TextField(
          key: const ValueKey('friends-field'),
          controller: _field,
          onChanged: (v) => _act('draft', [v, ++_seq]),
          textAlign: TextAlign.center,
          textCapitalization: TextCapitalization.characters,
          autocorrect: false,
          enableSuggestions: false,
          style: TextStyle(fontSize: 20, letterSpacing: 3, fontWeight: FontWeight.w800, color: web.text, fontFamily: mono),
          decoration: InputDecoration(
            hintText: _s(add['placeholder']),
            hintStyle: TextStyle(fontSize: 20, letterSpacing: 3, fontWeight: FontWeight.w800, color: web.textSecondary, fontFamily: mono),
            filled: true,
            fillColor: web.background,
            isDense: true,
            constraints: const BoxConstraints(minHeight: 48),
            // Высота — ровно minHeight 48 веба (кадры 07.10: с отступом 11 поле выходило на 3,5 точки выше).
            contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 9),
            border: OutlineInputBorder(borderRadius: BorderRadius.circular(10), borderSide: BorderSide(color: web.border, width: 1.5)),
            enabledBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(10), borderSide: BorderSide(color: web.border, width: 1.5)),
            focusedBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(10), borderSide: BorderSide(color: web.border, width: 1.5)),
          ),
        ),
        Semantics(
          label: _s(add['btn']),
          excludeSemantics: true,
          child: button(
            'friends-add-btn',
            color: primary,
            opacity: ready ? 1 : 0.4,
            onTap: ready ? () => _act('add') : null,
            child: add['sending'] == true ? spinner(Colors.white) : Text(_s(add['btn']), style: white),
          ),
        ),
        if (added != null) note(_s(added['text']), added['ok'] == true ? success : error),
      ]);

      // ── Таблица круга по одной игре ──
      final chips = SingleChildScrollView(
        key: const ValueKey('friends-chips'),
        scrollDirection: Axis.horizontal,
        padding: const EdgeInsets.only(top: 2, bottom: 2, right: 8),
        child: Row(
          spacing: 8,
          children: [
            for (final c in _list(table['chips']))
              Semantics(
                button: true,
                selected: c['on'] == true,
                child: GestureDetector(
                  key: ValueKey('friends-chip-${c['id']}'),
                  onTap: () => _act('game', [c['id']]),
                  child: Container(
                    constraints: const BoxConstraints(minHeight: 40),
                    padding: const EdgeInsets.symmetric(vertical: 9, horizontal: 14),
                    alignment: Alignment.center,
                    decoration: BoxDecoration(
                      color: c['on'] == true ? primary : web.surface,
                      border: Border.all(color: c['on'] == true ? primary : web.border, width: 1.5),
                      borderRadius: BorderRadius.circular(999),
                    ),
                    child: Text(
                      _s(c['label']),
                      maxLines: 1,
                      style: TextStyle(
                        fontSize: 13,
                        fontWeight: FontWeight.w700,
                        color: c['on'] == true ? Colors.white : web.text,
                      ),
                    ),
                  ),
                ),
              ),
          ],
        ),
      );
      final meBg = cssColor(m['meBg']);
      final tableCard = card(key: 'friends-table', [
        if (table['kind'] == 'loading') spinner(primary, margin: 16),
        if (table['empty'] != null)
          Padding(
            padding: const EdgeInsets.symmetric(vertical: 8),
            child: Text(
              _s(table['empty']),
              style: TextStyle(fontSize: 13.5, height: 20 / 13.5, color: web.textSecondary),
            ),
          ),
        for (final r in _list(table['rows']))
          Container(
            key: ValueKey('friends-row-${r['id']}'),
            padding: const EdgeInsets.symmetric(vertical: 9),
            decoration: BoxDecoration(
              color: r['me'] == true ? meBg : null,
              border: Border(bottom: BorderSide(color: web.border)),
            ),
            child: Row(
              spacing: 10,
              children: [
                SizedBox(
                  width: 22,
                  child: Text(
                    _s(r['rank']),
                    style: TextStyle(
                      fontSize: 13,
                      fontWeight: FontWeight.w800,
                      color: web.textSecondary,
                      fontFeatures: const [FontFeature.tabularFigures()],
                    ),
                  ),
                ),
                Expanded(
                  child: Text(
                    _s(r['name']),
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: TextStyle(fontSize: 14, fontWeight: FontWeight.w700, color: web.text),
                  ),
                ),
                Text(
                  _s(r['score']),
                  style: TextStyle(
                    fontSize: 14,
                    fontWeight: FontWeight.w800,
                    color: primary,
                    fontFeatures: const [FontFeature.tabularFigures()],
                  ),
                ),
              ],
            ),
          ),
      ]);

      // ── Круг и разрыв ──
      Widget? circleCard;
      if (circle != null) {
        circleCard = card(key: 'friends-circle', [
          for (final f in _list(circle['rows']))
            Container(
              key: ValueKey('friends-friend-${f['id']}'),
              padding: const EdgeInsets.symmetric(vertical: 9),
              decoration: BoxDecoration(border: Border(bottom: BorderSide(color: web.border))),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                spacing: 10,
                children: [
                  Row(
                    spacing: 10,
                    children: [
                      Expanded(
                        child: Text(
                          _s(f['name']),
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: TextStyle(fontSize: 14, fontWeight: FontWeight.w700, color: web.text),
                        ),
                      ),
                      Semantics(
                        button: true,
                        label: _s(circle['remove']),
                        excludeSemantics: true,
                        child: GestureDetector(
                          key: ValueKey('friends-drop-${f['id']}'),
                          behavior: HitTestBehavior.opaque,
                          onTap: () => _act('ask', [f['id']]),
                          child: SizedBox.square(
                            dimension: 44,
                            child: Center(child: IonIcon('person-remove-outline', size: 19, color: error)),
                          ),
                        ),
                      ),
                    ],
                  ),
                  if (f['pending'] == true)
                    Padding(
                      padding: const EdgeInsets.only(top: 4, bottom: 6),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.stretch,
                        spacing: 8,
                        children: [
                          Text(
                            _s(f['warn']),
                            style: TextStyle(fontSize: 13, height: 19 / 13, fontWeight: FontWeight.w600, color: web.text),
                          ),
                          Wrap(
                            spacing: 8,
                            runSpacing: 8,
                            children: [
                              _smallButton(
                                'friends-confirm-${f['id']}',
                                onTap: () => _act('drop', [f['id']]),
                                fill: error,
                                child: Text(_s(circle['confirm']), style: white),
                              ),
                              _smallButton(
                                'friends-cancel-${f['id']}',
                                onTap: () => _act('cancel'),
                                border: web.border,
                                child: Text(
                                  _s(circle['cancel']),
                                  style: TextStyle(color: web.text, fontWeight: FontWeight.w700),
                                ),
                              ),
                            ],
                          ),
                        ],
                      ),
                    ),
                ],
              ),
            ),
          if (circle['failed'] != null) note(_s(circle['failed']), error),
        ]);
      }

      return Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
            child: Row(
              children: [
                circleBack(
                  context,
                  'friends-back',
                  _s(m['back']),
                  _s(m['backIcon']),
                  () => _act('back'),
                  filled: false,
                ),
                Expanded(
                  child: Text(
                    _s(m['title']),
                    textAlign: TextAlign.center,
                    style: TextStyle(fontSize: 18, fontWeight: FontWeight.w800, color: web.text),
                  ),
                ),
                const SizedBox(width: 48),
              ],
            ),
          ),
          Expanded(
            child: ListView(
              key: const ValueKey('friends-list'),
              keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.manual,
              padding: EdgeInsets.fromLTRB(16, 16, 16, FabRules.clearance),
              children: [
                for (final (i, w) in [
                  myCard,
                  addCard,
                  section(table['title']),
                  chips,
                  tableCard,
                  hint(m['scoresOnly']),
                  if (circleCard != null) ...[section(circle!['title']), circleCard],
                ].indexed)
                  Padding(padding: EdgeInsets.only(top: i == 0 ? 0 : 10), child: w),
              ],
            ),
          ),
        ],
      );
    },
  );

  Widget _smallButton(String key, {required VoidCallback onTap, required Widget child, Color? fill, Color? border}) => Semantics(
    button: true,
    child: GestureDetector(
      key: ValueKey(key),
      behavior: HitTestBehavior.opaque,
      onTap: onTap,
      child: Container(
        constraints: const BoxConstraints(minHeight: 44),
        padding: const EdgeInsets.symmetric(horizontal: 16),
        decoration: BoxDecoration(
          color: fill,
          border: border == null ? null : Border.all(color: border, width: 1.5),
          borderRadius: BorderRadius.circular(10),
        ),
        child: Column(mainAxisSize: MainAxisSize.min, mainAxisAlignment: MainAxisAlignment.center, children: [child]),
      ),
    ),
  );
}
