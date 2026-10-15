# PsyGames: учебный статус и восстановление доступа к L79

Дата: 15.10.2026. Автор: psygames-codex-mac.
Задача TeamOps: a9147430-dc91-4285-b41c-76c1586ac812 (не закрыта).
Checkout: /Users/denisonosov/dev/psygames-game-lab/testflight-fixes-20261011.
Ветка: codex/sudoku-practice-guard-20261015, основана на локальном кандидате
f5cd811891bf0540b3e455e9fd21fa1bce109ca4. Не считать этот кандидат main/выпуском.

## Подтверждённые факты

- Пользователь прислал две разные решённые доски L78 с учебным итогом. Он сообщает,
  что игрок не открывал учителя. Скриншоты не доказывают причину учебного зачёта.
- Свежий экспорт /Users/denisonosov/Downloads/psygames-backup-2026-10-15.json:
  app_version=2.56.27, exported_at=2026-10-15T18:45:25.546Z, профиль women, L78.
- В последних учебных завершениях psygames_sessions записано hint_uses=1;
  в реестре раскрытых досок появились решения обеих досок со скриншотов.
  Это доказательство записанного приложением состояния, НЕ доказательство намеренного
  нажатия человеком. По этим данным нельзя утверждать, что он заходил в учителя.
- В Flutter _hint/_openCell реальное открытие одной цифры выставляет hintsUsed и
  answersRevealed. Итог становится учебным даже без входа в отдельный разбор.
  Раньше предупреждения до раскрытия и постоянного статуса во время решения не было.

## Точечная правка бэкапа, не исправление приложения на телефоне

Результат: /Users/denisonosov/Downloads/psygames-backup-2026-10-15-valya-level-79.json.
Оригинал сохранён. Меняются только три строковых значения:

- psygames_sudoku_level_women: 78 → 79;
- psygames_leaderboard_personal_best_sudoku_level: 77 → 78;
- psygames_resume_sudoku_women: строка null (очистить продолжение прежней доски).

Не создавались выдуманные сессии, звёзды, очки, время или награды. История, реестр
раскрытий и все остальные ключи сохранены. JSON и точное сравнение с оригиналом
проверены. Импорт на телефон и открытие L79 человеком не проверены.

## Локальное изменение продукта

- Sudoku: до первого реального раскрытия цифры требуется подтверждение с текстом
  о том, что учебная попытка не повышает уровень/рейтинг. Отмена ничего не раскрывает,
  не списывает подсказку и не меняет зачёт. Клетка задания/уже верная клетка — no-op.
  Возврат из предупреждения проверяет исходную доску, выделение и mounted.
- Общий Flutter GameShell показывает «Учебная» по ТОМУ ЖЕ LessonUsed, который читает
  зачёт, а не по собственной догадке; обновляется при mark/reset без перезапуска.
  Есть поддержка fieldOnly. Sudoku передаёт свой долговечный _assisted, в том числе
  после восстановления, вместо глобального флага другой игры.
- Короткая подпись переведена на 12 языков через канонический веб-словарь и embed-l10n.
- В снимок для отзыва добавлено поле practice. Сами правила начисления не ослаблены.

Граница охвата: общий Flutter-каркас и его LessonUsed плюс собственный статус Sudoku.
Это НЕ доказательство, что все старые WEB-экраны и все собственные флаги решателей уже
подключены к единой индикации. Их аудит/проводку следует продолжить; не объявлять
«все 145 игр проверены» по этим тестам.

## Проверки и остаток

Первый прогон: 52 PASS в шести Flutter-наборах (общая отметка, изоляция учителя,
магазинные способности, перенос флага между партиями, кнопка/плеер и охват учителей).
Flutter analyze: No issues found. Добавлены проверки маленького экрана/увеличенного
текста и карандаша без раскрытия. Финальный прогон: 44 PASS в четырёх наборах
(practice_status_shell, sudoku_teacher_isolation, sudoku_resume, sudoku_modes_resume).
Наборы пересекаются с первым прогоном: числа не складывать. Переход L78→L79,
карандаш, отмена предупреждения и восстановление проверены совместно. 12 локалей
проверены на наличие подписи. git diff --check чист.

Дальше: интеграция в main/обычный выпуск, проверка на устройстве, аудит собственных
флагов решателей и WEB. На первом checkpoint push/PR/релиз ещё не были выполнены;
актуальный release checkpoint ниже. Импорт бэкапа на телефоне не подтверждён.

## Release checkpoint — 16.10.2026

LATEST:PR348 now head4d0916f81c8c83e6cbe9880fe5e9cbdf99168b13.
Previous full Flutter38791114939 FAILED: old sudoku_screen test did not confirm
the new disclosure warning; feedback test expected no practice metadata field.
Updated both exact expectations without weakening assertions; added explicit
check that the digit remains blank before confirmation. Both suites9PASS and
release-branch analyzer clean. Runtime code unchanged by this follow-up.
New full Flutter38795853188 and WEB38795853184 are running on new head.
New signed Play build_only38795880797:
https://github.com/donosov999-ai/psygames-native/actions/runs/38795880797.
Old build_only38793174360 cancellation requested; DO NOT upload its artifact.
No merge, Google upload/publication or TestFlight2.56.28 yet. Cloud remains separate.
GitHub push also reported62 default-branch dependency alerts (1critical/43high/
18moderate); this is an upstream warning, not an independent exploit audit or
proof of runtime impact. No unrelated dependency upgrades made here.
Details:https://github.com/donosov999-ai/psygames-native/security/dependabot.

Earlier checkpoint (superseded run/head states retained as history):

Для независимого срочного выпуска fix cherry-picked на main5481326a в ветку
codex/practice-release-2-56-28. PR348:
https://github.com/donosov999-ai/psygames-native/pull/348.
Версия2.56.28, headf9812dbbdb56134e2079266e5ad45e7e3d414aa5.
В неё НЕ входят ни незавершённое облако, ни прежний local WEB candidatef5.
Первый CI нашёл пропуск badge в10 канонических overlay словарях; исправлен без
ослабления coverage. WEB run38791114992 SUCCESS. Полный Flutter run38791114939
ещё идёт. Подписанная Android build_only38793174360 начата на том же head:
https://github.com/donosov999-ai/psygames-native/actions/runs/38793174360.
build_only НЕ заливает в Play. Merge/main checks, upload точного AAB в production,
TestFlight и подтверждение доступности существующей группе «Свои» ещё впереди.
Release task:9e865178-e150-436e-a96d-775160840081, in_progress, НЕ закрывать.
Точная причина фактического срабатывания подсказки у игрока остаётся предметом
проверки: не приписывать человеку использование подсказки только по hint_uses.

## Отдельное обсуждение облака (не реализация)

Денис спросил о добровольном хранении настроек/прогресса в облаке вместо обязательного
локального хранения. Предлагается local-first + включаемый облачный бэкап в существующем
Supabase. В проверенном api.ts уже есть отправка результатов в cognitive_sessions;
это не полноценное восстановление настроек/уровней аккаунта. В supabase.ts клиент
пока не использует Auth. До приватного восстановления нужны настоящая учётная запись,
правила доступа владельца, версии снимков, защита от отката и явное согласие/отключение.
Здесь сервер, Auth, RLS, согласия и текущая отправка данных не изменялись.

См. также [WEB_LAUNCH_OWNER_REF.md](WEB_LAUNCH_OWNER_REF.md) и
[DART_ACCOUNTING_BOUNDARY_REF.md](DART_ACCOUNTING_BOUNDARY_REF.md).
