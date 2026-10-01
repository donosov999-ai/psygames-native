/* psygames-tatham-bridge-diag · VER 1 · 01.10.2026
 *
 * ПЕЧАТЬ РАССУЖДЕНИЙ РЕШАТЕЛЯ — В НАШ БУФЕР, А НЕ В stdout (задача 23773004).
 *
 * 🔴 ЗАЧЕМ. Разбор головоломок показывает, ЧТО поставить, но не ПОЧЕМУ: имя приёма
 * знает только решатель автора, и он его ПЕЧАТАЕТ — «Clue full; setting unlit to
 * IMPOSSIBLE», «ruling out placement …». Замер 01.10 по ~/dev/puzzles 428913c: печать есть
 * у 26 движков из 40, у 10 она закрыта `#ifdef SOLVER_DIAGNOSTICS`, у 16 —
 * `#ifdef STANDALONE_SOLVER`. Во время работы не включается ни у одного.
 *
 * КАК. Нативная сборка (`flutter/tool/build_tatham*.sh`) подключает этот файл к КАЖДОМУ
 * исходнику ключом `-include` и собирает с `-DSOLVER_DIAGNOSTICS`. Все вызовы `printf`
 * уходят в `psy_diag_printf` (psy_play.c), а тот пишет в буфер, ТОЛЬКО пока мост
 * ловит решение (`psy_solve_explain`). Генерация досок тоже печатает — эта печать
 * глотается без форматирования.
 *
 * ⚠️ МАКРОС-ФУНКЦИЯ, А НЕ `#define printf psy_diag_printf`. Простая подмена имени
 * переписала бы и `__attribute__((format(printf, 1, 2)))`, и это ошибка сборки. Макрос со
 * скобками трогает только вызовы. Канон Тэтхэма не меняется: правка живёт в нашей сборке.
 * Веб-сборка (emscripten) этот файл не подключает и печатает, как раньше.
 */
#ifndef PSY_DIAG_H
#define PSY_DIAG_H
#include <stdio.h>
int psy_diag_printf(const char *fmt, ...);
#define printf(...) psy_diag_printf(__VA_ARGS__)
#endif
