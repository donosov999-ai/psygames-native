import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/shell/level_ladder.dart';
import 'package:psygames_flutter/shell/shared_level_store.dart';
import 'package:psygames_flutter/shell/shared_state.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// ПРОБА ГРАНИЦЫ между перенесённой частью и WebView.
///
/// Она не читает исходник и не сверяет имена глазами — она ПРОГОНЯЕТ переход:
/// веб-сторона пишет уровень, перенесённая игра его видит; перенесённая игра
/// выигрывает уровень, веб-сторона получает его в снимке. Если мост разорвать
/// или переименовать ключ — проба краснеет, потому что прогресс разъезжается
/// именно так: обе половины работают, но показывают разное.
void main() {
  setUp(() => SharedPreferences.setMockInitialValues({}));

  Future<SharedState> open() => SharedState.open();

  test('🔴 ключ уровня совпадает с тем, что пишет нынешняя веб-сборка', () {
    // frontend/src/hooks/usePersistentLevel.ts:64 — `psygames_${gameId}_level_${pid}`
    expect(SharedState.levelKey('dots_connect', 'nzt48'), 'psygames_dots_connect_level_nzt48');
    expect(SharedState.failKey('dots_connect', 'nzt48'), 'psygames_dots_connect_failstreak_nzt48');
  });

  test('🔴 уровень, добытый в WebView, виден перенесённой игре', () async {
    final s = await open();
    final ok = await s.applyFromWeb(
        jsonEncode({'op': 'set', 'key': 'psygames_dots_connect_level_nzt48', 'value': '7'}));
    expect(ok, isTrue, reason: 'сообщение из страницы обязано быть принято');

    final ladder = LevelLadder(gameId: 'dots_connect', store: SharedLevelStore(s));
    await ladder.load();
    expect(ladder.level, 7);
  });

  test('🔴 победа в перенесённой игре доезжает до веб-стороны', () async {
    final s = await open();
    final ladder = LevelLadder(gameId: 'one_line', store: SharedLevelStore(s));
    await ladder.load();
    await ladder.win();

    // Снимок — ровно то, что вливается в страницу перед её кодом.
    expect(s.snapshot()['psygames_one_line_level_nzt48'], '2');
    expect(s.bootstrapJs(), contains('psygames_one_line_level_nzt48'));
  });

  test('🔴 у каждого профиля свой прогресс — иначе смена профиля тихо сотрёт чужой', () async {
    final s = await open();
    await s.applyFromWeb(
        jsonEncode({'op': 'set', 'key': 'psygames_one_line_level_nzt48', 'value': '9'}));

    final other = LevelLadder(gameId: 'one_line', store: SharedLevelStore(s, profile: 'basic'));
    await other.load();
    expect(other.level, 1, reason: 'чужой профиль не наследует прогресс');
  });

  test('чужие ключи мост не пропускает — страница не хозяйничает в наших настройках', () async {
    final s = await open();
    expect(await s.applyFromWeb(jsonEncode({'op': 'set', 'key': 'flutter.token', 'value': 'x'})),
        isFalse);
    expect(await s.applyFromWeb('это не json'), isFalse);
    expect(await s.applyFromWeb(jsonEncode({'op': 'drop', 'key': 'psygames_x'})), isFalse);
    expect(s.snapshot(), isEmpty);
  });

  test('удаление с веб-стороны доезжает тоже', () async {
    final s = await open();
    await s.set('psygames_active_profile', 'nzt48');
    expect(s.snapshot()['psygames_active_profile'], 'nzt48');
    final ok =
        await s.applyFromWeb(jsonEncode({'op': 'remove', 'key': 'psygames_active_profile'}));
    expect(ok, isTrue);
    expect(s.snapshot().containsKey('psygames_active_profile'), isFalse);
  });

  test('🔴 вливаемый скрипт перехватывает запись страницы, а не ждёт события storage', () async {
    final s = await open();
    final js = s.bootstrapJs();
    // Событие `storage` в своей же вкладке не срабатывает — если подмены нет,
    // запись страницы не вернётся никогда, и это не видно ничем, кроме этой строки.
    expect(js, contains('proto.setItem'));
    expect(js, contains('proto.removeItem'));
    expect(js, contains(SharedState.channel));
  });

  test('🔴 профиль берётся из общей памяти, а не зашит в коде', () async {
    // Замер живого запуска 23.09.2026: веб-часть прислала psygames_active_profile = «free»,
    // а нативная половина была зашита на «nzt48» — прогресс разъехался бы молча.
    final s = await open();
    await s.applyFromWeb(
        jsonEncode({'op': 'set', 'key': 'psygames_active_profile', 'value': 'free'}));

    final ladder = LevelLadder(gameId: 'dots_connect', store: SharedLevelStore(s));
    await ladder.load();
    await ladder.win();
    expect(s.snapshot()['psygames_dots_connect_level_free'], '2');
    expect(s.snapshot().containsKey('psygames_dots_connect_level_nzt48'), isFalse,
        reason: 'в чужой профиль писать нельзя');
  });

  test('смена профиля на ходу меняет и адрес записи — имя не запоминается', () async {
    final s = await open();
    final store = SharedLevelStore(s);
    await store.writeInt('one_line.level', 5);
    expect(s.snapshot()['psygames_one_line_level_nzt48'], '5');

    await s.set('psygames_active_profile', 'free');
    await store.writeInt('one_line.level', 5);
    expect(s.snapshot()['psygames_one_line_level_free'], '5');
  });
}
