/// ВЫБОР РЕЖИМА АНАГРАММ — переключатель веб-экрана настройки (`frontend/app/games/anagrams.tsx:966–995`),
/// перенесённый в натив.
///
/// 🔴 БЕЗ НЕГО ТРИ ИГРЫ ИЗ ЧЕТЫРЁХ БЫЛИ НЕДОСТИЖИМЫ. Замер 08.10.2026 по main c50a0f15d: ключи
/// `/games/anagrams?mode=…` (`hybrid_app.dart`) не упомянуты нигде — ни в развилках, ни в наборах, ни
/// в каталоге, ни в коде экранов. В вебе режим выбирали на экране настройки, а в приложении этот экран
/// не показывается никогда: развилка ведёт на `/games/anagrams`, перехват открывает нативную классику.
/// «Все слова», кроссворд и квадрат с переезда (30.09) открыть было неоткуда.
///
/// Переход — как у плашек набора (`SuiteSwitch`): экран закрывается с [HubCardTap], оболочка
/// открывает маршрут режима. На шаге зарядки пункта нет: шаг задаёт игру сам.
library;

import 'package:flutter/material.dart';

import '../../shell/aux_action.dart';
import '../../shell/game_preset.dart';
import '../../shell/hub_screen.dart' show HubCardTap;
import '../../shell/l10n.dart';
import '../../shell/shared_state.dart';
import 'mode_thumbs.dart';
import 'word_lang.dart' show AnagramMode;

/// Режимы в порядке веб-переключателя: классика, квадрат, «Все слова», кроссворд.
const anagramModesInOrder = [AnagramMode.classic, AnagramMode.square, AnagramMode.all, AnagramMode.cross];

/// Маршрут режима — ключ перехвата в `HybridApp.native`.
String anagramModeRoute(AnagramMode mode) => '/games/anagrams?mode=${mode.name}';

/// Подпись режима — те же ключи, что у веб-переключателя (`anagrams.tsx:994`).
String anagramModeName(AnagramMode mode) => switch (mode) {
      AnagramMode.classic => L.t('classicLabel'),
      AnagramMode.square => L.t('anagramSquare'),
      AnagramMode.all => L.t('anagramAllWords'),
      AnagramMode.cross => L.t('anagramCrossword'),
    };

String _modeIntro(AnagramMode mode) => switch (mode) {
      AnagramMode.classic => L.t('anagramClassicIntroDesc'),
      AnagramMode.square => L.t('anagramSquareIntroDesc'),
      AnagramMode.all => L.t('anagramAllIntroDesc'),
      AnagramMode.cross => L.t('anagramCrossIntroDesc'),
    };

/// Показывать ли выбор режима: на шаге зарядки игру задаёт шаг.
bool get anagramModeSwitchShown => !GamePreset.isPreset;

/// Пункт ряда значков «Режим»: лист из четырёх режимов с картинками под профиль.
AuxAction anagramModeAction(BuildContext context, SharedState state, AnagramMode current) => AuxAction(
      key: const Key('anagram-mode-switch'),
      icon: Icons.dashboard_outlined,
      label: L.t('mode'),
      onPressed: () => _pickMode(context, state, current),
    );

Future<void> _pickMode(BuildContext context, SharedState state, AnagramMode current) async {
  final profile = state.activeProfile;
  final picked = await showModalBottomSheet<AnagramMode>(
    context: context,
    showDragHandle: true,
    isScrollControlled: true,
    builder: (sheet) => SafeArea(
      child: ListView(
        shrinkWrap: true,
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 0, 16, 8),
            child: Text(L.t('mode'), style: Theme.of(sheet).textTheme.titleMedium),
          ),
          for (final mode in anagramModesInOrder)
            ListTile(
              key: Key('anagram-mode-${mode.name}'),
              leading: ClipRRect(
                borderRadius: BorderRadius.circular(8),
                child: Image.asset(
                  anagramModeThumb(mode, profile),
                  key: Key('anagram-mode-thumb-${mode.name}'),
                  width: 56,
                  height: 56,
                  fit: BoxFit.cover,
                  excludeFromSemantics: true,
                ),
              ),
              title: Text(anagramModeName(mode)),
              subtitle: Text(_modeIntro(mode), maxLines: 2, overflow: TextOverflow.ellipsis),
              selected: mode == current,
              trailing: mode == current ? const Icon(Icons.check) : null,
              onTap: () => Navigator.of(sheet).pop(mode),
            ),
        ],
      ),
    ),
  );
  if (picked == null || picked == current || !context.mounted) return;
  Navigator.of(context).pop(HubCardTap(anagramModeRoute(picked)));
}
