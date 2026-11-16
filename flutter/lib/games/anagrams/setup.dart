import 'package:flutter/material.dart';

import '../../shell/hub_screen.dart' show HubCardTap;
import '../../shell/l10n.dart';
import '../../shell/restart_scope.dart';
import '../../shell/setup_scroll.dart';
import '../../shell/shared_state.dart';
import '../languages/lang_names.dart';
import 'mode_switch.dart';
import 'model.dart';
import 'word_lang.dart';

class AnagramSetup extends StatefulWidget {
  const AnagramSetup({
    super.key,
    required this.state,
    required this.mode,
    required this.level,
    required this.lang,
    required this.height,
    required this.onStart,
    this.packCount,
    this.ringCount,
  });

  final SharedState state;
  final AnagramMode mode;
  final int level;
  final String lang;
  final double height;
  final VoidCallback onStart;
  final int? packCount;
  final int? ringCount;

  @override
  State<AnagramSetup> createState() => _AnagramSetupState();
}

class _AnagramSetupState extends State<AnagramSetup> {
  LangNames _names = LangNames.empty;

  @override
  void initState() {
    super.initState();
    LangNames.load().then((names) {
      if (mounted) setState(() => _names = names);
    });
  }

  String get _params {
    final p = AnagramLevel.of(widget.level);
    final args = {'n': '${p.trials}', 'l': '${p.length}', 'w': '${p.wordSec}'};
    return switch (widget.mode) {
      AnagramMode.all => L.t('anagramAllWordsLvlParams'),
      AnagramMode.square => L.t('anagramSquareLvlParams'),
      AnagramMode.cross => L.f('anagramsLvlParamsFree', args),
      AnagramMode.classic =>
        p.wordSec > 0
            ? L.f('anagramsLvlParamsTimed', args)
            : L.f('anagramsLvlParamsFree', args),
    };
  }

  String get _pass => switch (widget.mode) {
    AnagramMode.all => L.t('anagramAllWordsPass'),
    AnagramMode.square => L.t('anagramSquarePass'),
    AnagramMode.cross || AnagramMode.classic => L.t('anagramsPass'),
  };

  String get _hint => switch (widget.mode) {
    AnagramMode.classic => L.t('anagramClassicHint'),
    AnagramMode.all => L.t('anagramAllWordsHint'),
    AnagramMode.cross => L.t('anagramCrosswordHint'),
    AnagramMode.square => L.t('anagramSquareHint'),
  };

  void _pickMode(AnagramMode mode) {
    if (mode == widget.mode) return;
    Navigator.of(context)
        .pop(HubCardTap(anagramModeRoute(mode), replace: true));
  }

  Future<void> _pickLang(String lang) async {
    if (lang == widget.lang) return;
    await widget.state.set(
      anagramWordLangKey(widget.state.activeProfile),
      lang,
    );
    if (!mounted) return;
    RestartScope.of(context)?.call();
  }

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    final count = widget.mode == AnagramMode.square
        ? widget.ringCount
        : widget.packCount;
    return SetupScroll(
      height: widget.height,
      onStart: widget.onStart,
      children: [
        Text(
          L.t('anagramsDesc'),
          textAlign: TextAlign.center,
          style: text.titleMedium,
        ),
        const SizedBox(height: 16),
        Text('${L.t('level')} ${widget.level}', style: text.titleLarge),
        const SizedBox(height: 6),
        Text(_params, textAlign: TextAlign.center, style: text.bodyMedium),
        const SizedBox(height: 4),
        Text(_pass, textAlign: TextAlign.center, style: text.bodySmall),
        const SizedBox(height: 16),
        if (anagramModeSwitchShown) ...[
          SetupChoice<AnagramMode>(
            label: L.t('mode'),
            options: [
              for (final mode in anagramModesInOrder)
                (
                  mode,
                  anagramModeName(mode),
                  'anagram-setup-mode-${mode.name}',
                ),
            ],
            value: widget.mode,
            onPick: _pickMode,
          ),
          const SizedBox(height: 8),
        ],
        Text(_hint, textAlign: TextAlign.center, style: text.bodySmall),
        if (widget.mode != AnagramMode.classic && count != null) ...[
          const SizedBox(height: 6),
          Text(
            L.f('anagramSquareCount', {'n': '$count'}),
            textAlign: TextAlign.center,
            style: text.bodySmall,
          ),
        ],
        if (!anagramWordLangFromStep()) ...[
          const SizedBox(height: 16),
          SetupChoice<String>(
            label: L.t('wordLangLabel'),
            options: [
              for (final lang in anagramLangsOf(widget.mode))
                (lang, _names.label(lang), 'anagram-setup-lang-$lang'),
            ],
            value: widget.lang,
            onPick: (lang) => _pickLang(lang),
          ),
        ],
      ],
    );
  }
}
