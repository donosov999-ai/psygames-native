# Единый аккаунт: решение по тестовому пилоту

## АКТУАЛЬНО: Денис подтвердил 16.10.2026

**Free для отдельного тестового облака; технический ответственный за общий
backend пилота — psygames-codex-mac.** Владельцы приложений и executor общего
parent остаются прежними. Это прямой ответ Дениса в текущем чате, поступивший
после прежнего координационного сообщения о неутверждённом решении.

Отдельная действующая схема: [ECOSYSTEM_ACCOUNT_BACKEND_REF.md](ECOSYSTEM_ACCOUNT_BACKEND_REF.md).
Реальная Free-организация/проект ещё не созданы. Платные действия не разрешены.
Локальный PsyGames UI/mock не должен ждать оставшихся чужих ревью или provisioning.
**Текст ниже — историческое предложение до ответа Дениса; его фразы
«не утверждён/не назначен/ждёт решения» больше не описывают текущий owner/Free.**

16.10.2026, Asia/Almaty. Автор:psygames-codex-mac.
Своя задача:bb2c9f30-d786-4fe6-b25c-4b2ace267d4b.
Решение Дениса:377d1ecc-6297-4600-acbf-7356bb319881, needs-decision/planned.
Общий parent:f27599dc-31c9-4638-946d-ccb3270079bb, владелец psygames-claude-mac.
Папка:/Users/denisonosov/dev/psygames-game-lab/testflight-fixes-20261011.

## Рекомендуемый вариант — ещё НЕ утверждён

