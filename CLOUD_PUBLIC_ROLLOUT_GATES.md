# Public cloud rollout — отдельные разрешения Дениса

16.10.2026 · G1 AUTHORIZED / BLOCKED BY CONFIRMED SERVICE DEPENDENCY / NOT EXECUTED.
G2/G3 остаются proposed. Последняя фактическая проверка — ниже.
Основной исполнитель создал needs-decision 75d600c9-65d6-4c82-9f49-2476438d30be.
Изменяющие серверные операции G1–G3 всё ещё НЕ выполнены;
существующее local implementation ТЗ действует.
Среда: существующий personal-nzt (`iuvvheeocobhiothfgei`),
https://iuvvheeocobhiothfgei.supabase.co; это общая база, не staging.
Канон: [REF](/Users/denisonosov/dev/psygames-game-lab/testflight-fixes-20261011/ECOSYSTEM_CLOUD_V1_REF.md:111),
[PIN](/Users/denisonosov/dev/psygames-game-lab/testflight-fixes-20261011/ECOSYSTEM_CLOUD_V1_PIN.md:6),
SOURCE `057c03d7ba770fbee934918eddb87a88c28d0082`, Auth0.1.3/draft.4 + ecosystem.cloud/1.
Плавающий checkout и текущая PsyGames gateway/startup работа не заменяют этот pin.

Ниже gates публичного Auth/rollout, не запрет уже разрешённых local host/mock работ.
Первичный sidecar не делал DB-запросов. Основной исполнитель затем дополнил G1
живой metadata-only проверкой; никаких строк/credentials/server changes не было.
Метаданные, переданные владельцем как live-confirmed: обе `public`-таблицы
`translation_status`, `bugfix_project_owner`: RLS=false, authenticated SELECT=true,
anon SELECT=false. Sidecar независимо не перепроверял live-состояние; это риск
доступа вошедшего пользователя, не доказанный инцидент и не глобальный аудит PASS.

## G1. Legacy ACL: target-only service protection, не только SELECT

### Текущее решение и найденная зависимость — 16.10.2026, 08:13 UTC

Денис прямо ответил «делай» после предложения точечного security fix; разрешение
G1 записано в TeamOps: 02892b01-09aa-4067-bab8-d30ac64e37db. Нового разрешения
на тот же G1 не требуется. G2/G3 этим ответом не считаются согласованными.

До изменения прав найден НЕ гипотетический, а работающий клиент с ролью anon:

- Read-only SSH на 37.60.245.18: `systemctl is-active i18n-api.service` → active.
- Прочитан `/root/i18n/i18n_api.py`: `SB_KEY` берётся из `SUPABASE_ANON`;
  `write_status` передаёт этот ключ как apikey/Bearer в
  `/rest/v1/rpc/translation_status_set`.
- Только локально в процессе сервера разобран JWT из environment живого MainPID;
  наружу выведены лишь `runtime_key_present=true`, `runtime_database_role=anon`.
  Значения credentials не печатались, не сохранялись и не передавались.
- `write_status` перехватывает исключение и делает `pass`: после отзыва EXECUTE
  сам перевод может выглядеть успешным, но реестр перестанет обновляться.
- Код, environment, unit, данные и конфигурация этого сервиса НЕ изменялись;
  настоящая транскреация/LLM/запись статуса для проверки НЕ запускалась.

Поэтому согласованный service-dependency STOP сработал ДО SQL mutation.
Не подменять безопасное переключение выдачей полного service_role публичному
клиенту или неограниченному HTTP endpoint. Нужен server-only least-privilege
маршрут с подтверждением текущего production-владельца и планом отката.

Создана и перечитывается отдельная prerequisite-задача координатору
`teamops-claude-mac`: **584a68fd-0b29-4db9-a0d5-7fad7700534e**, Срочно,
срок 16.10.2026, parent bb2c9f30-d786-4fe6-b25c-4b2ace267d4b.
Создание задачи не означает принятия/выполнения адресатом.

Повторные metadata-only SQL подтвердили исходные ACL ниже, отсутствие явных
column ACL, memberships anon/authenticated/service_role и dependent views.
`translation_status_set` source MD5=f1dea3e75c9d045b8697a527b7790c60;
`bug_report_to_task` source MD5=54a81342160575fbb0a574e6343ac5ff.
Хеш non-target public relation/function/column/default ACL для контрольной сверки:
136465f04cc8f6c3065ea09de463aca7. Это только снимок, при чужих параллельных
изменениях требуется новый preflight, а не откат чужих ACL.
У targets anon/auth имеют также REFERENCES/TRIGGER/MAINTAIN: ALL PRIVILEGES
в предложении намеренно шире DML. Ни одна целевая операция пока не выполнена.

