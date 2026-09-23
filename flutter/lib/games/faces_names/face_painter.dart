/// ПОРТРЕТ РИСУЕТСЯ НА МЕСТЕ — ФОТОГРАФИЙ В ИГРЕ НЕТ И НЕ БУДЕТ.
///
/// 🔴 ЭТО НЕ ЭКОНОМИЯ НА КАРТИНКАХ. Игра про лица, собранная из чужих
/// фотографий, — юридическая и этическая мина: согласие, право на изображение,
/// узнавание реальных людей. Собранная из чисел — просто игра. Поэтому «лицо»
/// здесь это набор чисел и цветов, по которым фигура строится заново на каждом
/// кадре (в вебе то же самое делает SVG в `SyntheticFace.tsx`).
///
/// ⚠️ ФИГУРЫ ПЕРЕНЕСЕНЫ КООРДИНАТА В КООРДИНАТУ. Холст — тот же квадрат 100×100,
/// что `viewBox` у веб-версии, и масштабируется под размер. Стоит сдвинуть хоть
/// одну опорную точку — и один и тот же человек станет выглядеть по-разному в
/// двух половинах приложения, то есть перестанет быть тем же человеком.
library;

import 'package:flutter/material.dart';

import 'model.dart';

Color colorFromHex(String hex) {
  final clean = hex.replaceFirst('#', '');
  final value = int.parse(clean.length == 6 ? 'FF$clean' : clean, radix: 16);
  return Color(value);
}

class SyntheticFaceView extends StatelessWidget {
  const SyntheticFaceView({super.key, required this.face, required this.size, this.label});

  final FaceSpec face;
  final double size;

  /// Подпись для чтения с экрана: человеку со зрением она не показывается,
  /// но без неё портрет для незрячего — пустое место.
  final String? label;

  @override
  Widget build(BuildContext context) {
    final picture = ClipRRect(
      borderRadius: BorderRadius.circular(size * 0.16),
      child: CustomPaint(size: Size(size, size), painter: _FacePainter(face)),
    );
    return label == null ? picture : Semantics(image: true, label: label, child: picture);
  }
}

class _FacePainter extends CustomPainter {
  _FacePainter(this.face);

  final FaceSpec face;

  /// Пропорции лица по форме — те же четыре набора, что в вебе.
  static ({double rx, double ry}) _dimensions(String shape) {
    if (shape == 'round') return (rx: 29, ry: 30);
    if (shape == 'long') return (rx: 24, ry: 36);
    if (shape == 'angular') return (rx: 27, ry: 33);
    return (rx: 27, ry: 34);
  }

  static Path _hair(String style) {
    final p = Path();
    if (style == 'crop') {
      p.moveTo(24, 38);
      p.cubicTo(25, 14, 76, 14, 77, 38);
      p.cubicTo(67, 29, 35, 29, 24, 38);
    } else if (style == 'wave') {
      p.moveTo(20, 42);
      p.cubicTo(17, 20, 35, 13, 50, 19);
      p.cubicTo(64, 8, 84, 25, 79, 47);
      p.cubicTo(70, 35, 64, 37, 56, 28);
      p.cubicTo(48, 39, 35, 27, 20, 42);
    } else if (style == 'curve') {
      p.moveTo(22, 43);
      p.cubicTo(18, 16, 79, 8, 80, 43);
      p.cubicTo(68, 28, 35, 24, 22, 43);
    } else {
      p.moveTo(21, 43);
      p.cubicTo(21, 16, 77, 13, 79, 43);
      p.cubicTo(68, 29, 57, 25, 51, 23);
      p.cubicTo(44, 32, 31, 31, 21, 43);
    }
    p.close();
    return p;
  }

  @override
  void paint(Canvas canvas, Size size) {
    final scale = size.width / 100;
    canvas.scale(scale);
    final d = _dimensions(face.faceShape);
    final tone = colorFromHex(face.faceTone);
    final accent = colorFromHex(face.accentColor);
    final hairColor = colorFromHex(face.hairColor);
    final fill = Paint()..style = PaintingStyle.fill;

    canvas.drawRRect(
      RRect.fromRectAndRadius(const Rect.fromLTWH(0, 0, 100, 100), const Radius.circular(16)),
      fill..color = colorFromHex(face.backgroundColor),
    );
    // Плечи: подсказывают «человек», а не «голова в пустоте».
    canvas.drawOval(Rect.fromCenter(center: const Offset(50, 102), width: 70, height: 56), fill..color = accent);
    canvas.drawCircle(Offset(50 - d.rx, 51), 5, fill..color = tone);
    canvas.drawCircle(Offset(50 + d.rx, 51), 5, fill..color = tone);

    if (face.faceShape == 'angular') {
      final p = Path()
        ..moveTo(50, 17)
        ..cubicTo(68, 17, 78, 30, 76, 50)
        ..cubicTo(75, 68, 65, 82, 50, 87)
        ..cubicTo(35, 82, 25, 68, 24, 50)
        ..cubicTo(22, 30, 32, 17, 50, 17)
        ..close();
      canvas.drawPath(p, fill..color = tone);
    } else {
      canvas.drawOval(
        Rect.fromCenter(center: const Offset(50, 51), width: d.rx * 2, height: d.ry * 2),
        fill..color = tone,
      );
    }

    canvas.drawPath(_hair(face.hairStyle), fill..color = hairColor);

    final leftEye = 50 - face.eyeSpacing.toDouble();
    final rightEye = 50 + face.eyeSpacing.toDouble();
    final stroke = Paint()
      ..style = PaintingStyle.stroke
      ..strokeCap = StrokeCap.round
      ..color = hairColor
      ..strokeWidth = 1.8;
    canvas.drawLine(Offset(leftEye - 5, 43), Offset(leftEye + 5, 42), stroke);
    canvas.drawLine(Offset(rightEye - 5, 42), Offset(rightEye + 5, 43), stroke);
    canvas.drawCircle(Offset(leftEye, 49), 2.2, fill..color = const Color(0xFF24202B));
    canvas.drawCircle(Offset(rightEye, 49), 2.2, fill..color = const Color(0xFF24202B));

    if (face.glasses) {
      final glass = Paint()
        ..style = PaintingStyle.stroke
        ..color = accent
        ..strokeWidth = 1.8;
      canvas.drawCircle(Offset(leftEye, 49), 7, glass);
      canvas.drawCircle(Offset(rightEye, 49), 7, glass);
      canvas.drawLine(Offset(leftEye + 7, 49), Offset(rightEye - 7, 49), glass);
    }

    final nose = Path()
      ..moveTo(50, 51)
      ..lineTo(47, 60)
      ..quadraticBezierTo(50, 62, 53, 60);
    canvas.drawPath(
      nose,
      Paint()
        ..style = PaintingStyle.stroke
        ..strokeCap = StrokeCap.round
        ..color = const Color(0xFF8B5E49)
        ..strokeWidth = 1.4,
    );

    const mouthY = 68.0;
    final mouth = Path()
      ..moveTo(39, mouthY)
      ..quadraticBezierTo(50, mouthY + face.mouthCurve, 61, mouthY);
    canvas.drawPath(
      mouth,
      Paint()
        ..style = PaintingStyle.stroke
        ..strokeCap = StrokeCap.round
        ..color = const Color(0xFF8B3F4F)
        ..strokeWidth = 2,
    );
  }

  @override
  bool shouldRepaint(_FacePainter old) => old.face.assetId != face.assetId;
}
