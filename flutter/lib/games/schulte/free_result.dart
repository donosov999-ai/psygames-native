/// КАРТОЧКА РЕЗУЛЬТАТА СВОБОДНОЙ ПАРТИИ «ШУЛЬТЕ»: личный рекорд, график и тренд (задача 793b9faf).
///
/// Веб показывал на экране результата строку «12,3 сек · Личный рекорд: 11,8 сек», график последних
/// времён (`ResultSparkline`) и подпись тренда («лучше среднего на 8 %»). Здесь — то же, тем же
/// словарём. Кладётся в слот `details` общего итога [LevelResult] — своих кнопок «Дальше» тут нет.
library;

import 'package:flutter/material.dart';

import '../../shell/l10n.dart';
import 'record_book.dart';

class SchulteFreeResultCard extends StatelessWidget {
  const SchulteFreeResultCard({super.key, required this.result});

  final SchulteRecordResult result;

  /// Строка веба: «своё время · Личный рекорд: лучшее время». Секунды — до десятых.
  static String comparisonLine(SchulteRecordResult r) {
    final sec = L.t('seconds');
    return '${r.own.toStringAsFixed(1)} $sec · ${L.t('personalBest')}: ${r.best.toStringAsFixed(1)} $sec';
  }

  /// Подпись тренда: у веба она стоит под графиком и считается от среднего прежних партий.
  static String? trendText(SchulteRecordResult r) {
    final t = SchulteRecordBook.trend(r);
    if (t == null) return null;
    if (t.pct == 0) return L.t('trendOnAverage');
    // Ключи — буквальными вызовами: генератор словаря (`embed-l10n.mjs`) ищет `L.t('…')` и не видит
    // ключ, собранный тернарником (так `trendBetterPct` однажды остался пустым в нативной сборке).
    final line = t.better ? L.t('trendBetterPct') : L.t('trendWorsePct');
    return line.replaceAll('{n}', '${t.pct}');
  }

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final text = Theme.of(context).textTheme;
    final trend = trendText(result);
    return Column(mainAxisSize: MainAxisSize.min, children: [
      Text(comparisonLine(result),
          key: const Key('schulte-record-line'), style: text.titleSmall, textAlign: TextAlign.center),
      // График и тренд — от двух прежних партий: тренд из одной точки ничего не говорит (как у веба).
      if (trend != null) ...[
        const SizedBox(height: 8),
        SchulteSparkline(key: const Key('schulte-sparkline'), points: result.points, color: scheme.primary),
        const SizedBox(height: 4),
        Text(trend,
            key: const Key('schulte-trend'),
            style: text.bodySmall?.copyWith(color: scheme.primary, fontWeight: FontWeight.w600)),
      ],
    ]);
  }
}

/// Линия последних времён: старые слева, текущая справа крупной точкой; большее время — выше.
/// Размер и отступы — как у веб-`ResultSparkline` (220×48, поля 6). Слово «лучше / хуже» несёт
/// подпись тренда, а не направление линии.
class SchulteSparkline extends StatelessWidget {
  const SchulteSparkline({super.key, required this.points, required this.color});

  final List<double> points;
  final Color color;

  static const double width = 220, height = 48, pad = 6;

  /// Координаты точек в рамке [width]×[height]; одна точка — по центру. Вынесено для проб.
  static List<Offset> layout(List<double> points) {
    if (points.isEmpty) return const [];
    final lo = points.reduce((a, b) => a < b ? a : b);
    final hi = points.reduce((a, b) => a > b ? a : b);
    final range = hi - lo == 0 ? 1.0 : hi - lo;
    final step = points.length > 1 ? (width - pad * 2) / (points.length - 1) : 0.0;
    return [
      for (var i = 0; i < points.length; i += 1)
        Offset(
          points.length > 1 ? pad + i * step : width / 2,
          pad + (height - pad * 2) * (1 - (points[i] - lo) / range),
        ),
    ];
  }

  @override
  Widget build(BuildContext context) => SizedBox(
        width: width,
        height: height,
        child: CustomPaint(painter: _SparklinePainter(layout(points), color, Theme.of(context).colorScheme.onSurface)),
      );
}

class _SparklinePainter extends CustomPainter {
  _SparklinePainter(this.coords, this.color, this.dim);

  final List<Offset> coords;
  final Color color, dim;

  @override
  void paint(Canvas canvas, Size size) {
    if (coords.isEmpty) return;
    final line = Paint()
      ..color = color
      ..style = PaintingStyle.stroke
      ..strokeWidth = 2;
    final path = Path()..moveTo(coords.first.dx, coords.first.dy);
    for (final p in coords.skip(1)) {
      path.lineTo(p.dx, p.dy);
    }
    canvas.drawPath(path, line);
    for (var i = 0; i < coords.length; i += 1) {
      final last = i == coords.length - 1;
      canvas.drawCircle(coords[i], last ? 4 : 2.5, Paint()..color = last ? color : dim.withValues(alpha: 0.5));
    }
  }

  @override
  bool shouldRepaint(_SparklinePainter old) =>
      old.coords != coords || old.color != color || old.dim != dim;
}
