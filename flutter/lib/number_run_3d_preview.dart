// Проба движка flutter_scene для «Числового забега» (задача 84bcf2c9, Денис 05.11.2026: «вариант Б,
// настоящий 3D»). Только картинка: камера, небо, туман, море, полосы, числа и герой — по канону веба
// (frontend/src/games/number-run/runner-scene.mjs). Логики забега здесь нет: ядро уже перенесено
// (lib/games/number_run/), этот экран лишь показывает, что 3D рисуется на iPhone и Android.
//
// Запуск: flutter run -t lib/number_run_3d_preview.dart
import 'dart:math' as math;
import 'dart:ui' as ui;

import 'package:flutter/material.dart';
import 'package:flutter_scene/scene.dart';
import 'package:vector_math/vector_math.dart' as vm;

void main() => runApp(const MaterialApp(debugShowCheckedModeBanner: false, home: NumberRun3dPreview()));

/// sRGB-цвет веба (0xRRGGBB) → линейный, как ждут материалы движка.
vm.Vector3 lin(int rgb) {
  double c(int v) {
    final s = v / 255;
    return s <= .04045 ? s / 12.92 : math.pow((s + .055) / 1.055, 2.4).toDouble();
  }

  return vm.Vector3(c(rgb >> 16 & 255), c(rgb >> 8 & 255), c(rgb & 255));
}

const _lane = 2.4, _bg = 0x57c7df, _sea = 0x18c4cf;

class NumberRun3dPreview extends StatefulWidget {
  const NumberRun3dPreview({super.key});

  @override
  State<NumberRun3dPreview> createState() => _NumberRun3dPreviewState();
}

class _NumberRun3dPreviewState extends State<NumberRun3dPreview> {
  final scene = Scene();
  final road = Node();
  bool ready = false;
  double travelled = 0;

  Mesh box(double w, double h, double d, int rgb, {double rough = .35}) {
    final m = PhysicallyBasedMaterial()
      ..baseColorFactor = vm.Vector4(lin(rgb).x, lin(rgb).y, lin(rgb).z, 1)
      ..roughnessFactor = rough
      ..metallicFactor = .18;
    return Mesh(CuboidGeometry(vm.Vector3(w, h, d)), m);
  }

  /// Табличка числа: цифры рисуются Flutter в картинку и кладутся текстурой на лицевую грань.
  Future<Mesh> plate(String text, int rgb) async {
    const w = 512, h = 256;
    final rec = ui.PictureRecorder();
    final c = Canvas(rec);
    c.drawRRect(RRect.fromLTRBR(4, 4, w - 4, h - 4, const Radius.circular(48)), Paint()..color = Color(0xFF000000 | rgb));
    final tp = TextPainter(
      text: TextSpan(text: text, style: const TextStyle(color: Colors.white, fontSize: 170, fontWeight: FontWeight.w800)),
      textDirection: TextDirection.ltr,
    )..layout();
    tp.paint(c, Offset((w - tp.width) / 2, (h - tp.height) / 2));
    final img = await rec.endRecording().toImage(w, h);
    final tex = await Texture2D.fromImage(img);
    return Mesh(CuboidGeometry(vm.Vector3(1.9, .95, .22)), UnlitMaterial(colorTexture: tex));
  }

  @override
  void initState() {
    super.initState();
    _build();
  }

  Future<void> _build() async {
    await Scene.initializeStaticResources();
    // Небо и туман — цвет фона веба: дальняя дорога растворяется в нём, как в сцене Three.js (Fog 28…68).
    scene.skybox = Skybox(GradientSkySource()
      ..zenithColor = lin(0x8fdcf0)
      ..horizonColor = lin(_bg)
      ..groundColor = lin(_sea));
    scene.fog
      ..enabled = true
      ..mode = FogMode.linear
      ..start = 28
      ..end = 68
      ..color = lin(_bg);
    scene.directionalLight = DirectionalLight(direction: vm.Vector3(8, -14, -9)..normalize(), intensity: 2.2, castsShadow: true);

    final sea = Node(mesh: box(160, .1, 160, _sea))..position = vm.Vector3(0, -6, -30);
    final start = Node(mesh: box(7.2, .35, 18, 0xdce1ef))..position = vm.Vector3(0, -.22, 0);
    scene.add(sea);
    scene.add(start);

    // Полосы: три дорожки чередующихся оттенков, ряды по 12 единиц, как deck в buildRow.
    for (var row = 0; row < 10; row++) {
      for (var i = 0; i < 3; i++) {
        road.add(Node(mesh: box(_lane, .55, 11.8, row.isOdd ? 0xf4f5fa : 0xe3e8ef))
          ..position = vm.Vector3((i - 1) * _lane, -.32, -12.0 * row - 6));
      }
      // Ряд чисел: синее прибавляет, красное вычитает.
      if (row >= 1) {
        for (var i = 0; i < 3; i++) {
          final v = ((row * 7 + i * 5) % 9) - 3;
          final node = Node(mesh: await plate(v < 0 ? '−${-v}' : '$v', v < 0 ? 0xff1839 : 0x443bff))
            ..position = vm.Vector3((i - 1) * _lane, .55, -12.0 * row);
          road.add(node);
        }
      }
    }
    scene.add(road);

    // Герой — число игрока над средней полосой.
    scene.add(Node(mesh: await plate('1', 0x2563eb))..position = vm.Vector3(0, .6, 4));
    if (mounted) setState(() => ready = true);
  }

  @override
  Widget build(BuildContext context) {
    if (!ready) return const ColoredBox(color: Color(0xFF57C7DF), child: SizedBox.expand());
    return SceneView(
      scene,
      // Камера веба: PerspectiveCamera(55°), позиция (0, 8.2, 11), взгляд на (0, 0, −10).
      camera: PerspectiveCamera(
        fovRadiansY: 55 * vm.degrees2Radians,
        position: vm.Vector3(0, 8.2, 11),
        target: vm.Vector3(0, 0, -10),
      ),
      onTick: (_, dt) {
        travelled = (travelled + dt * 6) % 24;
        road.position = vm.Vector3(0, 0, travelled);
      },
    );
  }
}
