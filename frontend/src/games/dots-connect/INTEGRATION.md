# INTEGRATION · G2 «Соедини точки» (dots-connect)

**Точные строки для захода-интегратора.** Экран и модуль уже в main и работают по
маршруту `/games/dots-connect`. Здесь лежит всё, что трогает ОБЩИЕ файлы каталога,
словаря, профилей и справки — их правит один заход разом, чтобы семь параллельных
приёмок не затёрли друг друга.

Пока эти строки не внесены, игры нет в каталоге: попасть в неё можно только прямым
адресом. Это осознанно и застраховано — `src/__tests__/game-routes.test.ts`,
список `AWAITING_CATALOG`, запись `'dots-connect'`. **Внёс в каталог — убери оттуда
строку**, иначе гейт покраснеет на протухшем исключении.

---

## 1. `src/constants/games.ts` — запись каталога

Вставить в массив `GAMES` (рядом с логическими головоломками):

```ts
  {
    id: 'dots_connect',
    nameKey: 'dotsConnect',
    descKey: 'dotsConnectDesc',
    skillKey: 'skillPlanning',
    gradient: ['#2563eb', '#0f766e'],
    icon: 'share-social',
    route: '/games/dots-connect',
    category: 'logic',
  },
```

- `gradient` **менять нельзя** — он зашит в экране (`app/games/dots-connect.tsx`),
  им же красится тема модуля, и по нему посчитан цвет текста на плашке. Оба конца
  берут AA белым (5.17 и 5.47), вуаль не нужна.
- `category: 'logic'` — головоломка с полной информацией и без таймера, как ханойская
  башня и судоку. В `action` ей нечего делать: скорость здесь ничего не решает.
- `skillKey: 'skillPlanning'` — ключ уже существует, новый заводить не нужно.
- `icon: 'share-social'` — Ionicons: три узла, соединённые линиями, ровно про эту игру.
  Сверено 19.08.2026 — свободен, `git-network`/`git-merge`/`grid`/`link` уже заняты
  соседями. Равноценная замена, если займут: `color-filter` или `navigate-circle`.

## 2. Словарь — `src/contexts/LanguageContext.tsx`

Три ключа. `ru`/`en` канонические (приехали из HANDOFF модуля), остальные 10 языков
отдать переводчику вместе с переводами самого модуля (см. §6).

```ts
  dotsConnect: { ru: 'Соедини точки', en: 'Dots Connect' },
  dotsConnectDesc: {
    ru: 'Соединяйте одинаковые точки непересекающимися путями и заполните всю сетку.',
    en: 'Connect matching dots with non-crossing paths and fill the whole grid.',
  },
  dotsConnectIntroDesc: {
    ru: 'Тренирует пространственное планирование: проложите для каждой пары свой путь без пересечений и пустых клеток.',
    en: 'Trains spatial planning: give every pair its own path without crossings or empty cells.',
  },
```

⚠️ **Экран этих ключей не ждёт.** Название и правила он берёт из словаря самого
модуля (`core/i18n.ts`), поэтому и без регистрации на экране нет ни одного «имени
ключа вместо текста». Ключи нужны КАРТОЧКЕ в каталоге и справке — им, а не игре.

### 🔴 Остальные 10 языков — В ТОМ ЖЕ ЗАХОДЕ, иначе прогон красный

Проверено прогоном 19.08.2026: внести только `ru`/`en` нельзя — `i18n-coverage`
роняет прогон на всех десяти локалях сразу, плюс упирается храповик японского долга
(«не растёт, сейчас 0»). Поэтому переводы готовы, копировать целиком.
Формат файлов `src/contexts/translations/<локаль>.ts` — плоские `"ключ": "строка"`.

