import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/games/anagrams/ring.dart';

/// СВЕРКА СЛОВО-КВАДРАТА С ЭТАЛОНАМИ ЖИВОГО TS.
///
/// Сверяются не только числа: лестница задаёт, КАКОЙ квадрат человек получит на
/// уровне, поэтому проверяются сами кольца — четыре слова, банк и ключ.
void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  late Map<String, dynamic> ref;

  setUpAll(() {
    ref = jsonDecode(File('test/fixtures/rings-reference.json').readAsStringSync())
        as Map<String, dynamic>;
  });

  test('🔴 сторона, потолок банка и состав языков — те же', () {
    expect(ringSide, ref['сторона']);
    expect(ringBankMax, ref['банкМакс']);
    expect(RingPacks.locales, (ref['языки'] as List).cast<String>());
  });

  test('🔴 углы сходятся там же, где в живом коде', () async {
    final packs = await RingPacks.load('ru');
    final r = packs.rings.first;
    final e = ref['углы'] as Map<String, dynamic>;
    expect(ringCornersMeet(r.top, r.right, r.bottom, r.left), e['сходятся']);
    expect(ringCornersMeet('ААААА', r.right, r.bottom, r.left), e['неСходятся']);
  });

  test('🔴 углы сходятся у ВСЕХ колец всех языков — иначе рамка не замкнута', () async {
    for (final locale in RingPacks.locales) {
      final packs = await RingPacks.load(locale);
      final broken = [
        for (final r in packs.rings)
          if (!ringCornersMeet(r.top, r.right, r.bottom, r.left)) '${r.top}/${r.right}',
      ];
      expect(broken, isEmpty, reason: '$locale: рамка не замкнута');
    }
  });

  test('🔴 банк собирается из максимумов, и каждое слово из него складывается', () async {
    final packs = await RingPacks.load('ru');
    final e = ref['банк'] as Map<String, dynamic>;
    final r = packs.rings.first;
    final bank = ringBankOf(r.top, r.right, r.bottom, r.left);
    expect(madeOfBank(r.top, bank), e['да']);
    expect(madeOfBank('ЪЪЪЪЪ', bank), e['нет']);
    // И это верно для всех колец языка: банк обязан собирать все четыре слова.
    for (final k in packs.rings) {
      for (final w in k.words) {
        expect(madeOfBank(w, k.bank), isTrue, reason: 'банк не собирает «$w»');
      }
      expect(k.bank.length, lessThanOrEqualTo(ringBankMax));
    }
  });

  test('🔴 лестница совпадает с живым кодом: те же кольца, банки, ключи и вес', () async {
    final by = ref['по'] as Map<String, dynamic>;
    for (final locale in RingPacks.locales) {
      final packs = await RingPacks.load(locale);
      final e = by[locale] as Map<String, dynamic>;
      expect(packs.rings.length, e['колец'], reason: '$locale: колец');

      final steps = e['лестница'] as List;
      for (var i = 0; i < steps.length; i++) {
        final want = steps[i] as Map<String, dynamic>;
        final got = packs.ladder[i];
        final at = '$locale ступень ${i + 1}';
        expect(got.top, want['верх'], reason: '$at верх');
        expect(got.right, want['право'], reason: '$at право');
        expect(got.bottom, want['низ'], reason: '$at низ');
        expect(got.left, want['лево'], reason: '$at лево');
        expect(got.bank, (want['банк'] as List).cast<String>(), reason: '$at банк');
        expect(ringKey(got.top, got.right, got.bottom, got.left), want['ключ'], reason: '$at ключ');
        expect(ringFalseCandidates(got, packs.dictionary), want['ложных'], reason: '$at ложных');
      }

      // И одно из середины: сверять только начало — значит не сверять сортировку.
      final mid = e['середина'] as Map<String, dynamic>;
      final gotMid = packs.ladder[packs.ladder.length ~/ 2];
      expect(gotMid.top, mid['верх'], reason: '$locale середина верх');
      expect(ringFalseCandidates(gotMid, packs.dictionary), mid['ложных'],
          reason: '$locale середина ложных');
    }
  });

  test('🔴 у кольца ЧЕТЫРЕ РАЗНЫХ слова — допущение экрана, закреплённое замером', () async {
    /*
     * 📍 ЗАМЕР 24.09.2026 по всем восьми наборам: 0 колец из 8000 имеют одно и то
     * же слово на двух сторонах.
     *
     * 🔴 ЗАЧЕМ ЭТО ПРОБОЙ. Экран, закрывая сторону, ищет ПЕРВУЮ незакрытую с таким
     * словом. Если бы слово стояло на двух сторонах, без этой оговорки вторая
     * сторона не закрылась бы никогда — человек застрял бы на готовом квадрате.
     * Оговорка в экране есть, но мутация на ней ВЫЖИВАЕТ: на этих данных путь
     * недостижим. Значит проверять надо не ветку кода, а ДОПУЩЕНИЕ о данных —
     * пересоберут наборы, и проба скажет, что оговорка перестала быть страховкой.
     */
    for (final locale in RingPacks.locales) {
      final packs = await RingPacks.load(locale);
      final dup = [
        for (final r in packs.rings)
          if (r.words.toSet().length != 4) r.words.join('/'),
      ];
      expect(dup, isEmpty, reason: '$locale: слово повторяется на двух сторонах');
    }
  });

  test('🔴 ключ одинаков у всех восьми прочтений квадрата', () async {
    final packs = await RingPacks.load('en');
    final r = packs.rings.first;
    String rev(String s) => s.split('').reversed.join();
    final key = ringKey(r.top, r.right, r.bottom, r.left);
    // Поворот на 90°: тот же квадрат, тот же ключ.
    expect(ringKey(rev(r.left), r.top, rev(r.right), r.bottom), key);
    // Отражение: тоже тот же.
    expect(ringKey(rev(r.top), r.left, rev(r.bottom), r.right), key);
  });

  test('🔴 уровень даёт одно и то же кольцо и идёт по кругу', () async {
    final packs = await RingPacks.load('ru');
    expect(packs.ringForLevel(1).top, packs.ladder.first.top);
    expect(packs.ringForLevel(0).top, packs.ladder.first.top, reason: 'нулевой уровень — первый');
    expect(packs.ringForLevel(packs.ladder.length + 1).top, packs.ladder.first.top,
        reason: 'набор проходится по кругу');
  });
}
