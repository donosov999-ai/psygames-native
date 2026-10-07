import 'package:flutter/material.dart';

import 'feedback_fab.dart' show FabRules;
import 'info_screens.dart' show ModelPage, circleBack;
import 'ion_icon.dart';
import 'screen_ui.dart';
import 'web_theme.dart';

/// «МАГАЗИН» ПО МОДЕЛИ ВЕБА (задача 9424da3a; правило 4e679f41).
///
/// Баланс, цены, что куплено и надето, доступность кнопок (`abilityButtons`, `cosmeticRow`), ставку и
/// отчёт о последней трате считает веб под оболочкой (`app/shop.tsx`, `shopModel`), сюда приходят
/// готовые строки, цвета строками CSS и адреса картинок сборки. Нажатия — действия веба: вкладка
/// раздела, купить/применить способность, ставка, купить/надеть товар, «назад». Размеры — из `styles`
/// веб-экрана.
class ShopScreen extends StatelessWidget {
  const ShopScreen({super.key, required this.origin});
  static const route = '/shop';

  /// Адрес раздачи веб-сборки — картинки товаров приходят путями от неё.
  final String origin;

  void _act(String action, [List<Object?> args = const []]) => ScreenUi.act(route, action, args);

  @override
  Widget build(BuildContext context) => ModelPage(
    route: route,
    screenKey: 'shop-screen',
    builder: (context, m) {
      final web = WebTheme.of(context);
      final primary = cssColor(m['primary'], Theme.of(context).colorScheme.primary);
      String url(String u) => u.startsWith('http') ? u : '$origin$u';

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
                if (buttons.isNotEmpty) Column(mainAxisSize: MainAxisSize.min, spacing: 6, children: buttons),
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
                      onTap: () => _act('cat', [c['id']]),
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
