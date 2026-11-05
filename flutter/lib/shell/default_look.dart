import 'design_template.dart';
import 'shared_state.dart';

/// 🔴 ВИД ПО УМОЛЧАНИЮ — «АВРОРА» (Денис, 05.11.2026: «по умолчанию перекинуть на „Аврору“,
/// раз она почти полностью готова»). Тема НЕ навязывается: у «Авроры» есть светлая и тёмная,
/// и каждая берётся по профилю, как раньше (app_theme.dart, ThemeContext.tsx).
///
/// Пишется В НАСТРОЙКИ, а не меняет запасное значение в коде: `parseUiTemplate(null)` остаётся
/// прежним, иначе разом поменялись бы все экраны в тестах, рендерящих без сохранённого вида.
///
/// ОДИН РАЗ, с отметкой: выбор, сделанный до обновления, не трогается (есть ключ — значение
/// остаётся), а переключение на «Классику» потом не перебивается следующим запуском.
const defaultLookSeededKey = 'psygames_default_look_v1';

Future<void> seedDefaultLook(SharedState state) async {
  if (state.get(defaultLookSeededKey) != null) return;
  if (state.get(uiTemplateKey) == null) await state.set(uiTemplateKey, UiTemplate.aurora.id);
  await state.set(defaultLookSeededKey, '1');
}
