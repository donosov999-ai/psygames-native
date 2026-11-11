/// Карта уровней «Судоку» переехала в каркас — `lib/shell/level_map.dart` (11.11.2026, задача 8e90ac74).
/// Здесь остались формулы звёзд трёх судоку (веб, проп `stars` у `LevelCleared`).
library;

export '../../shell/level_map.dart';

int sudokuStars(int errors) => errors == 0 ? 3 : errors <= 2 ? 2 : 1; // sudoku.tsx
int fractalStars(int errors) => errors == 0 ? 3 : errors <= 3 ? 2 : 1; // sudoku-fractal.tsx
int samuraiStars(int errors, int hints) => // sudoku-samurai.tsx, starsFor
    errors == 0 && hints == 0 ? 3 : errors <= 2 && hints <= 1 ? 2 : 1;
