import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/shell/app_theme.dart';
import 'package:psygames_flutter/shell/crystal_palette.dart';
import 'package:psygames_flutter/shell/default_look.dart';
import 'package:psygames_flutter/shell/design_template.dart';
import 'package:psygames_flutter/shell/shared_state.dart';
import 'package:shared_preferences/shared_preferences.dart';

Future<SharedState> open(Map<String, Object> values) async {
  SharedPreferences.setMockInitialValues(values);
  return SharedState.open();
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  test('ничего не выбрано — «Аврора», тема по профилю не меняется', () async {
    final s = await open({'flutter.psygames_active_profile': 'kids'});
    final before = appThemeMode(s);
    await seedDefaultLook(s);
    expect(parseUiTemplate(s.get(uiTemplateKey)), UiTemplate.aurora);
    expect(appThemeMode(s), before);
    expect(s.get('psygames_theme_override'), isNull);
  });

  test('выбор до обновления не трогается: «Классика» остаётся', () async {
    final s = await open({'flutter.$uiTemplateKey': 'classic_v1'});
    await seedDefaultLook(s);
    expect(parseUiTemplate(s.get(uiTemplateKey)), UiTemplate.classic);
  });

  test('один раз: «Классика», выбранная потом, не перебивается следующим запуском', () async {
    final s = await open({});
    await seedDefaultLook(s);
    await s.set(uiTemplateKey, UiTemplate.classic.id);
    await seedDefaultLook(s);
    expect(parseUiTemplate(s.get(uiTemplateKey)), UiTemplate.classic);
  });

  test('палитра профиля включена; камень — по профилю («Женский» — розовый)', () async {
    final s = await open({'flutter.psygames_active_profile': 'women'});
    await seedDefaultLook(s);
    final p = CrystalPalette.read(s);
    expect(p.enabled, isTrue);
    expect(p.recipe.id, 'profile-women');
  });

  test('палитру, выключенную до обновления, не включаем', () async {
    final s = await open({'flutter.$crystalEnabledKey': '0'});
    await seedDefaultLook(s);
    expect(CrystalPalette.read(s).enabled, isFalse);
  });
}
