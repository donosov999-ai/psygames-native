import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/shell/catalog.dart';
import 'package:psygames_flutter/shell/catalog_kit.dart';
import 'package:psygames_flutter/shell/hub_screen.dart';
import 'package:psygames_flutter/shell/profiles.dart';
import 'package:psygames_flutter/shell/shared_state.dart';
import 'package:shared_preferences/shared_preferences.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  tearDown(() => Profiles.allProfilesAllGames = true);

  test('временный доступ не переписывает исходный список профиля', () {
    final profile = Profile({'allowed_games': ['sudoku']});
    expect(profile.games, isNull);
    Profiles.allProfilesAllGames = false;
    expect(profile.games, ['sudoku']);
  });

  test('каталог не применяет устаревший узкий список видимости', () async {
    SharedPreferences.setMockInitialValues({
      'psygames_active_profile': 'free',
      HubScreen.visibleKey:
          '{"profile":"free","catalog":["sudoku"],"hubs":{"/games/span":["/games/digit-span"]}}',
    });
    final state = await SharedState.open();
    final kit = CatalogKit(
      catalog: Catalog(categories: const [], games: const [], entries: const []),
      hubs: {
        'hubs': {
          '/games/span': ['a', 'b'],
        },
      },
    );
    final visible = kit.visible(state);
    expect(visible.games, isNull);
    expect(visible.hubCount['/games/span'], 2);

    Profiles.allProfilesAllGames = false;
    final restricted = kit.visible(state);
    expect(restricted.games, {'sudoku'});
    expect(restricted.hubCount['/games/span'], 1);
  });
}
