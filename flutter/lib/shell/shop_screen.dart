import 'dart:async';

import 'package:flutter/material.dart';

import 'feedback_fab.dart' show FabRules;
import 'info_screens.dart' show ModelPage, circleBack;
import 'ion_icon.dart';
import 'profiles.dart';
import 'screen_ui.dart';
import 'shared_state.dart';
import 'shop_model.dart';
import 'stats_model.dart' show activeProfileOf;
import 'training_history.dart' show Wall, deviceWall;
import 'web_theme.dart';

/// «МАГАЗИН» (задача 9424da3a; правило 4e679f41).
///
/// 🔴 МОДЕЛЬ СЧИТАЕТ DART (задача d6a60b02, вариант Б, `shop_model.dart`): баланс, цены, что куплено и
/// надето, доступность кнопок, ставку — из общей памяти, на каждую запись в неё (покупку страницы, смену
/// профиля) — заново. Вкладку раздела держит экран сам. Отчёт о последней трате (`note`) рождает действие
/// страницы — он приходит из её модели поверх своей. Нажатия покупок — по-прежнему действия веба
/// (`app/shop.tsx`): купить/применить способность, ставка, купить/надеть товар, «назад». Своя модель не
/// собралась — экран рисует модель страницы, как раньше. Размеры — из `styles` веб-экрана.
class ShopScreen extends StatefulWidget {
  const ShopScreen({super.key, required this.origin, this.state, this.ownModel = true});
  static const route = '/shop';

  /// Адрес раздачи веб-сборки — картинки товаров приходят путями от неё.
  final String origin;

  /// Общая память. Нет — экран рисует модель страницы.
  final SharedState? state;

  /// Считать модель на Dart (вариант Б). Пробы рисунка по модели веба выключают.
  final bool ownModel;

  /// Часы экрана (миг «сейчас» и местное время — сутки ставки). Пробы подменяют.
  @visibleForTesting
  static int Function() now = () => DateTime.now().millisecondsSinceEpoch;
  @visibleForTesting
  static Wall wall = deviceWall;

  @override
  State<ShopScreen> createState() => _ShopScreenState();
}

class _ShopScreenState extends State<ShopScreen> {
  final _own = ValueNotifier<Map<String, Object?>?>(null);
  ShopData? _data;
  bool _failed = false;
  Timer? _debounce;

  /// Открытая вкладка раздела (`null` — все) — `cat` веба.
  String? _cat;

  /// Ставка сгорела на этом показе. Запись `peekWager` стирает сразу (свой или страницы), а объяснение
  /// веб держит до следующей перезагрузки состояния — то есть до первого действия на экране.
  bool _lost = false;

  /// Модель страницы, чьё «сгорела» уже взято: после действия старая модель не должна вернуть объяснение.
  Map<String, Object?>? _lostFrom;

  bool get _ownOn => widget.ownModel && widget.state != null;

  @override
  void initState() {
    super.initState();
    if (!_ownOn) return;
    ScreenUi.model(ShopScreen.route).addListener(_refresh);
    widget.state!.writes.addListener(_onWrite);
    ShopData.load().then(
      (d) {
        _data = d;
        _refresh();
      },
      onError: (Object e) {
        debugPrint('ShopScreen: own model data failed, using the page model ($e)');
        _failed = true;
        _refresh();
      },
    );
  }

  void _onWrite() {
    _debounce?.cancel();
    _debounce = Timer(const Duration(milliseconds: 200), _refresh);
  }

  Future<void> _refresh() async {
    final s = widget.state, d = _data;
    if (!mounted || s == null) return;
    final page = ScreenUi.model(ShopScreen.route).value;
    if (_failed) {
      _own.value = page;
      return;
    }
    if (d == null) return;
    try {
      final ps = Profiles.current.list.isEmpty ? await Profiles.load() : Profiles.current;
      final pid = activeProfileOf(ps, s).id;
      var wager = await peekShopWager(s, pid, now: ShopScreen.now(), wall: ShopScreen.wall);
      if (wager.kind == 'lost') _lost = true;
      if (pageSawLostWager(page) && !identical(page, _lostFrom)) {
        _lost = true;
        _lostFrom = page;
      }
      if (wager.kind == 'none' && _lost) wager = (kind: 'lost', daysDone: 0);
      final own = shopModelFrom(s, d, profiles: ps, language: s.language, wager: wager, cat: _cat);
      if (mounted) _own.value = withShopPageEvents(own, page);
    } catch (e) {
      debugPrint('ShopScreen: own model failed, using the page model ($e)');
      _failed = true;
      if (mounted) _own.value = page;
    }
  }

