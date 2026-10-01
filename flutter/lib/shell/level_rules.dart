import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import 'l10n.dart';
import 'shared_state.dart';

/// ПРАВИЛО УРОВНЯ — НОВАЯ МЕХАНИКА ОБЪЯВЛЯЕТСЯ ДО ПАРТИИ, А НЕ ВКЛЮЧАЕТСЯ МОЛЧА.
///
/// 🔴 ПОВОД (задача e371fd3a, 30.09.2026). В веб-версии с уровнем приходит карточка
/// «что за правило» (`LevelRules.tsx`): обратный порядок у Корси, лимит ходов у сосудов,
/// новые операторы у счёта. Родилась она из жалобы Вали — анти-конь в судоку включался
/// молча. Во Flutter этого не было вовсе: у 16 перенесённых игр 56 механик приходили без
/// единого слова.
///
/// ⚠️ ЧТО ЗА ПРАВИЛО НА УРОВНЕ — РЕШАЕТ ТАБЛИЦА, А НЕ DART. `assets/level_rules.json`
/// считает живой TS (`frontend/src/games/level-rules/tools/export-level-rules.gen.ts`):
/// у «Сортировки товаров» правило действует по предикату, а не отрезком, и вторая копия
/// этой логики здесь разошлась бы с веб-версией молча. Свежесть таблицы сторожит проба
/// `level-rules-native-export-fresh.test.ts`.
///
/// «Уже видел» — тот же ключ, что у веба (`psygames_rulehint_<игра>_<правило>`), и он
/// ходит между половинами через [SharedState]: показанное в одной не всплывёт в другой.
class LevelRules {
  LevelRules._();

  static Map<String, List<List<Object?>>>? _table;

  /// Таблицу читаем один раз; повторный вызов ничего не делает.
  static Future<void> load({AssetBundle? bundle}) async {
    if (_table != null) return;
    try {
      final raw = await (bundle ?? rootBundle).loadString('assets/level_rules.json');
      final games = (jsonDecode(raw) as Map<String, dynamic>)['games'] as Map<String, dynamic>;
      _table = games.map((id, ranges) =>
          MapEntry(id, [for (final r in ranges as List) (r as List).cast<Object?>()]));
    } catch (_) {
      _table = const {};   // нет таблицы — правил нет, игра от этого не падает
    }
  }

  static bool get loaded => _table != null;

  @visibleForTesting
  static void debugSetTable(Map<String, List<List<Object?>>>? table) => _table = table;

  /// Ключ правила, действующего на уровне игры, или null — правила нет.
  static String? activeKey(String gameId, int level) {
    final ranges = _table?[gameId];
    if (ranges == null) return null;
    for (final r in ranges) {
      final from = r[0] as int;
      final to = r[1] as int?;
      if (level >= from && (to == null || level <= to)) return r[2] as String?;
    }
    return null;
  }

  static String textKey(String gameId, String ruleKey, String field) => 'lr_${gameId}_${ruleKey}_$field';

  /// Правило без заголовка или текста не показываем: окно «⚡ / Понятно» без единой строки
  /// веб уже ловил (переливалка, 16.09.2026) — это хуже, чем ничего.
  static bool hasText(String gameId, String ruleKey) =>
      L.has(textKey(gameId, ruleKey, 'title')) && L.has(textKey(gameId, ruleKey, 'rule'));

  static String seenKey(String gameId, String ruleKey) => 'psygames_rulehint_${gameId}_$ruleKey';
}

/// Где сейчас игра: какая игра, какой уровень и можно ли показать карточку.
class LevelRuleSpot {
  const LevelRuleSpot({required this.gameId, required this.level, required this.state, required this.calm});

  final String gameId;
  final int level;
  final SharedState state;

