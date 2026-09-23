import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/shell/shared_state.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// ПЕРЕХВАТ ЛОВИТ ПЕРЕХОД ЧЕРЕЗ History API, А НЕ ТОЛЬКО ЗАГРУЗКУ ДОКУМЕНТА.
///
/// 🔴 ЧТО БЫЛО СЛОМАНО, И ЭТО САМЫЙ ДОРОГОЙ ДЕФЕКТ ПЕРЕЕЗДА. Оболочка ловила
/// переходы делегатом `onNavigationRequest`, а он срабатывает только на НАСТОЯЩУЮ
/// загрузку документа. Приложение ходит по экранам через History API — роутер
/// зовёт `pushState`, — и WebView о таком переходе не сообщает вовсе.
///
/// 📍 Замер раздела «Зарядки» 23.09.2026, симулятор iPhone 17 Pro, сборка из
/// origin/main без флага WEB_ONLY: и `spatial-span` из зарядки, и `spatial-hub`
/// из каталога открылись ВЕБ-версиями, хотя обе стоят в карте перехвата. То есть
/// перехват не работал НИ РАЗУ — а вместе с ним не исполнялось ничего, что висит
/// на нативном экране: ни отчёт о партии, ни продолжение, ни питомец.
///
/// ⚠️ Нашли это живым прогоном на устройстве, а не пробой. Проба здесь сторожит
/// ровно тот кусок, который можно проверить без телефона: что вливаемый в
/// страницу скрипт ПОДМЕНЯЕТ оба метода истории и слушает «назад». Что переход
/// действительно доезжает до оболочки, доказывает только живой прогон.
void main() {
  late SharedState state;

  setUp(() async {
    SharedPreferences.setMockInitialValues({});
    state = await SharedState.open();
  });

  test('🔴 скрипт подменяет pushState И replaceState', () {
    final js = state.bootstrapJs();
    expect(js, contains('hist.pushState = function'),
        reason: 'роутер ходит по экранам именно им');
    expect(js, contains('hist.replaceState = function'),
        reason: 'замена адреса без записи в историю — тоже переход');
  });

  test('🔴 «назад» слушается отдельно: popstate на pushState НЕ приходит', () {
    expect(state.bootstrapJs(), contains("addEventListener('popstate'"));
  });

  test('о переходе сообщается тем же каналом, что и о записи в хранилище', () {
    final js = state.bootstrapJs();
    expect(js, contains("op: 'route'"));
    expect(js, contains('location.href'), reason: 'адрес берётся целиком, с запросом и якорем');
  });

  test('сообщение о маршруте ничего не записывает в общую память', () async {
    // ⚠️ ЧЕСТНО О ТОМ, ЧТО ЗДЕСЬ ДОКАЗАНО. Ранний выход по `op == 'route'` в
    // applyFromWeb — это ЯСНОСТЬ, а не защита: без него сообщение всё равно не
    // записалось бы, потому что `op` не равен ни `set`, ни `remove`. Проверял
    // мутацией — убрал выход, проба осталась зелёной. Поэтому проба утверждает
    // ровно то, что верно: маршрут не превращается в запись хранилища, каким бы
    // путём он ни шёл.
    for (final msg in [
      '{"op":"route","url":"http://x/games/sudoku"}',
      '{"op":"route","url":"http://x/games/sudoku","key":"psygames_x","value":"1"}',
    ]) {
      expect(await state.applyFromWeb(msg), isFalse, reason: msg);
    }
    expect(state.snapshot(), isEmpty);
  });

  test('обычная запись хранилища по-прежнему доезжает', () async {
    final ok = await state.applyFromWeb(
        '{"op":"set","key":"psygames_sudoku_level_free","value":"7"}');
    expect(ok, isTrue);
    expect(state.get('psygames_sudoku_level_free'), '7');
  });
}
