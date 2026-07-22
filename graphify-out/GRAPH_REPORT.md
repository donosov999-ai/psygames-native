# Graph Report - .  (2026-07-11)

## Corpus Check
- Large corpus: 554 files · ~797,087 words. Semantic extraction will be expensive (many Claude tokens). Consider running on a subfolder.

## Summary
- 1897 nodes · 4409 edges · 157 communities (119 shown, 38 thin omitted)
- Extraction: 94% EXTRACTED · 6% INFERRED · 0% AMBIGUOUS · INFERRED: 267 edges (avg confidence: 0.76)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- Services: sudoku
- Services: styles
- Contexts: anagramgame
- Constants: profiles
- Services: level
- Jest: react
- Juice: styles
- Services: weekday
- Cpt: rules
- Services: level
- Services: daily
- Constants: gradient
- Chess: name
- Src-Tauri: icon
- Hooks: styles
- Iso: mental
- Constants: pair
- Services: styles
- Services: assessment
- Services: vocab
- Set: rules
- Utils: gradient
- Hooks: corsi
- Data: words
- Pattern: gradient
- Services: feedback
- Color: wcst
- Letters: switching
- Juice: goods
- Services: listening
- Services: settings
- Translations: languagecontext
- Styles: story
- All: find
- Башня: анаграммы
- Services: achievements
- Ball: gradients
- Торможение: хаб
- Services: lexical
- Mahjong: gradient
- Expo: tsconfig
- Contexts: bart
- Sudoku: samurai
- Services: levelcleared
- Json: expo
- Services: math
- Ospan: letters
- Constants: pairs
- Pseudoword: echo
- Stroop: emotional
- Contexts: react
- Память: span
- Community 52
- Community 53
- Ant: gradient
- Rmet: eye
- Simon: gradient
- Services: gameresult
- Workflows: job
- Expo: react
- Community 60
- Inhibition: gradient
- Posner: gradient
- Services: levelprogressmap
- 108: 107
- 114: 117
- Community 66
- Community 67
- Eye: gym
- Flanker: gradient
- Pairs: phoneme
- Prl: cfg
- Scripts: keygen
- Apple: путь
- Community 74
- Choice: gradient
- Number: bonds
- Quick: count
- Stop: signal
- Trail: making
- Scripts: build
- Scripts: reset
- Constants: gamecard
- Community 83
- Community 84
- Community 85
- Community 86
- Community 87
- Community 88
- Community 89
- Community 90
- Deck: iowa
- Reading: span
- Sdmt: gradient
- Внимание: attention
- Letters: phonemic
- Stroop: gradient
- Scripts: gen
- Scripts: smoke
- Constants: gamehelpoverlay
- Community 100
- Community 101
- Community 102
- Community 103
- Android: adaptiveicon
- Expo: plugins
- Ai-Insight: anthropic
- Community 107
- Community 108
- Config: metro
- Orientationguard: txt
- Ios: supportstablet
- Web: bundler
- Eslint: config
- Expo: architecture
- Babel: plugin
- Expo
- Expo: blur
- Expo: constants
- Expo: font
- Expo: haptics
- Expo: linear
- Expo: linking
- Expo: ngrok
- Expo: notifications
- Expo: router
- Expo: status
- Expo: symbols
- Expo: system
- Expo: vector
- Expo: web
- Should: expo
- React: dom
- React: native
- Async: storage
- React: native
- React: native
- React: native
- React: native
- React: native
- React: native
- React: native
- React: native
- React: native
- React: navigation
- React: navigation
- React: navigation
- Supabase
- Tauri: apps
- Tauri: apps
- Zustand
- Constants: logo

## God Nodes (most connected - your core abstractions)
1. `useLanguage()` - 161 edges
2. `useTheme()` - 159 edges
3. `goBackOrHome()` - 133 edges
4. `saveSession()` - 131 edges
5. `useGamePreset()` - 85 edges
6. `expo-router` - 74 edges
7. `usePersistentLevel()` - 54 edges
8. `useProfile()` - 45 edges
9. `HomeScreen()` - 35 edges
10. `useLevelRules()` - 29 edges

## Surprising Connections (you probably didn't know these)
- `SettingsScreen()` --indirect_call--> `json()`  [INFERRED]
  frontend/app/settings.tsx → supabase/functions/ai-insight/index.ts
- `Путь B — стор-бинарь (Apple-аккаунт)` --conceptually_related_to--> `App Store listing kit`  [INFERRED]
  EAS_BUILD_GUIDE.md → APPSTORE_LISTING.md
