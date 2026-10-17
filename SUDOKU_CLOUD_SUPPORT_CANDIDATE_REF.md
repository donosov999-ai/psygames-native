# Удалённая помощь с уровнями — отдельный контур после облака

16.10.2026 · psygames-codex-mac · задача3d5255bc-2168-41f2-91f7-973520bac00c.
Ветка codex/sudoku-cloud-support-20261016, base6a2363258.
НЕ готовая удалённая поддержка и НЕ часть готового функционала PR351/2.56.30.
Облако, разрешение на поддержку и публичная статистика — разные согласия.

## Подготовлено и проверено

- scripts/cloud-support/sudoku-correction.mjs: offline bounded candidate,
  exactowner/issuer/app/revision/profile/road;18testsPASS. Меняет только два
  монотонных reached-level ключа, не создаёт победу/награды/сессии. Сохранённая
  доска не удаляется: несовпадение уровня требует выбора restore/restart.
- supabase/migrations/20261016120739_psygames_support_grants_candidate.sql:
  явные owner grants≤72h, exactrevision, server-only узкая очередьunlock1..180,
  неизменяемые поля и ownerstatusACK, отдельный owner audit. Не универсальная
  записьJSON и не доступ оператора кwallet/pet/всем snapshots.
- supabase/tests/psygames_support_grants.sql: основной исполнитель лично
  выполнил PostgreSQL-тесты на syntheticusers В ТРАНЗАКЦИИ С ПОЛНЫМ ROLLBACK.
  Crossowner/session/consent/grant-revision/expiry/immutability/idempotence
  assertions прошли. Первая попытка обнаружила неинициализированныйpg_temp;
  исправлено тестовым temp-table init + фактическим именем temp-schema.
  После успешного повторения support_objects_rolled_back=true. Новых support
  tables/schema/RPC в live не осталось; G2guard продолжает существовать,
  definitionMD5=28f2f202bd6c65fd83d006b65afaa604.

SQL queue/apply используют consent-row FOR SHARE→owner advisory lane, в одном
порядке с existing consent update; grant revoke не берёт consent-row. Это разбор
кода и serial rollback tests, НЕ двухсоединительный concurrency proof.
Монотонный queuefloor учитывает dismissed/history; он не знает фактического
текущего уровня телефона. Клиент обязан применять max(local,target), не победу.
`applied` означает owner-reportedACK, не независимую проверку телефона.

## Что ещё требуется

Checkpoint 18.10.2026: сохранён отдельный pure-Dart кандидат
`flutter/lib/shell/sudoku_support_correction.dart` и 48 проверок в
`flutter/test/sudoku_support_correction_test.dart`. Основной исполнитель
независимо повторил все 48 тестов: PASS, журнал
`_local/ecosystem-cloud/sudoku-support-candidate-main-review-20261018.txt`.
После исправления двух style-info в тестах повторный прогон: 48 PASS;
`flutter analyze --no-pub` для этих двух файлов — No issues found.
Это только расчёт монотонной поправки и безопасного выбора старой сохранённой
доски, без сети, локального durable apply, UI, server ACK и настоящего телефона.
В релиз 2.56.30 кандидат НЕ включён; перечисленные ниже пункты остаются открыты.

1. Отдельные live two-connection tests queue/apply vs support revoke и cloud
   consent update/delete; затем scoped deployment с rollback для новых объектов.
2. Native opt-in/support code для точного player/profile/road, срок и отзыв;
   облачное согласие само по себе не разрешает поддержку.
3. Native обработка очереди, durable idempotent local journal, явный безопасный
   выбор при старом resume, operatorreceipt/ACK, startup-before-gameplay apply.
4. Узкий просмотр Sudoku status по действующему grant, без скачивания личных
   данных/всей истории. Сейчас SQL queue такого просмотра не реализует.
5. Полный syntheticHTTP→Flutter→serverACK и повтор после обрыва/перезапуска;
   затем телефон. До этого не обещать, что одного входа Вали достаточно.

Валю/её реальные записи не читали и не изменяли. Это сохранённый кандидат,
не основание закрывать3d5255bc. ReceiptG2 и общее облако — см.
G2_RECEIPT_20261016.json / ECOSYSTEM_ACCOUNT_DRAFT5_PIN.md.
