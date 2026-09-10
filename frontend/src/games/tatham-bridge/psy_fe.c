/* psygames-tatham-bridge-frontend · VER 1 · 10.09.2026
 *
 * ЗАГЛУШКА ФРОНТЕНДА — только то, чего нет в его `drawing.c`.
 *
 * 🔴 ПОЧЕМУ НЕ `nullfe.c`. Его заглушка подменяет И САМ СЛОЙ РИСОВАНИЯ: `drawing_new`
 * там возвращает пустышку, а `draw_rect`/`draw_line`/`draw_text` — ничего не делают.
 * Для консольного решателя это правильно, а нам рисование и нужно: замер 10.09.2026 —
 * с `nullfe.c` `midend_force_redraw` давал НОЛЬ примитивов на всех головоломках.
 * Поэтому берём настоящий `drawing.c` (он и раздаёт вызовы в наш `drawing_api`),
 * а отсюда — только фронтендовые обязанности, которых в нём нет.
 *
 * Основано на Simon Tatham's Portable Puzzle Collection, MIT. Copyright (c) 2004-2024
 * Simon Tatham и соавторы — полный список в README рядом.
 */
#include <stdio.h>
#include <stdlib.h>
#include <stdarg.h>
#include "puzzles.h"

/* Цвет фона: берём светлый, свои цвета всё равно накладываем на нашей стороне. */
void frontend_default_colour(frontend *fe, float *output)
{ (void)fe; output[0] = output[1] = output[2] = 1.0F; }

/*
 * Зерно случайности фронтенда постоянное — И ЭТО НАРОЧНО. Доску мы задаём строкой
 * «параметры:описание» через `midend_game_id`, чтобы партия воспроизводилась по номеру
 * у всех игроков. Если бы зерно бралось отсюда, один и тот же уровень давал бы разные
 * доски на разных устройствах.
 */
void get_random_seed(void **randseed, int *randseedsize)
{ char *c = snewn(1, char); *c = 0; *randseed = c; *randseedsize = 1; }

/* Таймеры анимации не нужны: перерисовываем целиком на каждое нажатие. */
void deactivate_timer(frontend *fe) { (void)fe; }
void activate_timer(frontend *fe) { (void)fe; }

/* Печать головоломки на бумагу не нужна, но линковщик требует символ. */
void document_add_puzzle(document *doc, const game *game, game_params *par,
                         game_ui *ui, game_state *st, game_state *st2)
{ (void)doc; (void)game; (void)par; (void)ui; (void)st; (void)st2; }

void fatal(const char *fmt, ...)
{
    va_list ap;
    fprintf(stderr, "fatal error: ");
    va_start(ap, fmt); vfprintf(stderr, fmt, ap); va_end(ap);
    fprintf(stderr, "\n");
    exit(1);
}

void debug_printf(const char *fmt, ...) { (void)fmt; }
