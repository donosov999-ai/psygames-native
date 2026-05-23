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
