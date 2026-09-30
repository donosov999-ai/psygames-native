import 'package:flutter/material.dart';

import 'json_asset.dart';

/// САМОНАЗВАНИЯ ЯЗЫКОВ — данные веба, а не текст экрана.
///
/// `assets/vocab/lang-names.json` выгружается из `LANGUAGES`
/// (`frontend/src/contexts/LanguageContext.tsx`) и `WORD_LANG_LABEL`
/// (`frontend/src/services/wordLanguage.ts`) прибором
/// `frontend/scripts/flutter-lexical-decision-reference.test.ts`. Самоназвание
/// одинаково на любом языке интерфейса — поэтому оно не в словаре, а здесь.
class LangNames {
  const LangNames(this.languages, this.wordLabels);

  /// Порядок ключей — порядок `LANGUAGES`: выбор языка строится в нём же.
  final Map<String, String> languages;
  final Map<String, String> wordLabels;

  static const empty = LangNames({}, {});

  static Future<LangNames> load() async {
    final j = await loadJsonAsset('assets/vocab/lang-names.json') as Map;
    Map<String, String> m(Object? raw) => {for (final e in (raw as Map? ?? const {}).entries) '${e.key}': '${e.value}'};
    return LangNames(m(j['languages']), m(j['wordLabels']));
  }

  /// Название для выбора языка — `l.name` веба.
  String name(String code) => languages[code] ?? code.toUpperCase();

  /// Подпись языка у стимула — `WORD_LANG_LABEL[язык] ?? язык.toUpperCase()`.
  String label(String code) => wordLabels[code] ?? code.toUpperCase();
}

/// 🔴 ЯЗЫК — СЛОВОМ У САМОГО СТИМУЛА, а не только двумя буквами в шапке.
///
/// Правка Дениса 10.09.2026: «подписи должны быть — раз переход в
/// мультиязычности, какой язык пишется; обозначение мелкое». Переход отмечается
/// стрелкой и заливкой, повтор языка — спокойной рамкой. Перенос `LanguageBadge.tsx`.
class LanguageBadge extends StatelessWidget {
  const LanguageBadge({super.key, required this.label, required this.switched, required this.accent});

  final String label;

  /// Язык отличается от предыдущей пробы — это и есть переход.
  final bool switched;
  final Color accent;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Semantics(
      label: label,
      child: Container(
        key: const Key('language-badge'),
        margin: const EdgeInsets.only(top: 10),
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 5),
        decoration: BoxDecoration(
          color: switched ? accent : Colors.transparent,
          borderRadius: BorderRadius.circular(999),
          border: Border.all(color: switched ? accent : scheme.outlineVariant),
        ),
        // 15 — не «мелкое»: подпись должна читаться, не приглядываясь.
        child: Text(
          switched ? '→ $label' : label,
          style: TextStyle(
            fontSize: 15,
            fontWeight: FontWeight.w700,
            color: switched ? Colors.white : scheme.onSurfaceVariant,
          ),
        ),
      ),
    );
  }
}
