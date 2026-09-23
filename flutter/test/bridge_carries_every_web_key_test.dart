import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/shell/shared_state.dart';

/// МОСТ ОБЯЗАН ВОЗИТЬ КАЖДЫЙ КЛЮЧ ВЕБ-СТОРОНЫ, А НЕ ТОЛЬКО ТЕ, ЧТО ПОД ПРЕФИКСОМ.
///
/// 🔴 ЧТО СЛУЧИЛОСЬ. В шапке `shared_state.dart` стояло: «ВСЁ состояние веб-стороны
/// лежит под одним префиксом `psygames_`». Замер 23.09.2026 сплошным проходом по
/// `frontend/src` и `frontend/app` это опроверг: ключ `language` пишется голым
/// (`LanguageContext.tsx`). Мост его не возил — и нативная половина не могла даже
/// спросить, на каком языке говорить.
///
/// ПОЧЕМУ ОБЫЧНАЯ ПРОБА ЭТОГО НЕ ВИДЕЛА. Пробы моста проверяли, что `psygames_*`
/// доезжает. Ключ, которого мост не знает, в таком замере не участвует вовсе:
/// он не «не доехал», он не существует. Отрицательный результат тут невозможно
/// получить, глядя только на свою сторону, — надо идти в чужой исходник и
/// пересчитывать ЕГО ключи. Этим проба и занимается.
///
/// РАСТЁТ САМА. Появится в вебе второй голый ключ — проба покраснеет и назовёт
/// его по имени и файлу, вместо того чтобы он потерялся на границе молча.
void main() {
  final web = Directory('../frontend');

  test('🔴 каждый ключ хранилища веба либо под префиксом, либо в списке исключений', () {
    if (!web.existsSync()) {
      markTestSkipped('нет ../frontend — прогон вне общего дерева');
      return;
    }

    final calls = RegExp(r'''(?:getItem|setItem|removeItem)\(\s*(['"`])([^'"`\n]*)''');
    final consts = RegExp(r'''const\s+([A-Z][A-Z_0-9]*(?:KEY|FLAG))\s*=\s*(['"`])([^'"`\n]*)''');

    final strays = <String, String>{}; // ключ -> где нашли

    for (final f in _ourSources(web)) {
      final p = f.path;

      final src = f.readAsStringSync();
      for (final m in calls.allMatches(src)) {
        final key = _staticHead(m.group(2)!);
        if (key.isEmpty) continue; // ключ собран целиком из переменной — литерала нет
        if (!SharedState.owns(key)) strays[key] = p;
      }
      for (final m in consts.allMatches(src)) {
        final value = _staticHead(m.group(3)!);
        if (value.isEmpty) continue;
        // Ключи доступа и прочие не-хранилищные константы отсеиваем по виду значения.
        if (value.startsWith('sb_') || value.startsWith('http')) continue;
        if (!SharedState.owns(value)) strays[value] = '$p (${m.group(1)})';
      }
    }

    expect(
      strays,
      isEmpty,
      reason: 'Эти ключи веб-сторона пишет мимо префикса «${SharedState.prefix}» и мимо '
          'списка исключений ${SharedState.extraKeys}. Через границу они НЕ ПОЕДУТ: '
          'человек потеряет их, открыв перенесённую игру. Либо переименовать ключ в '
          'вебе под префикс, либо добавить в SharedState.extraKeys с причиной.\n'
          '${strays.entries.map((e) => '  · ${e.key}  ←  ${e.value}').join('\n')}',
    );
  });

  test('язык интерфейса доезжает через границу', () async {
    // Мост обязан не только ПРОПУСКАТЬ `language`, но и отдавать его нативной стороне.
    expect(SharedState.owns('language'), isTrue, reason: 'ключ языка признан своим');
    expect(SharedState.owns('psygames_dots_connect_level_free'), isTrue);
    expect(SharedState.owns('какой-то-чужой-ключ'), isFalse,
        reason: 'чужие ключи мост по-прежнему не трогает');
  });

  test('скрипт для страницы перечисляет исключения, а не только префикс', () {
    // Мутация: если из bootstrapJs убрать EXTRA, `language` перестанет уезжать обратно
    // в Dart при смене языка в вебе — и это должно быть видно пробой, а не руками.
    final src = File('lib/shell/shared_state.dart').readAsStringSync();
    final js = src.substring(src.indexOf('String bootstrapJs'));
    expect(js.contains('EXTRA'), isTrue, reason: 'список исключений уезжает в страницу');
    expect(RegExp(r'indexOf\(P\) === 0\)\s*send').hasMatch(js), isFalse,
        reason: 'ни одна ветка отправки не фильтрует ТОЛЬКО по префиксу');
  });
}


/// ТОЛЬКО НАШИ ИСХОДНИКИ. 🔴 Поймано при первом же прогоне на дереве, где
/// `node_modules` стоит ссылкой: обход ушёл в чужие пакеты и принёс двенадцать
/// «нарушений» — `supabase.auth.token`, `REANIMATED_MAGIC_KEY`,
/// `EXPO_NOTIFICATIONS_INSTALLATION_ID` и прочее. Все они законны: это ключи
/// СТОРОННИХ библиотек, наш мост их и не должен возить.
///
/// ⚠️ Фильтр «путь содержит /src/» на это не годится — у пакетов свои `src`
/// (`expo-notifications/src/...`). Поэтому отбор идёт от КОРНЯ: ровно
/// `frontend/src` и `frontend/app`, а `node_modules` отсекается до обхода,
/// заодно избавляя пробу от прогулки по десяткам тысяч чужих файлов.
///
/// Ложное срабатывание хуже отсутствия проверки: гейт, который краснеет на
/// исправном коде, перестают читать — и вместе с придуманной поломкой он
/// пропускает настоящую.
List<File> _ourSources(Directory web) {
  final out = <File>[];
  for (final name in ['src', 'app']) {
    final dir = Directory('${web.path}/$name');
    if (!dir.existsSync()) continue;
    for (final e in dir.listSync(recursive: true, followLinks: false)) {
      if (e is! File) continue;
      final p = e.path;
      if (p.contains('/node_modules/')) continue;
      if (!p.endsWith('.ts') && !p.endsWith('.tsx')) continue;
      // Пробы самого веба ставят ключи руками для своих же нужд — это не состояние приложения.
      if (p.contains('__tests__') || p.contains('/scripts/')) continue;
      out.add(e);
    }
  }
  return out;
}

/// Статическое начало ключа: из `psygames_resume_${game}` остаётся `psygames_resume_`,
/// из `${SOME}_free` — пустая строка (литерала нет, проверять нечего).
String _staticHead(String raw) {
  final i = raw.indexOf(r'${');
  return i < 0 ? raw : raw.substring(0, i);
}
