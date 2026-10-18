# PsyGames 2.56.31 — доставка удалённой поддержки Судоку

18.10.2026 · psygames-codex-mac.
Поддержка: `3d5255bc-2168-41f2-91f7-973520bac00c`;
доставка: `6cc82c0a-aa0b-448a-91be-e721a17de591`.
Основание — прямое повторное «делай» Дениса после отчёта о готовом сервере,
PR353, необходимости новой сборки и SMTP.

## Состояние

PR https://github.com/donosov999-ai/psygames-native/pull/353 **влит**
18.10.2026 16:47:42 UTC: main `9a9b1deda8b384512a9d3bd7cdc8a0231adec544`.
Финальный проверенный источник — `432bd6188b2daa3222cb888de1b1501dfbeffffd`,
ветка `codex/remote-level-support-20261018`. `git diff` подтвердил полное
равенство дерева этого SHA и merge-коммита. Ветка заморожена для носителей.
Предыдущая release-preparation ветка не используется для новой доставки.
Версия согласована в app.json/package.json/package-lock.json/tauri.conf.json;
Flutter workflows берут её из app.json. Play versionCode2056031.

Полные CI на финальном SHA завершены SUCCESS:

- [Веб-CI 39144021285](https://github.com/donosov999-ai/psygames-native/actions/runs/39144021285):
  18 успешных проверок; нецелевые платформенные jobs пропущены.
- [Flutter CI 39144021282](https://github.com/donosov999-ai/psygames-native/actions/runs/39144021282):
  analyze clean, **4376 PASS / 7 SKIP**; practice_kit analyze clean + **24 PASS**;
  контрольные APK/AAB собраны. Это полный набор, не ограниченные 241 проверки.

Оба магазина подтвердили приёмку; проверка физических телефонов отдельно:

- [TestFlight 39146663499](https://github.com/donosov999-ai/psygames-native/actions/runs/39146663499):
  **SUCCESS**, фактический номер **71**, 2.56.31, `cloud=true`.
  Пробы16:53:02–17:31:33UTC, IPA17:31:41–17:35:41UTC;
  VERIFY SUCCEEDED17:37:10UTC, UPLOAD SUCCEEDED17:38:34UTC.
  100405516байт; Delivery UUID `58d44ac2-56c2-421d-b621-47ada115b1ca`.
  Независимый App Store Connect readback17:55UTC:
  **VALID / IN_BETA_TESTING / Свои / assigned=true**.
  Receipt: `_local/ecosystem-cloud/testflight-2.56.31-71-readback.json`.
  Новых приглашений тестерам не отправляли. Это не проверка приложения на телефоне.
  17:56UTC исправлено только английское What to Test (en-US); ru не менялся,
  повторный readback подтвердил английский текст и неизменность других локалей.
  Receipt: `_local/ecosystem-cloud/testflight71-en-notes-receipt.json`.
- [Android BUILD_ONLY 39144265625](https://github.com/donosov999-ai/psygames-native/actions/runs/39144265625):
  **SUCCESS**, run number72, 2.56.31 / 2056031, `cloud=true`; публикация выключена.
  Этот номер прогона не является Android versionCode или номером TestFlight.
- После SMTP PASS17:10UTC запущен [Play39148328875](https://github.com/donosov999-ai/psygames-native/actions/runs/39148328875):
  `from_run=39144265625`, production100%, `confirm_production=yes-100`,
  frozen432bd6188. Это заливка того же проверенного AAB, без пересборки.
  **SUCCESS**: commit17:11:32UTC. Независимый Android Publisher readback
  17:12:48UTC: production release2.56.31/status=completed/[2056031],
  RU/EN notes соответствуют новой поддержке; bundle SHA256 точно совпал
  с аудированным AAB `5ca41c952ebf1d2c9472a30538e3c8d59a78334dad1fbba9589560ad058bfbfe`.
  Receipt: `_local/ecosystem-cloud/play-2.56.31-2056031-readback.json`.
  Это принятие store API, не факт появления обновления на конкретном телефоне.

Оба процесса закреплены за432bd6188. Приглашения тестерам повторно не отправляли.
Upload, Apple VALID/группа и Play track проверены отдельно; телефон не проверен.

### Android: проверка готового носителя

Артефакт GitHub `12144120564`, `flutter-hybrid-aab`, получен локально;
SHA256 скачанного ZIP **совпал** с GitHub digest. APK и AAB имеют
`com.psygames.app`, **2.56.31 / 2056031**. `apksigner` подтверждает APK v2;
сертификат совпал с прежним2.56.30 и с AAB:
`6d8025f2e51a9c70606220d44b1d2a64a76b587f4982cd9ca093d584b98f9280`.
`bundletool1.18.3 validate` PASS, AAB `jarsigner`: `jar verified`.
JDK предупреждает о self-signed цепочке и JarInputStream-порядке manifest;
те же предупреждения воспроизведены на прежнем2.56.30, их не скрывали.
Это не независимая приёмка Google Play.

| Носитель | SHA256 |
| --- | --- |
| ZIP | `4b31d6fb791e582073029be5b081e30ca855c4b771516544648ef6dcf78f60ea` |
| AAB, 154081048байт | `5ca41c952ebf1d2c9472a30538e3c8d59a78334dad1fbba9589560ad058bfbfe` |
| APK, 160570983байт | `2549ab265923a1dc0472dd1b3d6ffd60b8e28ce82d23cb93868aa61983b557f6` |

В нативных libapp.so всех3ABI обоих пакетов обнаружены новый support-код,
утверждённый проект и public client. Поиск фактических значений трёх конкретных
секретов (service credential, Timeweb API credential, новый SMTP password;
UTF8/UTF16LE/UTF16BE) во всех распакованных entries ничего не нашёл. Это
ограниченная проверка известных значений, не общий security-аудит.
Локальный receipt: `_local/ecosystem-cloud/android-2.56.31.PZO210/artifact-audit.json`;
рядом bundletool/jarsigner-логи. На телефоне/APK-эмуляторе этот выпуск не запускали.

### iOS: проверка готового носителя

Артефакт `12144782533`/`flutter-hybrid-ipa` получен из того же run39146663499.
SHA256 ZIP совпал с GitHub digest:
`7ebbe987856adafc5a293e9e855de4b26e2c043afe9a23a9ce93a5cf6b48c5fd`.
IPA100405516байт, SHA256:
`197ccc0a0e1bcbdf7cd25cac3f6c3ac4375b8915e974c9bbb49a1e5ecce12fb8`.
В настоящем Info.plist: com.psygames.app/2.56.31/71 и точная callback scheme.
В App.framework/App найдены support grants/corrections, утверждённый проект
и publishable client. Поиск тех же трёх фактических секретных значений
во всех распакованных entries (UTF8/UTF16LE/UTF16BE) — ничего не найдено.
Это ограниченный known-value поиск, не полный security-аудит.
Receipt: `_local/ecosystem-cloud/ios-2.56.31.kqISka/artifact-audit.json`.
`codesign --verify --deep --strict --verbose=2` распакованного Runner.app —
exit0, valid on disk / satisfies its Designated Requirement.
Ни IPA, ни Android-пакеты на устройства не устанавливались этим чатом.

Проверки/приёмка и операторские команды —
[SUDOKU_REMOTE_SUPPORT_REF.md](SUDOKU_REMOTE_SUPPORT_REF.md).
Сборка70/2.56.30 этой функции НЕ содержит. Ни её повторной заливки, ни
продвижения старого AAB за новый функционал не делать.

Android build-only запущен параллельно финальному CI, без публикации. Полные CI
затем завершились и PR был влит; TestFlight запущен после этого. Публичная
облачная доставка и SMTP затем проверены отдельными квитанциями выше/ниже.

## Почта

Выбор провайдера `76a5eb7d-8dbc-405a-a1f1-96fbb8eead41` закрыт после прямого
решения Дениса. **Исполнение SMTP также закрыто17:10UTC**:
`fd253372-8fca-408c-9515-5352cdeb931b`; журнал `c899c538-ac57-4f96-8b10-3766669c5f71`.
Канонический сайт — **psy-games.pro** (с дефисом), его текущие MX — Zoho.
Ранняя read-only проверка другого домена `psygames.pro` к этому сайту не
относится; использовать её для настройки нельзя. DNS обоих доменов не меняли.
Выбранная ниже отдельная SMTP-почта находится на asibots.pro.

Первоначальная проверка18.10: существующий GitHub-вход вернул доступ к Supabase;
https://supabase.com/dashboard/project/iuvvheeocobhiothfgei/auth/smtp показывает
`Toggle SMTP = false`. Провайдер не настроен. В разрешённом хранилище готовой
SMTP-конфигурации не найдено; значения секретов не выводились.
Страница оставлена пользователю для защищённого ввода реквизитов. Вход в
панель разработчика не является входом Вали и не устраняет почтовый блокер.
Денис сначала выбрал существующий info@asibots.pro, но сообщил, что его пароль
неизвестен. Пароль этого ящика не сбрасывали. Несохранённый черновик SMTP
отменили, чтобы включённый переключатель формы не выдавался за серверный факт.

Затем Денис прямо разрешил отдельный **login@asibots.pro до120руб/мес**.
Ящик создан в Timeweb: POST201 и точный GET200. TLS-сертификат и SMTP AUTH
новой учётной записи проверены успешно. Пароль
сгенерирован и сохранён только в разрешённом локальном хранилище с правами600,
не в Git/журналах/чате. Существующий info, его пароль и DNS не менялись.
Домен уже имеет MX Timeweb и SPF. Текущий API требует поле `login`, тогда как
публичный SDK описывал `mailbox`; исправление сделано после отказа400 и точного
подтверждения отсутствия ресурса, не слепым повтором неопределённого создания.

**17:06UTC: Supabase SMTP сохранён** по ответу Дениса «делай сам».
Повторная загрузка Dashboard подтверждает Toggle SMTP=1, smtp.timeweb.ru:465,
PsyGames и неактивную Save changes. Пароль перенесён без вывода значения,
исходный локальный файл закрыт, временный буфер очищен.
Первый OTP17:06UTC был отправлен ещё со стандартного noreply@mail.app.supabase.io:
это подтверждено auth_logs/mail.send и заголовками нового собственного ящика,
поэтому его не засчитали за custom-SMTP PASS. После применения конфигурации
отдельный запрос17:09:49–17:10:04UTC подтвердил HTTP200 и получение письма
именно ОТ login@asibots.pro К login@asibots.pro в Timeweb INBOX.
Headers-only: ссылки/коды не читались и не открывались. Собственный synthetic
Auth-user удалён с readback404 в обоих опытах.
PASS receipt: `_local/ecosystem-cloud/smtp-supabase-probe-5ccd38d2-edba-452f-9c7e-ad2697c23c66.json`.
В принятом письме нет Authentication-Results: SPF/DKIM и внешняя Gmail-доставка
этим опытом не доказаны. Реальные игроки и Samsung/PKCE не проверялись.
Панель также показывает предупреждение Outstanding invoices; оплату и другие
биллинговые изменения этот чат не выполнял. По одному баннеру не определяли
срок отключения или состояние платежей.

## Не смешивать другую ветку

PR352 со старыми сведениями о2.56.30 пока OPEN и имеет реальный failed-gate:
`store-listing-count.test.ts` — marketing145 против старогоPUBLIC_GAME_COUNT131.
Это отдельная задача96b4b7c8 и канон игр/режимов, не повод подгонять число под
тест или обходить гейт. Непроверенный PR352 не вливали в поддержку.

## Остаток

- Android-носитель проверен, Play production acceptance и TestFlight71
  VALID/IN_BETA_TESTING/группа подтверждены независимыми readback.
  Видимость обновлений и поведение приложения на физических телефонах не проверены.
- SMTP сохранён; доставка через него собственному non-team адресу подтверждена.
  Samsung/PKCE и внешняя Gmail-доставка остаются отдельной проверкой.
- Валины реальные данные и разрешения не читали/не меняли. Её80 ещё не выдан.
- Не закрывать поддержку и общий облачный parent по одной подготовке релиза.
