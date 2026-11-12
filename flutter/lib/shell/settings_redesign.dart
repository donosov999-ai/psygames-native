part of 'settings_screen.dart';

enum _SettingsPane {
  root,
  profiles,
  appearance,
  sound,
  synapse,
  language,
  data,
  help,
}

/// Aurora presentation only. All writes/imports/account actions remain owned
/// by the existing Settings state and existing destination screens.
extension _SettingsRedesign on _SettingsScreenState {
  bool get _dark => AppLook.isDark(_s);
  Color get _ink => AppLook.token('text', dark: _dark);
  Color get _secondary => AppLook.token('textSecondary', dark: _dark);
  ChromePalette get _chrome => ChromePalette.of(_dark);

  String get _paneTitle => switch (_pane) {
    _SettingsPane.root => L.t('settings'),
    _SettingsPane.profiles => L.t('settingsTrainingProfile'),
    _SettingsPane.appearance => L.t('theme_selection'),
    _SettingsPane.sound => L.t('settingsSoundHaptics'),
    _SettingsPane.synapse => L.t('petName'),
    _SettingsPane.language => L.t('settingsLanguageAccess'),
    _SettingsPane.data => L.t('settingsCloudBackups'),
    _SettingsPane.help => L.t('settingsHelpAbout'),
  };

  void _settingsBack() {
    if (_pane != _SettingsPane.root) {
      _showPane(_SettingsPane.root);
    } else {
      Navigator.of(context).maybePop();
    }
  }

  String get _themeSummary => switch (_s.get(AppLook.overrideKey)) {
    'light' => L.t('theme_light'),
    'dark' => L.t('theme_dark'),
    'system' => L.t('theme_system'),
    _ => L.t('theme_profile'),
  };

  String _presetName(GemPalettePreset preset) {
    if (preset.profileId != null) return L.t('profileName_${preset.profileId}');
    final i = extraGemPresets.indexWhere((p) => p.id == preset.id);
    return i < 0 ? L.t('gemPaletteCustom') : L.t(crystalPresetKeys[i]);
  }

  ThemeData _settingsTheme(BuildContext outer) {
    final base = appShellTheme(
      _s,
      brightness: _dark ? Brightness.dark : Brightness.light,
    );
    final font = Theme.of(outer).textTheme.bodyMedium;
    return base.copyWith(
      textTheme: base.textTheme.apply(
        fontFamily: font?.fontFamily,
        fontFamilyFallback: font?.fontFamilyFallback,
      ),
    );
  }