Mac: первая попытка CLI завершилась ENOSPC (df~102MiB). Без удаления файлов этим
чатом место позднее стало ~4.6GiB; повторный CLI `--version` работает (2.116.0).
Это не устранение системной причины заполнения диска и не разрешение на очистку.

### Live read-only preflight основного исполнителя 16.10

Никаких пользовательских строк/записей не читалось и не менялось. Проверены только
pg_class/pg_proc/pg_depend, grants и одна definition (SQL literals redacted):
оба table owner=postgres, RLS=false; authenticated SELECT=true; anon SELECT=false,
но у ОБЕИХ ролей на ОБЕИХ таблицах INSERT/UPDATE/DELETE/TRUNCATE=true.
service_role сохраняет SELECT и полный явный table grant. Значит прежние два
SELECT-only REVOKE недостаточны; это не только риск будущей регистрации.

public.translation_status_set(text,text,text,text,text,integer,integer,text):
SECURITY DEFINER owner=postgres, EXECUTE=true для anon/authenticated/service_role.
Тело — прямой upsert translation_status без проверки caller. Table REVOKE сам
по себе этот definer path НЕ закрывает. public.bug_report_to_task() тоже definer
owner=postgres, но EXECUTE=false anon/authenticated, true service_role.
Видимых pg_depend-dependent views для этих двух таблиц не найдено. Это не поиск
всех динамических/RPC путей и не полный security audit.

Локальный literal-name scan (rg, node_modules/.git/cache/build/Pods исключены):
в PsyGames repo и основном /Users/denisonosov/dev/psygames нет user-facing
consumer этих table names. Исторический служебный consumer bugfix_project_owner —
bug_report_to_task()/trg_bug_report_to_task:
[BUGFIX_ROUTING_CODEX.md](/Users/denisonosov/Documents/TeamOps/BUGFIX_ROUTING_CODEX.md:11).
Исторический service-owner contact webcheck-claude-mac, текущие ownership/credentials
надо подтвердить; не назначать его по одному старому документу.
Отсутствие literal hit НЕ доказывает отсутствие легитимного клиента.

### Предложение после явного разрешения и service-owner dependency проверки

В одной транзакции закрыть прямой клиентский доступ ТОЛЬКО к двум служебным
таблицам и явно обнаруженному незащищённому writer RPC:

```sql
-- PROPOSED ONLY / НЕ ВЫПОЛНЕНО.
REVOKE ALL PRIVILEGES ON TABLE public.translation_status FROM anon, authenticated RESTRICT;
REVOKE ALL PRIVILEGES ON TABLE public.bugfix_project_owner FROM anon, authenticated RESTRICT;
REVOKE EXECUTE ON FUNCTION public.translation_status_set(text,text,text,text,text,integer,integer,text)
  FROM anon, authenticated RESTRICT;
```

Не менять данные, service_role/postgres, default ACL, другие tables/functions,
и не включать RLS вслепую для служебных справочников. Если legitimate routine
использует anon/authenticated вместо service/admin — STOP: согласовать безопасный
служебный маршрут с владельцем до apply, не подменять его новым public write.

Before/after сохранить grantor/table+column/function grants/grant options/owners,
role memberships и effective права. После: anon/authenticated не имеют effective
операций на двух targets (включая column grants и PUBLIC inheritance) и EXECUTE
target writer; service/admin/bug_report_to_task и остальные ACL/данные неизменны.
Если наследованные права сохранят доступ — не расширять revoke молча.
Не выполнять реальный INSERT/UPDATE/DELETE/TRUNCATE/RPC с данными «для проверки»;
runtime smoke служебной маршрутизации/локализации — с владельцем отдельно.

Impact: исчезает прямое клиентское изменение служебных таблиц и writer RPC.
Rollback до commit — ROLLBACK; после — восстановить ТОЛЬКО зафиксированные target
grants/grant options/grantors. Это снова открывает прежний риск; публичный rollout
при rollback остаётся закрыт. Старые массовые remediation scripts не запускать.
Операции выше ещё НЕ применены; факта эксплуатации/утечки не утверждаю.

## G2. Общий account deletion — отдельный backend/UX proposal

Сейчас `deleteAccount` остаётся UNAVAILABLE. Не подменять удалением копий одного app.
Предлагается server-only операция по явному повторному подтверждению: «Удалить
общий аккаунт и облачные копии всех четырёх приложений; локальные данные останутся».

- Сервер проверяет bearer token: подпись доверенным issuer/key, exp, aud, subject;
  актуального пользователя и живой `session_id`, не только decode/getSession.
  Target owner берётся из проверенного subject, не произвольного body owner/app_id.
  Service/admin credential существует только на сервере; доступ клиентам запрещён.
