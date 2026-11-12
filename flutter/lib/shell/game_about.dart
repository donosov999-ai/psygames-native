// «ОБ ИГРЕ» — ОДИН БЛОК КАРКАСА ДЛЯ ВСЕХ ИГР (задача 3a365b5d, аудит потерь 05.11.2026).
//
// У веба `GameAbout` подключала каждая игра сама — 57 экранов (`frontend/src/components/GameAbout.tsx`):
// свёрнутая строка, по нажатию — подробное описание и «что развивает игра» (до трёх пунктов). При
// переезде на Flutter блок не перенесла ни одна игра. По канону «элемент большинства игр — один
// компонент каркаса» (стандарт дизайна каркаса, правило Дениса 11.11.2026) он живёт здесь, а игре
// остаются только данные: таблица `assets/game_about.json` (выгружает `tools/export-game-about.mjs`
// из веб-экранов), игра узнаётся по лестнице (`LevelLadder.current.gameId`).
//
// Где показан: свёрнутой строкой в паузе каркаса, под «Правилами» — пауза открывается и до старта,
// и во время партии, у всех игр одинаково, без правок в 90 экранах. Свёрнут по умолчанию: кто пришёл
// играть двадцатый раз, не платит за чтение; кто впервые — раскроет.
library;

import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart' show rootBundle;

import 'aurora_glass.dart';
import 'game_colors.dart';
import 'ion_icon.dart';
import 'l10n.dart';

/// Польза упражнения строкой: ключ словаря и значок — Ionicons веба ([ion]) или свой ([icon]).
class GameBenefit {
  const GameBenefit(this.key, {this.ion, this.icon});

  final String key;
  final String? ion;
  final IconData? icon;
}

/// Описание игры и её польза.
class GameAboutData {
  const GameAboutData(this.description, this.benefits);

  final String description;
  final List<GameBenefit> benefits;

  static const asset = 'assets/game_about.json';
  static Map<String, GameAboutData>? _table;
  static Future<void>? _loading;

  /// Данные игры; `null` — у игры нет блока или таблица ещё не загружена ([ensureLoaded]).
  static GameAboutData? of(String? gameId) => gameId == null ? null : _table?[gameId];

  static bool get loaded => _table != null;

  /// Загрузить таблицу один раз. Ошибка чтения — блока просто нет (игра от него не зависит).
  static Future<void> ensureLoaded() => _loading ??= () async {
    try {
      _table = parse(await rootBundle.loadString(asset));
    } on Object {
      _table = const {};
    }
  }();

  static Map<String, GameAboutData> parse(String raw) {
    final games = (jsonDecode(raw) as Map)['games'] as Map;
    return {
      for (final MapEntry(:key, :value) in games.entries)
        '$key': GameAboutData('${(value as Map)['description']}', [
          for (final b in (value['benefits'] as List).cast<Map>()) GameBenefit('${b['key']}', ion: '${b['icon']}'),
        ]),
    };
  }

  /// Для проб: подставить таблицу без загрузки ассета.
  @visibleForTesting
  static void debugSet(Map<String, GameAboutData>? table) {
    _table = table;
    _loading = table == null ? null : Future.value();
  }
}

/// Свёрнутая строка «Об игре»: по нажатию — описание и польза.
///
/// [aurora] — тёмная/светлая тема «Авроры» (вид панели «Правил» в её паузе); `null` — классика.
/// [keyPrefix] — приставка ключей для проб (`<приставка>-toggle`, `-body`, `-<ключ пользы>`).
class GameAbout extends StatefulWidget {
  const GameAbout({
    super.key,
    required this.descriptionKey,
    required this.benefits,
    this.aurora,
    this.keyPrefix = 'game-about',
  });

  GameAbout.of(GameAboutData data, {Key? key, bool? aurora, String keyPrefix = 'game-about'})
    : this(key: key, descriptionKey: data.description, benefits: data.benefits, aurora: aurora, keyPrefix: keyPrefix);

