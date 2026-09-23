import 'dart:convert';

import 'package:shared_preferences/shared_preferences.dart';

/// ОБЩАЯ ПАМЯТЬ ПО ОБЕ СТОРОНЫ ГРАНИЦЫ — сердце гибридной оболочки.
///
/// Пока перенесены не все экраны, приложение живёт двумя половинами: перенесённые
/// игры рисует Flutter, остальные открывает WebView с нынешней сборкой. Человеку
/// граница видна быть не должна: уровень, добытый в WebView, обязан лежать на
/// экране Flutter и наоборот.
///
/// 🔴 ЗЕРКАЛИТСЯ ПРОСТРАНСТВО ИМЁН, А НЕ СПИСОК КЛЮЧЕЙ. Замер по нынешнему коду
/// (frontend/src/hooks/usePersistentLevel.ts:64 и контексты) показал, что ВСЁ
/// состояние веб-стороны лежит под одним префиксом `psygames_`:
///   · `psygames_<играId>_level_<профиль>`      — уровень игры у профиля
///   · `psygames_<играId>_failstreak_<профиль>` — подряд провалов
///   · `psygames_active_profile`                — текущий профиль
///   · `psygames_theme_override`, `psygames_colorblind`, `psygames_first_run_done`,
///     `psygames_unlocked_themed`               — вид и первый запуск
/// Список ключей меняется каждую неделю, префикс — нет. Поэтому мост возит
/// пространство целиком: новая игра появится по обе стороны сама, без правки моста.
class SharedState {
  SharedState(this._prefs);

  static const prefix = 'psygames_';

  /// Имя канала, которым веб-сторона отвечает в Dart.
  static const channel = 'PsyBridge';

  final SharedPreferences _prefs;

  static Future<SharedState> open() async => SharedState(await SharedPreferences.getInstance());

  /// Всё, что относится к приложению. Чужие ключи (настройки самого Flutter) не трогаем.
  Map<String, String> snapshot() {
    final out = <String, String>{};
    for (final k in _prefs.getKeys()) {
      if (!k.startsWith(prefix)) continue;
      final v = _prefs.getString(k);
      if (v != null) out[k] = v;
    }
    return out;
  }

  String? get(String key) => _prefs.getString(key);

  /// Текущий профиль — тот, что выбран в приложении, а не придуманный нами.
  ///
  /// 🔴 ПОЙМАНО ЖИВЬЁМ 23.09.2026. Оболочку запустили, веб-часть прислала шесть
  /// ключей, и среди них `psygames_active_profile` = «free» — а нативная половина
  /// была зашита на «nzt48». Прогресс разъехался бы по профилю ТИХО: обе половины
  /// работают, обе пишут уровни, просто в разные ключи. Поэтому профиль всегда
  /// спрашивается у общей памяти и никогда не задаётся числом в коде.
  String get activeProfile => _prefs.getString('${prefix}active_profile') ?? 'nzt48';


  Future<void> set(String key, String value) async {
    if (!key.startsWith(prefix)) return;
    await _prefs.setString(key, value);
  }

  Future<void> remove(String key) async {
    if (!key.startsWith(prefix)) return;
    await _prefs.remove(key);
  }

  /// Ключ уровня ровно в том виде, в каком его пишет нынешняя веб-сборка.
  /// Совпадение с `usePersistentLevel.ts` — не украшение: разойдутся имена —
  /// разойдётся и прогресс, причём молча.
  static String levelKey(String gameId, String profile) => '$prefix${gameId}_level_$profile';
  static String failKey(String gameId, String profile) => '$prefix${gameId}_failstreak_$profile';

  /// Сообщение ОТ веб-стороны: `{"op":"set","key":"…","value":"…"}` или `{"op":"remove","key":"…"}`.
  ///
  /// Возвращает false, если сообщение не разобрано или ключ чужой, — экран по
  /// этому признаку жалуется, а не делает вид, что записал.
  Future<bool> applyFromWeb(String message) async {
    Map<String, dynamic> m;
    try {
      m = jsonDecode(message) as Map<String, dynamic>;
    } catch (_) {
      return false;
    }
    final key = m['key'];
    if (key is! String || !key.startsWith(prefix)) return false;
    switch (m['op']) {
      case 'set':
        final v = m['value'];
        if (v is! String) return false;
        await set(key, v);
        return true;
      case 'remove':
        await remove(key);
        return true;
      default:
        return false;
    }
  }

  /// Скрипт, который вливается в страницу ДО её кода.
  ///
  /// Делает две вещи: (1) кладёт снимок нашего пространства в localStorage, чтобы
  /// веб-сторона стартовала с уже верным прогрессом; (2) подменяет `setItem` и
  /// `removeItem`, чтобы каждая запись веб-стороны доезжала обратно в Dart.
  /// ⚠️ Подмена — не хитрость, а единственный способ: событие `storage` в своей же
  /// вкладке не срабатывает, и запись страницы осталась бы незамеченной.
  String bootstrapJs() {
    final data = jsonEncode(snapshot());
    return '''
(function () {
  var snap = $data;
  try {
    for (var k in snap) { if (Object.prototype.hasOwnProperty.call(snap, k)) window.localStorage.setItem(k, snap[k]); }
  } catch (e) {}
  if (window.__psyBridgeReady) return;
  window.__psyBridgeReady = true;
  var P = '$prefix';
  var send = function (msg) {
    try { if (window.$channel && window.$channel.postMessage) window.$channel.postMessage(JSON.stringify(msg)); } catch (e) {}
  };
  var proto = window.Storage.prototype;
  var setItem = proto.setItem, removeItem = proto.removeItem;
  proto.setItem = function (k, v) {
    setItem.call(this, k, v);
    if (this === window.localStorage && String(k).indexOf(P) === 0) send({ op: 'set', key: String(k), value: String(v) });
  };
  proto.removeItem = function (k) {
    removeItem.call(this, k);
    if (this === window.localStorage && String(k).indexOf(P) === 0) send({ op: 'remove', key: String(k) });
  };
})();
''';
  }
}
