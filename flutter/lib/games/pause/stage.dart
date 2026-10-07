// «Пауза»: сцена практики — картинка шага, часы фазы, летающий глаз.
//
// Взято у «Умного будильника» (его экран практики уже прошёл замечания Дениса по
// кадрам 23.09.2026), а не нарисовано заново: веб-экран `/games/pause` показывает
// ту же картинку страницей зарядки, и перенос обязан выглядеть так же.
// Массаж лица и три режима глаз — виджетами общего пакета practice_kit (02.10.2026:
// каталог один на оба приложения, и в PsyGames они теперь есть).
// ⚠️ Сама сцена (часы фазы, картинка, летающий глаз) — ещё копия будильника:
// следующий шаг — перенести её в пакет вместе с картинками.
import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:flutter_svg/flutter_svg.dart';
import 'package:practice_kit/practice_kit.dart';


class PracticeStage extends StatelessWidget {
  const PracticeStage({
    super.key,
    required this.engine,
    required this.cues,
    required this.elapsed,
    this.running = true,
    this.locale = 'en',
    this.onEyeHit,
  });

  final Practices engine;
  final List<Json> cues;
  final int elapsed;
  final bool running;
  final String locale;

  /// Засчитанное попадание в режимах глаз «поймай совпадение» и «две точки».
  final VoidCallback? onEyeHit;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final breath = cues.where((c) => c['setId'] == 'breathing').firstOrNull;
    final eye = cues.where((c) => c['setId'] == 'eye-gym').firstOrNull;
    // Режимы с нажатиями: свой экран мишеней вместо летающего глаза.
    final specialEye = eye != null && ['catch-overlap', 'two-dots'].contains(eye['programId']);
    final aux = cues.where((c) => c['setId'] != 'breathing' && c['setId'] != 'eye-gym').toList();
    // Напряжение в начале и в конце шага держит картинку на месте: сменить её
    // посреди сокращения — значит показать не то, что человек сейчас делает.
    final tension = aux
        .where((c) => c['channel'] == 'tension' && (c['progress'] < .14 || c['progress'] > .88))
        .firstOrNull;
    final picture = tension ?? (aux.isEmpty ? null : aux[(elapsed ~/ 4000) % aux.length]);
    final phase = breath ?? picture;
    return LayoutBuilder(
      builder: (context, box) {
        final w = box.maxWidth, h = box.maxHeight;
        final split = breath != null && picture != null && eye == null;
        final sceneWidth = split ? w * .7 : w;
        final artW = math.min(sceneWidth * .7, h * 1.05), artH = math.min(h * .72, artW * 390 / 600);
        // Массаж лица — своё поле во всю сцену, без рамки фаз.
        final massage = picture?['setId'] == 'face-massage';
        return Semantics(
          label: cues.map((c) => c['title']).join(', '),
          child: Stack(
            children: [
              if (picture != null && massage)
                Center(
                  child: SizedBox.square(dimension: math.min(w * .9, h * .9), child: PracticeArtwork(cue: picture)),
                ),
              if (picture != null && !massage)
                Positioned(left: 0, top: 0, bottom: 0, width: sceneWidth,
                  child: Center(child: SizedBox(width: artW, height: artH, child: PracticeArtwork(cue: picture))),
                ),
              if (phase != null && !(massage && breath == null))
                Positioned.fill(
                  right: split ? w * .3 : 0,
                  child: CustomPaint(
                    painter: PhaseClock(
                      cue: phase,
                      program: engine.program(phase['setId'], phase['programId']),
                      breathing: breath != null,
                      track: scheme.onSurface.withValues(alpha: .22),
                      run: scheme.primary,
                      dotColor: const Color(0xff5bd8d0),
                      crowded: eye == null ? true : picture != null,
                    ),
                  ),
                ),
              if (breath != null && eye == null)
                Align(
                  alignment: picture == null ? const Alignment(0, -.2) : const Alignment(1, -.2),
                  child: SizedBox.square(
                    dimension: picture == null ? math.min(w * .6, h * .5) : math.min(w * .3, h * .28),
                    child: BreathVisual(breath: breath,
                      muscle: cues.where((c) => c['setId'] == 'pelvic-floor').firstOrNull),
                  ),
                ),
              if (specialEye)
                Positioned.fill(
                  bottom: breath != null ? 64 : 0,
                  child: EyeModes(
                    key: ValueKey(eye['programId']),
                    mode: eye['programId'],
                    elapsed: elapsed,
                    running: running,
                    locale: locale,
                    onHit: onEyeHit,
                  ),
                ),
              if (eye != null && eye['programId'] == 'geometry-paths')
                Positioned.fill(child: CustomPaint(painter: EyeGeometryGuide(eye['stepId'], scheme.onSurface))),
              if (eye != null && !specialEye && eyePosition(eye) != null)
                Builder(
                  builder: (_) {
                    final p = eyePosition(eye)!;
                    return Positioned(
                      left: p.dx * w - 22,
                      top: p.dy * h - 22,
                      child: const SizedBox(width: 44, height: 44, child: CustomPaint(painter: FlyingEye())),
                    );
                  },
                ),
              if (breath != null)
                Align(
                  alignment: const Alignment(0, .85),
                  child: Container(
                    padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
                    decoration: BoxDecoration(
                      color: Theme.of(context).scaffoldBackgroundColor,
                      borderRadius: BorderRadius.circular(20),
                    ),
                    child: Text(
                      '${breath['title']} · ${_seconds(breath)}',
                      key: const Key('pause-breath-phase'),
                      style: Theme.of(context).textTheme.titleLarge,
                    ),
                  ),
                ),
            ],
          ),
        );
      },
    );
  }

  int _seconds(Json c) {
    final p = engine.program(c['setId'], c['programId']);
    final step = objects(p['steps']).firstWhere((s) => s['id'] == c['stepId']);
    return math.max(1, ((step['durationMs'] * (1 - c['progress'])) / 1000).ceil());
  }
}

