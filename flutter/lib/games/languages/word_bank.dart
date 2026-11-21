import 'dart:math';

import 'json_asset.dart';

typedef WordBankEntry = Map<String, String>;

const wordBankLanguages = {
  'en',
  'ru',
  'es',
  'pt',
  'de',
  'zh',
  'hi',
  'fr',
  'it',
  'ja',
  'ko',
  'ar',
};

/// Several games can consume one bank without coupling their state or rules.
/// The common asset remains intact for exercises that still use its exact order
/// or depend on semantic categories. The extension is deliberately opt-in.
class WordBank {
  WordBank({
    required List<WordBankEntry> core,
    List<WordBankEntry> extension = const [],
  }) : core = List.unmodifiable(core),
       extension = _completeExtension(core, extension);

  final List<WordBankEntry> core;
  final List<WordBankEntry> extension;

  static List<WordBankEntry> _completeExtension(
    List<WordBankEntry> core,
    List<WordBankEntry> extension,
  ) {
    String identity(String text) =>
        text.trim().toLowerCase().replaceFirst(RegExp(r'^to\s+'), '');
    final ids = {for (final row in core) identity(row['en'] ?? '')};
    return List.unmodifiable([
      for (final row in extension)
        if (wordBankLanguages.every(
              (lang) => (row[lang] ?? '').trim().isNotEmpty,
            ) &&
            ids.add(identity(row['en']!)))
          Map<String, String>.unmodifiable(row),
    ]);
  }

  /// Request the actual languages on the card, not a fallback language. A
  /// bilingual call includes the base language and both target languages.
  List<WordBankEntry> forLanguages(
    Set<String> languages, {
    bool interleave = false,
  }) {
    bool covers(WordBankEntry row) =>
        languages.every((lang) => (row[lang] ?? '').trim().isNotEmpty);
    final original = core.where(covers).toList();
    final added = extension.where(covers).toList();
    if (!interleave) return [...original, ...added];
    // Asset order is alphabetical for editing, not a learning order. Keep a
    // stable mix of new words across languages/reopens and preserve card IDs.
    added.shuffle(Random(0x505359));
    final groups = <String, List<WordBankEntry>>{};
    for (final row in added) {
      final initial = row['en']!.trim()[0].toLowerCase();
      (groups[initial] ??= []).add(row);
    }
    // Older packs contain mostly A–C. Give each initial a turn before using
    // the next word from a large letter bucket.
    final rounds = groups.values.fold(0, (n, bucket) => max(n, bucket.length));
    final mixed = [
      for (var i = 0; i < rounds; i++)
        for (final bucket in groups.values)
          if (i < bucket.length) bucket[i],
    ];
    return _interleave(original, mixed);
  }
}

List<WordBankEntry> _interleave(
  List<WordBankEntry> first,
  List<WordBankEntry> second,
) => [
  for (var i = 0; i < first.length || i < second.length; i++) ...[
    if (i < first.length) first[i],
    if (i < second.length) second[i],
  ],
];

Future<WordBank> loadWordBank() async {
  Future<List<WordBankEntry>> read(String path) async => [
    for (final row in await loadJsonAsset(path) as List)
      Map<String, String>.from(row as Map),
  ];
  return WordBank(
    core: await read('assets/vocab/translation-vocab.json'),
    extension: [
      ..._interleave(
        await read('assets/vocab/word-bank-expansion.json'),
        await read('assets/vocab/word-bank-shestov-reviewed.json'),
      ),
      ...await read('assets/vocab/word-bank-cldr.json'),
      ...await read('assets/vocab/word-bank-modern.json'),
    ],
  );
}
