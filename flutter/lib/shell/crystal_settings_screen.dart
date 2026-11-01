import 'package:flutter/material.dart';

import 'crystal_palette.dart';
import 'gem_palette_material.dart';
import 'gem_palette_presets.dart';
import 'l10n.dart';
import 'shared_state.dart';

const crystalPresetKeys = <String>[
  'gemDiamond',
  'gemBlackDiamond',
  'gemPinkDiamond',
  'gemSapphire',
  'gemEmerald',
  'gemRuby',
  'gemAmethyst',
  'gemPaletteHue',
  'gemPaletteLightness',
  'gemPaletteSaturation',
  'gemPaletteBackground',
  'gemPaletteGlow',
];

class CrystalSettingsScreen extends StatefulWidget {
  const CrystalSettingsScreen({super.key, required this.state});
  final SharedState state;
  @override
  State<CrystalSettingsScreen> createState() => _CrystalSettingsScreenState();
}

class _CrystalSettingsScreenState extends State<CrystalSettingsScreen> {
  late CrystalPalette _draft;
  bool _saving = false, _ready = false;
  @override
  void initState() {
    super.initState();
    _draft = CrystalPalette.read(widget.state);
    GemPaletteEngine.initialize().then((_) {
      if (mounted) setState(() => _ready = GemPaletteEngine.available);
    });
  }

  void _number({
    double? hue,
    double? saturation,
    double? lightness,
    double? backgroundHue,
    double? glow,
  }) {
    final p = _draft.recipe;
    setState(
      () => _draft = _draft.copyWith(
        recipe: GemPalettePreset(
          id: 'custom',
          label: '',
          stone: '',
          hue: hue ?? p.hue,
          saturation: saturation ?? p.saturation,
          lightness: lightness ?? p.lightness,
          backgroundHue: backgroundHue ?? p.backgroundHue,
          glow: glow ?? p.glow,
        ),
      ),
    );
  }

  Future<void> _save() async {
    setState(() => _saving = true);
    try {
      await widget.state.set(
        '$crystalKeyPrefix${widget.state.activeProfile}',
        _draft.encode(),
      );
      await widget.state.set(crystalEnabledKey, _draft.enabled ? '1' : '0');
      if (mounted) Navigator.of(context).pop();
    } catch (_) {
      if (mounted) {
        setState(() => _saving = false);
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text(L.t('gemPaletteSaveError'))));
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final p = _draft.recipe;
    Widget control(
      String key,
      double value,
      double min,
      double max,
      ValueChanged<double> change,
    ) => Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text('${L.t(key)}: ${value.toStringAsFixed(2)}'),
        Slider(
          key: ValueKey(key),
          label: L.t(key),
          value: value,
          min: min,
          max: max,
          onChanged: _ready ? change : null,
        ),
      ],
    );
    final options = [...profileGemPresets, ...extraGemPresets];
    final value = options.any((v) => v.id == p.id) ? p.id : 'custom';
    return Scaffold(
      appBar: AppBar(title: Text(L.t('gemPaletteTitle'))),
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(16),
          child: Center(
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 720),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  SwitchListTile(
                    key: const ValueKey('crystal-enabled'),
                    title: Text(L.t('gemPaletteEnabled')),
                    subtitle: Text(L.t('gemPaletteHint')),
                    value: _draft.enabled,
                    onChanged: (_ready || _draft.enabled)
                        ? (v) => setState(
                            () => _draft = _draft.copyWith(enabled: v),
                          )
                        : null,
                  ),
                  if (!_ready) Text(L.t('gemPaletteUnavailable')),
                  DropdownButton<String>(
                    key: const ValueKey('crystal-preset'),
                    itemHeight:
                        MediaQuery.textScalerOf(context).scale(24) * 2 + 16,
                    isExpanded: true,
                    value: value,
                    items: [
                      DropdownMenuItem(
                        value: 'custom',
                        child: Text(L.t('gemPaletteCustom')),
                      ),
                      for (final option in options)
                        DropdownMenuItem(
                          value: option.id,
                          child: Text(
                            option.profileId != null
                                ? L.t('profileName_${option.profileId}')
                                : L.t(
                                    crystalPresetKeys[extraGemPresets.indexOf(
                                      option,
                                    )],
                                  ),
                            maxLines: 2,
                          ),
                        ),
                    ],
                    onChanged: _ready
                        ? (id) {
                            if (id == 'custom') return;
                            setState(
                              () => _draft = _draft.copyWith(
                                recipe: options.firstWhere((p) => p.id == id),
                              ),
                            );
                          }
                        : null,
                  ),
                  const SizedBox(height: 12),
                  if (_ready)
                    SizedBox(
                      height: 104,
                      child: Stack(
                        fit: StackFit.expand,
                        children: [
                          GemPaletteMaterial(
                            asset: 'assets/aurora_tab_panels/header-dark.png',
                            program: GemPaletteEngine.program!,
                            hue: p.hue,
                            saturation: p.saturation,
                            lightness: p.lightness,
                            sourceLogicalSize: const Size(356, 389 / 6),
                            caps: const EdgeInsets.symmetric(
                              horizontal: 42,
                              vertical: 14,
                            ),
                          ),
                          Align(
                            alignment: AlignmentDirectional.centerStart,
                            child: Padding(
                              padding: const EdgeInsets.all(20),
                              child: Text(
                                L.t('tabGames'),
                                key: const ValueKey('crystal-preview-title'),
                                style: TextStyle(
                                  color: _draft.foreground,
                                  fontSize: 28,
                                  fontWeight: FontWeight.bold,
                                ),
                              ),
                            ),
                          ),
                        ],
                      ),
                    ),
                  if (_ready)
                    Center(
                      child: SizedBox(
                        width: 96,
                        height: 96,
                        child: GemPaletteMaterial(
                          asset: 'assets/aurora_game_chrome/sudoku_buttons/dark_undo.webp',
                          program: GemPaletteEngine.program!,
                          hue: p.hue,
                          saturation: p.saturation,
                          lightness: p.lightness,
                        ),
                      ),
                    ),
                  control(
                    'gemPaletteHue',
                    p.hue,
                    0,
                    360,
                    (v) => _number(hue: v),
                  ),
                  control(
                    'gemPaletteLightness',
                    p.lightness,
                    -1,
                    1,
                    (v) => _number(lightness: v),
                  ),
                  control(
                    'gemPaletteSaturation',
                    p.saturation,
                    0,
                    1.3,
                    (v) => _number(saturation: v),
                  ),
                  control(
                    'gemPaletteBackground',
                    p.backgroundHue,
                    0,
                    360,
                    (v) => _number(backgroundHue: v),
                  ),
                  control(
                    'gemPaletteGlow',
                    p.glow,
                    0,
                    1,
                    (v) => _number(glow: v),
                  ),
                  TextButton(
                    onPressed: () => setState(
                      () => _draft = _draft.copyWith(
                        recipe: CrystalPalette.profile(
                          widget.state.activeProfile,
                        ),
                      ),
                    ),
                    child: Text(L.t('theme_profile')),
                  ),
                  FilledButton(
                    key: const ValueKey('crystal-save'),
                    onPressed: _saving || (_draft.enabled && !_ready)
                        ? null
                        : _save,
                    child: Text(L.t('apply')),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}