/// Куда смотреть на шаге гимнастики глаз: доли ширины и высоты сцены.
/// `null` — шаг без мишени (ладони, взгляд вдаль).
Offset? eyePosition(Json c) {
  final p = (c['progress'] as num).toDouble().clamp(0, 1), tau = 2 * math.pi;
  if (c['programId'] == 'geometry-paths') return eyeGeometryPosition(c['stepId'], p * 2);
  switch (c['stepId']) {
    case 'directions':
      const dirs = [
        Offset(0, -1), Offset(.707, -.707), Offset(1, 0), Offset(.707, .707),
        Offset(0, 1), Offset(-.707, .707), Offset(-1, 0), Offset(-.707, -.707),
      ];
      final index = (p * 8).floor() % 8, local = p * 8 - (p * 8).floor(), ease = local * local * (3 - 2 * local);
      final point = Offset.lerp(dirs[index], dirs[(index + 1) % 8], ease.toDouble())!;
      return Offset(.5 + .45 * point.dx, .46 + .38 * point.dy);
    case 'horizontal':
      return Offset(.5 + .45 * math.sin(tau * 3 * p), .46);
    case 'vertical':
      return Offset(.5, .46 + .38 * math.sin(tau * 3 * p));
    case 'circle':
      return Offset(.5 + .45 * math.cos(tau * 3 * p), .46 + .38 * math.sin(tau * 3 * p));
    case 'figure-eight':
      final a = tau * 2 * p;
      return Offset(.5 + .45 * math.sin(a), .46 + .38 * math.sin(a) * math.cos(a));
    case 'converge':
      return Offset(.5, .08 + .38 * p);
    case 'far-focus':
    case 'palming':
      return null;
    case 'focus':
      return const Offset(.5, .42);
    default:
      return const Offset(.5, .46);
  }
}

/// Картинка шага: фигура тела (webp) и поверх — SVG шага, выгруженный рисовалками
/// веб-страницы зарядки (`flutter/tools/export-pause.cjs`).
class PracticeArtwork extends StatelessWidget {
  const PracticeArtwork({super.key, required this.cue});