- `Анаграммы` --shares_data_with--> `Словарь игры «Анаграммы» (1038 слов, RU/EN)`  [INFERRED]
  GAMES_REFERENCE.md → anagram_dictionary.md
- `CI job: macos-arm` --shares_data_with--> `macOS arm64`  [INFERRED]
  .github/workflows/build.yml → README.md
- `CI job: android` --shares_data_with--> `Android`  [INFERRED]
  .github/workflows/build.yml → README.md

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Групп-карта Span (групп-карта)** — games_reference_span_group, games_reference_digit_span, games_reference_corsi, games_reference_spatial_span [EXTRACTED 0.90]
- **Групп-карта Конфликт внимания (хаб)** — games_reference_attention_conflict, games_reference_stroop, games_reference_stroop_emotional, games_reference_flanker, games_reference_simon [EXTRACTED 0.90]
- **Групп-карта Торможение (хаб)** — games_reference_inhibition, games_reference_go_no_go, games_reference_stop_signal [EXTRACTED 0.90]
- **PsyGames release history** — changelog_v1_117_0, changelog_v1_116_0, changelog_v1_115_0, changelog_v1_114_1, changelog_v1_114_0, changelog_v1_113_0, changelog_v1_112_0, changelog_v1_111_0 [EXTRACTED 0.80]
- **GitHub Actions build/release pipeline** — github_workflows_build_typecheck, github_workflows_build_smoke, github_workflows_build_macos_arm, github_workflows_build_android, github_workflows_build_web_deploy, github_workflows_build_release, github_workflows_build_play_deploy [EXTRACTED 0.85]

## Communities (157 total, 38 thin omitted)

### Community 0 - "Services: sudoku"
Cohesion: 0.05
Nodes (64): blendHex(), CAGE_ACCENTS, exampleCaption(), exampleGrid(), ExMark, GamePhase, GRADIENT, KNIGHT_EX (+56 more)

### Community 1 - "Services: styles"
Cohesion: 0.06
Nodes (47): StatisticsScreen(), styles, AppErrorBoundary, State, styles, LeaderboardModal(), Props, styles (+39 more)

### Community 2 - "Contexts: anagramgame"
Cohesion: 0.16
Nodes (52): AnagramGame(), ANTGame(), AttentionConflictGame(), BARTGame(), BreathingGame(), ChoiceRtGame(), ClozeGame(), CounterGame() (+44 more)

### Community 3 - "Constants: profiles"
Cohesion: 0.07
Nodes (44): CATEGORY_EMOJI, ProfileSwitcherModal(), Props, GAMES, PROFILE_BADGES, profileBadge(), ALWAYS_ALLOWED, CHESS (+36 more)

### Community 4 - "Services: level"
Cohesion: 0.09
Nodes (39): GamePhase, GRADIENT, PROOFREADING_BENEFITS, styles, centerOutOrder(), ContentMode, Direction, GamePhase (+31 more)

### Community 5 - "Jest: react"
Cohesion: 0.05
Nodes (43): @babel/core, eslint, eslint-config-expo, devDependencies, @babel/core, eslint, eslint-config-expo, jest (+35 more)

### Community 6 - "Juice: styles"
Cohesion: 0.07
Nodes (31): BREATH_BENEFITS, BreathPhase, CYCLE_OPTIONS, Format, GamePhase, GRADIENT, PhaseType, styles (+23 more)

### Community 7 - "Services: weekday"
Cohesion: 0.10
Nodes (34): GRADIENT, styles, WarmupBridge(), Ctx, WarmupCtx, WarmupProvider(), WarmupState, setSessionListener() (+26 more)

### Community 8 - "Cpt: rules"
Cohesion: 0.08
Nodes (34): CONFUSABLE, CPT_BENEFITS, CPT_RULES, CPTGame(), GamePhase, GRADIENT, LETTERS_NON_X, levelParams() (+26 more)

### Community 9 - "Services: level"
Cohesion: 0.12
Nodes (32): ShopScreen(), styles, AVATAR_IMAGES, avatarImage(), Cosmetic, COSMETICS, CosmeticType, eKey() (+24 more)

### Community 10 - "Services: daily"
Cohesion: 0.11
Nodes (29): HomeScreen(), styles, FEATURE_ICONS, CATEGORY_META, CATEGORY_ORDER, ENGLISH_WORDS, GameCategory, GameConfig (+21 more)