  Widget _redesigned(BuildContext outer) => Theme(
    data: _settingsTheme(outer),
    child: Builder(
      builder: (context) => Directionality(
        textDirection: L.locale == 'ar' ? TextDirection.rtl : TextDirection.ltr,
        child: PopScope<HubCardTap>(
          canPop: _pane == _SettingsPane.root,
          onPopInvokedWithResult: (didPop, _) {
            if (!didPop) _settingsBack();
          },
          child: Stack(
            children: [
              Scaffold(
                key: const Key('settings-redesigned'),
                backgroundColor: Theme.of(context).scaffoldBackgroundColor,
                bottomNavigationBar: NativeTabs.tabs.isEmpty
                    ? null
                    : NativeTabBar(
                        active: widget.originTab,
                        allowReselect: true,
                        onTap: (route) =>
                            Navigator.of(context).pop(HubCardTap(route)),
                        accent: AppLook.accentOf(_s),
                      ),
                body: SafeArea(
                  bottom: false,
                  child: Column(
                    children: [
                      _settingsHeader(context),
                      Expanded(
                        child: SingleChildScrollView(
                          key: ValueKey('settings-scroll-${_pane.name}'),
                          padding: const EdgeInsets.fromLTRB(14, 12, 14, 100),
                          child: Align(
                            alignment: Alignment.topCenter,
                            child: ConstrainedBox(
                              constraints: const BoxConstraints(maxWidth: 600),
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.stretch,
                                children: _settingsContents(context),
                              ),
                            ),
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
              ),
              // One drag preference, positioned against the full window.
              if (widget.onFeedback != null)
                FeedbackFab(state: _s, onOpen: widget.onFeedback!),
            ],
          ),
        ),
      ),
    ),
  );

  Widget _settingsHeader(BuildContext context) {
    final color = CrystalPalette.of(context)?.foreground ?? _ink;
    return Container(
      key: const Key('settings-jewel-header'),
      constraints: const BoxConstraints(minHeight: 104),
      margin: const EdgeInsets.symmetric(horizontal: 4),
      padding: const EdgeInsetsDirectional.fromSTEB(12, 18, 12, 18),
      decoration: BoxDecoration(
        image: ChromeArt.header(_dark, context: context),
      ),
      child: Row(
        children: [
          _jewelIcon(
            context,
            key: const Key('settings-back'),
            icon: Icons.arrow_back,
            label: L.t('a11yBack'),
            onTap: _settingsBack,
            color: color,
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Text(
              _paneTitle,
              key: const Key('settings-pane-title'),
              style: TextStyle(
                color: color,
                fontSize: 28,
                height: 1.15,
                fontWeight: FontWeight.w700,
              ),
            ),
          ),
          const SizedBox(width: 8),
          IconButton(
            key: const Key('settings-header-pet'),
            tooltip: L.t('tabPet'),
            onPressed: () => Navigator.of(context).pop(HubCardTap('/pet')),
            constraints: const BoxConstraints(minWidth: 44, minHeight: 44),
            icon: PetHost.ready
                ? GamePet(
                    state: PetHost.state!,
                    origin: PetHost.origin!,
                    size: 36,
                    errorPlaceholder: Icon(Icons.pets_outlined, color: color),
                  )
                : Icon(Icons.pets_outlined, color: color),
          ),
        ],
      ),
    );
  }

  Widget _jewelIcon(
    BuildContext context, {
    Key? key,
    required IconData icon,
    required String label,
    VoidCallback? onTap,
    Color? color,
  }) => IconButton(
    key: key,
    tooltip: label,
    onPressed: onTap,
    constraints: const BoxConstraints(minWidth: 44, minHeight: 44),
    padding: EdgeInsets.zero,
    icon: Container(
      width: 44,
      height: 44,
      decoration: AuroraGlass.ring(_dark),
      child: Icon(icon, color: color ?? _ink, size: 23),
    ),
  );

  Widget _settingsPanel(BuildContext context, List<Widget> children) =>
      Container(
        margin: const EdgeInsets.only(bottom: 12),
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
        decoration: ChromeArt.panel(context),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            for (var i = 0; i < children.length; i++) ...[
              if (i > 0)
                Divider(
                  height: 1,
                  indent: 8,
                  endIndent: 8,
                  color: _secondary.withValues(alpha: .18),
                ),
              children[i],
            ],
          ],
        ),
      );

  Widget _sectionLabel(String label) => Padding(
    padding: const EdgeInsetsDirectional.fromSTEB(8, 8, 8, 8),
    child: Text(
      label,
      style: TextStyle(
        color: _secondary,
        fontSize: 12,
        letterSpacing: .8,
        fontWeight: FontWeight.w700,
      ),
    ),
  );

  Widget _settingsRow(
    BuildContext context, {
    required String key,
    required IconData icon,
    required String title,
    String? subtitle,
    required VoidCallback onTap,
    Widget? leading,
    Widget? trailing,
  }) => InkWell(
    key: Key(key),
    onTap: onTap,
    borderRadius: BorderRadius.circular(14),
    child: ConstrainedBox(
      constraints: const BoxConstraints(minHeight: 64),
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 10),
        child: Row(
          children: [
            leading ??
                Container(
                  width: 36,
                  height: 40,
                  decoration: AuroraGlass.chrome(
                    _dark,
                    radius: 10,
                    glow: false,
                  ),
                  child: Icon(icon, color: _chrome.text, size: 23),
                ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                mainAxisSize: MainAxisSize.min,
                children: [
                  Text(
                    title,
                    style: TextStyle(
                      color: _ink,
                      fontSize: 16,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                  if (subtitle != null && subtitle.isNotEmpty) ...[
                    const SizedBox(height: 3),
                    Text(
                      subtitle,
                      style: TextStyle(
                        color: _secondary,
                        fontSize: 12,
                        height: 1.3,
                      ),
                    ),
                  ],
                ],
              ),
            ),
            const SizedBox(width: 6),
            trailing ??
                Icon(
                  Directionality.of(context) == TextDirection.rtl
                      ? Icons.chevron_left
                      : Icons.chevron_right,
                  color: _secondary,
                ),
          ],
        ),
      ),
    ),
  );

  Widget _paneLink(
    BuildContext context,
    _SettingsPane pane,
    IconData icon,
    String title,
    String summary,
  ) => _settingsRow(
    context,
    key: 'settings-open-${pane.name}',
    icon: icon,
    title: title,
    subtitle: summary,
    onTap: () => _showPane(pane),
  );

  Widget _settingSwitch(
    BuildContext context,
    String key,
    IconData icon,
    String title,
    bool value,
    ValueChanged<bool>? onChanged, {
    String? hint,
  }) => Padding(
    padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 6),
    child: Row(
      children: [
        Icon(icon, color: _secondary, size: 23),
        const SizedBox(width: 12),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                title,
                style: TextStyle(
                  color: _ink,
                  fontSize: 16,
                  fontWeight: FontWeight.w600,
                ),
              ),
              if (hint != null)
                Text(hint, style: TextStyle(color: _secondary, fontSize: 12)),
            ],
          ),
        ),
        const SizedBox(width: 8),
        Switch(key: Key('settings-$key'), value: value, onChanged: onChanged),
      ],
    ),
  );

  List<Widget> _settingsContents(BuildContext context) => switch (_pane) {
    _SettingsPane.root => _settingsHub(context),
    _SettingsPane.profiles => [_profileSection(dark: _dark)],
    _SettingsPane.appearance => _appearancePane(context),
    _SettingsPane.sound => _soundPane(context),
    _SettingsPane.synapse => _synapsePane(context),
    _SettingsPane.language => _languagePane(context),
    _SettingsPane.data => _dataPane(context),
    _SettingsPane.help => _helpPane(context),
  };

  List<Widget> _settingsHub(BuildContext context) {
    final palette = CrystalPalette.read(_s);
    String on(bool value) => value ? L.t('settingsOn') : L.t('settingsOff');
    return [
      _settingsPanel(context, [
        _paneLink(
          context,
          _SettingsPane.profiles,
          Icons.person_outline,
          L.t('settingsTrainingProfile'),
          L.t('profileName_${_s.activeProfile}'),
        ),
      ]),
      _sectionLabel(L.t('settingsPersonalize')),
      _settingsPanel(context, [
        _paneLink(
          context,
          _SettingsPane.appearance,
          Icons.diamond_outlined,
          L.t('theme_selection'),
          '$_themeSummary · ${L.t('frameAurora')}${palette.enabled ? ' · ${_presetName(palette.recipe)}' : ''}',
        ),
        _paneLink(
          context,
          _SettingsPane.sound,
          Icons.volume_up_outlined,
          L.t('settingsSoundHaptics'),
          '${L.t('label_sound')}: ${on(_sound)} · ${L.t('music')}: ${on(_music)}',
        ),
        _paneLink(
          context,
          _SettingsPane.synapse,
          Icons.pets_outlined,
          L.t('petName'),
          _pet ? L.t('settingsSynapseSummary') : on(false),
        ),
        _paneLink(
          context,
          _SettingsPane.language,
          Icons.language,
          L.t('settingsLanguageAccess'),
          _names.name(L.locale),
        ),
      ]),
      _sectionLabel(L.t('settingsDataSupport')),
      _settingsPanel(context, [
        _paneLink(
          context,
          _SettingsPane.data,
          Icons.cloud_outlined,
          L.t('settingsCloudBackups'),
          widget.cloudPilot == null
              ? L.t('cloudPilotLocal')
              : L.t('cloudPilotTest'),
        ),
        _paneLink(
          context,
          _SettingsPane.help,
          Icons.menu_book_outlined,
          L.t('settingsHelpAbout'),
          L.t('settingsHelpSummary'),
        ),
      ]),
      if (_version.isNotEmpty)
        Padding(
          padding: const EdgeInsets.all(8),
          child: Text(
            'PsyGames $_version',
            textAlign: TextAlign.center,
            style: TextStyle(color: _secondary, fontSize: 12),
          ),
        ),
    ];
  }

  Widget _choices(
    BuildContext context,
    List<Widget> choices, {
    int columns = 2,
  }) => LayoutBuilder(
    builder: (_, box) {
      // At x2 or narrow widths, let labels wrap without shrinking text.
      final count =
          MediaQuery.textScalerOf(context).scale(16) > 25 && box.maxWidth < 360
          ? 1
          : columns;
      final width = (box.maxWidth - 8 * (count - 1)) / count;
      return Wrap(
        spacing: 8,
        runSpacing: 8,
        children: choices.map((c) => SizedBox(width: width, child: c)).toList(),
      );
    },
  );

  Widget _choice(
    BuildContext context, {
    required String key,
    required String text,
    required bool selected,
    required VoidCallback onTap,
    IconData? icon,
    bool enabled = true,
  }) => Semantics(
    key: Key(key),
    button: true,
    selected: selected,
    enabled: enabled,
    child: Material(
      type: MaterialType.transparency,
      child: InkWell(
        onTap: enabled ? onTap : null,
        borderRadius: BorderRadius.circular(16),
        child: Container(
          constraints: const BoxConstraints(minHeight: 56),
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 12),
          decoration: selected
              ? BoxDecoration(
                  image: ChromeArt.compactAction,
                  color: _chrome.primaryTop,
                  borderRadius: BorderRadius.circular(16),
                )
              : ChromeArt.panel(context).copyWith(color: _chrome.glass),
          child: Row(
            children: [
              if (icon != null) ...[
                Icon(icon, size: 20, color: selected ? Colors.black : _ink),
                const SizedBox(width: 8),
              ],
              Expanded(
                child: Text(
                  text,
                  style: TextStyle(
                    color: selected ? Colors.black : _ink,
                    fontSize: 14,
                    height: 1.3,
                    fontWeight: FontWeight.w600,
                  ),
                ),
              ),
              if (selected) ...[
                const SizedBox(width: 4),
                const Icon(Icons.check, size: 18, color: Colors.black),
              ],
            ],
          ),
        ),
      ),
    ),
  );

  List<Widget> _appearancePane(BuildContext context) {
    final mode = _s.get(AppLook.overrideKey) ?? 'profile';
    final palette = CrystalPalette.read(_s);
    final options = [...profileGemPresets, ...extraGemPresets];
    return [
      _sectionLabel(L.t('themeLabel')),
      _choices(context, [
        for (final item in [
          ('light', L.t('theme_light'), Icons.light_mode_outlined),
          ('dark', L.t('theme_dark'), Icons.dark_mode_outlined),
          ('system', L.t('theme_system'), Icons.devices_outlined),
          ('profile', L.t('theme_profile'), Icons.person_outline),
        ])
          _choice(
            context,
            key: 'settings-theme-${item.$1}',
            text: item.$2,
            selected: mode == item.$1,
            onTap: () => _setTheme(item.$1),
            icon: item.$3,
          ),
      ]),
      const SizedBox(height: 12),
      _sectionLabel(L.t('ui_template_title')),
      _choices(context, [
        for (final item in [
          (UiTemplate.classic, L.t('modeClassic')),
          (UiTemplate.aurora, L.t('frameAurora')),
        ])
          _choice(
            context,
            key: 'settings-template-${item.$1.name}',
            text: item.$2,
            selected: item.$1 == UiTemplate.aurora,
            icon: Icons.dashboard_customize_outlined,
            onTap: () async {
              await _s.set(uiTemplateKey, item.$1.id);
              AppLook.refresh(_s);
              _redraw();
            },
          ),
      ]),
      const SizedBox(height: 12),
      _settingsPanel(context, [
        _settingSwitch(
          context,
          'crystal-overview-enabled',
          Icons.diamond_outlined,
          L.t('gemPaletteTitle'),
          palette.enabled,
          _paletteSaving || (!GemPaletteEngine.available && !palette.enabled)
              ? null
              : (v) => _saveCrystal(palette.copyWith(enabled: v)),
        ),
        if (!GemPaletteEngine.available)
          Padding(
            padding: const EdgeInsets.all(12),
            child: Text(
              L.t('gemPaletteUnavailable'),
              style: TextStyle(color: _secondary),
            ),
          ),
        Padding(
          padding: const EdgeInsets.all(8),
          child: _choices(context, [
            for (final id in [
              'sapphire',
              'diamond',
              'pink-diamond',
              'black-diamond',
            ])
              if (options.any((p) => p.id == id))
                Builder(
                  builder: (_) {
                    final option = options.firstWhere((p) => p.id == id);
                    return _presetTile(context, palette, option);
                  },
                ),
          ], columns: 4),
        ),
        _settingsRow(
          context,
          key: 'settings-crystal-palette',
          icon: Icons.grid_view,
          title: L.f('settingsPresetCount', {'n': '${options.length}'}),
          subtitle: _presetName(palette.recipe),
          onTap: _openCrystal,
        ),
        _settingsRow(
          context,
          key: 'settings-customize-palette',
          icon: Icons.palette_outlined,
          title: L.t('settingsCustomize'),
          subtitle:
              '${L.t('gemPaletteHue')} · ${L.t('gemPaletteLightness')} · ${L.t('gemPaletteGlow')}',
          onTap: _openCrystal,
        ),
      ]),
      ExpansionTile(
        key: const Key('settings-appearance-details'),
        title: Text(L.t('ui_template_title')),
        children: [
          Padding(
            padding: const EdgeInsets.all(12),
            child: Text(L.t('ui_template_hint')),
          ),
          Padding(
            padding: const EdgeInsets.all(12),
            child: Text(L.t('gemPaletteHint')),
          ),
        ],
      ),
    ];
  }

  Future<void> _openCrystal() async {
    await Navigator.of(context).push<void>(
      MaterialPageRoute(builder: (_) => CrystalSettingsScreen(state: _s)),
    );
    _redraw();
  }

  Widget _presetTile(
    BuildContext context,
    CrystalPalette palette,
    GemPalettePreset option,
  ) {
    final selected = palette.recipe.id == option.id;
    final enabled = !_paletteSaving && GemPaletteEngine.available;
    return Semantics(
      button: true,
      selected: selected,
      enabled: enabled,
      child: InkWell(
        key: Key('settings-preset-${option.id}'),
        borderRadius: BorderRadius.circular(14),
        onTap: enabled
            ? () => _saveCrystal(palette.copyWith(recipe: option))
            : null,
        child: Container(
          constraints: const BoxConstraints(minHeight: 108),
          padding: const EdgeInsets.symmetric(horizontal: 5, vertical: 8),
          decoration: ChromeArt.panel(context, square: true).copyWith(
            border: Border.all(
              color: selected ? _chrome.gold : Colors.transparent,
              width: 2,
            ),
          ),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Stack(
                alignment: AlignmentDirectional.topEnd,
                children: [
                  SizedBox(
                    width: 48,
                    height: 48,
                    child: GemPaletteEngine.available
                        ? GemPaletteMaterial(
                            asset: 'assets/aurora_game_chrome/dark_round_button.webp',
                            program: GemPaletteEngine.program!,
                            hue: option.hue,
                            saturation: option.saturation,
                            lightness: option.lightness,
                          )
                        : Icon(
                            Icons.diamond_outlined,
                            color: _secondary,
                            size: 32,
                          ),
                  ),
                  if (selected)
                    Icon(Icons.check_circle, color: _chrome.gold, size: 16),
                ],
              ),
              const SizedBox(height: 6),
              Text(
                _presetName(option),
                textAlign: TextAlign.center,
                style: TextStyle(
                  color: _ink,
                  fontSize: 12,
                  height: 1.25,
                  fontWeight: FontWeight.w600,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Future<void> _saveCrystal(CrystalPalette palette) async {
    if (_paletteSaving) return;
    _paletteSaving = true;
    _redraw();
    try {
      await _s.set('$crystalKeyPrefix${_s.activeProfile}', palette.encode());
      await _s.set(crystalEnabledKey, palette.enabled ? '1' : '0');
    } catch (_) {
      if (mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text(L.t('gemPaletteSaveError'))));
      }
    } finally {
      _paletteSaving = false;
      _redraw();
    }
  }

  List<Widget> _soundPane(BuildContext context) => [
    _settingsPanel(context, [
      _settingSwitch(
        context,
        'sound',
        Icons.volume_up_outlined,
        L.t('label_sound'),
        _sound,
        (v) => _put(SettingsScreen.sound, '$v'),
      ),
      if (_sound)
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 4),
          child: Row(
            children: [
              IconButton(
                key: const Key('settings-volume-down'),
                tooltip: '${L.t('volumeLabel')} −10',
                onPressed: () => _put(
                  SettingsScreen.volume,
                  '${(_volume - 10).clamp(0, 100)}',
                ),
                icon: const Icon(Icons.remove),
              ),
              Expanded(
                child: Slider(
                  key: const Key('settings-volume'),
                  value: _volume.toDouble(),
                  max: 100,
                  label: '$_volume%',
                  onChanged: (v) => _put(SettingsScreen.volume, '${v.round()}'),
                ),
              ),
              IconButton(
                key: const Key('settings-volume-up'),
                tooltip: '${L.t('volumeLabel')} +10',
                onPressed: () => _put(
                  SettingsScreen.volume,
                  '${(_volume + 10).clamp(0, 100)}',
                ),
                icon: const Icon(Icons.add),
              ),
              Text('$_volume%', style: TextStyle(color: _secondary)),
            ],
          ),
        ),
      _settingSwitch(
        context,
        'music',
        Icons.music_note_outlined,
        L.t('music'),
        _music,
        (v) => _put(SettingsScreen.music, '$v'),
      ),
      _settingSwitch(
        context,
        'haptic',
        Icons.vibration,
        L.t('label_vibration'),
        _haptic,
        (v) => _put(SettingsScreen.haptic, '$v'),
      ),
    ]),
  ];

  List<Widget> _synapsePane(BuildContext context) => [
    _settingsPanel(context, [
      _settingSwitch(
        context,
        'pet',
        Icons.pets_outlined,
        L.t('petSynapse'),
        _pet,
        (v) => _put(SettingsScreen.pet, v ? '1' : '0'),
      ),
      if (_pet)
        _settingSwitch(
          context,
          'petwalk',
          Icons.directions_walk,
          L.t('petWalks'),
          _petWalks,
          (v) => _put(SettingsScreen.petWalk, v ? '1' : '0'),
        ),
      if (_pet)
        Padding(
          padding: const EdgeInsets.all(12),
          child: Column(
            children: [
              Row(
                children: [
                  Expanded(
                    child: Text(L.t('petSize'), style: TextStyle(color: _ink)),
                  ),
                  Text(
                    '${(_petScale * 100).round()}%',
                    style: TextStyle(color: _secondary),
                  ),
                ],
              ),
              Slider(
                key: const Key('settings-pet-scale'),
                value: _petScale,
                min: SettingsScreen.petMin,
                max: SettingsScreen.petMax,
                onChanged: (v) => _put(
                  SettingsScreen.petScale,
                  SettingsScreen.jsNumber(double.parse(v.toStringAsFixed(2))),
                ),
              ),
            ],
          ),
        ),
    ]),
  ];

  List<Widget> _languagePane(BuildContext context) => [
    _settingsPanel(context, [
      _settingSwitch(
        context,
        'colorblind',
        Icons.visibility_outlined,
        L.t('colorblindMode'),
        _colorblind,
        (v) => _put(SettingsScreen.colorblind, '$v'),
        hint: L.t('colorblindWhere'),
      ),
    ]),
    _sectionLabel(L.t('language')),
    _choices(context, [
      for (final code
          in _names.languages.isEmpty ? L.locales : _names.languages.keys)
        _choice(
          context,
          key: 'settings-lang-$code',
          text: _names.name(code),
          selected: L.locale == code,
          onTap: () => _setLanguage(code),
        ),
    ]),
  ];

  List<Widget> _dataPane(BuildContext context) => [
    _settingsPanel(context, [
      if (widget.cloudPilot != null)
        _settingsRow(
          context,
          key: 'settings-cloud',
          icon: Icons.cloud_outlined,
          title: L.t('cloudPilotTitle'),
          subtitle: L.t('cloudPilotTest'),
          onTap: () async {
            await Navigator.of(context).push<void>(
              MaterialPageRoute(
                builder: (_) => CloudSettingsScreen(pilot: widget.cloudPilot!),
              ),
            );
            _redraw();
          },
        )
      else
        Padding(
          padding: const EdgeInsets.all(12),
          child: Text(
            L.t('cloudPilotLocalHint'),
            style: TextStyle(color: _secondary),
          ),
        ),
      // Кабинет преподавателя (флаг PSY_COACH, поверх облачного пилота): тот же аккаунт.
      if (PsyGamesCoach.instance case final coach?) ...[
        ValueListenableBuilder<CoachRole>(
          valueListenable: coach.role,
          builder: (context, mode, _) => _settingSwitch(
            context,
            'coach-role',
            Icons.swap_horiz,
            '${PsyGamesCoach.v2Strings.roleTitle}: ${PsyGamesCoach.v2Strings.roleTeacher}',
            mode == CoachRole.teacher,
            (v) => coach.setRole(v ? CoachRole.teacher : CoachRole.student),
            hint: PsyGamesCoach.v2Strings.roleHint,
          ),
        ),
        _settingsRow(
          context,
          key: 'settings-coach-teacher',
          icon: Icons.school_outlined,
          title: coach.strings.teacherTitle,
          onTap: () => coach.openTeacher(context),
        ),
        _settingsRow(
          context,
          key: 'settings-coach-mine',
          icon: Icons.people_outline,
          title: coach.strings.studentTitle,
          onTap: () => coach.openMyCoaches(context),
        ),
      ],
      _settingsRow(
        context,
        key: 'settings-backup-save',
        icon: Icons.download_outlined,
        title: L.t('btn_save_backup'),
        onTap: _saveBackup,
      ),
      _settingsRow(
        context,
        key: 'settings-backup-restore',
        icon: Icons.upload_outlined,
        title: L.t('btn_restore_backup'),
        onTap: _restoreBackup,
      ),
    ]),
    _settingsPanel(context, [
      ExpansionTile(
        key: const Key('settings-transfer-options'),
        title: Text(L.t('settingsTransferOptions')),
        children: [
          Padding(
            padding: const EdgeInsets.all(12),
            child: Text(L.t('transferProgressHint')),
          ),
          _settingsRow(
            context,
            key: 'settings-export',
            icon: Icons.output,
            title: L.t('exportGetCode'),
            onTap: _exportCode,
          ),
          _settingsRow(
            context,
            key: 'settings-import',
            icon: Icons.input,
            title: L.t('importPasteCode'),
            onTap: _importCode,
          ),
        ],
      ),
    ]),
    if (_s.activeProfile == 'odv999')
      _settingsPanel(context, [
        ExpansionTile(
          key: const Key('settings-owner-tools'),
          title: Text(L.t('settingsOwnerTools')),
          children: [
            _settingsRow(
              context,
              key: 'settings-playlists-load',
              icon: Icons.list_alt,
              title: L.t('btn_load_playlists'),
              subtitle: _playlistProfiles == null
                  ? L.t('playlistsNowFactory')
                  : L
                        .t('playlistsNowFile')
                        .replaceAll('{n}', '$_playlistProfiles'),
              onTap: _loadPlaylists,
            ),
            if (_playlistProfiles != null)
              _settingsRow(
                context,
                key: 'settings-playlists-reset',
                icon: Icons.restart_alt,
                title: L.t('btn_reset_playlists'),
                onTap: _resetPlaylists,
              ),
          ],
        ),
      ]),
  ];

  List<Widget> _helpPane(BuildContext context) => [
    _settingsPanel(context, [
      if (widget.onFeedback != null)
        _settingsRow(
          context,
          key: 'settings-report',
          icon: Icons.bug_report_outlined,
          title: L.t('feedbackFabLabel'),
          onTap: widget.onFeedback!,
        ),
      _settingSwitch(
        context,
        'devchat',
        Icons.bug_report_outlined,
        L.t('devChatToggle'),
        _devChat,
        (v) => _put(SettingsScreen.devChat, v ? '1' : '0'),
      ),
      for (final item in [
        (
          '/onboarding?tutorial=1',
          Icons.play_circle_outline,
          L.t('btn_replay_tutorial'),
        ),
        ('/sources', Icons.local_library_outlined, L.t('sourcesTitle')),
        ('/whats-new', Icons.auto_awesome_outlined, L.t('versionHistory')),
      ])
        _settingsRow(
          context,
          key: 'settings-link-${item.$1}',
          icon: item.$2,
          title: item.$3,
          onTap: () => Navigator.of(context).pop(HubCardTap(item.$1)),
        ),
      _settingsRow(
        context,
        key: 'settings-update',
        icon: Icons.system_update_alt,
        title: L.t('updCheckBtn'),
        subtitle: _updChecking ? '…' : 'PsyGames $_version',
        onTap: _checkUpdates,
      ),
    ]),
    _settingsPanel(context, [
      _settingsRow(
        context,
        key: 'settings-link-/achievements',
        icon: Icons.emoji_events_outlined,
        title: L.t('achievementsTitle'),
        onTap: () => Navigator.of(context).pop(HubCardTap('/achievements')),
      ),
    ]),
    Padding(
      padding: const EdgeInsets.all(12),
      child: Text(
        'PsyGames${_version.isEmpty ? '' : ' v$_version'} · ${L.t('profileName_${_s.activeProfile}')} · ${L.t('label_validated_paradigms')}',
        textAlign: TextAlign.center,
        style: TextStyle(color: _secondary, fontSize: 12),
      ),
    ),
  ];
}
