import 'package:flutter/material.dart';

import 'ion_icon.dart';
import 'screen_ui.dart';
import 'web_theme.dart';

/// ИТОГ ОЦЕНКИ `/assessment-result` НА FLUTTER — ПЕРЕНОС `frontend/app/assessment-result.tsx`
/// (задача 455d71b1, правило 4e679f41).
///
/// Подсчёт доменов, сохранение итога и остановка батареи остаются у веба (экран стоит под
/// оболочкой), сюда приходит модель: тексты, цвета уровней и ГЕОМЕТРИЯ радара числами
/// (`radarGeometry` веба — та же, что рисует его SVG). Здесь только рисунок; «Сохранить профиль» и
/// «На главную» — действия веба `apply` и `home`.
class AssessmentResultScreen extends StatelessWidget {
  const AssessmentResultScreen({super.key});

  static const route = '/assessment-result';

  void _act(String a) => ScreenUi.act(route, a);

  @override
  Widget build(BuildContext context) {
    final web = WebTheme.of(context);
    return ValueListenableBuilder<Map<String, Object?>?>(
      valueListenable: ScreenUi.model(route),
      builder: (context, m, _) {
        if (m == null || m['loading'] != null) {
          return Material(
            key: const ValueKey('assessment-loading'),
            color: web.background,
            child: Center(
              child: Text(_s(m?['loading']), style: TextStyle(color: web.text)),
            ),
          );
        }
        final hero = _map(m['hero']);
        // Вуаль `GradientSurface` веба ровная по всей плашке — наложить её на каждую точку градиента
        // то же самое, что положить слоем сверху.
        final veil = cssColor(hero['veil']);
        final grad = [for (final c in (hero['gradient'] as List? ?? const [])) Color.alphaBlend(veil, cssColor(c))];
        final onGrad = cssColor(hero['color'], Colors.white);
        final ai = _map(m['ai']);
        final recs = _list(m['recs']);
        Widget gap([double h = 14]) => SizedBox(height: h);
        return Material(
          key: const ValueKey('assessment-screen'),
          color: web.background,
          child: WebTheme.textDefaults(
            context,
            SafeArea(
              bottom: false,
              child: Align(
                alignment: Alignment.topCenter,
                child: ConstrainedBox(
                  constraints: const BoxConstraints(maxWidth: 540),
                  child: ListView(
                    key: const ValueKey('assessment-list'),
                    padding: const EdgeInsets.all(18),
                    children: [
                      Container(
                        key: const ValueKey('assessment-hero'),
                        padding: const EdgeInsets.all(22),
                        decoration: BoxDecoration(
                          borderRadius: BorderRadius.circular(16),
                          gradient: grad.length >= 2
                              ? LinearGradient(colors: grad, begin: Alignment.topLeft, end: Alignment.bottomRight)
                              : null,
                        ),
                        child: Column(
                          children: [
                            Text(_s(hero['emoji']), style: const TextStyle(fontSize: 44)),
                            const SizedBox(height: 6),
                            Text(
                              _s(hero['title']),
                              textAlign: TextAlign.center,
                              style: TextStyle(color: onGrad, fontSize: 18, fontWeight: FontWeight.w900, letterSpacing: 2),
                            ),
                            const SizedBox(height: 6),
                            Text(
                              _s(hero['subtitle']),
                              style: TextStyle(color: cssColor(hero['soft'], onGrad), fontSize: 12, fontWeight: FontWeight.w700),
                            ),
                          ],
                        ),
                      ),
                      gap(),
                      Center(child: _Radar(g: _map(m['radar']))),
                      gap(),
                      _title(context, _s(m['domainsTitle'])),
                      for (final (i, d) in _list(m['domains']).indexed) ...[if (i > 0) const SizedBox(height: 8), _domain(context, d)],
                      if (ai.isNotEmpty) ...[
                        gap(),
                        Container(
                          key: const ValueKey('assessment-ai'),
                          padding: const EdgeInsets.all(14),
                          decoration: BoxDecoration(
                            color: web.surface,
                            border: Border.all(color: cssColor(ai['color']), width: 1.5),
                            borderRadius: BorderRadius.circular(12),
                          ),
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                _s(ai['title']),
                                style: TextStyle(color: cssColor(ai['color']), fontSize: 11, fontWeight: FontWeight.w800, letterSpacing: 1),
                              ),
                              const SizedBox(height: 6),
                              Text(
                                _s(ai['text']),
                                style: TextStyle(color: web.text, fontSize: 14, height: 21 / 14),
                              ),
                            ],
                          ),
                        ),
                      ],
                      if (recs.isNotEmpty) ...[
                        gap(),
                        _title(context, _s(m['recsTitle'])),
                        Wrap(
                          spacing: 8,
                          runSpacing: 8,
                          children: [
                            for (final r in recs)
                              Container(
                                key: ValueKey('assessment-rec-${r['id']}'),
                                constraints: const BoxConstraints(minHeight: 48),
                                padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                                decoration: BoxDecoration(
                                  color: web.surface,
                                  border: Border.all(color: cssColor(r['color']), width: 1.5),
                                  borderRadius: BorderRadius.circular(16),
                                ),
                                child: Row(
                                  mainAxisSize: MainAxisSize.min,
                                  children: [
                                    IonIcon(_s(r['icon']), size: 16, color: cssColor(r['color'])),
                                    const SizedBox(width: 6),
                                    // Длинное имя игры переносится внутри фишки, а не вылезает за край.
                                    Flexible(
                                      child: Text(
                                        _s(r['name']),
                                        style: TextStyle(color: web.text, fontSize: 12, fontWeight: FontWeight.w700),
                                      ),
                                    ),
                                  ],
                                ),
                              ),
                          ],
                        ),
                      ],
                      gap(22),
                      _actions(context, m, grad, onGrad),
                      gap(22),
                      Text(
                        _s(m['footnote']),
                        textAlign: TextAlign.center,
                        style: TextStyle(fontSize: 11, fontStyle: FontStyle.italic, color: web.textSecondary),
                      ),
                    ],
                  ),
                ),
              ),
            ),
          ),
        );
      },
    );
  }

  Widget _title(BuildContext context, String t) => Padding(
    padding: const EdgeInsets.only(left: 4, bottom: 12),
    child: Text(
      t,
      style: TextStyle(fontSize: 16, fontWeight: FontWeight.w800, color: WebTheme.of(context).text),
    ),
  );

  Widget _domain(BuildContext context, Map<String, Object?> d) {
    final web = WebTheme.of(context);
    final color = cssColor(d['color']);
    return Container(
      key: ValueKey('assessment-domain-${d['id']}'),
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(color: web.surface, borderRadius: BorderRadius.circular(10)),
      child: Row(
        children: [
          Container(
            width: 4,
            height: 36,
            decoration: BoxDecoration(color: color, borderRadius: BorderRadius.circular(2)),
          ),
          const SizedBox(width: 10),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  _s(d['label']),
                  style: TextStyle(fontSize: 14, fontWeight: FontWeight.w700, color: web.text),
                ),
                const SizedBox(height: 2),
                Text(_s(d['meta']), style: TextStyle(fontSize: 11, color: web.textSecondary)),
              ],
            ),
          ),
          const SizedBox(width: 10),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
            decoration: BoxDecoration(color: color, borderRadius: BorderRadius.circular(8)),
            child: Text(
              _s(d['badge']),
              style: const TextStyle(color: Colors.black, fontSize: 10, fontWeight: FontWeight.w900),
            ),
          ),
        ],
      ),
    );
  }

  Widget _actions(BuildContext context, Map<String, Object?> m, List<Color> grad, Color onGrad) {
    final web = WebTheme.of(context);
    final save = _map(m['save']);
    final saved = _map(m['saved']);
    Widget btn({required Key key, required Widget child, Decoration? deco, VoidCallback? onTap}) => GestureDetector(
      key: key,
      behavior: HitTestBehavior.opaque,
      onTap: onTap,
      child: Container(constraints: const BoxConstraints(minHeight: 48), clipBehavior: Clip.antiAlias, decoration: deco, child: child),
    );
    Widget row(String ion, String label, Color color) => Padding(
      padding: const EdgeInsets.symmetric(vertical: 14),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          IonIcon(ion, size: 20, color: color),
          const SizedBox(width: 8),
          Flexible(
            child: Text(
              label,
              style: TextStyle(color: color, fontSize: 14, fontWeight: FontWeight.w800, letterSpacing: 1),
            ),
          ),
        ],
      ),
    );
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        if (m['applied'] != true)
          btn(
            key: const ValueKey('assessment-apply'),
            onTap: () => _act('apply'),
            deco: BoxDecoration(
              borderRadius: BorderRadius.circular(16),
              gradient: grad.length >= 2 ? LinearGradient(colors: grad) : null,
            ),
            child: row('checkmark-circle', _s(save['label']), cssColor(save['color'], onGrad)),
          )
        else
          btn(
            key: const ValueKey('assessment-applied'),
            deco: BoxDecoration(color: cssColor(saved['bg']), borderRadius: BorderRadius.circular(16)),
            child: row('checkmark', _s(saved['label']), cssColor(saved['color'], Colors.black)),
          ),
        const SizedBox(height: 10),
        btn(
          key: const ValueKey('assessment-home'),
          onTap: () => _act('home'),
          deco: BoxDecoration(
            color: web.surface,
            border: Border.all(color: web.border),
            borderRadius: BorderRadius.circular(16),
          ),
          child: Padding(
            padding: const EdgeInsets.symmetric(vertical: 14),
            child: Text(
              _s(m['home']),
              textAlign: TextAlign.center,
              style: TextStyle(color: web.text, fontSize: 14, fontWeight: FontWeight.w700),
            ),
          ),
        ),
      ],
    );
  }
}