- Перед destructive step проверить metadata всех FK/триггеров/storage-зависимостей
  общего `auth.users` в personal-nzt. Не предполагать, что cascade затронет только
  ecosystem: неожиданные legacy-эффекты требуют отдельного разрешения владельца.
- Отозвать все сессии/refresh tokens этого общего аккаунта, не только текущего app;
  не обещать мгновенную невалидность уже выданного access JWT. Проверять живую
  сессию для endpoint и завершение удаления пользователя; partial failure не ACK.
  [Supabase session semantics](https://supabase.com/docs/guides/auth/sessions).
- Удалить auth identity только через проверенный server admin path и подтвердить
  каскад всех owner-scoped consent/snapshots для `psygames`, `smart-alarm`,
  `abstract-hub`, `typerighting`. FK `auth.users(id) ON DELETE CASCADE` для новых
  таблиц есть в [миграции:5/53](/Users/denisonosov/dev/psygames-game-lab/testflight-fixes-20261011/supabase/migrations/20261016022904_ecosystem_app_cloud_backups.sql:5).
  [Admin delete — только server](https://supabase.com/docs/reference/javascript/auth-admin-deleteuser).
- Не стирать локальный прогресс/дневники/фото на этом или других устройствах;
  hosts прекращают cloud и сбрасывают своё account-состояние после ACK.
  Не добавлять AI, общий wallet, billing, rewards/session writer и автомиграцию.

Acceptance до включения: синтетический account с четырьмя app scopes; чужой owner,
expired/revoked token отклоняются; all-four cascade, отсутствие чужих потерь,
повтор удаления/partial failure, restart/OFF и сохранность local данных проверены.
Нужны app-owner/device UX проверки, не только mock. Destructive deletion не имеет
простого rollback; отключение endpoint/кнопки предотвращает новые удаления, но не
возвращает уже удалённые аккаунты/копии. Live users не удалять ради теста.

## G3. Exact Auth redirect additions — пока НЕ зарегистрированы

По [канону:117–119](/Users/denisonosov/dev/psygames-game-lab/testflight-fixes-20261011/ECOSYSTEM_CLOUD_V1_REF.md:117)
сохранить существующий `com.psygames.app://auth/callback`; добавить только:

| Host | Exact redirect URL proposal | Состояние |
|---|---|---|
| Smart Alarm | `com.odv999.smartalarm://auth/callback` | Proposed, не зарегистрирован |
| Chess & Go | `com.abstracthub.app://auth/callback` | Proposed, не зарегистрирован |
| TypeFree | `pro.typefree.app://auth/callback` | Новый proposed URI от владельца TypeFree; итоговый host report/native proof ещё ожидается, НЕ зарегистрирован |

Без wildcard, смены Site URL, новых providers или перезаписи всего redirect list.
Перед apply сверить exact native scheme/host/path с владельцами и текущий список
метаданными; записать before/after. Код exchange query `?code=...` не часть
сохраняемого allowlist URL. PKCE verifier и app+issuer namespace обязательны;
`app_id` — data partition, не app attestation.
Verification: diff только отдельно согласованных добавлений; затем отдельно разрешённые warm/cold
device PKCE/чужой callback/OFF проверки каждого host. Новые реальные письма и
регистрация пользователей не разрешены этим документом. Rollback: удалить только
эти добавления, сохранить исходные и параллельные чужие изменения; не трогать данные.

## Решения Дениса и оставшиеся запросы

[G1] Разрешение получено 16.10; применение ждёт безопасного переключения подтверждённого anon-consumer (ref: 584a68fd-0b29-4db9-a0d5-7fad7700534e). Три target-only REVOKE, без чтения/изменения строк и других ACL/RLS/schema; проверить service/admin; откат — точные исходные grants. НЕ применять до dependency ACK.

[G2] Одобрить отдельный план server-only deployment общего account deletion по G2 после legacy-cascade/UX review и синтетической приёмки; локальная разработка уже разрешена, реальные аккаунты не удалять по этому пункту (ref: этот файл, G2) · подготовить проверяемый endpoint/hosts contract, пока кнопки UNAVAILABLE · откат: выключить endpoint/UI, удалённые данные автоматически не восстановить → рекомендую: Делать.

[G3] Разрешить psygames-codex-mac после exact native подтверждений добавить в Auth redirect allowlist personal-nzt только согласованные URL из G3; TypeFree добавлять лишь после его финального native proof/подтверждения, без писем и регистраций (ref: этот файл, G3) · сохранить existing redirects, проверить metadata diff · откат: удалить только новые согласованные добавления → рекомендую: Делать.

«Делать» означает согласование указанного плана; документ сам не является
server-change authorization. Прямой ответ Дениса получен для G1, не для G2/G3;
никаких задач/сообщений для его получения sidecar не создавал.