```
de: "dotsConnect": "Punkte verbinden",
    "dotsConnectDesc": "Verbinde gleiche Punkte mit kreuzungsfreien Wegen und fülle das ganze Gitter",
    "dotsConnectIntroDesc": "Trainiert räumliches Planen: Lege für jedes Paar einen eigenen Weg — ohne Kreuzungen und ohne leere Felder",

es: "dotsConnect": "Une los puntos",
    "dotsConnectDesc": "Une los puntos iguales con caminos que no se crucen y llena toda la cuadrícula",
    "dotsConnectIntroDesc": "Entrena la planificación espacial: traza para cada pareja su propio camino, sin cruces ni casillas vacías",

pt: "dotsConnect": "Ligue os pontos",
    "dotsConnectDesc": "Ligue os pontos iguais com caminhos que não se cruzam e preencha toda a grade",
    "dotsConnectIntroDesc": "Treina o planeamento espacial: trace para cada par o seu próprio caminho, sem cruzamentos nem casas vazias",

fr: "dotsConnect": "Relier les points",
    "dotsConnectDesc": "Reliez les points identiques par des chemins sans croisement et remplissez toute la grille",
    "dotsConnectIntroDesc": "Entraîne la planification spatiale : tracez pour chaque paire son propre chemin, sans croisement ni case vide",

it: "dotsConnect": "Unisci i punti",
    "dotsConnectDesc": "Unisci i punti uguali con percorsi che non si incrociano e riempi tutta la griglia",
    "dotsConnectIntroDesc": "Allena la pianificazione spaziale: traccia per ogni coppia il suo percorso, senza incroci né caselle vuote",

zh: "dotsConnect": "连点成线",
    "dotsConnectDesc": "用互不交叉的路径连接相同的点，并填满整个网格",
    "dotsConnectIntroDesc": "训练空间规划：为每一对点各铺一条路径，既不交叉也不留空格",

ja: "dotsConnect": "点つなぎ",
    "dotsConnectDesc": "同じ印どうしを交差しない線でつなぎ、盤面をすべて埋めます",
    "dotsConnectIntroDesc": "空間的な計画力を鍛えます。各ペアに専用の道を引き、交差も空きマスも作りません",

ko: "dotsConnect": "점 잇기",
    "dotsConnectDesc": "같은 점끼리 서로 겹치지 않는 길로 잇고 격자를 모두 채우세요",
    "dotsConnectIntroDesc": "공간 계획력을 기릅니다. 각 쌍마다 전용 길을 내되 교차도 빈칸도 없어야 합니다",

hi: "dotsConnect": "बिंदु जोड़ो",
    "dotsConnectDesc": "एक जैसे बिंदुओं को बिना काटे रास्तों से जोड़ें और पूरा ग्रिड भरें",
    "dotsConnectIntroDesc": "स्थानिक योजना का अभ्यास: हर जोड़ी के लिए अलग रास्ता बनाएँ — न कोई क्रॉसिंग, न कोई खाली खाना",

ar: "dotsConnect": "صِل النقاط",
    "dotsConnectDesc": "صِل النقاط المتشابهة بمسارات لا تتقاطع واملأ الشبكة بالكامل",
    "dotsConnectIntroDesc": "يدرّب التخطيط المكاني: ارسم لكل زوج مساره الخاص، بلا تقاطعات ولا مربعات فارغة",
```

Это пересказ, а не подстрочник: в китайском и японском «сетка» — про игровое поле,
а не про таблицу, в арабском порядок «соедини — заполни» сохранён как в русском.

## 3. `src/constants/helpMap.ts` — справка «?»

```json
  "/games/dots-connect": {
    "nameKey": "dotsConnect",
    "skillKey": "skillPlanning",
    "introKey": "dotsConnectIntroDesc"
  },
```

Либо перегенерировать картой репозитория: `node scripts/gen-helpmap.mjs`.

## 4. `src/constants/profiles.ts` — где игра уместна

Добавить `'dots_connect'` в `allowed_games`:

| профиль | брать? | почему |
|---|---|---|
| `odv999`, `nzt48` | автоматически | у них `allowed_games: 'all'` — трогать не нужно |
| `chess` | **да** | ровно их предмет: удержать в голове последствия хода на несколько шагов вперёд, поле с полной информацией, без часов. Соседствует с `tower_london` и `sudoku` |
| `execs` | **да** | планирование под ограничением ресурса: жадный первый ход запирает четвёртую пару — цена нетерпения видна сразу и без штрафов |
| `students` | **да** | тихая головоломка без таймера, годится как разгрузка между фокус-блоками |
| `kids` | **да, но** | 4×4 на первых уровнях ребёнок берёт легко; уровни 25+ (8×8, восемь пар) уже взрослые. Брать, только если в наборе нормально, что дальняя часть лесенки не для них |
| `seniors` | **да** | нет часов и нет проигрыша по времени — можно думать сколько нужно; ошибка обратима «протянуть назад» |
| `drivers` | нет | у них цена ошибки в секундах, а эта игра про неспешную прикидку |
| `women` | нет | набор про залипательные казуалки; здесь нужно именно планировать, а не расслабляться |
| `vasilyeva`, `polyglot` | нет | мимо предмета (поле зрения / вербальное) |
| `free` | **нет** | ⚠️ описание профиля вбито строкой «9 тренажёров» и сверяется гейтом `game-standard`. Добавишь игру — обнови число в `profiles.ts` И в словаре на 12 языках, иначе прогон покраснеет |

## 5. Зарядка — `src/services/warmup.ts`

**Не брать.** Шаг зарядки — 60–150 секунд, а здесь одна партия на 8×8 занимает
несколько минут и обрывать её на середине нечем: игра засчитывается только когда
занята ВСЯ сетка, промежуточного результата не существует. Полупройденная сетка не
пишет сессию, а зарядка двигается именно по сохранённой сессии — получился бы
тупик того же сорта, что ловит `warmup-deadend.test.ts`.

Если всё же захочется — брать ТОЛЬКО ранние уровни и явным параметром:

```ts
{ game_id: 'dots_connect', game_route: '/games/dots-connect', difficulty: 'easy',
  settings: { level: 3 }, est_duration_sec: 90 },
```

⚠️ И учесть: в шаге зарядки человек увидит экран правил и тренировочную сетку —
экран показывает знакомство на ПЕРВОМ заходе за визит, а шаг зарядки как раз первый.

## 6. Языки модуля (отдельная задача переводчику)

Модуль везёт свой словарь `src/games/dots-connect/core/i18n.ts` — сейчас там только
`ru` и `en`, это записанная граница G2. Остальные 10 языков приложения откатываются
на английский: название игры, правила, подпись раунда, кнопки «Отменить»/«Заново».
Ключи и структура — в том же файле, `DotsLocale` расширяется добавлением локали.

## 7. Что уже сделано и трогать не надо

- `app/games/dots-connect.tsx` — экран-обёртка;
- `src/games/dots-connect/**` — модуль (ядро, UI, SPEC);
- `src/__tests__/dots-connect-integration.test.ts` — гейт стыковки, 26 проверок;
- реестры соседних гейтов, по одной строке в каждом:
  `game-routes.test.ts` (`AWAITING_CATALOG`), `undo-honesty.test.ts` (`WITHOUT_UNDO`),
  `game-mode-switch.test.ts` (`WITHOUT_SWITCH`), `game-task-line.test.ts` (`NOT_A_GAME`).

## 8. 🔴 Витрины магазинов — `store/google-play/listing-*.md`, `store/windows/listing-*.md`

Каталог вырастет на единицу, а в текстах витрин число упражнений вбито строкой на
всех двенадцати языках. Гейт `store-listing-count.test.ts` сверяет их с размером
каталога и покраснеет в тот же момент, когда запись из §1 попадёт в `GAMES`.

Проверено прогоном: без правки витрин регистрация роняет прогон. Число там одно,
меняется поиском по маркерам «упражнени / exercise / Übung / ejercicio / exercice /
esercizi / exercício / 種類の脳トレ / 项练习 / 가지 훈련 / अभ्यास / تمرين».

⚠️ Если в этот же заход регистрируются другие игры из лаборатории — считать
ПОСЛЕ всех, одним числом, а не по разу на игру.

## 9. Свежая игра — `src/constants/freshGames.ts`

По желанию, чтобы карточка получила метку «новое»:

```ts
    { id: 'dots_connect', since: '2026-08-19', kind: 'new' },
```
