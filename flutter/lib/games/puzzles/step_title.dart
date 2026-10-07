/// ИМЯ СТУПЕНИ ТЭТХЭМА НА ЯЗЫКЕ ЧЕЛОВЕКА (задача 92e1b615, 01.10.2026).
///
/// 🔴 ПОВОД. Основной язык — английский (решение Дениса 01.10.2026), а имя ступени в полосе
/// «Доска» приходит ДАННЫМИ из веба: `frontend/src/games/tatham-bridge/sections/*.ts` → поле
/// `лестница[].имя`. Замер 01.10: 78 имён из 88 — русские строки, и на английском телефоне
/// человек видел их по-русски. Веб эти имена не показывает — они нужны только нативной полосе.
///
/// КАК. Имена собраны из десятка повторяющихся частей (размер, трудность, «N мин», «N цветов»,
/// «Крест», «поворот N×N»…). Выгрузка `tools/embed-puzzle-modes.mjs` раскладывает каждое имя
/// на части `{key, n}` / `{text}` и ПАДАЕТ на имени, которого не разобрала; здесь части
/// собираются по ключам словаря. Русскому — имя как в данных. Русских слов в коде экрана нет.
library;

import '../../shell/l10n.dart';
import 'ladder.dart';

/// Ключи частей приходят из ДАННЫХ, а не литералом в `L.t` — список для `tools/embed-l10n.mjs`
/// (без него сборщик словаря их не увидит, и экран покажет `tathamDiffEasy`).
const tathamStepKeys = <String>[
  'tathamDiffEasy', 'tathamDiffNormal', 'tathamDiffMedium', 'tathamDiffHard', 'tathamDiffTricky',
  'tathamDiffExtreme', 'tathamDiffUnreasonable', 'tathamDiffBasic', 'tathamDiffAdvanced',
  'tathamRandom', 'tathamCross', 'tathamOctagon', 'tathamMines', 'tathamColours', 'tathamPegs',
  'tathamRotation', 'tathamOrientable', 'tathamTiles',
];

/// Имя ступени для полосы «Доска». Русский — как в данных; иначе по частям выгрузки.
/// Частей нет (пресеты самого движка — у них имена латиницей) — имя как есть.
String stepTitle(PuzzleStep step) {
  if (L.locale == 'ru' || step.parts.isEmpty) return step.title;
  return [
    for (final p in step.parts)
      p.key == null ? p.text : L.t(p.key!).replaceAll('{n}', p.n),
  ].join(', ');
}
