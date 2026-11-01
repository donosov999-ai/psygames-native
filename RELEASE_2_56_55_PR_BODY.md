## Разрешение

Денис после просмотра Flutter-кандидата и исправления подложки History: «заливай». Новый выпуск2.56.55; предыдущее ограничение этапа без stores снято этой командой. База текущий main d6621a413, чужие worktrees не менялись.

## Что переносится

- Принятые jewel assets Home и прежние header/footer; единый формат5шапок, настоящие Games/Workout/Progress/Pet без замены моделей/сохранений/Classic.
- Квадратная обычная витрина, поиск/фильтры/действующие маршруты; один реальный выбор Workout с параметрами; настоящая статистика/PetFrames/уход.
- Конечный входной блик, top-down Progress, radial Pet, goods move/reward, отключаемый glass. Уважение Reduce Motion/фона/выхода.
- Music host остаётся владельцем между вкладками; защита устаревших play/fade. SFX и новые haptics OFF.
- Обе кнопки Summary/History с подложками, шрифт bugFX. RU/EN What’s New и версия2.56.55.
- Штатные mobile workflows собирают main entrypoint с единым public approved-ui.json и прежним cloud config.16KB и полные тесты не отключались.

## Проверки и ограничения

Локально128 targeted Flutter +37Stats/chrome +24preview cases, config2 и analyzer clean; warmup JS12/audio35/routing50 ранее. Наборы пересекаются. Полный CI требуется, не заменён локальными выборками. Визуальные остатки/fixture vs device чётко описаны в FOUR_TABS_IMPLEMENTATION_REF.md; физические iPhone/Android/GPU/audio interruptions не подтверждены. Источники/рефы/50%overlay/логи сохранены для handoff. Mac preview in-memory НЕ используется в релизе.

## Выпуск и откат

RELEASE_2_56_55_REF.md фиксирует текущий Play readback2.56.51 (не2.56.54), TF2.56.54+93 и фактические квитанции нового выпуска по мере получения. Никаких миграций/очистки данных/платных API. Откат UI через Classic; динамика — отдельными build defines, без новых SFX/haptic patterns. Не отменять чужие changes in review.
