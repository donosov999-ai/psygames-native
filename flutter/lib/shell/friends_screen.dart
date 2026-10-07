import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import 'feedback_fab.dart' show FabRules;
import 'info_screens.dart' show ModelPage, circleBack;
import 'ion_icon.dart';
import 'screen_ui.dart';
import 'web_theme.dart';

/// «ДРУЗЬЯ» ПО МОДЕЛИ ВЕБА (задача 7bb8035b; правило 4e679f41).
///
/// Сервер, нормализацию кода, правило «что рисовать» (`friendsView`: пять состояний таблицы) и
/// исходы добавления держит веб под оболочкой (`app/friends.tsx`), сюда приходят готовые строки.
/// Нажатия — действия веба: набор кода, «Добавить», чип игры, крестик (только открывает
/// подтверждение), «Разорвать», «Отмена», «назад». Своё у оболочки одно — буфер обмена: у скрытой
/// страницы нет фокуса, и `navigator.clipboard` ей откажет; итог уходит вебу действием `copied`.
/// Размеры — из `styles` веб-экрана.
class FriendsScreen extends StatefulWidget {
  const FriendsScreen({super.key});
  static const route = '/friends';

  @override
  State<FriendsScreen> createState() => _FriendsScreenState();
}

typedef _M = Map<String, Object?>;
_M _map(Object? v) => v is Map ? Map<String, Object?>.from(v) : const {};
List<_M> _list(Object? v) => v is List ? [for (final x in v) _map(x)] : const [];
String _s(Object? v) => v == null ? '' : '$v';

class _FriendsScreenState extends State<FriendsScreen> {
  final _field = TextEditingController();
  final _model = ScreenUi.model(FriendsScreen.route);

  /// Номер последнего набора. Нормализованный код веба встаёт в поле, только когда модель ответила
  /// именно на него: иначе ответ на «a» затёр бы уже набранное «ab».
  int _seq = 0;

  @override
  void initState() {
    super.initState();
    _model.addListener(_sync);
    _sync();
  }

  @override
  void dispose() {
    _model.removeListener(_sync);
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

  void _act(String action, [List<Object?> args = const []]) => ScreenUi.act(FriendsScreen.route, action, args);

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