  final String descriptionKey;
  final List<GameBenefit> benefits;
  final bool? aurora;
  final String keyPrefix;

  @override
  State<GameAbout> createState() => _GameAboutState();
}

class _GameAboutState extends State<GameAbout> {
  bool _open = false;

  Widget _icon(GameBenefit b, double size, Color color) =>
      b.ion != null ? IonIcon(b.ion, size: size, color: color) : Icon(b.icon ?? Icons.check, size: size, color: color);

  @override
  Widget build(BuildContext context) {
    final dark = widget.aurora;
    final theme = Theme.of(context);
    final scheme = theme.colorScheme;
    final p = dark == null ? null : ChromePalette.of(dark);
    final accent = p == null ? GameColors.of(context).selected : (dark! ? p.gold : p.text);
    final text = p?.text ?? theme.textTheme.bodyMedium?.color;
    final secondary = p?.textSecondary ?? scheme.onSurfaceVariant;
    final radius = p == null ? 14.0 : 18.0;
    final k = widget.keyPrefix;

    final head = Row(
      children: [
        if (p == null)
          Icon(Icons.info_outline, size: 20, color: accent)
        else
          Container(
            width: 42,
            height: 42,
            decoration: BoxDecoration(
              color: p.gold.withValues(alpha: dark! ? 0.2 : 0.35),
              borderRadius: BorderRadius.circular(11),
              border: Border.all(color: p.gold, width: 1.5),
            ),
            child: Icon(Icons.info_outline_rounded, color: accent, size: 26),
          ),
        SizedBox(width: p == null ? 8 : 14),
        Expanded(
          child: Text(
            L.t('title_about_game'),
            style: p == null
                ? theme.textTheme.titleSmall
                : TextStyle(fontSize: 19, fontWeight: FontWeight.w800, color: p.text),
          ),
        ),
        Icon(
          _open ? Icons.expand_less_rounded : Icons.expand_more_rounded,
          size: p == null ? 24 : 30,
          color: p?.text ?? scheme.onSurfaceVariant,
        ),
      ],
    );

    return Container(
      key: Key(k),
      decoration: p == null
          ? BoxDecoration(
              color: scheme.surfaceContainerLow,
              borderRadius: BorderRadius.circular(radius),
              border: Border.all(color: scheme.outlineVariant),
            )
          : AuroraGlass.panel(dark!, radius: radius),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Semantics(
            button: true,
            expanded: _open,
            child: Material(
              type: MaterialType.transparency,
              child: InkWell(
                key: Key('$k-toggle'),
                borderRadius: BorderRadius.circular(radius),
                onTap: () => setState(() => _open = !_open),
                child: ConstrainedBox(
                  constraints: BoxConstraints(minHeight: p == null ? 48 : 66),
                  child: Padding(
                    padding: EdgeInsets.symmetric(horizontal: 12, vertical: p == null ? 0 : 12),
                    child: head,
                  ),
                ),
              ),
            ),
          ),
          if (_open)
            Padding(
              key: Key('$k-body'),
              padding: const EdgeInsets.fromLTRB(12, 0, 12, 12),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Text(
                    L.t(widget.descriptionKey),
                    style: TextStyle(fontSize: p == null ? 14 : 15.5, height: 1.4, color: secondary),
                  ),
                  for (final b in widget.benefits)
                    Padding(
                      padding: const EdgeInsets.only(top: 8),
                      child: Row(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          _icon(b, 18, accent),
                          const SizedBox(width: 8),
                          Expanded(
                            child: Text(
                              L.t(b.key),
                              key: Key('$k-${b.key}'),
                              style: TextStyle(fontSize: p == null ? 14 : 15.5, height: 1.35, color: text),
                            ),
                          ),
                        ],
                      ),
                    ),
                ],
              ),
            ),
        ],
      ),
    );
  }
}
