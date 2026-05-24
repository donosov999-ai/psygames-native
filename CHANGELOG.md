# Changelog

All notable changes to PsyGames Native (Mac/Win/Android/Web).

Following [Semantic Versioning](https://semver.org/): `MAJOR.MINOR.PATCH`
- **MAJOR** — breaking changes (incompatible UX/data)
- **MINOR** — new features (backward-compatible)
- **PATCH** — bug fixes, content updates, small UX tweaks

To create a release: bump version in `tauri.conf.json` + `frontend/package.json`
+ `frontend/app.json` → commit → `git tag vX.Y.Z` → `git push --tags`.
CI's `release` job will attach all 4 artifacts (Mac/Win .exe/.msi/Android)
to a GitHub Release automatically.

---

## [1.4.0] — 2026-05-24

### Added
- **👩 Женщины** — 11-й тематический профиль. Аудитория: женщины 25-55,
  мамы, а также HR-специалисты, медсёстры, учителя, продажники обоих полов.
  9 игр под мультитаскинг (Switching, Trail Making), социальную когницию
  (RMET — Reading Mind in Eyes), вербалку (Phonemic Fluency), память на
  имена/списки (Word Pairs, Picture Pairs), внимание к деталям (Find
  Differences, Schulte) + бытовой счёт (Math Sprint).
- Master code: `WOMEN-NZT-2026` (hash `ccdc487...`).
- Цвет профиля: `#ec4899` (розовый), эмодзи: 👩.
- Длительность сессии: 10-15 мин. Warmup ✅, Assessment ✅, Financial ❌.

### Changed
- Settings UI label: «10 профилей» → «11 профилей · 1 бесплатный + 10 тематических».
- Onboarding слайд: «10 профилей под цель» → «11 профилей под цель».
- Unlock modal: добавлено упоминание профиля Женщины в список тематических.

### Critical note (от Claude)
- Gender-locked название «Женщины» отсекает мужскую B2B-аудиторию (HR,
  медучреждения) — это решение Дениса. По сути игр там нет ничего женского,
  они просто bias-нуты под soft skills + multitasking. Если продажи покажут
  что профиль покупают и мужчины тоже — переименовать в «Soft skills /
  Эмпатия» за один патч (только display_name + description).

---

## [1.3.0] — 2026-05-24

### Changed (BREAKING for personal users)
- **Removed all 5 personal profiles** (Денис / Алекс / Валя / Юля / Гость) from
  the public app. Семейные имена больше не светятся в коммерческой сборке.
- Бывший profile «Денис» (полный доступ ко всем 47 играм + Зарядка + Financial
  Brain Day + Assessment) пересоздан как тематический профиль **ODV999** под
  отдельным мастер-кодом. Тот же код, что и staticrypt-пароль NZT-сайта.
- `ProfileId` теперь: `odv999 | chess | kids | vasilyeva | nzt48 | free |
  drivers | seniors | execs | students` (10 штук, было 14).
- Раздел «👥 Личные» в Settings теперь не рендерится, если личных профилей нет.
- Onboarding-слайд «5 профилей» заменён на «10 профилей под цель» с упоминанием
  тематических батарей.
- Legacy migration: установки с сохранённым `denis/alex/valya/yulya/guest`
  тихо переключаются на FREE при первом запуске v1.3.0 (никаких ошибок,
  никаких потерь данных — `cognitive_sessions.person` остаётся как было).

### Added
- ODV999 themed profile + master code лежит в локальном `UNLOCK_CODES.md`
  (не в git). Чтобы войти — Settings → 🔑 Ввести код → ввести мастер-код.

---

## [1.2.6] — 2026-05-24

### Fixed
- **GameCard widths still drifted on Web** even with v1.2.5's CSS belt.
  Root cause: `gap` in flex-wrap is a known RN Web bug — it distributes
  the gap unevenly across items in rows with different item counts.
- Replaced parent `gap: GRID_GAP` (12px) with per-card `marginRight: 10,
  marginBottom: 10` directly on the outer View inside GameCard.
- Recomputed `cardWidth` formula to account for trailing per-card margin
  (so N cards + N margins fit containerWidth, not N + (N-1) gaps).

---

## [1.2.5] — 2026-05-24

### Fixed
- **macOS Tauri WebView** (WebKit) sometimes ignored plain `width` on
  flex-wrap children, letting cards stretch in sections with fewer items.
  Plain `width: cardWidth` worked in Chrome (Web build) but not always
  in macOS native app. Added belt-and-braces sizing on outer View:
  `width + minWidth + maxWidth + flexBasis + flexShrink:0 + flexGrow:0`.
  Same for height. This forces WebKit to honor exact dimensions
  regardless of flex parent layout decisions.

---

## [1.2.4] — 2026-05-24

### Fixed
- **GameCard sizes differed BETWEEN sections** (Память cards taller +
  narrower than Внимание cards on same page). Sections with fewer cards
  had cards rendered with different dimensions because RN Web's
  `flexBasis` + `width` combination on TouchableOpacity wasn't reliably
  honored — flex distribution still leaked through.
- Wrapped GameCard contents in an outer plain `<View style={{width:X, height:Y}}>`.
  In RN Web a plain View with inline width/height renders as `<div style="width:Xpx;height:Ypx">`,
  which is rock-solid against any flex math. TouchableOpacity + LinearGradient
  inside use `flex:1` to fill it exactly.
- Every game card on every section is now EXACTLY cardWidth × cardHeight.

---

## [1.2.3] — 2026-05-24

### Fixed
- **GameCard width now stable** across rows. After v1.2.2 fix for height,
  width started varying within rows (Парные ≈200px, Span ≈240px on the
  same row). RN Web's flex-wrap was still letting cards stretch/shrink
  to fill leftover space inconsistently.
- TouchableOpacity now has `flexShrink: 0, flexGrow: 0, flexBasis: cardWidth`
  — hard-pins each card to exactly cardWidth, no flex distribution.
- `gamesGrid` got `alignContent: flex-start` and `alignItems: flex-start`
  to prevent any row-level stretching.

---

## [1.2.2] — 2026-05-24

### Fixed
- **GameCard: row heights still differed between rows** (row 1 was taller
  than row 2 visually). v1.2.1 didn't fully fix it because dimensions
  were set on inner LinearGradient, not outer TouchableOpacity. RN Web
  wrap-flex measures each row's cross-size independently, so shorter
  rows could collapse to the natural content height.
- Moved `{width, height}` to outer TouchableOpacity (forces explicit
  layout dimensions per card). LinearGradient now uses `flex: 1` to
  fill its parent. TextContainer uses `flex: 1` to push badge to bottom.
  All cards on all rows now perfectly equal.

---

## [1.2.1] — 2026-05-24

### Fixed
- **Hero cards (Зарядка / Профиль / FIN BRAIN)** had different heights
  because `minHeight: 130` allowed cards with longer subtitles (e.g.
  «12 тестов · ~12 мин» + ★ badge) to stretch past 130 while neighbours
  stayed shorter. Fixed: `height: 150` (fixed), all 3 always equal.
- **Game cards** had varying internal layout: cards with short
  description had big empty gap between icon and text (because
  `justifyContent: 'space-between'` distributed remaining space).
  Fixed: removed `space-between` from card style; explicit `marginTop: 12`
  between icon and text, `marginTop: 'auto'` on badge to pin it to
  bottom. Result: identical visual structure regardless of desc length.

---

## [1.2.0] — 2026-05-23

Big refactor: 4 categories + balanced themed profiles.

### Changed
- **6 categories → 4** (Lumosity-style for simpler discovery):
  - 🧠 Память (12) — без изменений
  - 👁 Внимание (7) — только pure attention
  - 🧩 Логика и принятие решений (14) — was Logic (8) + Switching (3) + Risk (3)
  - ⚡ Скорость и торможение (14) — was Inhibition (7) + Speed (3) + Math (3) + Social (1)
  - Category sizes now 12/7/14/14 (was 12/7/8/14/3/3, разрыв 4.7× → 2.0×)
- **All 9 themed profiles rebuilt by «1+1+1+1 base + 5 themed» formula**.
  Every profile now covers ALL 4 categories with bias on its target audience.
  Previously many profiles had 0 games in 2-3 categories.

### New profile layouts (9 themed, 9 games each, all 4 cats covered)
- ♟ Шахматист: Corsi+CPT+ToL+ChoiceRT + 5 logic-bias (MR/Pattern/SET/Sudoku/Schulte)
- 🧒 Дети: Picture Pairs+Find Diff+Hanoi+Targets + 5 fun-bias
- 📖 Скорочтение: Reading Span+Schulte+Anagrams+SDMT + 5 attention-bias
- 💊 NZT-48: N-back+CPT+ToL+Conflict + 5 full-prefrontal-bias
- 🚗 Водители: N-back+CPT+Trail+ChoiceRT + 5 attention/reaction-bias
- 👴 50+: Picture Pairs+Schulte+Mnemonics+SDMT + 5 memory-bias
- 💼 Предприниматели: N-back+CPT+ToL+Conflict + 5 risk/decision-bias (BART/Iowa/PRL)
- 🎓 Студенты ЕГЭ: Reading Span+Schulte+Pattern+Math Sprint + 5 memory-bias
- 🎁 FREE: Picture Pairs+Schulte+Hanoi+Math Sprint + 5 funnel-teaser-bias

### Why
- Old profiles had 0 control for 5 themed (Шах, Дети, Скоро, Студенты, FREE) —
  bug: pure inhibition is one of the most trainable functions, can't omit it
- NZT-48 had only 1 memory game (contradicts the «WM is the base» concept)
- Шахматист had 5/9 in logic (too lopsided)
- Уровень категорий теперь равный для всех ЦА

### Technical
- `GameCategory` type: removed 'control', 'math', 'speed'; added 'action'
- `CATEGORY_ORDER` reduced from 6 to 4 entries
- `CATEGORY_META.action` added with flash-outline icon (same as ex-speed)
- 14 games re-categorised in `games.ts`: 6 → 'logic' (Trail/Switching/WCST/BART/Iowa/PRL), 14 → 'action' (Stroop/Flanker/GoNoGo/StopSignal/Counter/MathSprint/NumberBonds/ChoiceRT/Targets/SDMT/RMET/2 hubs)
- `LanguageContext.tsx`: new `catAction` key; legacy `catControl`/`catMath`/`catSpeed`
  point to «Скорость и торможение» for back-compat with any old code paths
- `app/index.tsx`: `grouped` Record narrowed to 4-category type

---

## [1.1.3] — 2026-05-23

### Added
- **Anagrams: hint banner** — each word now shows a short clue («💡
  упрямое животное» for «осёл») above the letter slots. Helps users
  who can shuffle letters but can't think of any matching word.

### Fixed
- **Anagrams: word list bugs** — `компьютер` (9 letters) was in the
  5-letter array, `берёза` (6) in 5, half of the 6-letter array was
  actually 7 letters. All entries now type-checked + auto-filtered by
  `.filter(e => e.w.length === N)` to prevent regression.

---

## [1.1.2] — 2026-05-23

### Fixed
- **Find Differences: shapes overlap** — random scene generation had no
  collision check, so two shapes could be drawn on top of each other.
  In SVG `onPress` only fires on the topmost element → the bottom shape
  was un-tappable, even if it was the actual diff. Fixed with rejection
  sampling (60 attempts per shape with min-distance check). Also enlarged
  scene area (280 → 340px height) and protected size-change diffs from
  introducing new overlaps.

---

## [1.1.1] — 2026-05-23

### Fixed
- **Picture Pairs «10 пар»** was always locked for themed profiles because
  the level manifest only had 6/8/12, while UI had 6/8/10/12 buttons.
  Added '10 pairs' as a 3rd step (unlock at 8 pairs ≤75s), and adjusted
  12 pairs to require '10 pairs ≤100s × 2'.

---

## [1.1.0] — 2026-05-17

Commercial profiles + level progression + onboarding UX.

### Added
- **9 themed commercial profiles** (chess / kids / vasilyeva /
  nzt48 / drivers / seniors / execs / students / free), each = 9 games
  curated for the audience. Personal profiles (Денис/Алекс/Валя/Юля/Гость)
  unchanged.
- **Unlock-code system**: 8 master codes (SHA-256 hashed in code, plaintext
  in `~/Downloads/PSYGAMES_UNLOCK_CODES.md` not in git). FREE is default,
  others require code.
- **Welcome modal** at first run with «FREE / Have a code» choice. Sets
  `psygames_first_run_done` flag.
- **Level progression** for themed profiles. 10 games with thresholds:
  Schulte (5×5 → 6×6 → 7×7 → 8×8 → 9×9 → 10×10), N-back (1 → 2 → 3 → 4),
  Digit Span (forward → backward), Corsi, Memory Matrix, Picture Pairs,
  Math Sprint, Pattern, Mental Rotation, CPT. Personal profiles see no locks.
- **UI locks** on 9/10 game config screens (🔒 emoji + disabled tap + helper
  text). CPT pending refactor — tracked in DB task `b5e34e05`.
- **`useLevelGate` hook** — reusable 3-line patch for level locks in any game.
- **Global UnlockToast** — «🎉 Новый уровень разблокирован!» banner shown
  for 4.5 sec when threshold is met.
- **Expanded profile descriptions** — `long_description`, `audience`,
  `session_minutes` fields added to ProfileDef.
- **Settings UI split** — «👥 Личные» + «🎯 Тематические» sections with
  lock icons on un-unlocked themed.

### Changed
- **Default profile = FREE** for unknown devices (was Денис). Commercial
  users no longer leak into personal data.
- **Default difficulty = first level** in all 9 patched games (was middle).
  Themed users start at unlocked level instead of staring at locked default.
- Main screen 3 hero blocks compressed into a single horizontal row of
  small squares (was vertical stack ~660px → now ~130px).

### Fixed
- Mental Rotation isometric SVG rendering bugs (z=min face → z=max,
  painter's algorithm Y sign).
- Picture Pairs photo-memory flash mode (per-card preview before play).
- Digit Span auto-check on last digit + auto-advance.
- Story Recall «Готов» button to skip distractor when ready.
- Proofreading cell sizing for desktop.

### Infrastructure
- `psygames-native` repo created as **single source of truth** for all
  platforms (Mac/Win/Android/Web). One push = 4 platform builds + auto
  web-deploy to `psygames-web`.
- GH Actions matrix workflow with caching, Android keystore signing,
  release-on-tag automation.
- README updated in all 3 places (`psygames-native`, `psygames-web`,
  local `psygames/frontend`) to mark single source of truth.

---

## [1.0.0] — 2026-05 (pre-versioning)

Initial native release covering everything before commercial profiles.

### Highlights
- 47 cognitive games across 6 categories (memory / attention / logic /
  control / math / speed)
- Утренняя Зарядка with per-weekday playlists
- Financial Brain Day battery (Iowa → BART → PRL, biweekly)
- G1 Initial Skill Assessment (12-domain radar)
- Achievements (20 in 5 categories)
- F2 Supabase cloud sync (fire-and-forget upsert)
- Profile gating × 5 personal profiles (Денис/Алекс/Валя/Юля/Гость)
- Onboarding tutorial (5 slides)

See git log before 2026-05-17 for details.
