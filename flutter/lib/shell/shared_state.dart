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
///
/// ⚠️ 🔴 И ОДНО ИСКЛЮЧЕНИЕ, НАЙДЕННОЕ ЗАМЕРОМ 23.09.2026. Утверждение выше —
/// «ВСЁ состояние лежит под префиксом» — оказалось неверным. Сплошной проход по
/// `frontend/src` и `frontend/app` (все `getItem`/`setItem`/`removeItem`, 53
/// константы-ключа + литералы) нашёл РОВНО ОДИН ключ мимо префикса: `language`,
/// который пишет `src/contexts/LanguageContext.tsx:4137`. Это язык интерфейса —
/// двенадцать языков приложения. Без него нативная половина не знает, на каком
/// языке говорить, и молчание тут не безобидно: экран просто останется русским.
/// Поэтому рядом с префиксом живёт ЯВНЫЙ список исключений [extraKeys], а гейт
/// `bridge_carries_every_web_key_test.dart` сверяет его с живым исходником веба:
/// появится второй голый ключ — проба покраснеет и назовёт его.
class SharedState {
  SharedState(this._prefs);

  static const prefix = 'psygames_';

  /// Ключи веб-стороны МИМО префикса. Список закрытый и сверяется гейтом.
  ///
  /// `language` — язык интерфейса (`LanguageContext.tsx`). Единственный на
  /// 23.09.2026; если станет два, гейт назовёт второй раньше, чем он потеряется.
  static const extraKeys = {'language'};

  /// Ключ принадлежит приложению — префикс ИЛИ явное исключение.
  static bool owns(String key) => key.startsWith(prefix) || extraKeys.contains(key);

  /// Имя канала, которым веб-сторона отвечает в Dart.
  static const channel = 'PsyBridge';

  final SharedPreferences _prefs;

  static Future<SharedState> open() async => SharedState(await SharedPreferences.getInstance());

  /// Всё, что относится к приложению. Чужие ключи (настройки самого Flutter) не трогаем.
  Map<String, String> snapshot() {
    final out = <String, String>{};
    for (final k in _prefs.getKeys()) {
      if (!owns(k)) continue;
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

  /// Язык интерфейса — тот, что выбран в приложении.
  ///
  /// 🔴 ЗАЧЕМ ЭТО ВООБЩЕ НУЖНО. В приложении двенадцать языков и два гейта,
  /// которые довели веб-сторону до нуля зашитых строк (`ci-i18n-hardcode-guard`,
  /// `i18n-coverage`). Перенесённые экраны начали заново с зашитого русского:
  /// замер 23.09.2026 по `flutter/lib` — 789 видимых русских строк на пяти
  /// ветках. Пока мост не возил `language`, у нативной половины не было даже
  /// возможности спросить язык. Теперь есть; сами строки — отдельная работа.
  String get language => _prefs.getString('language') ?? 'ru';


  Future<void> set(String key, String value) async {
    if (!owns(key)) return;
    await _prefs.setString(key, value);
  }

  Future<void> remove(String key) async {
    if (!owns(key)) return;
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
    // Сообщение о смене маршрута ключей не несёт — его разбирает оболочка.
    if (m['op'] == 'route') return false;
    final key = m['key'];
    if (key is! String || !owns(key)) return false;
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
    // Исключения мимо префикса уезжают в страницу списком, а не переписыванием
    // условия: добавится ключ в [extraKeys] — скрипт подхватит его сам.
    final extras = jsonEncode(extraKeys.toList());
    return '''
(function () {
  var snap = $data;
  try {
    for (var k in snap) { if (Object.prototype.hasOwnProperty.call(snap, k)) window.localStorage.setItem(k, snap[k]); }
  } catch (e) {}
  if (window.__psyBridgeReady) return;
  window.__psyBridgeReady = true;
  var P = '$prefix';
  var EXTRA = $extras;
  var mine = function (k) { k = String(k); return k.indexOf(P) === 0 || EXTRA.indexOf(k) >= 0; };
  var send = function (msg) {
    try { if (window.$channel && window.$channel.postMessage) window.$channel.postMessage(JSON.stringify(msg)); } catch (e) {}
  };
  // 🔴 СМЕНА МАРШРУТА — ТАКАЯ ЖЕ ПОДМЕНА, КАК И ЗАПИСЬ В ХРАНИЛИЩЕ, И ПО ТОЙ ЖЕ ПРИЧИНЕ.
  //
  // Оболочка ловила переходы через `onNavigationRequest`, а он срабатывает только
  // на НАСТОЯЩУЮ загрузку документа. Приложение же ходит по экранам через History
  // API (expo-router зовёт `pushState`), и WebView о таком переходе не сообщает
  // вовсе. Замер раздела «Зарядки» 23.09.2026 на симуляторе iPhone 17 Pro: и
  // `spatial-span` из зарядки, и `spatial-hub` из каталога открылись ВЕБ-версиями,
  // хотя обе стоят в карте перехвата. То есть перехват не работал ни разу, и
  // вместе с ним не исполнялось ничего, что висит на нативном экране.
  //
  // ⚠️ Событие `popstate` тут не спасает: браузер шлёт его на «назад», но НЕ на
  // `pushState`. Поэтому подменяются оба метода, а `popstate` слушается вдобавок.
  var sendRoute = function () { send({ op: 'route', url: String(location.href) }); };
  var hist = window.history;
  var push = hist.pushState, replace = hist.replaceState;
  hist.pushState = function () { push.apply(hist, arguments); sendRoute(); };
  hist.replaceState = function () { replace.apply(hist, arguments); sendRoute(); };
  window.addEventListener('popstate', sendRoute);

  var proto = window.Storage.prototype;
  var setItem = proto.setItem, removeItem = proto.removeItem;
  proto.setItem = function (k, v) {
    setItem.call(this, k, v);
    if (this === window.localStorage && mine(k)) send({ op: 'set', key: String(k), value: String(v) });
  };
  proto.removeItem = function (k) {
    removeItem.call(this, k);
    if (this === window.localStorage && mine(k)) send({ op: 'remove', key: String(k) });
  };
})();
''';
  }
}
