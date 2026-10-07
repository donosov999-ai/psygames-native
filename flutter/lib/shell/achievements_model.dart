import 'dart:convert';

import 'asset_json.dart';
import 'l10n.dart';
import 'shared_state.dart';
import 'streak_calendar_model.dart' show CalendarLocales;

/// «ДОСТИЖЕНИЯ» — РАСЧЁТ НА DART (задача d6a60b02, вариант Б, пятый экран).
///
/// Перенос модели `frontend/app/achievements.tsx` (`achievementsModel`, `humanDate`) и чтения
/// `getUnlocked` из `frontend/src/services/achievements.ts` один в один. Таблица достижений и разделы
/// экрана — данными веба (`assets/achievements.json`, выгрузка `tools/embed-achievements.mjs`); дата
/// открытия — шаблоном ICU (`CalendarLocales.shortDate`). Открывает достижения по-прежнему веб
/// (`checkNewAchievements` после партии) — здесь только чтение. Эталон — модель веб-экрана вместе с
/// ключом хранилища (`fixtures/achievements_*`), проба `achievements_model_test.dart`.
typedef Achievement = ({String id, String emoji, String category, String nameRu, String nameEn, String descRu, String descEn});
typedef AchievementSection = ({String key, String labelRu, String labelEn});

class AchievementsData {
  AchievementsData(this.sections, this.achievements);
  final List<AchievementSection> sections;
  final List<Achievement> achievements;

  factory AchievementsData.fromJson(Map<String, Object?> j) => AchievementsData(
    [
      for (final c in (j['categories']! as List).cast<Map>())
        (key: c['key'] as String, labelRu: c['label_ru'] as String, labelEn: c['label_en'] as String),
    ],
    [
      for (final a in (j['achievements']! as List).cast<Map>())
        (
          id: a['id'] as String,
          emoji: a['emoji'] as String,
          category: a['category'] as String,
          nameRu: a['name_ru'] as String,
          nameEn: a['name_en'] as String,
          descRu: a['desc_ru'] as String,
          descEn: a['desc_en'] as String,
        ),
    ],
  );

  static AchievementsData? _cache;

  static Future<AchievementsData> load() async => _cache ??= AchievementsData.fromJson(
    await loadJsonAsset('assets/achievements.json'),
  );
}

/// Запись об открытии как лежит в хранилище: поля — что угодно (`{id, date}` у исправной записи).
typedef UnlockedRecord = ({Object? id, Object? date});

/// `getUnlocked` веба: список открытых. Нет записи, битый JSON — пусто. 🔴 Не-список и не-объекты
/// веб уронили бы экран (`unlocked.map`, `u.id`); здесь — пусто и запись без полей.
List<UnlockedRecord> unlockedOf(SharedState state) {
  final raw = state.get('psygames_achievements_unlocked');
  if (raw == null || raw.isEmpty) return const [];
  Object? v;
  try {
    v = jsonDecode(raw);
  } catch (_) {
    return const [];
  }
  if (v is! List) return const [];
  return [for (final u in v) u is Map ? (id: u['id'], date: u['date']) : (id: null, date: null)];
}

/// Ложь по правилам JS (`date ? … : null` веба).
bool _truthy(Object? v) => v != null && v != false && v != '' && v != 0 && !(v is double && v.isNaN);

/// `String(x)` веба для того, что приходит из JSON.
String _jsString(Object? v) => v is double && v == v.truncateToDouble() && v.isFinite ? '${v.toInt()}' : '$v';

final _ymd = RegExp(r'^(\d{4})-(\d{2})-(\d{2})$');

const _rtl = {'ar', 'he', 'fa', 'ur'};

/// `humanDate` веба: `ГГГГ-ММ-ДД` — по-человечески на языке, местной датой из частей; непонятное —
/// как есть. Переполнение частей (`2026-02-30`, `2026-00-10`) сдвигает дату, как `new Date(г, м, д)`;
/// год 0–99 — 1900-е, как там же.
String humanDate(Object? key, String lang, CalendarLocales loc) {
  final s = _truthy(key) ? _jsString(key) : '';
  final m = _ymd.firstMatch(s);
  if (m == null) return s;
  var y = int.parse(m[1]!);
  if (y >= 0 && y <= 99) y += 1900;
  final d = DateTime.utc(y, int.parse(m[2]!), int.parse(m[3]!));
  return loc.shortDate(lang, d.year, d.month, d.day);
}

/// Модель — та же, что `achievementsModel` веба.
Map<String, Object?> achievementsModel(AchievementsData data, List<UnlockedRecord> unlocked, CalendarLocales loc) {
  final lang = L.locale;
  final ru = lang == 'ru';
  final open = {for (final u in unlocked) u.id};
  Object? dateOf(String id) {
    for (final u in unlocked) {
      if (u.id == id) return u.date;
    }
    return null;
  }

  final total = data.achievements.length;
  return {
    'v': 1,
    'title': '🏆 ${L.t('achievementsTitle')} ${unlocked.length}/$total',
    'back': L.t('a11yBack'),
    'rtl': _rtl.contains(lang.split('-').first.toLowerCase()),
    'sections': [
      for (final sec in data.sections)
        {
          'key': sec.key,
          'title': ru ? sec.labelRu : sec.labelEn,
          'cards': [
            for (final a in data.achievements.where((a) => a.category == sec.key))
              () {
                final date = dateOf(a.id);
                return {
                  'id': a.id,
                  'emoji': a.emoji,
                  'unlocked': open.contains(a.id),
                  'name': ru ? a.nameRu : a.nameEn,
                  'desc': ru ? a.descRu : a.descEn,
                  'date': _truthy(date) ? humanDate(date, lang, loc) : null,
                };
              }(),
          ],
        },
    ],
    'footer': L.t('achievementsFooter').replaceFirst('{n}', '${total - unlocked.length}'),
  };
}

/// Модель «Достижений» этого человека.
Future<Map<String, Object?>> achievementsModelFor(SharedState state) async =>
    achievementsModel(await AchievementsData.load(), unlockedOf(state), await CalendarLocales.load());
