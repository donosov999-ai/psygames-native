import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/shell/shared_state.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// 🔴 ЯЗЫК НЕ ВЫБРАН — НАТИВНАЯ ПОЛОВИНА ГОВОРИТ НА ЯЗЫКЕ СИСТЕМЫ, КАК ВЕБ.
///
/// 📍 Замер 01.10.2026, релиз 2.56.1 на эмуляторе en-US, свежая установка: главная
/// (веб) по-английски, а «Колышки», меню паузы и все нативные игры — по-русски.
/// Веб без сохранённого ключа берёт `navigator.language` и ключ не пишет, а здесь
/// стояло `?? 'ru'`. Для человека в Play с английским телефоном это половина
/// приложения на чужом языке.
void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  final original = SharedState.systemLanguage;
  tearDown(() => SharedState.systemLanguage = original);

  Future<SharedState> fresh([Map<String, Object> values = const {}]) async {
    SharedPreferences.setMockInitialValues(values);
    return SharedState(await SharedPreferences.getInstance());
  }

  test('язык не выбран, телефон английский — английский, а не русский', () async {
    SharedState.systemLanguage = () => 'en';
    expect((await fresh()).language, 'en');
  });

  test('язык не выбран, телефон немецкий — немецкий (он из двенадцати)', () async {
    SharedState.systemLanguage = () => 'de';
    expect((await fresh()).language, 'de');
  });

  test('язык не выбран, телефон русский — русский', () async {
    SharedState.systemLanguage = () => 'ru';
    expect((await fresh()).language, 'ru');
  });

  test('язык системы не из двенадцати — английский, как у веба (база EN)', () async {
    SharedState.systemLanguage = () => 'sv';
    expect((await fresh()).language, 'en');
  });

  test('язык выбран в приложении — он и остаётся, система не перебивает', () async {
    SharedState.systemLanguage = () => 'en';
    expect((await fresh({'language': 'ru'})).language, 'ru');
  });
}