  /*
   * 🔴 КАРТОЧКА НЕ ЛОЖИТСЯ ПОВЕРХ ИДУЩЕЙ ПАРТИИ.
   *
   * Веб на этом обжёгся (разбор «Объёма памяти», задача 1db3d4eb): сетка матрицы уже
   * горела, а поверх неё вылезло объяснение правил — человек терял то, что держал в
   * рабочей памяти. Поэтому экран сам говорит, спокойный ли сейчас момент: настройка,
   * «Начать», итог партии — да; показ стимула и ответ — нет.
   */
  final bool calm;
}

/// Открыть карточку правила. Флаг «видел» здесь не трогается — это делает наблюдатель.
Future<void> showLevelRule(BuildContext context, String gameId, String ruleKey) {
  final example = LevelRules.textKey(gameId, ruleKey, 'example');
  return showDialog<void>(
    context: context,
    builder: (ctx) {
      final scheme = Theme.of(ctx).colorScheme;
      return AlertDialog(
        key: const Key('level-rule-card'),
        icon: const Icon(Icons.new_releases_outlined),
        title: Text(L.t(LevelRules.textKey(gameId, ruleKey, 'title'))),
        content: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(L.t(LevelRules.textKey(gameId, ruleKey, 'rule'))),
              if (L.has(example)) ...[
                const SizedBox(height: 12),
                Container(
                  width: double.infinity,
                  padding: const EdgeInsets.all(10),
                  decoration: BoxDecoration(
                    color: scheme.surfaceContainerHighest,
                    borderRadius: BorderRadius.circular(10),
                  ),
                  child: Text(L.t(example), style: TextStyle(color: scheme.onSurfaceVariant)),
                ),
              ],
            ],
          ),
        ),
        actions: [
          FilledButton(
            key: const Key('level-rule-ok'),
            onPressed: () => Navigator.of(ctx).pop(),
            child: Text(L.t('ctaGotIt')),
          ),
        ],
      );
    },
  );
}

/// Показывает карточку сам — один раз на правило, и только в спокойный момент.
class LevelRuleWatcher extends StatefulWidget {
  const LevelRuleWatcher({super.key, required this.spot, required this.child});

  final LevelRuleSpot spot;
  final Widget child;

  @override
  State<LevelRuleWatcher> createState() => _LevelRuleWatcherState();
}

class _LevelRuleWatcherState extends State<LevelRuleWatcher> {
  bool _showing = false;

  @override
  void initState() {
    super.initState();
    _check();
  }

  @override
  void didUpdateWidget(LevelRuleWatcher old) {
    super.didUpdateWidget(old);
    final a = old.spot, b = widget.spot;
    if (a.gameId != b.gameId || a.level != b.level || a.calm != b.calm) _check();
  }

  Future<void> _check() async {
    await LevelRules.load();
    if (!mounted || _showing) return;
    // Условия читаются заново ПОСЛЕ загрузки: пока таблица грузилась, человек мог нажать
    // «Начать» — ровно та щель, через которую веб клал карточку поверх горящей сетки.
    final s = widget.spot;
    if (!s.calm) return;
    final key = LevelRules.activeKey(s.gameId, s.level);
    if (key == null || !LevelRules.hasText(s.gameId, key)) return;
    if (s.state.get(LevelRules.seenKey(s.gameId, key)) != null) return;
    _showing = true;
    WidgetsBinding.instance.addPostFrameCallback((_) async {
      final now = widget.spot;
      if (!mounted || !now.calm || LevelRules.activeKey(now.gameId, now.level) != key) {
        _showing = false;
        return;
      }
      // Флаг — только когда карточка действительно показана, иначе человек её не увидит никогда.
      await now.state.set(LevelRules.seenKey(now.gameId, key), '1');
      if (!mounted) return;
      await showLevelRule(context, now.gameId, key);
      _showing = false;
    });
    // Кадр заказываем сами: когда партия кончилась, экран бывает уже неподвижен, и без
    // этого отложенный показ ждал бы следующей перерисовки — то есть не случался вовсе
    // (поймано пробой level_rules_test «открывается, когда партия кончилась»).
    WidgetsBinding.instance.ensureVisualUpdate();
  }

  @override
  Widget build(BuildContext context) => widget.child;
}