### Community 11 - "Constants: gradient"
Cohesion: 0.07
Nodes (26): CLOZE_BENEFITS, GamePhase, GRADIENT, Round, styles, GamePhase, GRADIENT, Round (+18 more)

### Community 12 - "Chess: name"
Cohesion: 0.10
Nodes (28): buildOptions(), buildQuestions(), CHESS_BENEFITS, ChessBlindGame(), Combo, comboKey(), DIRS_BISHOP, DIRS_ROOK (+20 more)

### Community 13 - "Src-Tauri: icon"
Cohesion: 0.07
Nodes (28): https://github.com/donosov999-ai/psygames-native/releases/latest/download/latest.json, icons/icon.icns, icons/icon.ico, icons/icon.png, app, security, windows, build (+20 more)

### Community 14 - "Hooks: styles"
Cohesion: 0.11
Nodes (24): DISC_HUE, GamePhase, GRADIENT, HANOI_BENEFITS, HanoiGame(), HN_RULES, levelParams(), styles (+16 more)

### Community 15 - "Iso: mental"
Cohesion: 0.11
Nodes (26): Cube, Difficulty, GamePhase, GRADIENT, ISO_X_DX, ISO_X_DY, ISO_Z_DY, isValidRotation() (+18 more)

### Community 16 - "Constants: pair"
Cohesion: 0.09
Nodes (25): colorDist(), farColor(), FIND_BENEFITS, GamePhase, generateScene(), GRADIENT, hexToRgb(), PALETTE (+17 more)

### Community 17 - "Services: styles"
Cohesion: 0.16
Nodes (22): OnboardingScreen(), Slide, SLIDES, styles, GRADIENT_GOLD, GRADIENT_GREEN, styles, WarmupComplete() (+14 more)

### Community 18 - "Services: assessment"
Cohesion: 0.15
Nodes (21): AssessmentResultScreen(), GRADIENT, RadarChart(), styles, ASSESSMENT_PLAYLIST, AssessmentResult, buildRecommendations(), Domain (+13 more)

### Community 19 - "Services: vocab"
Cohesion: 0.14
Nodes (21): Direction, GamePhase, GRADIENT, styles, VOCAB_BENEFITS, addCustomWords(), allCards(), buildQueue() (+13 more)

### Community 20 - "Set: rules"
Cohesion: 0.10
Nodes (22): allCards(), buildBoard(), Card, COLOR_HEX, COLORS, ColorType, COUNTS, CountType (+14 more)

### Community 21 - "Utils: gradient"
Cohesion: 0.11
Nodes (17): GRADIENT, styles, SUB_GAMES, GamePhase, GO_BENEFITS, GRADIENT, styles, GameMode (+9 more)

### Community 22 - "Hooks: corsi"
Cohesion: 0.12
Nodes (19): CORSI_BENEFITS, CORSI_RULES, CorsiGame(), GamePhase, GRADIENT, levelParams(), Mode, POS (+11 more)

### Community 23 - "Data: words"
Cohesion: 0.16
Nodes (19): ANAGRAM_BENEFITS, GamePhase, GRADIENT, shuffle(), styles, ANAGRAM_THEMES, EN_WORDS_4, EN_WORDS_5 (+11 more)

### Community 24 - "Pattern: gradient"
Cohesion: 0.20
Nodes (20): AMBIGUOUS_ITEMS, Difficulty, GamePhase, genArithmetic(), genCubes(), genFibonacci(), genGeometric(), genGrowingDiff() (+12 more)

### Community 25 - "Services: feedback"
Cohesion: 0.20
Nodes (20): beep(), fbAchievement(), fbComplete(), fbCorrect(), fbStimulus(), fbWrong(), getAudioCtx(), MUSIC_NOTES (+12 more)

### Community 26 - "Color: wcst"
Cohesion: 0.12
Nodes (19): Card, Color, COLOR_HEX, COLOR_HEX_CB, COLORS, Count, COUNTS, GamePhase (+11 more)

### Community 27 - "Letters: switching"
Cohesion: 0.13
Nodes (18): ALL_LETTERS, Difficulty, DIGITS, GamePhase, genStim(), GRADIENT, judgeLeft(), LETTERS (+10 more)

### Community 28 - "Juice: goods"
Cohesion: 0.18
Nodes (16): GamePhase, generate(), GOOD_SETS, GOOD_SPRITES, GOODS_BENEFITS, GoodsSortGame(), GRADIENT, gridFor() (+8 more)

