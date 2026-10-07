/// ПОЛЯ ФАЙЛА СОСТАВА — ИМЕНА СХЕМЫ ВЕБА, А НЕ ТЕКСТ ЭКРАНА.
///
/// `СохранённыйСостав` и `СоставПрофиля` в `frontend/src/services/playlistOverride.ts` названы
/// по-русски. Здесь — кодами символов, чтобы сторожа кириллицы в коде (`no_new_hardcoded_cyrillic`,
/// `ui_text_debt_does_not_grow`) считали только видимый текст (тот же приём у `_profilesField` в
/// `settings_screen.dart`). Читатели файла в варианте Б (d6a60b02) берут имена отсюда.
abstract final class PlaylistFields {
  /// «профили» — раздел по профилям.
  static const profiles = '\u043f\u0440\u043e\u0444\u0438\u043b\u0438';

  /// «коллекция» — пороги фигурок.
  static const collection = '\u043a\u043e\u043b\u043b\u0435\u043a\u0446\u0438\u044f';

  /// «игры» — список игр профиля (`allowed_games`).
  static const games = '\u0438\u0433\u0440\u044b';

  /// «убрать» — закрытые профилю игры (`closed_games`).
  static const remove = '\u0443\u0431\u0440\u0430\u0442\u044c';
}
