import 'package:flutter/material.dart';

import 'feedback_fab.dart' show FabRules;
import 'ion_icon.dart';
import 'screen_ui.dart';
import 'web_theme.dart';

/// КАЛЕНДАРЬ СЕРИИ `/streak-calendar` НА FLUTTER — ПЕРЕНОС `frontend/app/streak-calendar.tsx`
/// (задача cd77367d, правило 4e679f41).
///
/// Рисунок — веба (числа из его `styles`), данные — модель веба ([ScreenUi]): дни зарядки, полоски
/// серии, «сегодня», подписи для чтения вслух и названия месяца/дней недели на языке человека
/// считает экран, стоящий под оболочкой. Месяц листает действие веба `month`, «Назад» — `back`.
class StreakCalendarScreen extends StatelessWidget {
  const StreakCalendarScreen({super.key});

  static const route = '/streak-calendar';

  static const _orange = Color(0xFFF97316);
  static const _strip = Color(0x66FB923C);

  void _act(String a, [List<Object?> args = const []]) => ScreenUi.act(route, a, args);

  @override
  Widget build(BuildContext context) {
    final web = WebTheme.of(context);
    return ValueListenableBuilder<Map<String, Object?>?>(
      valueListenable: ScreenUi.model(route),
      builder: (context, m, _) {
        if (m == null) {
          return ColoredBox(
            color: web.background,
            child: const Center(child: CircularProgressIndicator(key: ValueKey('calendar-loading'))),
          );
        }
        final labels = _map(m['labels']);
        final month = _map(m['month']);
        final primary = cssColor(m['primary'], Theme.of(context).colorScheme.primary);
        final rtl = Directionality.of(context) == TextDirection.rtl;
        return Material(
          key: const ValueKey('calendar-screen'),
          color: web.background,
          child: WebTheme.textDefaults(
            context,
            SafeArea(
              bottom: false,
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Padding(
                    padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 16),
                    child: Row(
                      children: [
                        _round(
                          context,
                          'calendar-back',
                          _s(labels['back']),
                          rtl ? 'arrow-forward' : 'arrow-back',
                          web.surface,
                          () => _act('back'),
                        ),
                        Expanded(
                          child: Text(
                            _s(m['title']),
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            textAlign: TextAlign.center,
                            style: TextStyle(fontSize: 19, fontWeight: FontWeight.w900, color: web.text),
                          ),
                        ),
                        const SizedBox(width: 44),
                      ],
                    ),
                  ),
                  Expanded(
                    child: Align(
                      alignment: Alignment.topCenter,
                      child: ConstrainedBox(
                        constraints: const BoxConstraints(maxWidth: 620),
                        child: ListView(
                          key: const ValueKey('calendar-list'),
                          padding: EdgeInsets.fromLTRB(16, 0, 16, FabRules.clearance),
                          children: [
                            Row(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                for (final (i, x) in _list(m['metrics']).indexed) ...[
                                  if (i > 0) const SizedBox(width: 8),
                                  Expanded(child: _metric(context, x)),
                                ],
                              ],
                            ),
                            const SizedBox(height: 12),
                            Padding(
                              padding: const EdgeInsets.symmetric(horizontal: 16),
                              child: Text(
                                _s(m['bestCaption']),
                                textAlign: TextAlign.center,
                                style: TextStyle(fontSize: 13, height: 18 / 13, color: web.textSecondary),
                              ),
                            ),
                            const SizedBox(height: 12),
                            Container(
                              key: const ValueKey('calendar-card'),
                              padding: const EdgeInsets.fromLTRB(10, 14, 10, 18),
                              decoration: BoxDecoration(
                                color: web.surface,
                                border: Border.all(color: web.border),
                                borderRadius: BorderRadius.circular(22),
                              ),
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.stretch,
                                children: [
                                  Padding(
                                    padding: const EdgeInsets.symmetric(horizontal: 4),
                                    child: Row(
                                      children: [
                                        _round(
                                          context,
                                          'calendar-prev',
                                          _s(labels['prev']),
                                          rtl ? 'chevron-forward' : 'chevron-back',
                                          web.background,
                                          () => _act('month', [-1]),
                                          size: 22,
                                        ),
                                        Expanded(
                                          child: Padding(
                                            padding: const EdgeInsets.symmetric(horizontal: 8),
                                            child: Text(
                                              _s(month['title']),
                                              key: const ValueKey('calendar-month'),
                                              textAlign: TextAlign.center,
                                              style: TextStyle(fontSize: 17, fontWeight: FontWeight.w900, color: web.text),
                                            ),
                                          ),
                                        ),
                                        Opacity(
                                          opacity: month['canNext'] == true ? 1 : 0.28,
                                          child: _round(
                                            context,
                                            'calendar-next',
                                            _s(labels['next']),
                                            rtl ? 'chevron-back' : 'chevron-forward',
                                            web.background,
                                            month['canNext'] == true ? () => _act('month', [1]) : null,
                                            size: 22,
                                          ),
                                        ),
                                      ],
                                    ),
                                  ),
                                  const SizedBox(height: 14),
                                  Row(
                                    children: [
                                      for (final w in (m['weekdays'] as List? ?? const []))
                                        Expanded(
                                          child: Text(
                                            _s(w).toUpperCase(),
                                            textAlign: TextAlign.center,
                                            style: TextStyle(fontSize: 11, fontWeight: FontWeight.w800, color: web.textSecondary),
                                          ),
                                        ),
                                    ],
                                  ),
                                  const SizedBox(height: 4),
                                  _grid(context, m['cells'] as List? ?? const [], primary),
                                  if (m['empty'] != null)
                                    Padding(
                                      padding: const EdgeInsets.fromLTRB(16, 12, 16, 0),
                                      child: Text(
                                        _s(m['empty']),
                                        key: const ValueKey('calendar-empty'),
                                        textAlign: TextAlign.center,
                                        style: TextStyle(fontSize: 13, height: 18 / 13, color: web.textSecondary),
                                      ),
                                    ),
                                ],
                              ),
                            ),
                          ],
                        ),
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ),
        );
      },
    );
  }

  Widget _metric(BuildContext context, Map<String, Object?> x) {
    final web = WebTheme.of(context);
    return Container(
      constraints: const BoxConstraints(minHeight: 112),
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 12),
      decoration: BoxDecoration(
        color: web.surface,
        border: Border.all(color: cssColor(x['border'], web.border)),
        borderRadius: BorderRadius.circular(16),
      ),
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Text(_s(x['emoji']), style: const TextStyle(fontSize: 22)),
          const SizedBox(height: 2),
          Text(
            _s(x['value']),
            style: TextStyle(fontSize: 26, fontWeight: FontWeight.w900, color: web.text),
          ),
          const SizedBox(height: 2),
          Text(
            _s(x['label']),
            textAlign: TextAlign.center,
            style: TextStyle(fontSize: 11, fontWeight: FontWeight.w700, color: web.textSecondary),
          ),
        ],
      ),
    );
  }

  /// Сетка месяца: 7 колонок по 1/7, клетка 50 в высоту; полоска серии — половинками к соседям.
  Widget _grid(BuildContext context, List cells, Color primary) {
    final web = WebTheme.of(context);
    final rows = <Widget>[];
    for (var r = 0; r * 7 < cells.length; r++) {
      rows.add(
        Row(
          children: [
            for (var c = 0; c < 7; c++) Expanded(child: _cell(context, r * 7 + c < cells.length ? cells[r * 7 + c] : null, primary, web)),
          ],
        ),
      );
    }
    return Column(children: rows);
  }

  Widget _cell(BuildContext context, Object? raw, Color primary, WebColors web) {
    if (raw is! Map) return const SizedBox(height: 50);
    final x = Map<String, Object?>.from(raw);
    final trained = x['trained'] == true;
    final today = x['today'] == true;
    return Semantics(
      key: ValueKey('calendar-day-${x['day']}'),
      label: _s(x['a11y']),
      excludeSemantics: true,
      container: true,
      child: SizedBox(
        height: 50,
        child: LayoutBuilder(
          builder: (context, box) => Stack(
            alignment: Alignment.center,
            children: [
              if (x['left'] == true)
                Positioned(
                  left: 0,
                  width: box.maxWidth / 2,
                  top: 21,
                  height: 8,
                  child: const ColoredBox(color: _strip),
                ),
              if (x['right'] == true)
                Positioned(
                  left: box.maxWidth / 2,
                  right: 0,
                  top: 21,
                  height: 8,
                  child: const ColoredBox(color: _strip),
                ),
              Container(
                width: 40,
                height: 40,
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  color: trained ? _orange : null,
                  border: today ? Border.all(color: primary, width: 2) : null,
                  boxShadow: trained ? const [BoxShadow(color: Color(0x47F97316), blurRadius: 5, offset: Offset(0, 2))] : null,
                ),
                child: Stack(
                  alignment: Alignment.center,
                  children: [
                    Transform.translate(
                      offset: const Offset(0, -5),
                      child: Text(
                        '${x['day']}',
                        style: TextStyle(fontSize: 14, fontWeight: FontWeight.w800, color: trained ? Colors.white : web.text),
                      ),
                    ),
                    if (trained) const Positioned(bottom: 1, child: Text('🔥', style: TextStyle(fontSize: 11))),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _round(BuildContext context, String key, String label, String ion, Color bg, VoidCallback? onTap, {double size = 24}) {
    final web = WebTheme.of(context);
    return Semantics(
      button: true,
      enabled: onTap != null,
      label: label,
      child: GestureDetector(
        key: ValueKey(key),
        onTap: onTap,
        child: Container(
          width: 48,
          height: 48,
          decoration: BoxDecoration(color: bg, shape: BoxShape.circle),
          child: Center(
            child: IonIcon(ion, size: size, color: web.text),
          ),
        ),
      ),
    );
  }
}

Map<String, Object?> _map(Object? v) => v is Map ? Map<String, Object?>.from(v) : const {};
List<Map<String, Object?>> _list(Object? v) => v is List ? [for (final x in v) _map(x)] : const [];
String _s(Object? v) => v == null ? '' : '$v';
