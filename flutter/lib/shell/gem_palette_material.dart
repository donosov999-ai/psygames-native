import 'dart:ui' as ui;
import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter/foundation.dart';

import 'gem_palette_presets.dart';

class GemPaletteEngine {
  static ui.FragmentProgram? program;
  static Future<void>? _loading;
  static bool get available => program != null;
  static Future<void> initialize() => _loading ??= _initialize();
  static Future<void> _initialize() async {
    try {
      program = await ui.FragmentProgram.fromAsset('shaders/gem_palette.frag');
    } catch (_) {
      program = null;
    } // Keep the accepted static artwork if unsupported.
  }
}

/// Cached per asset/recipe by Flutter ImageCache. Source scale and nine-slice
/// coordinates remain unchanged; only decorative material pixels are processed.
class GemPaletteImage extends ImageProvider<GemPaletteImage> {
  const GemPaletteImage({
    required this.asset,
    required this.recipe,
    this.scale = 1,
  });
  final String asset;
  final GemPalettePreset recipe;
  final double scale;
  @override
  Future<GemPaletteImage> obtainKey(ImageConfiguration configuration) =>
      SynchronousFuture(this);
  @override
  ImageStreamCompleter loadImage(
    GemPaletteImage key,
    ImageDecoderCallback decode,
  ) => OneFrameImageStreamCompleter(_load());

  Future<ImageInfo> _load() async {
    final data = await rootBundle.load(asset);
    final codec = await ui.instantiateImageCodec(
      data.buffer.asUint8List(data.offsetInBytes, data.lengthInBytes),
    );
    final source = (await codec.getNextFrame()).image;
    codec.dispose();
    await GemPaletteEngine.initialize();
    final program = GemPaletteEngine.program;
    if (program == null) return ImageInfo(image: source, scale: scale);
    ui.Image? mask;
    final shader = program.fragmentShader();
    try {
      if (asset.endsWith('/dark_undo.webp')) {
        final b = await rootBundle.load(
          'assets/palette_pilot/undo-glyph-mask.png',
        );
        final c = await ui.instantiateImageCodec(
          b.buffer.asUint8List(b.offsetInBytes, b.lengthInBytes),
        );
        mask = (await c.getNextFrame()).image;
        c.dispose();
      }
      final recorder = ui.PictureRecorder(), canvas = Canvas(recorder);
      _GemPalettePainter(
        GemPaletteMaterial(
          asset: asset,
          program: program,
          hue: recipe.hue,
          saturation: recipe.saturation,
          lightness: recipe.lightness,
        ),
        source,
        shader,
        mask,
      ).paint(canvas, Size(source.width.toDouble(), source.height.toDouble()));
      final picture = recorder.endRecording();
      try {
        return ImageInfo(
          image: await picture.toImage(source.width, source.height),
          scale: scale,
        );
      } finally {
        picture.dispose();
      }
    } finally {
      source.dispose();
      mask?.dispose();
      shader.dispose();
    }
  }

  @override
  bool operator ==(Object other) =>
      other is GemPaletteImage &&
      asset == other.asset &&
      scale == other.scale &&
      recipe.hue == other.recipe.hue &&
      recipe.saturation == other.recipe.saturation &&
      recipe.lightness == other.recipe.lightness;
  @override
  int get hashCode => Object.hash(
    asset,
    scale,
    recipe.hue,
    recipe.saturation,
    recipe.lightness,
  );
}

/// Sampled accepted decorative art with a selective sapphire mask.
/// Does not recolour a subtree, text, gameplay stimuli or gold.
/// Known glyphs have an explicit separate mask, never a global white-pixel filter.
Color gemForeground({
  required double hue,
  required double saturation,
  required double lightness,
  bool lightBase = false,
}) {
  if (lightBase) return Colors.black;
  final value = math.pow(.35, math.pow(2, -lightness * 3)).toDouble();
  final body = HSVColor.fromAHSV(
    1,
    hue,
    (.85 * saturation).clamp(0, 1),
    value,
  ).toColor();
  final luminance = body.computeLuminance();
  return (luminance + .05) / .05 >= 1.05 / (luminance + .05)
      ? Colors.black
      : Colors.white;
}

