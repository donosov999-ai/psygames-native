library;

import 'package:flutter/material.dart';

import 'dart:convert';

import 'package:flutter/services.dart' show rootBundle;

import 'l10n.dart';

/// СПРАВКА ПО ПРАВИЛУ — ОДНА НА ВСЕ ИГРЫ.
///
/// 🔴 ПОВОД, 24.09.2026. Нативный экран головоломок не показывал правил ВООБЩЕ:
/// доска и всё. У сорока двух игр коллекции правила разные, и половина из них с
/// доски не угадывается. Отчёт тестировщика по «Рельсам»: человек полтора часа
/// искал, «как повернуть кусок», — а поворота в этой игре нет вовсе, форму задаёт
/// путь протяжки. Текст правила при этом в словаре ЛЕЖАЛ, показать его было нечем.
///
/// ⚠️ Показываем ровно текст из словаря и ничего не дописываем от себя: правило
/// пишет владелец игры, выверяя его на людях, а справка — только окно.
Future<void> showGameRules(
  BuildContext context, {
  required String title,
  required String ruleKey,
}) {
  return showDialog<void>(
    context: context,
    builder: (ctx) => AlertDialog(
      key: const Key('game-rules'),
      title: Text(title),
      content: SingleChildScrollView(
        child: Text(
          L.t(ruleKey),
          key: const Key('game-rules-text'),
          style: const TextStyle(fontSize: 16, height: 1.35),
        ),
      ),
      actions: [
        FilledButton(
          key: const Key('game-rules-close'),
          onPressed: () => Navigator.of(ctx).pop(),
          child: Text(L.t('close')),
        ),
      ],
    ),
  );
}

/// 🔴 ПРАВИЛО ДЛЯ ЛЮБОЙ ИГРЫ ПО ЕЁ АДРЕСУ — ОДИН РАЗ НА ВСЕ ЭКРАНЫ.
///
/// Заводить кнопку справки в каждый из полусотни перенесённых экранов значило бы
/// полсотни мест её забыть — так уже вышло с выходом из игры (`onBack` передавал
/// ОДИН экран из тридцати восьми). Поэтому каркас спрашивает правило сам, по
/// адресу открытой игры, а экран об этом ничего не знает.
///
/// Ключ берётся из того же реестра развилок, что и карточки: у каждой карточки
/// есть `descKey` — то самое описание, которое человек читает в каталоге. Второго
/// источника правил не заводим: разошлись бы молча.
class GameRules {
  GameRules._();

  static Map<String, String> _byRoute = const {};

  /// Адрес игры, открытой поверх страницы; ставит оболочка. Пусто — игра открыта
  /// не через перехват (настольная проба), и правило искать не по чему.
  static String? currentRoute;

  /// Прочитать реестр один раз на запуск.
  static Future<void> load() async {
    if (_byRoute.isNotEmpty) return;
    try {
      final j = jsonDecode(await rootBundle.loadString('assets/hubs.json'))
          as Map<String, dynamic>;
      final out = <String, String>{};
      for (final list in (j['hubs'] as Map<String, dynamic>).values) {
        for (final c in list as List) {
          final m = c as Map<String, dynamic>;
          final route = m['route'] as String?;
          final key = m['descKey'] as String?;
          if (route != null && key != null && key.isNotEmpty) out[route] = key;
        }
      }
      for (final c in (j['extra'] as Map<String, dynamic>? ?? {}).values) {
        final m = c as Map<String, dynamic>;
        final route = m['route'] as String?;
        final key = m['descKey'] as String?;
        if (route != null && key != null && key.isNotEmpty) out[route] = key;
      }
      _byRoute = out;
    } catch (_) {
      // Реестр не прочитался — справки не будет, но игра откроется.
    }
  }

  /// Ключ правила для адреса; null — правила нет, и кнопку рисовать не надо.
  ///
  /// ⚠️ Сперва ищем адрес ЦЕЛИКОМ, с хвостом: за `/games/puzzles?mode=Bridges`
  /// стоит своя игра со своим правилом, и общее правило головоломок тут соврало бы.
  static String? keyFor(String? route) {
    if (route == null) return null;
    final direct = _byRoute[route] ?? _byRoute[route.split('?').first];
    if (direct != null) return direct;
    /*
     * ⚠️ ИГРА МОЖЕТ НЕ ЛЕЖАТЬ КАРТОЧКОЙ НИ В ОДНОЙ РАЗВИЛКЕ, а правило у неё
     * есть. Замер 24.09.2026: таких двенадцать (варианты лаборатории, «Саймон»,
     * ANT, IGT, BART и другие), и у десяти правило в словаре БЫЛО — просто
     * спросить его было не по чему. Выводим ключ по имени адреса:
     * `/games/go-no-go` → `goNoGoDesc`. Тем же правилом их собирает и словарь.
     */
    final name = route.split('?').first.split('/').last;
    final parts = name.split('-');
    final camel = parts.first +
        parts.skip(1).map((p) => p.isEmpty ? p : p[0].toUpperCase() + p.substring(1)).join();
    final byName = '${camel}Desc';
    return L.has(byName) ? byName : null;
  }
}
