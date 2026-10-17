# PsyGames 2.56.30 — выпуск и облачные сведения

18.10.2026 · psygames-codex-mac · задача
`a87bbe94-fb12-46a1-a287-71b9bd896963`; общий backend
`bb2c9f30-d786-4fe6-b25c-4b2ace267d4b` остаётся OPEN.

## Подтверждено

- [PR351](https://github.com/donosov999-ai/psygames-native/pull/351)
  merged без обхода проверок. Полные PR CI38900182984 и38900183133 SUCCESS.
  Source PR `b9b97e2ff5a4b3c406d373b5440411fe4ebee598`, merge/main
  `ed594a3f7b54d3d06baa2fca7863e401cb2655df`.
  Main CI39069952596 и39069952691 теперь оба SUCCESS.
- Frozen SDK source `6ef80e0565a91b160fbd180f07b5920d9cb1b789`:
  Auth0.1.4 / account draft.5, cloud0.1.1. Точные package hashes —
  `ECOSYSTEM_ACCOUNT_DRAFT5_PIN.md`; исходный pin остальных приложений не заменён.
- G1 scoped legacy ACL/writer cutover, G2 fixed account-delete backend,
  G3 exact redirect allowlist выполнены. Подробности в трёх отдельных receipts.
  У G2 есть synthetic HTTP и настоящий Flutter VM/SDK save/preview/restore/delete;
  это не приёмка физического телефона и не готовность всех четырёх приложений.
- [Политика](https://psy-games.pro/privacy/), legacy `/privacy.html`,
  [удаление аккаунта](https://psy-games.pro/account-deletion/) опубликованы
  строго в разрешённом scope. Website PR2 merged, clean build и26 HTTPS/hash
  readbacks PASS; чужие незакоммиченные страницы не публиковались.
- Google Play: все12 описаний исправлены через два узких API edits и независимо
  перечитаны; Data Safety отправлена и находится **на проверке**. Это не approval
  и не доказательство публичной доступности нового бинарника.

## Запущено, но ещё не выдано за доставку

- [TestFlight39069987949](https://github.com/donosov999-ai/psygames-native/actions/runs/39069987949):
  cloud=true, signed build+upload workflow. При подготовке этого checkpoint
  ещё in_progress; номер build, VALID и существующая группа «Свои» требуют
  отдельного readback после окончания. Повторно добавлять Дениса в тестеры нельзя.
- [Android39069990585](https://github.com/donosov999-ai/psygames-native/actions/runs/39069990585):
  **SUCCESS**, cloud=true, **build_only=true**. Это только подписанный пакет,
  не Google upload: Google upload/продвижение/загрузка проверенного файла SKIPPED.
  Основной исполнитель скачал artifact12115558110, сверил SHA256 всего архива,
  отдельно AAB/APK и version2.56.30/code2056030 в обоих настоящих манифестах.
  APK v2signature и AAB jarsigner verification exit0, сертификаты совпадают;
  официальный Google bundletool1.18.3 validate exit0. Предупреждения jarsigner
  (self-signed/timestamp/JarInputStream manifest order) сохранены, не замолчаны.
  Полный фактологический receipt: `ANDROID_2_56_30_PACKAGE_RECEIPT.json`.
  APK для собственной проверки Дениса:
  `/Users/denisonosov/dev/psygames-game-lab/testflight-fixes-20261011/_local/ecosystem-cloud/android-2.56.30-mrWL7M/app-release.apk`.
  Установки/эмулятора/проверки телефона не было. Не удалять установленное
  приложение ради обхода несовпадения подписи APK без сохранения прогресса.
  После закрытия почтового gate загружать тот же артефакт через from_run,
  не пересобирать и не менять versionCode вручную.
- Apple App Privacy пока не обновлена в консоли: служебный UI просит вход.
  Локальные сведения `store/appstore/listing.md` не равны отправке Apple.

## Реальный оставшийся gate: письма входа обычным пользователям

18.10 live UI подтвердил custom SMTP OFF и отсутствие Send Email Auth Hook.
Стандартная почта Supabase ограничена участниками developer-team; письмо на
адрес владельца не проверяет вход Вали. Официальный источник:
[Supabase SMTP](https://supabase.com/docs/guides/auth/auth-smtp).
MX `psy-games.pro` у Zoho; существующий разрешённый SMTP credential не найден.
Создана отдельная decision-task `76a5eb7d-8dbc-405a-a1f1-96fbb8eead41`.
Нужно выбрать согласованный почтовый канал, задать credential в защищённых
настройках и проверить реальную доставку на согласованный адрес вне команды.
До этого Google production с cloud=true приостановлен. Подписанная Android
сборка и TestFlight для своей команды могут завершаться независимо.

Cloud build flag=true даёт настройку в приложении, но **не включает согласие**:
локальная игра остаётся режимом по умолчанию, нет скрытой регистрации/загрузки.
Копия содержит имя/вид питомца, заработанные баллы и покупки за баллы, прогресс,
историю. Это не платёжная система и не разрешение на публикацию рейтинга.

## Не смешивать с выпуском

- Удалённое открытие уровней Вале — отдельная3d5255bc и support-ветка.
  Ни account login, ни48 pure-Dart тестов не делают её готовой; SQL support
  не deployed, реальный телефон не исправлен.
- TypeFree TS/native deletion parity — отдельный кандидат, не приложение
  PsyGames2.56.30 и не основание закрывать общий четырёхприложенный backend.
- Предыдущий подтверждённый выпуск:2.56.29, Google2056029 completed,
  TestFlight69 VALID/«Свои», **cloud OFF**. Его receipts не использовать как
  доказательство доставки2.56.30.

Машиночитаемый scoped итог: `CLOUD_DISCLOSURES_20261018_RECEIPT.json`.
Обновлять этот файл и TeamOps после фактических store receipts, а не по старту CI.