class GemPaletteMaterial extends StatefulWidget {
  const GemPaletteMaterial({
    super.key,
    required this.asset,
    required this.program,
    required this.hue,
    this.saturation = 1,
    this.lightness = 0,
    this.strength = 1,
    this.mask = false,
    this.sourceLogicalSize,
    this.caps = EdgeInsets.zero,
    this.adaptiveGlyph = true,
  });
  final String asset;
  final ui.FragmentProgram program;
  final double hue, saturation, lightness, strength;
  final bool mask;
  final bool adaptiveGlyph;
  final Size? sourceLogicalSize;
  final EdgeInsets caps;
  @override
  State<GemPaletteMaterial> createState() => _GemPaletteMaterialState();
}

class _GemPaletteMaterialState extends State<GemPaletteMaterial> {
  ui.Image? _image;
  ui.Image? _glyphMask;
  late final _shader = widget.program.fragmentShader();
  Object? _error;
  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      final b = await rootBundle.load(widget.asset);
      final codec = await ui.instantiateImageCodec(
        b.buffer.asUint8List(b.offsetInBytes, b.lengthInBytes),
      );
      final image = (await codec.getNextFrame()).image;
      codec.dispose();
      ui.Image? glyphMask;
      if (widget.asset.endsWith('/dark_undo.webp')) {
        final data = await rootBundle.load(
          'assets/palette_pilot/undo-glyph-mask.png',
        );
        final maskCodec = await ui.instantiateImageCodec(
          data.buffer.asUint8List(data.offsetInBytes, data.lengthInBytes),
        );
        glyphMask = (await maskCodec.getNextFrame()).image;
        maskCodec.dispose();
      }
      if (!mounted) {
        image.dispose();
        glyphMask?.dispose();
        return;
      }
      setState(() {
        _image = image;
        _glyphMask = glyphMask;
      });
    } catch (e) {
      if (mounted) setState(() => _error = e);
    }
  }

  @override
  void dispose() {
    _shader.dispose();
    _image?.dispose();
    _glyphMask?.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    if (_error != null) return const Center(child: Icon(Icons.error_outline));
    if (_image == null) return const SizedBox.expand();
    return CustomPaint(
      painter: _GemPalettePainter(widget, _image!, _shader, _glyphMask),
    );
  }
}

class _GemPalettePainter extends CustomPainter {
  _GemPalettePainter(this.config, this.image, this.shader, this.glyphMask);
  final GemPaletteMaterial config;
  final ui.Image image;
  final ui.FragmentShader shader;
  final ui.Image? glyphMask;
  @override
  void paint(Canvas c, Size size) {
    final source =
        config.sourceLogicalSize ??
        Size(image.width.toDouble(), image.height.toDouble());
    final values = [
      size.width,
      size.height,
      source.width,
      source.height,
      config.caps.left,
      config.caps.top,
      config.caps.right,
      config.caps.bottom,
      config.hue / 360,
      config.saturation,
      config.lightness,
      config.strength,
      config.mask ? 1.0 : 0.0,
      config.adaptiveGlyph &&
              glyphMask != null &&
              config.strength > 0 &&
              gemForeground(
                    hue: config.hue,
                    saturation: config.saturation,
                    lightness: config.lightness,
                  ) ==
                  Colors.black
          ? 1.0
          : 0.0,
    ];
    for (var i = 0; i < values.length; i++) {
      shader.setFloat(i, values[i]);
    }
    shader.setImageSampler(0, image);
    shader.setImageSampler(1, glyphMask ?? image);
    c.drawRect(Offset.zero & size, Paint()..shader = shader);
  }

  @override
  bool shouldRepaint(_GemPalettePainter old) => true;
}