Технический ответственный за backend тестового пилота — **psygames-codex-mac**
в существующей bb2c9f30. Формальная координация четырёх приложений остаётся у
psygames-claude-mac; parent/executor не переназначать.
Среда — **один отдельный Supabase test project в отдельной Free-организации**
(предлагаемое имя `ODV999 Apps Test`, ещё не создана). Не клонировать production
данные/пользователей и не давать другим приложениям доступ к personal-nzt.
Расходы:только подтверждённая Free-квота; если она недоступна — STOP, никакого
автоматического платного upgrade. Организацию/ID выбирает Денис; перед созданием
проекта получить и показать точную цену для выбранной организации и подтвердить
её. Текущая видимая организация khqcouskemguusdtqvwg имеет Pro, не Free.
Free и Pro нельзя смешать в одной организации; это не обещание бесплатного нового
проекта внутри существующей Pro. Free может приостанавливаться при низкой
активности; среда только для тестов, не гарантия production-доступности.
[Биллинг](https://supabase.com/docs/guides/platform/billing-on-supabase),
[приостановка Free](https://supabase.com/docs/guides/platform/free-project-pausing).

Первый host — **PsyGames**, затем остальные по своим существующим задачам.
Маршрут:local UI/fake transport → после оставшихся согласований изолированная
authority/тестовые аккаунты → закрытая тестовая сборка PsyGames → device check.
Сборки:существующая группа TestFlight «Свои» и существующий Play internal/APK,
НЕ Google production. Номера/version/source резервировать перед сборкой,
не смешивать этот пилот с отдельным исправлением учебного режима2.56.28.

## Реальные решения на одну версию

Shared:`ecosystem.account/1-draft.3`, package0.1.2.
Immutable:`0040152c40a2eb26b1d75890884837804074d1a9`.
CONTRACT SHA256:`640febbb6347a356d78644e009c45124fde5e268945c49ca5300ed2a790a39d0`.

| Владелец | Подтверждённый ответ | TeamOps источник |
|---|---|---|
| smart-alarm-codex-mac | СОГЛАСЕН shared; независимые30PASS/analyze clean | 2203ef6d-573c-429c-95b5-fd80edf41fc7 |
| chess-go-codex-mac | СОГЛАСЕН shared; независимые27PASS/analyze clean | 252afaeb-b3de-4ed3-bbe6-4ab8ddc98e84 |
| psygames-claude-mac | Формальный ответ на exactrevision/hash не найден | f27599dc-31c9-4638-946d-ccb3270079bb, planned |
| typerighting-claude-mac | Формальный ответ на exactrevision/hash не найден | 7bba5d2a-cf16-4543-8273-97f4fecf556d, planned |

Проверены текущие карточки и доступные журналы двух отсутствующих авторов по
0040152 /640febbb /draft.3:ответов нет. Это ограниченная проверка TeamOps, не
доказательство отсутствия любых локальных черновиков.30/27/авторские58
перекрываются:не суммировать и не называть device/runtime PASS. Собственная
позиция автора PsyGames — подготовка, не подмена формального голоса Claude.

## Что конкретно нужно, чтобы пойти дальше

1. Денис утверждает предложенных технического ответственного/Free-only среду.
   Разрешение создать среду не заменяет4 app-owner ответа или согласие пользователя
   на загрузку истории. Общий provider Supabase уже выбран, повторно не выбирать.
2. Владельцы PsyGames/TypeFree в СВОИХ существующих задачах дают СОГЛАСЕН либо
   точные ВОЗРАЖЕНИЯ на0040152/640febbb. Новые чаты/дубликаты не нужны.
   Проверенная витрина native:все pinned+50 recent, указанных Claude UUID там нет.
   Registry `local_9141e1d3-9d6f-4d89-a251-e87a4ab36e26` и
   `local_70855e8f-662e-490f-9765-8279b531f269` не использовать как Codex IDs.
   Практический маршрут:Денис открывает текущие Claude-чаты и просит прочитать
   соответствующую TeamOps задачу/этот пакет. Если нужен ремонт доставки —
   интерактивный администратор teamops-claude-mac проверяет существующие receipts
   933d42d0-541a-45ea-bc23-9acbb7d4cf1a и f1c4cc81-28fc-482c-a1a7-94cf52b02e8a.
   В coordinator-state они last-observed queued; текущий delivery_status этих ID
   мне не вернул. Это НЕ независимое подтверждение их текущего queued/delivered.
   Не посылать дубликаты и не ставить delivered вручную.
3. Я готовлю PsyGames host:в настройках тестовый переключатель OFF; объяснение,
   versioned app+issuer+account consent; вход; preview истории; backup/restore,
   конфликт/выход/отзыв/удаление. До live gate — fake transport, 0progress sends
   без согласия (не обещание 0всех сетевых запросов BugFX/обновлений). Кадры/дневник,
   набранный текст/общий кошелёк не добавляются. Реальные старые данные в stage
   автоматически не переносить. После4ответов/authority/privacy/deletion тестов —
   существующие тестовые каналы, затем реальный login/restore на двух устройствах.

Важная граница TypeFree:GitHub main754e5715143de25bc7722e70f3e757eee1ebd69d,
package.json blob8d4ba75050395472b4dc28d0644ad4be0bde99df подтверждает2.60.3,
TypeScript/Vite/Tauri. Dart package нельзя объявить напрямую подключённым туда:
typerighting-claude-mac должен согласовать host adapter по ТОМУ ЖЕ контракту и
провайдеру, не вторую identity-систему и не переписывание приложения на Flutter.
[Manifest](https://github.com/donosov999-ai/typerighting/blob/754e5715143de25bc7722e70f3e757eee1ebd69d/package.json).

Ничего из предлагаемого ещё не создано/назначено/включено. Откат пилота —
выключить test route и вернуться в LOCAL без удаления прогресса. Удаление remote
проекта/данных — отдельное необратимое действие с отдельным подтверждением.

## Первичные ревью и граница этой сверки

Smart report:/Users/denisonosov/dev/smart-alarm-photo-diary/smart-alarm-flutter/ACCOUNT_CONTRACT_REVIEW_0040152.md,
SHA256a483d27d7fb816153db1d8b207fa4f172dfa71195855f50fb24aef28d787d7af.
Smart testlog:/Users/denisonosov/Documents/TeamOps/smart-alarm-ux/account-review-0040152-20261016/draft3-independent-tests.log,
SHA256271d98d817371ffdbf35156c5e3cfa2102c392090d4ad701814df7ed6677c01b.
Chess report:/Users/denisonosov/dev/chessgo-wt-synapse/ACCOUNT_CONTRACT_REVIEW_0040152.md,
SHA256ea34030885b3e1c58e74ceb23a1816f94b761ac1d4fbc9ad6cc5f2b83fcbc0c0.
Chess testlog:/Users/denisonosov/dev/psygames-checkpoints/chessgo-account-draft3-20261016.mmrDnb/account-tests.log,
SHA256619f8e228c25b2bce4d3bb87364e2e6450d7562f22ac7b3ae9340aceddad4df6.
Оба report прочитаны полностью,4SHA и PASS tails сверены; тесты в этой
координационной сверке заново не запускались. Подписи взяты из собственных
TeamOps записей владельцев, не только из пересылки координатора.
Сверка выполнена16.10, около01:19Asia/Almaty; это не постоянный мониторинг.
