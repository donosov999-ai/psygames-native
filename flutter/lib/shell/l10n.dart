import 'dart:convert';

import 'package:flutter/services.dart';

/// ЯЗЫК НАТИВНЫХ ЭКРАНОВ — ИЗ ОБЩЕГО СЛОВАРЯ, А НЕ ИЗ ЗАШИТЫХ СТРОК.
///
/// 🔴 ЧТО ЭТО ЧИНИТ. Веб-сторона говорит на двенадцати языках и держит это двумя
/// гейтами: `i18n-coverage` довёл десять локалей до нуля пропусков, а
/// `ci-i18n-hardcode-guard` в августе погасил долг из 14 экранов и 106 мест и с
/// тех пор требует ноль зашитых строк. Перенос на Flutter начал ровно с того, с
/// чего веб когда-то начинал: замер 23.09.2026 по `flutter/lib` нашёл 789 видимых
/// русских строк, зашитых прямо в экраны, на пяти ветках. Немец, открыв
/// перенесённую игру, увидит русский — и не поймёт, почему.
///
/// 🔴 СЛОВАРЬ ОДИН НА ДВА СТЕКА. Здесь не заводится второй источник правды:
/// `flutter/tools/embed-l10n.mjs` вырезает из веб-словаря ровно те ключи, которые
/// зовут отсюда, и раскладывает их в `assets/l10n/<язык>.json`. Ключа нет в
/// веб-словаре — скрипт краснеет и требует завести строку ТАМ, а не тут.
/// Поэтому перевод, сделанный для веба, приходит в нативный экран сам.
class L {
  L._();

  static const locales = ['ru', 'en', 'es', 'de', 'zh', 'hi', 'pt', 'fr', 'it', 'ja', 'ko', 'ar'];

  static Map<String, String> _dict = const {};
  static String _locale = 'ru';

  static String get locale => _locale;

  /// Язык, который приложение реально поддерживает. Незнакомый — английский:
  /// так же поступает веб-сторона, и расхождения между половинами не возникает.
  static String resolve(String? code) {
    if (code == null) return 'en';
    final short = code.split(RegExp('[-_]')).first.toLowerCase();
    return locales.contains(short) ? short : 'en';
  }

  /// Загрузить словарь языка. Зовётся один раз при старте оболочки и ещё раз,
  /// когда веб-половина сменила язык (мост привозит ключ `language`).
  static Future<void> load(String? code, {AssetBundle? bundle}) async {
    final loc = resolve(code);
    final b = bundle ?? rootBundle;
    try {
      /*
       * 🔴 БАЙТЫ, А НЕ `loadString`. `loadString` расшифровывает файл больше
       * 50 × 1024 байт в отдельном изоляте (`compute`), а внутри `testWidgets`
       * изолят не завершается никогда: проба, грузящая словарь в теле, висит
       * 10 минут и падает по таймауту. Замер 30.09.2026: `ru.json` на main —
       * 50 619 байт, в 581 байте от порога, `hi.json` — 61 019, уже за ним;
       * шапка развилок (+36 ключей) дала `ru.json` 55 368 — и `goods_set_picker`
       * повис на 10 минут, хотя на main проходил за секунду. Расшифровка
       * 60 КБ здесь — единицы миллисекунд один раз на запуск, изолят не нужен.
       */
      final data = await b.load('assets/l10n/$loc.json');
      final raw = utf8.decode(Uint8List.sublistView(data));
      _dict = (jsonDecode(raw) as Map<String, dynamic>).cast<String, String>();
      _locale = loc;
    } catch (_) {
      // ⚠️ Молчать нельзя, но и падать из-за словаря — тоже: игра важнее подписи.
      // Пустой словарь означает «показываем ключи», и это видно сразу, в отличие
      // от тихого отката на русский, который выглядит как нормальная работа.
      _dict = const {};
      _locale = loc;
    }
  }

  /// Строка по ключу. Нет ключа — возвращается сам ключ: на экране видно
  /// `digitSpanTitle` вместо подписи, и пропуск чинится в тот же день.
  static String t(String key) => _dict[key] ?? key;

  /// Есть ли такой ключ в словаре.
  ///
  /// ⚠️ Нужен там, где ключ ВЫВОДИТСЯ правилом, а не написан в коде: `t` при
  /// промахе возвращает САМ ключ, и проверить существование им нельзя — на экране
  /// оказалось бы `goNoGoDesc` вместо правила.
  static bool has(String key) => _dict.containsKey(key);

  /// Подстановка: `L.f('levelOf', {'n': '7'})` для строк с `{n}`.
  static String f(String key, Map<String, String> args) {
    var s = t(key);
    args.forEach((k, v) => s = s.replaceAll('{$k}', v));
    return s;
  }

  /// Только для проб: задать словарь без обращения к ассетам.
  static void useForTest(String locale, Map<String, String> dict) {
    _locale = locale;
    _dict = dict;
  }
}