  final Json cue;

  @override
  Widget build(BuildContext context) {
    final String set = cue['setId'], program = cue['programId'];
    if (set == 'face-massage') {
      return FaceMassageGuide(step: cue['stepId'], program: program, progress: (cue['progress'] as num).toDouble());
    }
    if (set == 'postures') {
      final pose = ['horse', 'cobbler', 'lotus'].firstWhere(program.contains, orElse: () => 'mountain');
      return Image.asset('assets/pause/cosmic-body/pose-$pose-phone-v1.webp', fit: BoxFit.contain);
    }
    final cosmic = ['face-speech', 'abdomen', 'pelvic-floor'].contains(set);
    return ClipRect(
      child: LayoutBuilder(
        builder: (context, b) => Stack(
          children: [
            if (cosmic)
              Builder(
                builder: (_) {
                  final factor = set == 'face-speech' ? 6.3 : 4.0,
                      shift = set == 'face-speech' ? -.0794 : set == 'abdomen' ? -.435 : -.51;
                  final height = b.maxHeight * factor, width = height * 2 / 3;
                  return Positioned(
                    left: (b.maxWidth - width) / 2,
                    top: b.maxHeight * .5 + height * shift,
                    width: width,
                    height: height,
                    child: Image.asset('assets/pause/cosmic-body/body-master-v1.webp', fit: BoxFit.fill),
                  );
                },
              ),
            Positioned.fill(
              child: SvgPicture.asset(
                'assets/pause/guides/${set}__${program}__${cue['stepId']}.svg',
                fit: BoxFit.contain,
                // Шага без картинки нет в каталоге рисовалок (дыхание, глаза) —
                // пустое место лучше красной плашки ошибки посреди практики.
                errorBuilder: (_, _, _) => const SizedBox.shrink(),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// Часы фазы: контур (квадрат, треугольник или круг) и бегущая точка.
///
/// Уроки будильника, перенесённые вместе с кодом (замечания Дениса 23.09.2026):
/// цвета из темы, а не зашитые; обе линии одной толщины (иначе грань «дышит» на
/// переходе); пройденное — одним путём, а не отрезками (иначе торчат углы); при
/// дыхании внутри квадрата надувается шарик.
class PhaseClock extends CustomPainter {
  PhaseClock({
    required this.cue,
    required this.program,
    required this.breathing,
    required this.track,
    required this.run,
    required this.dotColor,
    this.crowded = false,
  });

  final Json cue, program;
  final bool breathing;
  final Color track, run, dotColor;

  /// В центре уже стоит картинка — шарик не рисуем, чтобы не наложить одно на другое.
  final bool crowded;

  double _swell(String stepId, double progress) {
    const low = .34, high = 1.0;
    switch (stepId) {
      case 'inhale':
        return low + (high - low) * progress;
      case 'hold-in':
        return high;
      case 'exhale':
        return high - (high - low) * progress;
      default:
        return low;
    }
  }

  @override
  void paint(Canvas canvas, Size size) {
    final steps = objects(program['steps']),
        index = math.max(0, steps.indexWhere((s) => s['id'] == cue['stepId']));
    final progress = (cue['progress'] as num).toDouble();
    final side = math.min(size.width * .78, size.height * .66);
    final rect = Rect.fromCenter(center: Offset(size.width / 2, size.height * .40), width: side, height: side);
    const stroke = 6.0;
    final outline = Paint()
      ..color = track
      ..style = PaintingStyle.stroke
      ..strokeWidth = stroke
      ..strokeJoin = StrokeJoin.round;
    final fill = Paint()
      ..color = run
      ..style = PaintingStyle.stroke
      ..strokeWidth = stroke
      ..strokeCap = StrokeCap.round
      ..strokeJoin = StrokeJoin.round;
    final shape = program['leaderShape'];
    final phased = !breathing &&
        ['pelvic-floor', 'isometrics', 'abdomen'].contains(cue['setId']) &&
        steps.length >= 2 &&
        steps.length <= 8;
    final sides = breathing
        ? (shape == 'square' ? 4 : shape == 'triangle' ? 3 : 0)
        : (phased ? steps.length : 0);
    Offset? dot;
    if (sides >= 3) {
      final points = sides == 4
          ? [rect.bottomLeft, rect.topLeft, rect.topRight, rect.bottomRight]
          : List.generate(sides, (i) {
              final angle = -math.pi / 2 + 2 * math.pi * i / sides;
              return rect.center + Offset(math.cos(angle) * rect.width / 2, math.sin(angle) * rect.height / 2);
            });
      canvas.drawPath(Path()..addPolygon(points, true), outline);
      if (breathing && !crowded) {
        final r = rect.width / 2 * .78 * _swell('${cue['stepId']}', progress);
        canvas.drawCircle(rect.center, r, Paint()..color = run.withValues(alpha: .16));
        canvas.drawCircle(
          rect.center,
          r,
          Paint()
            ..color = run.withValues(alpha: .55)
            ..style = PaintingStyle.stroke
            ..strokeWidth = 2,
        );
      }
      final current = index % sides;
      dot = Offset.lerp(points[current], points[(current + 1) % sides], progress);
      final done = Path()..moveTo(points[0].dx, points[0].dy);
      for (int i = 1; i <= current; i++) {
        done.lineTo(points[i % sides].dx, points[i % sides].dy);
      }
      done.lineTo(dot!.dx, dot.dy);
      canvas.drawPath(done, fill);
    } else {
      final radius = math.min(rect.width, rect.height) / 2, oval = Rect.fromCircle(center: rect.center, radius: radius);
      double fraction;
      if (breathing) {
        final duration = steps.fold<num>(0, (v, s) => v + s['durationMs']);
        final before = steps.take(index).fold<num>(0, (v, s) => v + s['durationMs']);
        fraction = (before + (steps[index]['durationMs'] as num) * progress) / duration;
      } else {
        fraction = phased ? (index + progress) / steps.length : progress;
      }
      canvas.drawOval(oval, outline);
      canvas.drawArc(oval, -math.pi / 2, 2 * math.pi * fraction, false, fill);
      final angle = -math.pi / 2 + 2 * math.pi * fraction;
      dot = rect.center + Offset(math.cos(angle) * radius, math.sin(angle) * radius);
    }
    canvas.drawCircle(dot, 14, Paint()..color = dotColor.withValues(alpha: .18));
    canvas.drawCircle(dot, 11, Paint()..color = const Color(0xffffffff));
    canvas.drawCircle(dot, 9, Paint()..color = dotColor);
  }

  @override
  bool shouldRepaint(covariant PhaseClock oldDelegate) => true;
}

/// Летающий глаз для гимнастики глаз: белок, радужка, зрачок и блик — рисуется
/// кодом, чтобы читаться на любой теме.
class FlyingEye extends CustomPainter {
  const FlyingEye();

  @override
  void paint(Canvas canvas, Size size) {
    final center = Offset(size.width / 2, size.height / 2);
    final r = math.min(size.width, size.height) / 2;
    canvas.drawCircle(center, r, Paint()..color = const Color(0xff1f8f86).withValues(alpha: .18));
    canvas.drawCircle(center, r * .82, Paint()..color = const Color(0xffffffff));
    canvas.drawCircle(
      center,
      r * .82,
      Paint()
        ..color = const Color(0xff1f8f86)
        ..style = PaintingStyle.stroke
        ..strokeWidth = 2,
    );
    canvas.drawCircle(center, r * .46, Paint()..color = const Color(0xff2aa79b));
    canvas.drawCircle(center, r * .24, Paint()..color = const Color(0xff10312f));
    canvas.drawCircle(center + Offset(-r * .18, -r * .2), r * .1, Paint()..color = const Color(0xffffffff));
  }

  @override
  bool shouldRepaint(covariant FlyingEye oldDelegate) => false;
}