  @override
  void dispose() {
    if (_ownOn) {
      ScreenUi.model(ShopScreen.route).removeListener(_refresh);
      widget.state!.writes.removeListener(_onWrite);
    }
    _debounce?.cancel();
    _own.dispose();
    super.dispose();
  }

  void _act(String action, [List<Object?> args = const []]) {
    // Любое действие, кроме вкладки, у веба перезагружает состояние — объяснение сгоревшей ставки уходит.
    if (action != 'cat') {
      _lost = false;
      _lostFrom = ScreenUi.model(ShopScreen.route).value;
    }
    ScreenUi.act(ShopScreen.route, action, args);
  }

  /// Вкладка — своя: модель пересчитывается сразу; странице — то же действие, чтобы её модель не расходилась.
  void _pickCat(Object? id) {
    _act('cat', [id]);
    if (!_ownOn) return;
    _cat = id is String ? id : null;
    _refresh();
  }

  @override
  Widget build(BuildContext context) => ModelPage(
    route: ShopScreen.route,
    screenKey: 'shop-screen',
    own: _ownOn ? _own : null,
    builder: (context, m) {
      final web = WebTheme.of(context);
      final primary = cssColor(m['primary'], Theme.of(context).colorScheme.primary);
      String url(String u) => u.startsWith('http') ? u : '${widget.origin}$u';

      Widget btn(String key, {required String label, required bool enabled, required Color fill, Color? border, Color text = Colors.white, VoidCallback? onTap}) =>
          Semantics(
            button: true,
            enabled: enabled,
            label: label,
            excludeSemantics: true,
            child: GestureDetector(
              key: ValueKey(key),
              behavior: HitTestBehavior.opaque,
              onTap: enabled ? onTap : null,
              child: Opacity(
                opacity: enabled ? 1 : 0.6,
                child: Container(
                  constraints: const BoxConstraints(minHeight: 48, minWidth: 92),
                  padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
                  alignment: Alignment.center,
                  decoration: BoxDecoration(
                    color: fill,
                    border: border == null ? null : Border.all(color: border, width: 1.5),
                    borderRadius: BorderRadius.circular(16),
                  ),
                  child: Text(label, style: TextStyle(color: text, fontWeight: FontWeight.w800, fontSize: 13)),
                ),
              ),
            ),
          );

      Widget swatch(Map<String, Object?> s) {
        final kind = s['kind'];
        Widget box({Color? color, Widget? child, BoxBorder? border}) => Container(
          width: 38,
          height: 38,
          alignment: Alignment.center,
          decoration: BoxDecoration(
            color: color ?? web.background,
            borderRadius: BorderRadius.circular(12),
            border: border,
          ),
          child: child,
        );
        switch (kind) {
          case 'icon':
            return box(child: IonIcon(_s(s['icon']), size: 22, color: cssColor(s['color'], primary)));
          case 'frame':
            return box(
              border: Border.all(color: cssColor(s['color']), width: 3),
              child: IonIcon('person', size: 16, color: web.textSecondary),
            );
          case 'text':
            return box(child: Text(_s(s['text']), style: const TextStyle(fontSize: 20)));
          case 'image':
            return ClipRRect(
              borderRadius: BorderRadius.circular(12),
              child: box(
                child: Image.network(url(_s(s['uri'])), width: 38, height: 38, fit: BoxFit.cover, errorBuilder: (_, _, _) => const SizedBox()),
              ),
            );
          case 'digits':
            return box(child: Image.network(url(_s(s['uri'])), width: 34, height: 34, fit: BoxFit.contain, errorBuilder: (_, _, _) => const SizedBox()));
          default:
            return box(color: cssColor(s['color'], web.border));
        }
      }

      Widget row(String key, {required Widget lead, required List<Widget> texts, required List<Widget> buttons, Color? edge, double edgeW = 1}) =>
          Container(
            key: ValueKey(key),
            margin: const EdgeInsets.only(bottom: 10),
            padding: const EdgeInsets.all(14),
            decoration: BoxDecoration(
              color: web.surface,
              border: Border.all(color: edge ?? web.border, width: edgeW),
              borderRadius: BorderRadius.circular(16),
            ),
            child: Row(
              spacing: 14,
              children: [
                lead,
                Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: texts)),
                // Кнопки столбца — одной ширины, как у веба (столбец RN растягивает детей по ширине).
                if (buttons.isNotEmpty)
                  IntrinsicWidth(
                    child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.stretch, spacing: 6, children: buttons),
                  ),
              ],
            ),
          );
      Widget name(Object? v) => Text(_s(v), style: TextStyle(color: web.text, fontWeight: FontWeight.w700, fontSize: 15));
      Widget desc(Object? v) => Padding(
        padding: const EdgeInsets.only(top: 2),
        child: Text(_s(v), style: TextStyle(color: web.textSecondary, fontSize: 12, height: 16 / 12)),
      );
      Widget price(Object? v, {bool dim = false}) => Padding(
        padding: const EdgeInsets.only(top: 3),
        child: Text(_s(v), style: TextStyle(color: dim ? web.textSecondary : web.text, fontSize: 13, fontWeight: FontWeight.w700)),
      );
      Widget section(Object? v, {double top = 20}) => Padding(
        padding: EdgeInsets.only(top: top, bottom: 14),
        child: Text(_s(v), style: TextStyle(color: web.textSecondary, fontSize: 13, height: 1.5)),
      );
      Widget hint(Object? v, {double top = 14, double bottom = 0}) => Padding(
        padding: EdgeInsets.only(top: top, bottom: bottom),
        child: Text(_s(v), textAlign: TextAlign.center, style: TextStyle(color: web.textSecondary, fontSize: 12, height: 1.5)),
      );

      final children = <Widget>[];
      final note = m['note'];
      if (note != null) {
        children.add(Container(
          key: const ValueKey('shop-note'),
          margin: const EdgeInsets.only(bottom: 14),
          padding: const EdgeInsets.all(12),
          decoration: BoxDecoration(
            color: web.surface,
            border: Border.all(color: primary, width: 1.5),
            borderRadius: BorderRadius.circular(14),
          ),
          child: Text(_s(note), style: TextStyle(color: web.text, fontSize: 13, height: 1.5)),
        ));
      }

      final ab = m['abilities'] is Map ? _map(m['abilities']) : null;
      if (ab != null) {
        children.add(section(ab['title'], top: 0));
        for (final a in _list(ab['rows'])) {
          final buy = _map(a['buy']);
          final use = a['use'] is Map ? _map(a['use']) : null;
          children.add(row(
            'shop-ability-${a['id']}',
            lead: swatch({'kind': 'icon', 'icon': a['icon']}),
            texts: [name(a['name']), desc(a['desc']), price(a['price'])],
            buttons: [
              btn('shop-ability-buy-${a['id']}',
                  label: _s(buy['label']),
                  enabled: buy['enabled'] == true,
                  fill: buy['enabled'] == true ? primary : web.border,
                  onTap: () => _act('buyAbility', [a['id']])),
              if (use != null)
                btn('shop-ability-use-${a['id']}',
                    label: _s(use['label']),
                    enabled: use['ready'] == true,
                    fill: Colors.transparent,
                    border: use['ready'] == true ? primary : web.border,
                    text: use['ready'] == true ? primary : web.textSecondary,
                    onTap: () => _act('useShield')),
            ],
          ));
        }
        children.add(hint(ab['hint'], top: 4, bottom: 6));
        final w = _map(ab['wager']);
        final active = w['active'] == true;
        final wbtn = w['btn'] is Map ? _map(w['btn']) : null;
        children.add(row(
          'shop-wager',
          edge: active ? primary : null,
          edgeW: active ? 2 : 1,
          lead: swatch({'kind': 'icon', 'icon': 'flame', 'color': active ? '#f59e0b' : m['primary']}),
          texts: [
            name(w['title']),
            if (active) ...[
              price(w['day']),
              Padding(
                padding: const EdgeInsets.only(top: 3),
                child: Text(_s(w['dots']), style: TextStyle(color: web.textSecondary, fontSize: 15, letterSpacing: 2)),
              ),
            ] else
              desc(w['desc']),
          ],
          buttons: [
            if (wbtn != null)
              btn('shop-wager-place',
                  label: _s(wbtn['label']),
                  enabled: wbtn['enabled'] == true,
                  fill: wbtn['enabled'] == true ? primary : web.border,
                  onTap: () => _act('wager')),
          ],
        ));
      }

      for (final (i, sec) in _list(m['sections']).indexed) {
        children.add(section(sec['title'], top: i == 0 && sec['first'] == true ? 0 : 20));
        for (final it in _list(sec['items'])) {
          final accent = cssColor(it['accent'], primary);
          final on = it['on'] == true;
          final owned = it['owned'] == true;
          final b = _map(it['btn']);
          children.add(row(
            'shop-item-${it['id']}',
            edge: on ? accent : null,
            edgeW: on ? 2 : 1,
            lead: swatch(_map(it['swatch'])),
            texts: [name(it['name']), desc(it['desc']), price(it['price'], dim: owned)],
            buttons: [
              if (owned)
                btn('shop-equip-${it['id']}',
                    label: _s(b['label']),
                    enabled: true,
                    fill: on ? accent : Colors.transparent,
                    border: accent,
                    text: on ? Colors.white : accent,
                    onTap: () => _act('toggle', [it['id']]))
              else
                btn('shop-buy-${it['id']}',
                    label: _s(b['label']),
                    enabled: b['enabled'] == true,
                    fill: b['enabled'] == true ? primary : web.border,
                    onTap: () => _act('buy', [it['id']])),
            ],
          ));
        }
      }
      children.add(hint(m['earnHint']));

      return Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 16),
            child: Row(
              children: [
                circleBack(context, 'shop-back', _s(m['back']), _s(m['backIcon']), () => _act('back')),
                Expanded(
                  child: Text(
                    _s(m['title']),
                    textAlign: TextAlign.center,
                    style: TextStyle(fontSize: 20, fontWeight: FontWeight.w700, color: web.text),
                  ),
                ),
                Container(
                  key: const ValueKey('shop-balance'),
                  height: 44,
                  padding: const EdgeInsets.symmetric(horizontal: 12),
                  decoration: BoxDecoration(
                    color: web.surface,
                    border: Border.all(color: web.border),
                    borderRadius: BorderRadius.circular(22),
                  ),
                  child: Row(
                    mainAxisSize: MainAxisSize.min,
                    spacing: 5,
                    children: [
                      const Text('⭐', style: TextStyle(fontSize: 15)),
                      Text(_s(m['balance']), style: TextStyle(color: web.text, fontWeight: FontWeight.w800, fontSize: 15)),
                    ],
                  ),
                ),
              ],
            ),
          ),
          Padding(
            padding: const EdgeInsets.fromLTRB(20, 0, 20, 12),
            child: Wrap(
              spacing: 8,
              runSpacing: 8,
              children: [
                for (final c in _list(m['cats']))
                  Semantics(
                    button: true,
                    selected: c['on'] == true,
                    label: _s(c['label']),
                    excludeSemantics: true,
                    child: GestureDetector(
                      key: ValueKey('shop-cat-${c['id'] ?? 'all'}'),
                      onTap: () => _pickCat(c['id']),
                      child: Container(
                        width: 48,
                        height: 48,
                        decoration: BoxDecoration(
                          color: c['on'] == true ? primary : web.surface,
                          border: Border.all(color: c['on'] == true ? primary : web.border, width: 1.5),
                          shape: BoxShape.circle,
                        ),
                        child: Center(
                          child: IonIcon(_s(c['icon']), size: 18, color: c['on'] == true ? Colors.white : web.textSecondary),
                        ),
                      ),
                    ),
                  ),
              ],
            ),
          ),
          Expanded(
            child: ListView(
              key: const ValueKey('shop-list'),
              padding: EdgeInsets.fromLTRB(20, 0, 20, FabRules.clearance),
              children: children,
            ),
          ),
        ],
      );
    },
  );
}

Map<String, Object?> _map(Object? v) => v is Map ? Map<String, Object?>.from(v) : const {};
List<Map<String, Object?>> _list(Object? v) => v is List ? [for (final x in v) _map(x)] : const [];
String _s(Object? v) => v == null ? '' : '$v';
