import 'dart:convert';

import 'package:flutter/services.dart' show AssetBundle, rootBundle;

/// КАТАЛОГ НАБОРОВ ТОВАРОВ — ШЕСТЬ ВИТРИН, А НЕ ОДИН «МИКС».
///
/// 🔴 ЧТО БЫЛО ПОТЕРЯНО ПЕРЕНОСОМ. В вебе у игры ШЕСТЬ наборов со своими пулами:
/// «Микс» 34 вида, «Еда» 6, «Напитки» 8, «Игрушки» 8, «Молочное» 9, «Зверята» 12;
/// пять из шести открываются по уровням. В первой выгрузке для Flutter лежал ОДИН
/// (`set: "mix"`), выбора у человека не было вовсе, а 44 спрайта товаров при этом
/// уже ехали в сборке — то есть картинки для остальных пяти были на месте и
/// просто не показывались.
///
/// 🔴 ПОЧЕМУ У КАЖДОГО НАБОРА СВОЯ ЛЕСТНИЦА, А НЕ ОДНА ОБЩАЯ. Размер пула решает,
/// сколько ВИДОВ уровень может положить на доску (`levelCfg`). Набор из шести
/// видов не может раздать доску, которой нужно одиннадцать. Поэтому наборы — это
/// не «другие картинки на тех же уровнях», а шесть разных лестниц, и каждая
/// выгружена своим прогоном генератора.
///
/// ⚠️ ЧИСЛА ЗДЕСЬ НЕ НАПИСАНЫ, А ПРОЧИТАНЫ. Порог открытия считает веб
/// (`setUnlockLevel` от размера пула через `typeBudget`), набор по умолчанию для
/// профиля — таблица `PROFILE_GOOD_SET`. Оба уезжают в `assets/levels/goods_sets.json`
/// вместе с лестницами. Продублировать их в Dart значило бы завести вторую
/// истину, которая молча разойдётся с первой на первой же правке пула.
class GoodsSet {
  const GoodsSet({
    required this.key,
    required this.ru,
    required this.en,
    required this.pool,
    required this.preview,
    required this.alike,
    required this.unlockLevel,
    required this.file,
  });

  factory GoodsSet.fromJson(Map<String, dynamic> j) => GoodsSet(
        key: j['key'] as String,
        ru: j['ru'] as String,
        en: j['en'] as String,
        pool: (j['pool'] as List).cast<int>(),
        preview: (j['preview'] as List?)?.cast<int>() ?? const [],
        alike: j['alike'] == true,
        unlockLevel: (j['unlockLevel'] as num?)?.toInt() ?? 1,
        file: j['file'] as String,
      );

  final String key;
  final String ru;
  final String en;

  /// Виды товаров набора: номер вида — номер картинки `assets/goods/good<N>.webp`.
  final List<int> pool;

  /// Шесть товаров для витрины выбора.
  final List<int> preview;

  /// Товары набора НАМЕРЕННО похожи («Молочное»): предупреждение, а не дефект.
  final bool alike;

  /// С какого уровня набор открыт.
  final int unlockLevel;

  /// Файл лестницы этого набора внутри `assets/levels/`.
  final String file;
}

class GoodsSets {
  const GoodsSets(this.sets, this.byProfile, this.widestPool);

  static const asset = 'assets/levels/goods_sets.json';

  factory GoodsSets.fromJsonString(String raw) {
    final j = jsonDecode(raw) as Map<String, dynamic>;
    return GoodsSets(
      (j['sets'] as List).map((e) => GoodsSet.fromJson(e as Map<String, dynamic>)).toList(),
      (j['byProfile'] as Map?)?.map((k, v) => MapEntry(k as String, v as String)) ?? const {},
      (j['widestPool'] as num?)?.toInt() ?? 0,
    );
  }

  static Future<GoodsSets> load([AssetBundle? bundle]) async =>
      GoodsSets.fromJsonString(await (bundle ?? rootBundle).loadString(asset));

  final List<GoodsSet> sets;
  final Map<String, String> byProfile;
  final int widestPool;

  GoodsSet byKey(String key) => sets.firstWhere((s) => s.key == key, orElse: () => sets.first);

  /// Самый широкий набор — точка отсчёта и запасной вариант: он открыт с первого
  /// уровня по построению.
  GoodsSet get widest =>
      sets.firstWhere((s) => s.pool.length == widestPool, orElse: () => sets.first);

  /// Можно ли ВЫБРАТЬ набор. `reached` — достигнутый потолок, а не уровень, на
  /// котором играют: переигровка лёгкого уровня не отбирает наборы, заработанные
  /// выше. `granted` — набор уже начатой партии, его не отбирают никогда.
  bool available(String key, int reached, {String? granted}) =>
      key == granted || reached >= byKey(key).unlockLevel;

  /// Набор, с которого игра открывается у этого профиля на этом уровне.
  ///
  /// ⚠️ Предпочтение профиля — не назначение, а ожидание: пока набор не открылся,
  /// играем самым широким. Иначе ребёнок открыл бы игру набором, который ему ещё
  /// не выдан (ровно этот дефект поймал веб-гейт `goods-sort-unlock`).
  String defaultFor(String? profile, int reached) {
    final preferred = profile == null ? null : byProfile[profile];
    if (preferred == null || !sets.any((s) => s.key == preferred)) return widest.key;
    return reached >= byKey(preferred).unlockLevel ? preferred : widest.key;
  }
}
