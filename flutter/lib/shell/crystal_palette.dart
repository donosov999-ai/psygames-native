import 'dart:convert';

import 'package:flutter/material.dart';

import 'gem_palette_material.dart';
import 'gem_palette_presets.dart';
import 'shared_state.dart';

const crystalKeyPrefix = 'psygames_crystal_palette_v1_';
const crystalEnabledKey = '${crystalKeyPrefix}enabled';

/// Decorative appearance only. Never used for game stimuli, scores or access.
class CrystalPalette extends ThemeExtension<CrystalPalette> {
  const CrystalPalette({required this.enabled, required this.recipe});
  final bool enabled;
  final GemPalettePreset recipe;
  bool get effective => enabled && GemPaletteEngine.available;

  static GemPalettePreset profile(String id) => profileGemPresets.firstWhere(
    (p) => p.profileId == id,
    orElse: () => extraGemPresets.firstWhere((p) => p.id == 'sapphire'),
  );

  static CrystalPalette read(SharedState state) {
    final fallback = profile(state.activeProfile);
    final enabled = state.get(crystalEnabledKey) == '1';
    try {
      final raw = state.get('$crystalKeyPrefix${state.activeProfile}');
      if (raw == null) {
        return CrystalPalette(enabled: enabled, recipe: fallback);
      }
      final data = jsonDecode(raw) as Map;
      double number(String key, double initial, double lo, double hi) {
        final v = data[key];
        return v is num && v.isFinite ? v.toDouble().clamp(lo, hi) : initial;
      }

      return CrystalPalette(
        enabled: enabled,
        recipe: GemPalettePreset(
          id: data['id'] is String ? data['id'] as String : 'custom',
          label: '',
          stone: '',
          hue: number('hue', fallback.hue, 0, 360),
          saturation: number('saturation', fallback.saturation, 0, 1.3),
          lightness: number('lightness', fallback.lightness, -1, 1),
          backgroundHue: number(
            'backgroundHue',
            fallback.backgroundHue,
            0,
            360,
          ),
          glow: number('glow', fallback.glow, 0, 1),
        ),
      );
    } catch (_) {
      return CrystalPalette(enabled: false, recipe: fallback);
    }
  }

  String encode() => jsonEncode({
    'enabled': enabled,
    'id': recipe.id,
    'hue': recipe.hue,
    'saturation': recipe.saturation,
    'lightness': recipe.lightness,
    'backgroundHue': recipe.backgroundHue,
    'glow': recipe.glow,
  });

  static CrystalPalette? of(BuildContext context) {
    final p = Theme.of(context).extension<CrystalPalette>();
    return p?.enabled == true && GemPaletteEngine.available ? p : null;
  }

  Color get foreground => gemForeground(
    hue: recipe.hue,
    saturation: recipe.saturation,
    lightness: recipe.lightness,
  );
  Color background(bool dark) => HSVColor.fromAHSV(
    1,
    recipe.backgroundHue,
    dark ? .5 : .04,
    dark ? .09 : .98,
  ).toColor();

  ImageProvider image(String asset, {double scale = 1}) =>
      GemPaletteImage(asset: asset, recipe: recipe, scale: scale);

  @override
  CrystalPalette copyWith({bool? enabled, GemPalettePreset? recipe}) =>
      CrystalPalette(
        enabled: enabled ?? this.enabled,
        recipe: recipe ?? this.recipe,
      );
  @override
  CrystalPalette lerp(covariant CrystalPalette? other, double t) =>
      t < .5 ? this : other ?? this;
}
