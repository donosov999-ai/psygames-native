// СГЕНЕРИРОВАНО tools/embed-puzzle-routes.mjs — руками не править.
// Источник: assets/puzzles/modes.json (42 режимов).
//
// Экран головоломок один, а адресов 43: голый /games/puzzles ведёт на
// «Unruly», остальные отличаются хвостом ?mode=. Имя режима в хвосте закодировано
// так же, как его пишет веб-версия, — иначе четыре игры с пробелом в имени
// («Light Up», «Train Tracks», «Black Box», «Same Game») перехватываться не будут.
library;

import 'package:flutter/widgets.dart';

import '../games/puzzles/screen.dart';
import 'shared_state.dart';

Map<String, Widget Function(SharedState)> puzzleRoutes() => {
  '/games/puzzles': (s) => PuzzlesScreen(state: s, mode: 'Unruly'),
  '/games/puzzles?mode=Black%20Box': (s) => PuzzlesScreen(state: s, mode: "Black Box"),
  '/games/puzzles?mode=Bridges': (s) => PuzzlesScreen(state: s, mode: "Bridges"),
  '/games/puzzles?mode=Cube': (s) => PuzzlesScreen(state: s, mode: "Cube"),
  '/games/puzzles?mode=Dominosa': (s) => PuzzlesScreen(state: s, mode: "Dominosa"),
  '/games/puzzles?mode=Fifteen': (s) => PuzzlesScreen(state: s, mode: "Fifteen"),
  '/games/puzzles?mode=Filling': (s) => PuzzlesScreen(state: s, mode: "Filling"),
  '/games/puzzles?mode=Flip': (s) => PuzzlesScreen(state: s, mode: "Flip"),
  '/games/puzzles?mode=Flood': (s) => PuzzlesScreen(state: s, mode: "Flood"),
  '/games/puzzles?mode=Galaxies': (s) => PuzzlesScreen(state: s, mode: "Galaxies"),
  '/games/puzzles?mode=Guess': (s) => PuzzlesScreen(state: s, mode: "Guess"),
  '/games/puzzles?mode=Inertia': (s) => PuzzlesScreen(state: s, mode: "Inertia"),
  '/games/puzzles?mode=Keen': (s) => PuzzlesScreen(state: s, mode: "Keen"),
  '/games/puzzles?mode=Light%20Up': (s) => PuzzlesScreen(state: s, mode: "Light Up"),
  '/games/puzzles?mode=Loopy': (s) => PuzzlesScreen(state: s, mode: "Loopy"),
  '/games/puzzles?mode=Magnets': (s) => PuzzlesScreen(state: s, mode: "Magnets"),
  '/games/puzzles?mode=Map': (s) => PuzzlesScreen(state: s, mode: "Map"),
  '/games/puzzles?mode=Mines': (s) => PuzzlesScreen(state: s, mode: "Mines"),
  '/games/puzzles?mode=Mosaic': (s) => PuzzlesScreen(state: s, mode: "Mosaic"),
  '/games/puzzles?mode=Net': (s) => PuzzlesScreen(state: s, mode: "Net"),
  '/games/puzzles?mode=Netslide': (s) => PuzzlesScreen(state: s, mode: "Netslide"),
  '/games/puzzles?mode=Palisade': (s) => PuzzlesScreen(state: s, mode: "Palisade"),
  '/games/puzzles?mode=Pattern': (s) => PuzzlesScreen(state: s, mode: "Pattern"),
  '/games/puzzles?mode=Pearl': (s) => PuzzlesScreen(state: s, mode: "Pearl"),
  '/games/puzzles?mode=Pegs': (s) => PuzzlesScreen(state: s, mode: "Pegs"),
  '/games/puzzles?mode=Range': (s) => PuzzlesScreen(state: s, mode: "Range"),
  '/games/puzzles?mode=Rectangles': (s) => PuzzlesScreen(state: s, mode: "Rectangles"),
  '/games/puzzles?mode=Same%20Game': (s) => PuzzlesScreen(state: s, mode: "Same Game"),
  '/games/puzzles?mode=Signpost': (s) => PuzzlesScreen(state: s, mode: "Signpost"),
  '/games/puzzles?mode=Singles': (s) => PuzzlesScreen(state: s, mode: "Singles"),
  '/games/puzzles?mode=Sixteen': (s) => PuzzlesScreen(state: s, mode: "Sixteen"),
  '/games/puzzles?mode=Slant': (s) => PuzzlesScreen(state: s, mode: "Slant"),
  '/games/puzzles?mode=Slide': (s) => PuzzlesScreen(state: s, mode: "Slide"),
  '/games/puzzles?mode=Sokoban': (s) => PuzzlesScreen(state: s, mode: "Sokoban"),
  '/games/puzzles?mode=Solo': (s) => PuzzlesScreen(state: s, mode: "Solo"),
  '/games/puzzles?mode=Tents': (s) => PuzzlesScreen(state: s, mode: "Tents"),
  '/games/puzzles?mode=Towers': (s) => PuzzlesScreen(state: s, mode: "Towers"),
  '/games/puzzles?mode=Train%20Tracks': (s) => PuzzlesScreen(state: s, mode: "Train Tracks"),
  '/games/puzzles?mode=Twiddle': (s) => PuzzlesScreen(state: s, mode: "Twiddle"),
  '/games/puzzles?mode=Undead': (s) => PuzzlesScreen(state: s, mode: "Undead"),
  '/games/puzzles?mode=Unequal': (s) => PuzzlesScreen(state: s, mode: "Unequal"),
  '/games/puzzles?mode=Unruly': (s) => PuzzlesScreen(state: s, mode: "Unruly"),
  '/games/puzzles?mode=Untangle': (s) => PuzzlesScreen(state: s, mode: "Untangle"),
};
