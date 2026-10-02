/* psygames-native-only-games · VER 3 · 02.10.2026 */
/**
 * ИГРЫ ТОЛЬКО С НАТИВНЫМ ЭКРАНОМ — БЕЗ ВЕБ-ДВОЙНИКА.
 *
 * До 30.09.2026 каждая игра приложения жила в веб-реестре `GAMES`, а Flutter лишь
 * перехватывал её адрес своим экраном. Первые игры, написанные сразу на Flutter, —
 * «Очередь зверей» и «Цвета и формы» (движки MindLab, решение Дениса 30.09.2026:
 * «добавляем, потом доработаем»). Веб-экрана у них нет: переезд идёт в другую сторону.
 *
 * 🔴 ЗАЧЕМ ВЕБУ ЭТОТ СПИСОК. Разбор состава (`services/playlistOverride.ts`) принимает
 * карточку развилки, только если её маршрут ведёт к существующей игре, и сверял это
 * по одному `GAMES`. Нативную игру он отбрасывал: и заводской состав, и файл из
 * редактора теряли бы её карточку. Экран у неё есть — в карте перехвата
 * `flutter/lib/shell/hybrid_app.dart`; проба `native-only-routes.test.ts` сверяет,
 * что каждый адрес отсюда там действительно перехвачен.
 *
 * ⚠️ В вебе такой адрес по-прежнему ведёт в пустоту. Живых людей это не касается:
 * развилки в приложении нативные, а веб-версии на сайте нет.
 */
export interface NativeOnlyGame {
  route: string;
  /** Ключи словаря — те же, что у карточки в `defaultPlaylists.json`. */
  nameKey: string;
  descKey: string;
}

export const NATIVE_ONLY_GAMES: readonly NativeOnlyGame[] = [
  { route: '/games/animal-queue', nameKey: 'animalQueue', descKey: 'animalQueueDesc' },
  { route: '/games/kids-sort', nameKey: 'kidsSort', descKey: 'kidsSortDesc' },
  // MindLab у координатора (задача f5034811): четыре игры из пилота Codex — по развилкам
  // «Пространство», «Поиск глазами», «Конфликт внимания», «Головоломки».
  { route: '/games/traffic-jam', nameKey: 'trafficJam', descKey: 'trafficJamDesc' },
  { route: '/games/monster-traits', nameKey: 'monsterTraits', descKey: 'monsterTraitsDesc' },
  // MindLab «Найди» (kids/find.py) — раздел «Поиск», задача c8a2783f.
  { route: '/games/kids-find', nameKey: 'kidsFind', descKey: 'kidsFindDesc' },
  // MindLab «Подлодки» (submarinos/sea.py) — раздел «Поиск», задача c8a2783f.
  { route: '/games/submarines', nameKey: 'submarines', descKey: 'submarinesDesc' },
  // Второй режим «Найди признак» — «Кого не хватает» (раздел «Поиск», задача 664b414a).
  { route: '/games/monster-traits?mode=missing', nameKey: 'monsterMissing', descKey: 'monsterMissingDesc' },
  { route: '/games/roll-and-bank', nameKey: 'rollAndBank', descKey: 'rollAndBankDesc' },
  { route: '/games/hidden-character', nameKey: 'hiddenCharacter', descKey: 'hiddenCharacterDesc' },
  // «Кошки» (раздел «Судоку», PR #10): экран только нативный — без строки здесь профиль её не пропускал (4a5bb886).
  { route: '/games/cats', nameKey: 'catsTitle', descKey: 'catsDesc' },
  // Раннер «Поиска глазами» (задача 5386c0e8, решение Дениса 30.09.2026: сразу на Flutter).
  { route: '/games/search-runner', nameKey: 'searchRunner', descKey: 'searchRunnerDesc' },
  // «Шахматы», новая игра 1 из 7 (задача 04e0a67e): тактика по двенадцати приёмам Lichess.
  { route: '/games/find-move', nameKey: 'findMove', descKey: 'findMoveDesc' },
  // «Шахматы», новая игра 2 из 7 (задача 66b3d2ac): каждый ход — взятие, остаётся одна фигура.
  { route: '/games/solitaire-chess', nameKey: 'solitaireChess', descKey: 'solitaireChessDesc' },
  // «Шахматы», новая игра 3 из 7 (задача 39ad8924): «Восемь ферзей» и «Обход конём» одним экраном.
  { route: '/games/knights-queens', nameKey: 'knightsQueens', descKey: 'knightsQueensDesc' },
  // «Судоку для малышей» (раздел «Судоку», #160; задача d87a4605): 4×4 и 6×6 со зверями — только натив.
  { route: '/games/sudoku?mode=junior', nameKey: 'sudokuJuniorTitle', descKey: 'sudokuSkinAnimals' },
];

export const NATIVE_ONLY_ROUTES: readonly string[] = NATIVE_ONLY_GAMES.map((g) => g.route);
