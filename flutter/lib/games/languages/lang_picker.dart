import 'package:flutter/material.dart';

/// ВЫБОР ЯЗЫКА — ОДНА ВЫПАДАЮЩАЯ СТРОКА НА ВЕСЬ РАЗДЕЛ «ЯЗЫКИ» (задача a0ae517f,
/// слово Дениса 17.09.2026 про «портянку»).
///
/// Замер 17.09 по вебу: сетка до 11 кнопок занимала до 277 px экрана настройки и
/// сталкивала «Начать» под сгиб; выпадающая строка — ~56 px. Во Flutter часть экранов
/// уже была со списком, часть — с сеткой фишек, и каждая строка была своя вёрстка.
/// Теперь один компонент: подпись — название языка (а не код «EN»), у каждого пункта
/// ключ `<prefix>-<код>` — его находят пробы и в закрытом списке, и в открытом.
class LangDropdown extends StatelessWidget {
  const LangDropdown({
    required Key key,
    required this.keyPrefix,
    required this.langs,
    required this.value,
    required this.label,
    required this.onChanged,
  }) : super(key: key);

  final String keyPrefix;
  final List<String> langs;
  final String? value;
  final String Function(String code) label;
  final ValueChanged<String> onChanged;

  @override
  Widget build(BuildContext context) => DropdownButtonFormField<String>(
    initialValue: langs.contains(value) ? value : null,
    isExpanded: true,
    decoration: const InputDecoration(border: OutlineInputBorder(), isDense: true),
    items: [for (final l in langs) DropdownMenuItem(key: Key('$keyPrefix-$l'), value: l, child: Text(label(l)))],
    onChanged: (v) {
      if (v != null) onChanged(v);
    },
  );
}