/// Радар по геометрии веба: кольца (пунктир, кроме нулевого), оси, многоугольник, точки, подписи.
class _Radar extends StatelessWidget {
  const _Radar({required this.g});
  final Map<String, Object?> g;

  @override
  Widget build(BuildContext context) {
    final size = _d(g['size'], 320);
    return Semantics(
      key: const ValueKey('assessment-radar'),
      container: true,
      child: CustomPaint(
        size: Size.square(size),
        painter: RadarPainter(g, text: DefaultTextStyle.of(context).style),
      ),
    );
  }
}

@visibleForTesting
class RadarPainter extends CustomPainter {
  RadarPainter(this.g, {this.text = const TextStyle()});
  final Map<String, Object?> g;

  /// Шрифт экрана: у рисовальщика нет DefaultTextStyle, без него подписи шли бы шрифтом по умолчанию.
  final TextStyle text;

  @override
  void paint(Canvas canvas, Size size) {
    final c = Offset(_d(g['cx']), _d(g['cy']));
    Offset pt(Map<String, Object?> p) => Offset(_d(p['x']), _d(p['y']));
    for (final r in _list(g['rings'])) {
      final paint = Paint()
        ..style = PaintingStyle.stroke
        ..color = cssColor(r['color'])
        ..strokeWidth = _d(r['width'], 1);
      final radius = _d(r['r']);
      if (r['dashed'] == true) {
        // strokeDasharray "3,3": штрих 3 и пропуск 3 по окружности.
        final circumference = 2 * 3.141592653589793 * radius;
        final n = (circumference / 6).floor();
        for (var i = 0; i < n; i++) {
          final a0 = i * 6 / radius;
          canvas.drawArc(Rect.fromCircle(center: c, radius: radius), a0, 3 / radius, false, paint);
        }
      } else {
        canvas.drawCircle(c, radius, paint);
      }
    }
    final axis = Paint()
      ..color = const Color(0xFF1E1E3A)
      ..strokeWidth = 0.5;
    for (final a in _list(g['axes'])) {
      canvas.drawLine(c, pt(a), axis);
    }
    final poly = _list(g['poly']);
    if (poly.length >= 3) {
      final path = Path()..addPolygon([for (final p in poly) pt(p)], true);
      canvas.drawPath(path, Paint()..color = const Color(0x407C3AED));
      canvas.drawPath(
        path,
        Paint()
          ..style = PaintingStyle.stroke
          ..color = const Color(0xFF7C3AED)
          ..strokeWidth = 2,
      );
    }
    for (final p in _list(g['points'])) {
      canvas.drawCircle(pt(p), 4, Paint()..color = cssColor(p['color']));
      canvas.drawCircle(
        pt(p),
        4,
        Paint()
          ..style = PaintingStyle.stroke
          ..color = Colors.white
          ..strokeWidth = 1,
      );
    }
    for (final l in _list(g['labels'])) {
      final tp = TextPainter(
        text: TextSpan(
          text: _s(l['text']),
          style: text.copyWith(fontSize: 9, color: const Color(0xFF94A3B8)),
        ),
        textDirection: TextDirection.ltr,
      )..layout();
      tp.paint(canvas, pt(l) - Offset(tp.width / 2, tp.height / 2));
    }
  }

  @override
  bool shouldRepaint(RadarPainter old) => old.g != g;
}

Map<String, Object?> _map(Object? v) => v is Map ? Map<String, Object?>.from(v) : const {};
List<Map<String, Object?>> _list(Object? v) => v is List ? [for (final x in v) _map(x)] : const [];
String _s(Object? v) => v == null ? '' : '$v';
double _d(Object? v, [double f = 0]) => v is num ? v.toDouble() : f;
