import 'package:flutter/material.dart';

import '../../shell/game_preset.dart';
import '../../shell/game_shell.dart';
import '../../shell/l10n.dart';
import '../../shell/restart_scope.dart';
import '../../shell/shared_state.dart';
import '../languages/lang_names.dart';
import 'model.dart';
import 'ring.dart';

/// ЯЗЫК СЛОВ АНАГРАММ — перенос `frontend/src/services/wordLanguage.ts` и
/// `frontend/src/hooks/useWordLanguage.ts`.
///
/// 🔴 ДЕФЕКТ ПЕРЕНОСА, КОТОРЫЙ ЭТО ЗАКРЫВАЕТ. Все четыре экрана создавались без языка
/// (`hybrid_app.dart`: `AnagramsScreen(state: s)`), а умолчание конструктора было `'ru'` —
/// банк слов был РУССКИМ У ВСЕХ, включая английский телефон. Английский с 01.10.2026 —
/// основной язык продукта (решение Дениса). А выбор языка слов в вебе появился по двум
/// отчётам Дениса 05.09.2026: «надо добавить выбор языка».
///
/// Правило веба, по шагам:
/// 1. Язык из шага зарядки (`targetLang` в адресе) сильнее хранилища и НЕ сохраняется.
///    Зарядка — гость: говорит, на чём играть сейчас.
/// 2. Затем выбор человека — ключ `psygames_anagrams_wordlang_<профиль>`, общий с вебом.
/// 3. Затем язык интерфейса, если у игры есть на нём слова, иначе английский.
/// Годность 1–3 проверяется по ИГРЕ (`wordLangsFor('anagrams')`), а не по режиму:
/// корейский, выбранный в «Все слова», не должен сбрасываться, если зайти в классику.
///
/// ⚠️ СУЖЕНИЕ ПО РЕЖИМУ — СОЗНАТЕЛЬНОЕ ОТСТУПЛЕНИЕ ОТ ВЕБА. Веб сужает выбор под режим
/// вызовом `pick('en')`, а это ЗАПИСЬ: корейский из «Все слова» стирался одним заходом
/// в классику. Здесь недоступный режиму язык заменяется английским только на эту партию,
/// выбор человека в хранилище остаётся.
enum AnagramMode { classic, all, cross, square }

/// Языки игры и их порядок в выборе — `ЯЗЫКИ_ИГРЫ.anagrams` веба.
const anagramGameLangs = <String>['ru', 'en', 'de', 'es', 'fr', 'it', 'ko', 'pt', 'ar', 'ja'];

/// Языки режима — перенос `языкиРежима` из `frontend/app/games/anagrams.tsx`.
///
/// · «Все слова» — все языки, у которых есть наборы.
/// · Кроссворд — те же без арабского. Замер веба: в коробку 12×12 арабский влезает лишь
///   в 69,4 % уровней, слова в среднем 5,3 буквы против 4,5 у корейского.
/// · Квадрат — языки, у которых есть кольца.
/// · Классика — без ko, ja и ar: плитка-чамо, катакана и письмо справа налево — отдельная
///   работа на экране, а не строчка в списке.
List<String> anagramLangsOf(AnagramMode mode) => [
      for (final l in anagramGameLangs)
        if (switch (mode) {
          AnagramMode.all => WordBank.locales.contains(l),
          AnagramMode.cross => WordBank.locales.contains(l) && l != 'ar',
          AnagramMode.square => RingPacks.locales.contains(l),
          AnagramMode.classic => WordBank.locales.contains(l) && l != 'ko' && l != 'ja' && l != 'ar',
        })
          l,
    ];

/// Ключ выбора — `wordLangKey('anagrams', профиль)` веба: по игре И по профилю.
String anagramWordLangKey(String profile) => 'psygames_anagrams_wordlang_$profile';

/// Язык слов для партии в режиме [mode].
String anagramWordLang(SharedState state, AnagramMode mode) {
  bool ofGame(String? l) => l != null && anagramGameLangs.contains(l);
  final fromStep = GamePreset.str('targetLang', '');
  final saved = state.get(anagramWordLangKey(state.activeProfile));
  final ui = state.language;
  final chosen = ofGame(fromStep)
      ? fromStep
      : ofGame(saved)
          ? saved!
          : ofGame(ui)
              ? ui
              : 'en';
  return anagramLangsOf(mode).contains(chosen) ? chosen : 'en';
}

/// Пункт паузы «Язык слов · EN»: выбор сохраняется, экран начинается заново на новом
/// языке — пересборкой каркаса (`RestartScope`), как «Заново». Лестница не трогается:
/// ступень у режима одна на все языки, как в вебе.
PauseAction anagramWordLangAction(BuildContext context, SharedState state, AnagramMode mode, String current) =>
    PauseAction(
      label: '${L.t('wordLangLabel')} · ${current.toUpperCase()}',
      icon: Icons.translate,
      onPressed: () => _pick(context, state, mode, current),
    );

Future<void> _pick(BuildContext context, SharedState state, AnagramMode mode, String current) async {
  final names = await LangNames.load();
  if (!context.mounted) return;
  final lang = await showDialog<String>(
    context: context,
    builder: (c) => SimpleDialog(
      title: Text(L.t('wordLangLabel')),
      children: [
        for (final l in anagramLangsOf(mode))
          SimpleDialogOption(
            key: Key('anagram-wordlang-$l'),
            onPressed: () => Navigator.of(c).pop(l),
            // Подпись — на СВОЁМ языке, а не переводом: так человек находит свой язык,
            // даже когда интерфейс на чужом (`WORD_LANG_LABEL` веба).
            child: Row(children: [
              Expanded(child: Text(names.label(l))),
              if (l == current) const Icon(Icons.check, size: 18),
            ]),
          ),
      ],
    ),
  );
  if (lang == null || lang == current) return;
  await state.set(anagramWordLangKey(state.activeProfile), lang);
  if (!context.mounted) return;
  RestartScope.of(context)?.call();
}