### Community 29 - "Services: listening"
Cohesion: 0.23
Nodes (16): GamePhase, GRADIENT, levelParams(), ListeningSpanGame(), pickWords(), shuffle(), styles, sndCorrect() (+8 more)

### Community 30 - "Services: settings"
Cohesion: 0.23
Nodes (16): CATEGORY_EMOJI, SettingsScreen(), styles, BackupFile, buildBackupJSON(), downloadBackup(), pickAndRestoreBackup(), restoreBackupJSON() (+8 more)

### Community 31 - "Translations: languagecontext"
Cohesion: 0.15
Nodes (12): LANG_CODES, Language, LanguageContext, LanguageContextType, LanguageProvider(), OVERLAYS, Translations, t (+4 more)

### Community 32 - "Styles: story"
Cohesion: 0.12
Nodes (14): Cell, COUNTER_BENEFITS, GamePhase, GRADIENT, styles, GamePhase, GRADIENT, STORIES (+6 more)

### Community 33 - "All: find"
Cohesion: 0.14
Nodes (16): COLORS_ALL, Difficulty, FIND_CONJ, FIND_TXT, GamePhase, GRADIENT, Item, levelParams() (+8 more)

### Community 34 - "Башня: анаграммы"
Cohesion: 0.12
Nodes (16): Словарь игры «Анаграммы» (1038 слов, RU/EN), Анаграммы, BART: риск-баллон, Ханойская башня, Iowa: 4 колоды, Логика и решения (Logic & Decisions), Ментальная ротация, Паттерны: мышление (+8 more)

### Community 35 - "Services: achievements"
Cohesion: 0.22
Nodes (14): AchievementsScreen(), styles, Achievement, ACHIEVEMENT_REWARD, ACHIEVEMENTS, checkNewAchievements(), Context, evalCondition() (+6 more)

### Community 36 - "Ball: gradients"
Cohesion: 0.18
Nodes (15): Ball, BALL_GRADIENTS, BALL_GRADIENTS_CB, bfsMin(), cloneState(), CURRENT_CAPS, Difficulty, GamePhase (+7 more)

### Community 37 - "Торможение: хаб"
Cohesion: 0.17
Nodes (16): Конфликт внимания (хаб), Выбор-реакция, Считалка: счёт, Фланкер: стрелки, Go / No-Go, Торможение (хаб), Математический спринт, Числовые пары: счёт (+8 more)

### Community 38 - "Services: lexical"
Cohesion: 0.20
Nodes (13): GamePhase, GRADIENT, LD_BENEFITS, styles, Trial, CONSONANTS, generatePseudowords(), realWords() (+5 more)

### Community 39 - "Mahjong: gradient"
Cohesion: 0.21
Nodes (14): buildPositions(), GamePhase, generate(), GRADIENT, isFree(), levelParams(), MAHJONG_BENEFITS, MAHJONG_RULES (+6 more)

