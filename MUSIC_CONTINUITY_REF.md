# PsyGames · непрерывность музыки · 01.11.2026

Задание Дениса: при смене вкладок музыка обрывается; исправить сейчас, сохранив работу Claude. TeamOps `fbf00e1c-0f69-4a06-aba0-4369a38479ae`. Ветка `codex/psygames-design-integration`, только отдельный worktree `/Users/denisonosov/dev/psygames-game-lab/design-integration-20261101`.

## Подтверждённая причина

Фоновая музыка в этой версии ещё HTMLAudioElement (`frontend/src/services/music.ts`), НЕ just_audio. Голос/шум/дыхание используют нативные слои, их движки не заменены.

`frontend/app/index.tsx` держал музыку в useFocusEffect и на любом blur вызывал stopMusic. Поэтому главная → игры/зарядка/прогресс/питомец обрывала фон. Возврат создавал новый audio/порядок треков и сбрасывал позицию. Дополнительно старый play().then обращался к изменяемому global el и мог изменить громкость уже другого запуска; при stop/start пересекались fading-плееры. После autoplay rejection ненулевой el мешал повторному старту. Громкость настройки не доходила до музыки.

## Исправление

- Один AppMusicHost в корневом layout. Blur главной больше не владеет музыкой. Все пять вкладок и настройки оставляют один audio, файл, позицию и плейлист.
- Игры/активные служебные шаги сохраняют прежнюю тихую политику. Нативный экран передаёт только отдельное music route событие; позднее закрытие старого token не снимает hold следующей игры. Старый __psyNativeOver и его карантин фантомных партий не заменены.
- Элемент сохраняется на временной паузе/выключении. Fade привязан к своему element+generation, поздний play не оживляет отключённый/освобождённый звук. Только корневое размонтирование освобождает элемент.
- Background/visibility — временный hold без перезаписи preference. Жест пользователя повторяет отклонённый autoplay синхронно, без создания второго плеера.
- Загрузка preferences объединена одним Promise; свежие music toggle/volume применяются после гидратации. Ползунок громкости доходит и до музыки, ноль остаётся нулём. Music opt-in отдельно от игровых звуков, файлы шести треков сохранены.

## Проверка / ограничение

Тесты: music-lifecycle, app-music-host, music-preferences-race, music-library, audio-warmup, speech-sound-toggle — 35/35. Они исполняют реальные контроллер и React-host с тестовым audio, проверяя переходы, mute/volume, поздние Promise, rejection, быстрый stop/start, фон и освобождение. Отдельно Flutter native_tabs_shell/hybrid_overlay/warmup_step_done_once — 50/50, защищают мост и навигацию. TypeScript tsc и ESLint изменённых сервисов/host без ошибок; flutter analyze из flutter/ чистый. Логи: design-integration-evidence/logs/music-tests.log и music-native-routing.log.

Свежий собственный web пересобран вместе с фиксом; безопасная review-копия собрана и открыта на Mac: `/Users/denisonosov/dev/psygames-game-lab/design-integration-20261101/flutter/build/macos/Build/Products/Debug/PsyGames Integration Review.app`. Bundle id `pro.psygames.codexDesignIntegration`, тестовая память, без LegacyImport/Cloud. Открытие приложения не является проверкой прослушивания. Production entrypoint и идентификатор в исходниках не изменены.

Это не доказательство отсутствия любых аудиобагов: физические iPhone/Samsung, реальные звонки/Bluetooth, WebKit autoplay/возврат из фона и прослушивание отдельно. Не менялись production, аккаунты, пользовательский прогресс, just_audio и practice_kit. Публикации в магазины в этом поручении нет.

Для включения фикса в локальный гибрид обязательно пересобрать СВЕЖИЙ web: `REBUILD=1 bash flutter/tools/embed-web.sh`, затем Flutter build. Старый вложенный dist оставит прежний cleanup, даже если Dart уже собран.

Связанный реф: `DESIGN_INTEGRATION_HANDOFF.md` в этом worktree. Откат — отдельный собственный music commit, без сброса ветки/чужих деревьев.
