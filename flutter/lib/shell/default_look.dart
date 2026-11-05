import 'crystal_palette.dart';
import 'design_template.dart';
import 'shared_state.dart';

/// 🔴 ВИД ПО УМОЛЧАНИЮ — «АВРОРА» (Денис, 05.11.2026: «по умолчанию перекинуть на „Аврору“,
/// раз она почти полностью готова»). Тема НЕ навязывается: у «Авроры» есть светлая и тёмная,
/// и каждая берётся по профилю, как раньше (app_theme.dart, ThemeContext.tsx).
///
/// И ПАЛИТРА ПРОФИЛЯ ВКЛЮЧЕНА (Денис, 05.11: «да»): у каждого профиля свой камень
/// (gem_palette_presets.dart — «Женский» розовый, «Шахматы» чёрный, ODV999 сапфир). Переключатель
/// общий, камень берётся по активному профилю (CrystalPalette.read). Правило зовётся в main.dart
/// ДО загрузки шейдера — иначе движок не поднимется при первом запуске.
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
  if (state.get(crystalEnabledKey) == null) await state.set(crystalEnabledKey, '1');
  await state.set(defaultLookSeededKey, '1');
}