### Community 40 - "Expo: tsconfig"
Cohesion: 0.13
Nodes (14): compilerOptions, paths, strict, types, extends, include, @/*, ./* (+6 more)

### Community 41 - "Contexts: bart"
Cohesion: 0.14
Nodes (12): BART_BENEFITS, Difficulty, GamePhase, GRADIENT, MAX_BURST_BY_DIFF, styles, darkTheme, lightTheme (+4 more)

### Community 42 - "Sudoku: samurai"
Cohesion: 0.22
Nodes (12): Cell, CELLS, countSolutions(), GamePhase, generatePuzzle(), GRADIENT, GRIDS, gridsOf() (+4 more)

### Community 43 - "Services: levelcleared"
Cohesion: 0.26
Nodes (10): LevelCleared(), Props, styles, cleanRunBonus(), getCleanRun(), load(), tickCleanRun(), resetLevelStreak() (+2 more)

### Community 44 - "Json: expo"
Cohesion: 0.15
Nodes (12): baseUrl, typedRoutes, expo, experiments, icon, name, newArchEnabled, orientation (+4 more)

### Community 45 - "Services: math"
Cohesion: 0.19
Nodes (12): Difficulty, GamePhase, generateProblem(), GRADIENT, MATH_BENEFITS, MathSprintGame(), MS_RULES, Op (+4 more)

### Community 46 - "Ospan: letters"
Cohesion: 0.19
Nodes (12): Equation, GamePhase, GRADIENT, LETTERS_EN, LETTERS_RU, levelParams(), makeEquation(), OSPAN_BENEFITS (+4 more)

### Community 47 - "Constants: pairs"
Cohesion: 0.21
Nodes (12): Card, GameMode, GamePhase, GRADIENT, levelCfg(), PAIRS_BENEFITS, PAIRS_RULES, PicturePairsGame() (+4 more)

### Community 48 - "Pseudoword: echo"
Cohesion: 0.21
Nodes (12): buildRounds(), CONSONANTS, GamePhase, GRADIENT, levelParams(), makeOptions(), mutateOnce(), Round (+4 more)

### Community 49 - "Stroop: emotional"
Cohesion: 0.17
Nodes (12): COLOR_HEX, COLORS_RGB, GamePhase, GRADIENT, makeTrial(), rndItem(), STROOP2_BENEFITS, styles (+4 more)

### Community 50 - "Contexts: react"
Cohesion: 0.19
Nodes (9): NotificationTapHandler(), RootLayoutNav(), react, styles, UnlockEventDetail, UnlockToast(), UpdateGate(), ThemeProvider() (+1 more)

### Community 51 - "Память: span"
Cohesion: 0.19
Nodes (13): Кубики Корси, Запомни цифры, Память (Memory), Матрица памяти, Мнемоника: порядок, N-back: оперативная память, OSpan: счёт+память, Парные картинки (+5 more)

### Community 52 - "Community 52"
Cohesion: 0.17
Nodes (12): v1.13.2, v1.13.3, v1.13.4, v1.14.0, v1.15.0, v1.16.0, v1.17.0, v1.18.0 (+4 more)

### Community 53 - "Community 53"
Cohesion: 0.17
Nodes (12): v1.22.1, v1.22.2, v1.22.3, v1.22.4, v1.22.5, v1.23.0, v1.24.0, v1.24.1 (+4 more)

### Community 54 - "Ant: gradient"
Cohesion: 0.18
Nodes (11): ANT_BENEFITS, Congruence, CueType, Direction, GamePhase, GRADIENT, makeTrial(), Position (+3 more)

### Community 55 - "Rmet: eye"
Cohesion: 0.17
Nodes (10): EYE_IMG, EYE_PARAMS, EyeItem, EyeP, GamePhase, GRADIENT, ITEMS, RMET_BENEFITS (+2 more)

### Community 56 - "Simon: gradient"
Cohesion: 0.18
Nodes (11): correctSide(), Difficulty, GamePhase, GRADIENT, makeTrial(), Position, SI_BENEFITS, StimColor (+3 more)

### Community 57 - "Services: gameresult"
Cohesion: 0.21
Nodes (8): GameResult(), GameResultProps, gradientIsLight(), styles, Props, styles, ShareOutcome, shareResult()

### Community 58 - "Workflows: job"
Cohesion: 0.23
Nodes (12): CI job: android, CI job: macos-arm, CI job: play-deploy, CI job: release, CI job: smoke, CI job: typecheck, CI job: web-deploy, Android (+4 more)

### Community 59 - "Expo: react"
Cohesion: 0.18
Nodes (11): axios, expo-image, expo-splash-screen, dependencies, axios, expo-image, expo-splash-screen, react-native-gesture-handler (+3 more)

### Community 60 - "Community 60"
Cohesion: 0.18
Nodes (11): v1.0.0, v1.1.0, v1.1.1, v1.1.2, v1.1.3, v1.2.0, v1.2.1, v1.2.2 (+3 more)

### Community 61 - "Inhibition: gradient"
Cohesion: 0.18
Nodes (10): BENEFITS, Difficulty, GamePhase, GngStimulus, GRADIENT, SsState, STOP_DIFF, StopCfg (+2 more)

### Community 62 - "Posner: gradient"
Cohesion: 0.18
Nodes (10): CueValidity, Difficulty, GamePhase, GRADIENT, makeTrial(), POSNER_BENEFITS, Side, styles (+2 more)

### Community 63 - "Services: levelprogressmap"
Cohesion: 0.29
Nodes (8): LevelProgressMap(), Props, styles, LevelStarsSummary, getLevelStars(), key(), saveLevelStars(), StarsMap

### Community 64 - "108: 107"
Cohesion: 0.20
Nodes (10): v1.100.0, v1.101.0, v1.102.0, v1.103.0, v1.104.0, v1.105.0, v1.106.0, v1.107.0 (+2 more)

### Community 65 - "114: 117"
Cohesion: 0.20
Nodes (10): v1.109.0, v1.110.0, v1.111.0, v1.112.0, v1.113.0, v1.114.0, v1.114.1, v1.115.0 (+2 more)

### Community 66 - "Community 66"
Cohesion: 0.20
Nodes (10): v1.10.0, v1.11.0, v1.12.0, v1.13.0, v1.13.1, v1.6.1, v1.7.0, v1.8.0 (+2 more)

### Community 67 - "Community 67"
Cohesion: 0.20
Nodes (10): v1.85.0, v1.85.1, v1.86.0, v1.86.1, v1.86.2, v1.87.0, v1.88.0, v1.88.1 (+2 more)

### Community 68 - "Eye: gym"
Cohesion: 0.20
Nodes (9): DIRECTIONS, dotFor(), EYE_BENEFITS, GamePhase, GRADIENT, Pattern, SEQUENCE, Step (+1 more)

### Community 69 - "Flanker: gradient"
Cohesion: 0.20
Nodes (9): Difficulty, Direction, FL_BENEFITS, GamePhase, GRADIENT, makeTrial(), styles, Trial (+1 more)

### Community 70 - "Pairs: phoneme"
Cohesion: 0.20
Nodes (9): buildTrials(), GamePhase, GRADIENT, LANG_NAMES, levelParams(), MINIMAL_PAIRS, styles, TARGET_LANGS (+1 more)

### Community 71 - "Prl: cfg"
Cohesion: 0.20
Nodes (9): Cfg, Choice, DIFF_CFG, Difficulty, GamePhase, GRADIENT, PRL_BENEFITS, styles (+1 more)

### Community 72 - "Scripts: keygen"
Cohesion: 0.38
Nodes (9): formatDate(), generateCode(), hmac(), interactiveMode(), main(), parseArgs(), printHelp(), PROFILE_CODES (+1 more)

### Community 73 - "Apple: путь"
Cohesion: 0.22
Nodes (9): Age Rating анкета, ASC keywords, App Store listing kit, App Privacy nutrition label, Screenshots spec, Apple credentials, Нативная сборка iOS через EAS, Путь A — скриншоты (без Apple) (+1 more)

### Community 74 - "Community 74"
Cohesion: 0.22
Nodes (9): v1.30.17, v1.30.18, v1.30.19, v1.30.20, v1.30.22, v1.30.25, v1.30.26, v1.30.27 (+1 more)

### Community 75 - "Choice: gradient"
Cohesion: 0.22
Nodes (8): ARROW_ICON, CHOICE_BENEFITS, Direction, DIRECTIONS, GamePhase, GRADIENT, Mode, styles

### Community 76 - "Number: bonds"
Cohesion: 0.25
Nodes (8): Difficulty, GamePhase, GRADIENT, makePuzzle(), NB_BENEFITS, Puzzle, shuffle(), styles

### Community 77 - "Quick: count"
Cohesion: 0.28
Nodes (8): Dot, GamePhase, GRADIENT, levelParams(), QUICKCOUNT_BENEFITS, QuickCountGame(), scatterDots(), styles

### Community 78 - "Stop: signal"
Cohesion: 0.22
Nodes (8): DIFF, Difficulty, DifficultyCfg, GamePhase, GRADIENT, SignalState, STOP_BENEFITS, styles

### Community 79 - "Trail: making"
Cohesion: 0.25
Nodes (8): GamePhase, GRADIENT, makeNodes(), Mode, Node, rand(), styles, TRAIL_BENEFITS

### Community 80 - "Scripts: build"
Cohesion: 0.22
Nodes (7): __dirname, dist, lines, MD, OUT, OVERRIDE, THEME_RULES

### Community 81 - "Scripts: reset"
Cohesion: 0.22
Nodes (7): exampleDirPath, fs, oldDirs, path, readline, rl, root

### Community 82 - "Constants: gamecard"
Cohesion: 0.33
Nodes (7): GameCard(), GameCardProps, gradientIsLight(), styles, GAME_ICONS, gameIcon(), gameIconByNameKey()

### Community 83 - "Community 83"
Cohesion: 0.25
Nodes (8): v1.26.1, v1.27.0, v1.28.0, v1.29.0, v1.29.1, v1.29.2, v1.29.3, v1.30.0

### Community 84 - "Community 84"
Cohesion: 0.25
Nodes (8): v1.30.1, v1.30.2, v1.30.3, v1.30.4, v1.30.5, v1.30.6, v1.30.7, v1.30.8

### Community 85 - "Community 85"
Cohesion: 0.25
Nodes (8): v1.30.10, v1.30.11, v1.30.12, v1.30.13, v1.30.14, v1.30.15, v1.30.16, v1.30.9

### Community 86 - "Community 86"
Cohesion: 0.25
Nodes (8): v1.36.0, v1.37.0, v1.38.0, v1.39.0, v1.40.0, v1.41.0, v1.42.0, v1.43.0

### Community 87 - "Community 87"
Cohesion: 0.25
Nodes (8): v1.44.0, v1.45.0, v1.46.0, v1.47.0, v1.48.0, v1.49.0, v1.50.0, v1.51.0

### Community 88 - "Community 88"
Cohesion: 0.25
Nodes (8): v1.52.0, v1.53.0, v1.54.0, v1.55.0, v1.56.0, v1.57.0, v1.58.0, v1.59.0

### Community 89 - "Community 89"
Cohesion: 0.25
Nodes (8): v1.60.0, v1.61.0, v1.62.0, v1.63.0, v1.64.0, v1.65.0, v1.66.0, v1.67.0

### Community 90 - "Community 90"
Cohesion: 0.25
Nodes (8): v1.91.0, v1.92.0, v1.93.0, v1.94.0, v1.95.0, v1.96.0, v1.97.0, v1.98.0

### Community 91 - "Deck: iowa"
Cohesion: 0.25
Nodes (7): Deck, DECK_INFO, GamePhase, GRADIENT, IGT_BENEFITS, LOSS_PATTERNS, styles

### Community 92 - "Reading: span"
Cohesion: 0.25
Nodes (7): GamePhase, GRADIENT, RS_BENEFITS, SentenceItem, SENTENCES, shuffle(), styles

### Community 93 - "Sdmt: gradient"
Cohesion: 0.25
Nodes (7): GamePhase, GRADIENT, KeyMap, SDMT_BENEFITS, shuffle(), styles, SYMBOLS

### Community 94 - "Внимание: attention"
Cohesion: 0.25
Nodes (8): ANT: 3 сети внимания, Внимание (Attention), CPT: устойчивое внимание, Найди отличия, Posner Cuing, Корректура: фокус, Шульте: внимание, Визуальный поиск

### Community 95 - "Letters: phonemic"
Cohesion: 0.29
Nodes (6): EN_LETTERS, FLU_BENEFITS, GamePhase, GRADIENT, RU_LETTERS, styles

### Community 96 - "Stroop: gradient"
Cohesion: 0.29
Nodes (6): COLORS_DEF, GamePhase, GRADIENT, Mode, STROOP_BENEFITS, styles

### Community 97 - "Scripts: gen"
Cohesion: 0.29
Nodes (6): BLOCKS, LANGS, MAP, missing, out, SITE

### Community 98 - "Scripts: smoke"
Cohesion: 0.33
Nodes (6): CLICKS, failed, IGNORE, isNoise(), results, routes

### Community 99 - "Constants: gamehelpoverlay"
Cohesion: 0.33
Nodes (5): DEEP_LABELS, PROSE_KEYS, styles, HELP_MAP, HelpEntry

### Community 100 - "Community 100"
Cohesion: 0.33
Nodes (6): v1.2.6, v1.3.0, v1.4.0, v1.4.1, v1.5.0, v1.6.0

### Community 101 - "Community 101"
Cohesion: 0.33
Nodes (6): v1.30.29, v1.30.30, v1.30.31, v1.30.32, v1.30.33, v1.31.0

### Community 102 - "Community 102"
Cohesion: 0.33
Nodes (6): v1.73.0, v1.74.0, v1.75.0, v1.76.0, v1.77.0, v1.78.0

### Community 103 - "Community 103"
Cohesion: 0.33
Nodes (6): v1.79.0, v1.80.0, v1.81.0, v1.82.0, v1.83.0, v1.84.0

### Community 104 - "Android: adaptiveicon"
Cohesion: 0.33
Nodes (6): backgroundColor, foregroundImage, adaptiveIcon, edgeToEdgeEnabled, package, android

### Community 105 - "Expo: plugins"
Cohesion: 0.33
Nodes (6): plugins, expo-font, expo-image, expo-notifications, expo-status-bar, expo-web-browser

### Community 106 - "Ai-Insight: anthropic"
Cohesion: 0.33
Nodes (3): ANTHROPIC_KEY, CORS, json()

### Community 107 - "Community 107"
Cohesion: 0.40
Nodes (5): v1.32.0, v1.32.1, v1.33.0, v1.34.0, v1.35.0

### Community 108 - "Community 108"
Cohesion: 0.40
Nodes (5): v1.68.0, v1.69.0, v1.70.0, v1.71.0, v1.72.0

### Community 109 - "Config: metro"
Cohesion: 0.40
Nodes (4): config, { FileStore }, { getDefaultConfig }, path

### Community 110 - "Orientationguard: txt"
Cohesion: 0.50
Nodes (4): LANDSCAPE_OK, OrientationGuard(), styles, TXT

### Community 111 - "Ios: supportstablet"
Cohesion: 0.50
Nodes (4): ios, buildNumber, bundleIdentifier, supportsTablet

### Community 112 - "Web: bundler"
Cohesion: 0.50
Nodes (4): web, bundler, favicon, output

### Community 114 - "Expo: architecture"
Cohesion: 0.67
Nodes (3): Expo app scaffold, Architecture (Tauri + Expo/RN), Code signing (Android/macOS/Win)

## Knowledge Gaps
- **816 isolated node(s):** `name`, `slug`, `version`, `orientation`, `icon` (+811 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **38 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `dependencies` connect `Expo: react` to `Expo: system`, `Expo: vector`, `Expo: web`, `React: dom`, `Jest: react`, `React: native`, `Async: storage`, `React: native`, `React: native`, `React: native`, `React: native`, `React: native`, `React: native`, `React: native`, `React: native`, `React: native`, `React: navigation`, `React: navigation`, `React: navigation`, `Supabase`, `Tauri: apps`, `Tauri: apps`, `Zustand`, `Contexts: react`, `Babel: plugin`, `Expo`, `Expo: blur`, `Expo: constants`, `Expo: font`, `Expo: haptics`, `Expo: linear`, `Expo: linking`, `Expo: ngrok`, `Expo: notifications`, `Expo: router`, `Expo: status`, `Expo: symbols`?**
  _High betweenness centrality (0.092) - this node is a cross-community bridge._
- **Why does `react` connect `Contexts: react` to `Constants: profiles`, `Contexts: anagramgame`, `Expo: react`, `Services: settings`?**
  _High betweenness centrality (0.090) - this node is a cross-community bridge._
- **Why does `useLanguage()` connect `Contexts: anagramgame` to `Services: sudoku`, `Services: styles`, `Constants: profiles`, `Services: level`, `Juice: styles`, `Services: weekday`, `Cpt: rules`, `Services: level`, `Services: daily`, `Constants: gradient`, `Chess: name`, `Hooks: styles`, `Iso: mental`, `Constants: pair`, `Services: styles`, `Services: assessment`, `Services: vocab`, `Set: rules`, `Utils: gradient`, `Hooks: corsi`, `Data: words`, `Pattern: gradient`, `Color: wcst`, `Letters: switching`, `Juice: goods`, `Services: listening`, `Services: settings`, `Translations: languagecontext`, `Styles: story`, `All: find`, `Services: achievements`, `Ball: gradients`, `Services: lexical`, `Mahjong: gradient`, `Contexts: bart`, `Sudoku: samurai`, `Services: math`, `Ospan: letters`, `Constants: pairs`, `Pseudoword: echo`, `Stroop: emotional`, `Contexts: react`, `Ant: gradient`, `Rmet: eye`, `Simon: gradient`, `Services: gameresult`, `Inhibition: gradient`, `Posner: gradient`, `Eye: gym`, `Flanker: gradient`, `Pairs: phoneme`, `Prl: cfg`, `Choice: gradient`, `Number: bonds`, `Quick: count`, `Stop: signal`, `Trail: making`, `Constants: gamecard`, `Deck: iowa`, `Reading: span`, `Sdmt: gradient`, `Letters: phonemic`, `Stroop: gradient`, `Constants: gamehelpoverlay`, `Orientationguard: txt`?**
  _High betweenness centrality (0.087) - this node is a cross-community bridge._
- **What connects `name`, `slug`, `version` to the rest of the system?**
  _817 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Services: sudoku` be split into smaller, more focused modules?**
  _Cohesion score 0.0546583850931677 - nodes in this community are weakly interconnected._
- **Should `Services: styles` be split into smaller, more focused modules?**
  _Cohesion score 0.061016949152542375 - nodes in this community are weakly interconnected._
- **Should `Constants: profiles` be split into smaller, more focused modules?**
  _Cohesion score 0.06717687074829932 - nodes in this community are weakly interconnected._