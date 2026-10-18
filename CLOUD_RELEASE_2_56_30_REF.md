# PsyGames 2.56.30 — выпуск и облачные сведения

18.10.2026 · psygames-codex-mac · задача
`a87bbe94-fb12-46a1-a287-71b9bd896963`; общий backend
`bb2c9f30-d786-4fe6-b25c-4b2ace267d4b` остаётся OPEN.

## Подтверждено

- **Новая Google production-отправка 18.10:** после прямого «заливай» и
  «продложай» Дениса запущен upload-only
  [39140950390](https://github.com/donosov999-ai/psygames-native/actions/runs/39140950390),
  source `ed594a3f7b54d3d06baa2fca7863e401cb2655df`, track=production,
  confirm_production=yes-100, from_run=39069990585, cloud=true. Это тот же
  ранее проверенный AAB2056030, без пересборки/смены номера. Run **SUCCESS**;
  Google принял upload и commit. Независимый readback15:34:30UTC подтвердил
  production2.56.30/2056030/status=completed и SHA256 bundle, побайтно совпавший
  с проверенным AAB. `GOOGLE_PLAY_2_56_30_RECEIPT.json` хранит точные результаты.
  Первый readback вернул503; повторён только read, не upload. Это не проверка
  физического телефона/появления обновления у каждого пользователя. Новое
  распоряжение не закрывает проблему доставки облачных писем.

- **TestFlight2.56.30/build70 доставлен:** attempt2 SUCCESS. Независимый Apple
  readback18.10: build16c6fdcf-2d8d-4820-bf27-332d8d7d4f3d,
  processingVALID/internalIN_BETA_TESTING, assigned existing internal «Свои».
  Новых testerinvites не было. RU/EN notes перечитаны после исправления языка
  и явной пометки, что доставка облачных писем пока ограниченный пилот.
  `TESTFLIGHT_2_56_30_RECEIPT.json` содержит точные provider/artifact receipts.
  Физический телефон/вход пользователя этим не проверены.

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
  cloud=true, build70. **Attempt2 SUCCESS, Apple VALID/IN_BETA_TESTING/«Свои»**;
  этот этап выполнен, не запускать повторную отправку/новый номер.
  IPA сохранён локально, реальный bundleplist2.56.30/70/com.psygames.app и hashes
  проверены, archive4cdc8e5a…/IPA d9a180ba…; точные значения в receipt выше.
  История: **Attempt1 FAILED** после успешных полных Flutter tests,
  подписи, IPA build, binaryenginegate и Apple archivevalidation. Upload оборвался
  с NSURLErrorDomain-1004, сохранение IPA artifact — с ENOTFOUND. По независимому
  Apple API сборка70 ещё не найдена; её buildUpload16c6fdcf-2d8d-4820-bf27-332d8d7d4f3d
  AWAITING_UPLOAD/uploadedDate=null, доставлены только analyzerZIP и descriptionXML,
  не IPA. GitHub artifacts0; runnerIPA недоступен, его SHA не выдумывается.
  **Один bounded rerun attempt2** затем завершился успешно: тот же source/run/build70/cloudinput,
  без обхода тестов/смены workflow, номера, пользователей или настроек сервиса.
  Receipt `TESTFLIGHT_2_56_30_ATTEMPT1_RECEIPT.json`. Это не прежняя проблема
  Transporter/Defaults и не SMTP/AppPrivacy login. После попытки2 нужны отдельные
  VALID и существующая группа «Свои» теперь независимо подтверждены; приглашения
  не пересоздавались. Это не проверка пользователя на телефоне.
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
  Первоначально отправка ждала почтового gate; после нового прямого распоряжения
  Дениса18.10 тот же артефакт отправлен через from_run (run39140950390 выше).
  Не пересобирать и не менять versionCode вручную; не отправлять дубликат.
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
Первоначально Google production с cloud=true был приостановлен. После явного
повторного «заливай» Дениса18.10 отправка существующего пакета продолжена;
это не свидетельство готовности почты, не смена SMTP/Auth/ACL и не новое
разрешение на расходы. Подписанная сборка и TestFlight остаются отдельными
доказательствами от реального входа обычного пользователя.

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
