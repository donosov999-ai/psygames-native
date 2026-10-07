// СЦЕНА ПРАКТИКИ — картинка шага, часы фазы, шар дыхания, летающий глаз. ОДНА на
// PsyGames («Пауза») и «Умный будильник».
//
// 🔴 До 07.10.2026 сцена жила тремя копиями: у будильника (полная, после замечаний
// Дениса 23.09: картинка внутри рамки фаз, белые линии схемы с тёмным ореолом на
// неоновом теле, кадр фигуры по набору) и урезанная у PsyGames — и правка одной
// не доходила до другой. Взята сцена будильника; фигуры тела — WebP веб-зарядки
// (те же изображения, что PNG будильника, в 14 раз легче), схемы шагов — те же 98
// SVG, что побайтно совпадали в обоих приложениях.
import 'dart:math' as math;
import 'dart:ui' as ui;

import 'package:flutter/material.dart';
import 'package:flutter_svg/flutter_svg.dart';

import 'breath_visual.dart';
import 'eye_geometry.dart';
import 'eye_modes.dart';
import 'face_massage_guide.dart';
import 'practices.dart';


class PracticeStage extends StatelessWidget {
  final VoidCallback? onEyeHit;
  final Practices engine;
  final List<Json> cues;
  final int elapsed;
  final bool running;
  final String locale;
  const PracticeStage({
    super.key,
    this.onEyeHit,
    required this.engine,
    required this.cues,
    required this.elapsed,
    this.running = true,
    this.locale = 'ru',
  });
  @override
  Widget build(BuildContext context) {
    final breath = cues.where((c) => c['setId'] == 'breathing').firstOrNull;
    final eye = cues.where((c) => c['setId'] == 'eye-gym').firstOrNull;
    final specialEye = eye != null &&
        ['catch-overlap', 'two-dots'].contains(eye['programId']);
    final aux = cues
        .where((c) => c['setId'] != 'breathing' && c['setId'] != 'eye-gym')
        .toList();
    final tension = aux
        .where(
          (c) =>
              c['channel'] == 'tension' &&
              (c['progress'] < .14 || c['progress'] > .88),
        )
        .firstOrNull;
    final picture =
        tension ?? (aux.isEmpty ? null : aux[(elapsed ~/ 4000) % aux.length]);
    final phase = breath ?? picture;
    return LayoutBuilder(
      builder: (context, box) {
        final w = box.maxWidth, h = box.maxHeight;
        final split = breath != null && picture != null && eye == null;
        final sceneWidth = split ? w * .7 : w;
        final massage = picture?['setId'] == 'face-massage';
        // Картинка — ВНУТРИ рамки фаз и по её центру: геометрия у них одна
        // (`phaseFrame`). Массаж лица рамки не имеет и остаётся своим полем.
        final frame = phaseFrame(Size(sceneWidth, h)).deflate(10);
        final round = phase != null &&
            PhaseClock.sidesOf(phase, engine.program(phase['setId'], phase['programId']), breath != null) != 4;
        return Semantics(
          label: cues.map((c) => c['title']).join(', '),
          child: Stack(
            children: [
              if (picture != null && massage)
                Center(
                  child: SizedBox.square(
                    dimension: math.min(w * .9, h * .9),
                    child: PracticeArtwork(cue: picture),
                  ),
                ),
              // Рамка — круг или многоугольник: картинка обрезается кругом,
              // иначе её углы торчали бы за линию.
              if (picture != null && !massage)
                Positioned.fromRect(
                  rect: frame,
                  child: round
                      ? ClipOval(child: PracticeArtwork(cue: picture))
                      : PracticeArtwork(cue: picture),
                ),
              if (phase != null && !(massage && breath == null))
                Positioned.fill(
                  right: split ? w * .3 : 0,
                  child: CustomPaint(
                    painter: PhaseClock(
                      cue: phase,
                      program: engine.program(
                        phase['setId'],
                        phase['programId'],
                      ),
                      breathing: breath != null,
                      track: Theme.of(
                        context,
                      ).colorScheme.onSurface.withValues(alpha: .22),
                      run: Theme.of(context).colorScheme.primary,
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
                  child: EyeModes(key: ValueKey(eye['programId']),
                    mode: eye['programId'], elapsed: elapsed,
                    running: running, locale: locale, onHit: onEyeHit),
                ),
              if (eye != null && eye['programId'] == 'geometry-paths')
                Positioned.fill(child: CustomPaint(painter: EyeGeometryGuide(
                  eye['stepId'], Theme.of(context).colorScheme.onSurface))),
              if (eye != null && !specialEye && eyePosition(eye) != null)
                Builder(
                  builder: (_) {
                    final p = eyePosition(eye)!;
                    // 🔴 ЗА ЧЕМ СЛЕДИТЬ ГЛАЗАМИ — САМ ГЛАЗ (ТЗ Дениса 23.09.2026:
                    // «для зарядки глаз цвет тоже надо поменять или вообще
                    // отрисовать глазик летающий, круглый»). Бирюзовый кружок
                    // сливался со спокойным фоном практик, а зрачок с бликом
                    // держит взгляд сам по себе: глазу есть за что цепляться.
                    return Positioned(
                      left: p.dx * w - 22,
                      top: p.dy * h - 22,
                      child: const SizedBox(
                        width: 44,
                        height: 44,
                        child: CustomPaint(painter: FlyingEye()),
                      ),
                    );
                  },
                ),
              if (breath != null)
                Align(
                  alignment: const Alignment(0, .85),
                  child: Container(
                    padding: const EdgeInsets.symmetric(
                      horizontal: 16,
                      vertical: 8,
                    ),
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
    return math.max(
      1,
      ((step['durationMs'] * (1 - c['progress'])) / 1000).ceil(),
    );
  }
}

Offset? eyePosition(Json c) {
  final p = (c['progress'] as num).toDouble().clamp(0, 1), tau = 2 * math.pi;
  if (c['programId'] == 'geometry-paths') {
    return eyeGeometryPosition(c['stepId'], p * 2);
  }
  switch (c['stepId']) {
    case 'directions':
      const dirs = [
        Offset(0, -1),
        Offset(.707, -.707),
        Offset(1, 0),
        Offset(.707, .707),
        Offset(0, 1),
        Offset(-.707, .707),
        Offset(-1, 0),
        Offset(-.707, -.707),
      ];
      final index = (p * 8).floor() % 8,
          local = p * 8 - (p * 8).floor(),
          ease = local * local * (3 - 2 * local);
      final point = Offset.lerp(
        dirs[index],
        dirs[(index + 1) % 8],
        ease.toDouble(),
      )!;
      return Offset(.5 + .45 * point.dx, .46 + .38 * point.dy);
    case 'horizontal':
      return Offset(.5 + .45 * math.sin(tau * 3 * p), .46);
    case 'vertical':
      return Offset(.5, .46 + .38 * math.sin(tau * 3 * p));
    case 'circle':
      return Offset(
        .5 + .45 * math.cos(tau * 3 * p),
        .46 + .38 * math.sin(tau * 3 * p),
      );
    case 'figure-eight':
      final a = tau * 2 * p;
      return Offset(
        .5 + .45 * math.sin(a),
        .46 + .38 * math.sin(a) * math.cos(a),
      );
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

/// 🔴 ВЫРЕЗКА ПО СУТИ, А НЕ «КРУПНЕЕ ЦЕНТР». Денис: «если это живот — то живот,
/// а руки-то зачем торчат» (01fbe4b2), «таз обрезан, руки из воздуха рядом»
/// (fc840740). Кисти на исходнике `body-master-v1.png` висят на уровне таза
/// (x 0,08–0,20 и 0,80–0,93), а прежняя вырезка шириной 0,58 исходника брала
/// их пальцы по краям.
///
/// Здесь на каждый набор — квадрат по ЗАМЕРУ прозрачности исходника: центр по
/// x и y и ширина, всё в долях исходника. Проба `practice_artwork_test.dart`
/// проходит по каждой строке квадрата и краснеет, если в него попала рука.
const cosmicFocus = <String, (double, double, double)>{
  // Таз от гребня до верха бёдер: y 0,39–0,63, x 0,32–0,68.
  'pelvic-floor': (.5, .51, .36),
  // Живот от рёбер до низа живота: y 0,327–0,513, x 0,36–0,64. Выше не
  // поднимать: на y 0,313 край плеча доходит до x 0,36 (поймано пробой).
  'abdomen': (.5, .42, .28),
  // Голова целиком, без плеч: y 0,01–0,14.
  'face-speech': (.5, .075, .2),
};

class PracticeArtwork extends StatelessWidget {
  final Json cue;
  const PracticeArtwork({super.key, required this.cue});
  @override
  Widget build(BuildContext context) {
    final String set = cue['setId'], program = cue['programId'];
    if (set == 'face-massage') {
      return FaceMassageGuide(step: cue['stepId'], program: program,
          progress: (cue['progress'] as num).toDouble());
    }
    if (set == 'postures') {
      final pose = [
        'horse',
        'cobbler',
        'lotus',
      ].firstWhere(program.contains, orElse: () => 'mountain');
      return Image.asset(
        'packages/practice_kit/assets/cosmic-body/pose-$pose-phone-v1.webp',
        fit: BoxFit.contain,
      );
    }
    final focus = cosmicFocus[set];
    final guide = 'packages/practice_kit/assets/guides/${set}__${program}__${cue['stepId']}.svg';
    return ClipRect(
      child: LayoutBuilder(
        builder: (context, b) => Stack(
          children: [
            if (focus != null)
              Builder(
                builder: (_) {
                  final (cx, cy, part) = focus;
                  // Ширина вырезки `part` от исходника ложится ровно на сторону
                  // поля; исходник 2:3, поэтому высота — в полтора раза больше.
                  final width = math.min(b.maxWidth, b.maxHeight) / part,
                      height = width * 1.5;
                  return Positioned(
                    left: b.maxWidth / 2 - cx * width,
                    top: b.maxHeight / 2 - cy * height,
                    width: width,
                    height: height,
                    child: Image.asset(
                      'packages/practice_kit/assets/cosmic-body/body-master-v1.webp',
                      fit: BoxFit.fill,
                    ),
                  );
                },
              ),
            // 🔴 ЛИНИИ ЧИТАЮТСЯ НА ЯРКОМ ТЕЛЕ (отчёт fc840740: «кольцо сжатия не
            // видно ни хуя»). Схема рисуется сиреневым 58 % — на неоновом теле она
            // тонула. Поверх тела она белая, а под ней тёмный размытый ореол той
            // же формы: контраст держится на любом участке картинки.
            if (focus != null)
              Positioned.fill(
                child: ImageFiltered(
                  imageFilter: ui.ImageFilter.blur(sigmaX: 3, sigmaY: 3),
                  child: SvgPicture.asset(
                    guide,
                    fit: BoxFit.contain,
                    colorFilter: const ColorFilter.mode(Color(0xe6120a2e), BlendMode.srcIn),
                  ),
                ),
              ),
            Positioned.fill(
              child: SvgPicture.asset(
                guide,
                fit: BoxFit.contain,
                colorFilter: focus == null
                    ? null
                    : const ColorFilter.mode(Color(0xffffffff), BlendMode.srcIn),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// Квадрат фаз на сцене — ОДНА геометрия для рамки и для картинки внутри неё.
///
/// 🔴 Раньше их было две: рамку `PhaseClock` ставил с центром на 40 % высоты
/// сцены, а картинку `PracticeStage` — `Center` на 50 % и шириной 70 %. На
/// iPhone 430×932 картинка выходила на 23 pt ниже центра рамки и на 12 pt
/// шире её с каждой стороны (отчёты Дениса 01fbe4b2 и fc840740: «не по центру»).
///
/// ⚠️ .66 и центр на .40, а не .76/.46: под фигурой живёт счётчик фазы
/// («Вдох · 4»), и на кадре 23.09.2026 он лёг прямо на нижнюю грань квадрата.
Rect phaseFrame(Size stage) {
  final side = math.min(stage.width * .78, stage.height * .66);
  return Rect.fromCenter(
    center: Offset(stage.width / 2, stage.height * .40),
    width: side,
    height: side,
  );
}

class PhaseClock extends CustomPainter {
  final Json cue, program;
  final bool breathing;

  /// 🔴 ЦВЕТА ПРИХОДЯТ ИЗ ТЕМЫ, А НЕ ЗАШИТЫ (Денис 23.09.2026: «ползунок и точку
  /// у квадрата надо поменять, он сливается с остальным телом по цвету»).
  ///
  /// Было: контур `0xff8d7bff` с прозрачностью .22 на светло-лиловом фоне —
  /// линия почти не читалась, а бегущая точка терялась на ней. Утренняя и
  /// вечерняя палитры разные, поэтому единственный зашитый цвет не может быть
  /// контрастным в обеих.
  final Color track, run, dotColor;

  /// В центре уже стоит картинка упражнения — значит место занято.
  /// Денис 23.09.2026: «если внутри квадрата отображается другой режим — только
  /// внешнее кольцо». Шарик тогда не рисуем, чтобы не наложить одно на другое.
  final bool crowded;

  static bool isPhased(Json cue, Json program, bool breathing) {
    final steps = objects(program['steps']);
    return !breathing &&
        ['pelvic-floor', 'isometrics', 'abdomen'].contains(cue['setId']) &&
        steps.length >= 2 &&
        steps.length <= 8;
  }

  /// Сколько углов у рамки: 4 — квадрат, 3 и 5–8 — многоугольник, меньше 3 — круг.
  static int sidesOf(Json cue, Json program, bool breathing) {
    final shape = program['leaderShape'];
    if (breathing) return shape == 'square' ? 4 : shape == 'triangle' ? 3 : 0;
    return isPhased(cue, program, breathing) ? objects(program['steps']).length : 0;
  }

  PhaseClock({
    required this.cue,
    required this.program,
    required this.breathing,
    required this.track,
    required this.run,
    required this.dotColor,
    this.crowded = false,
  });

  /// Насколько «надут» шарик на этом шаге: 0 — сдут, 1 — полный.
  ///
  /// 🔴 Шаги дыхания размечены в данных: inhale / hold-in / exhale / hold-out.
  /// Вдох раздувает, выдох сдувает, паузы держат достигнутое — иначе шарик
  /// дёргался бы на задержках, а они и есть половина квадратного дыхания.
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
        index = math.max(
          0,
          objects(program['steps']).indexWhere((s) => s['id'] == cue['stepId']),
        );
    final progress = (cue['progress'] as num).toDouble();
    final rect = phaseFrame(size);
    // 🔴 ОБЕ ЛИНИИ ОДНОЙ ТОЛЩИНЫ — ИНАЧЕ ГРАНЬ «ДЫШИТ».
    //
    // Денис 23.09.2026 (отчёт 19fe6c53): «квадрат скачет, когда по нему ползунок
    // бегает: когда вниз переходит, сдвигается вверх на пару миллиметров».
    // Так и было: дорожка шла толщиной 4, пройденная часть — 6, и в тот миг,
    // когда грань становилась пройденной, её край уезжал наружу на полразницы.
    // Замер на канве 360×320: верх фигуры 20 на вдохе и 19 на остальных фазах.
    // Различать пройденное надо цветом, а не толщиной: толщина — это габарит.
    const stroke = 6.0;
    // Непройденная часть — заметная, но спокойная: это дорожка, а не главное.
    final outline = Paint()
      ..color = track
      ..style = PaintingStyle.stroke
      ..strokeWidth = stroke
      ..strokeJoin = StrokeJoin.round;
    // Пройденная — та же толщина, насыщенный цвет: видно, сколько сделано.
    final fill = Paint()
      ..color = run
      ..style = PaintingStyle.stroke
      ..strokeWidth = stroke
      ..strokeCap = StrokeCap.round
      ..strokeJoin = StrokeJoin.round;
    final phased = isPhased(cue, program, breathing);
    final sides = sidesOf(cue, program, breathing);
    Offset? dot;
    if (sides >= 3) {
      final points = sides == 4
          ? [rect.bottomLeft, rect.topLeft, rect.topRight, rect.bottomRight]
          : List.generate(sides, (i) {
              final angle = -math.pi / 2 + 2 * math.pi * i / sides;
              return rect.center +
                  Offset(
                    math.cos(angle) * rect.width / 2,
                    math.sin(angle) * rect.height / 2,
                  );
            });
      final path = Path()..addPolygon(points, true);
      canvas.drawPath(path, outline);
      // 🔴 ШАРИК ВНУТРИ КВАДРАТА (ТЗ Дениса 23.09.2026): «когда вдох идёт, надо
      // чтобы внутри квадрата надувался шарик, и соответственно при выдохе
      // сдувался». Дыхание видно телом, а не счётом секунд.
      if (breathing && !crowded) {
        final k = _swell('${cue['stepId']}', progress);
        final r = rect.width / 2 * .78 * k;
        canvas.drawCircle(
          rect.center,
          r,
          Paint()..color = run.withValues(alpha: .16),
        );
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
      dot = Offset.lerp(
        points[current],
        points[(current + 1) % sides],
        progress,
      );
      // 🔴 ПРОЙДЕННОЕ — ОДИН ПУТЬ, А НЕ ОТДЕЛЬНЫЕ ОТРЕЗКИ. Отрезки кончались
      // круглым колпачком в каждом углу, и колпачок выступал за угол наружу:
      // угол то торчал, то нет — тот же скачок, только по углам. У одного пути
      // круглым остаётся лишь свободный конец, и он всегда под бегущей точкой.
      final done = Path()..moveTo(points[0].dx, points[0].dy);
      for (int i = 1; i <= current; i++) {
        done.lineTo(points[i % sides].dx, points[i % sides].dy);
      }
      done.lineTo(dot!.dx, dot.dy);
      canvas.drawPath(done, fill);
    } else {
      final radius = math.min(rect.width, rect.height) / 2,
          oval = Rect.fromCircle(center: rect.center, radius: radius);
      double fraction;
      if (breathing) {
        final duration = steps.fold<num>(0, (v, s) => v + s['durationMs']);
        final before = steps
            .take(index)
            .fold<num>(0, (v, s) => v + s['durationMs']);
        fraction =
            (before + (steps[index]['durationMs'] as num) * progress) /
            duration;
      } else {
        fraction = phased ? (index + progress) / steps.length : progress;
      }
      canvas.drawOval(oval, outline);
      canvas.drawArc(oval, -math.pi / 2, 2 * math.pi * fraction, false, fill);
      final angle = -math.pi / 2 + 2 * math.pi * fraction;
      dot =
          rect.center +
          Offset(math.cos(angle) * radius, math.sin(angle) * radius);
    }
    // 🔴 ТОЧКА ЧИТАЕТСЯ НА ЛЮБОМ ФОНЕ. Раньше это был плоский кружок радиуса 7
    // одного цвета: на светлой утренней палитре он сливался с дорожкой. Теперь
    // радиус 9, кольцо фона под ним и мягкий ореол — глазу есть за что зацепиться,
    // а «где я сейчас» видно, не приглядываясь.
    canvas.drawCircle(
      dot,
      14,
      Paint()..color = dotColor.withValues(alpha: .18),
    );
    canvas.drawCircle(dot, 11, Paint()..color = const Color(0xffffffff));
    canvas.drawCircle(dot, 9, Paint()..color = dotColor);
  }

  @override
  bool shouldRepaint(covariant PhaseClock oldDelegate) => true;
}

/// Летающий глаз для зарядки глаз: белок, радужка, зрачок и блик.
///
/// Рисуется кодом, а не картинкой: он должен читаться и на утренней палитре, и
/// на вечерней, а картинку пришлось бы держать в двух вариантах.
class FlyingEye extends CustomPainter {
  const FlyingEye();

  @override
  void paint(Canvas canvas, Size size) {
    final center = Offset(size.width / 2, size.height / 2);
    final r = math.min(size.width, size.height) / 2;

    // Мягкий ореол — чтобы глаз не терялся на светлом фоне.
    canvas.drawCircle(
      center,
      r,
      Paint()..color = const Color(0xff1f8f86).withValues(alpha: .18),
    );
    // Белок с тонкой обводкой: без неё белое на белом исчезает.
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
    // Блик — единственная деталь, которая делает круг живым глазом.
    canvas.drawCircle(
      center + Offset(-r * .18, -r * .2),
      r * .1,
      Paint()..color = const Color(0xffffffff),
    );
  }

  @override
  bool shouldRepaint(covariant FlyingEye oldDelegate) => false;
}

/// Текст подсказки сверху, сцена — от его низа до панели кнопок.
///
/// ⚠️ Отступ считается от НАСТОЯЩЕЙ высоты текста, а не долей экрана: у
/// подсказки своя высота (шрифт, крупный текст в системе, строка об ошибке
/// звука), и доля экрана её не знает.
