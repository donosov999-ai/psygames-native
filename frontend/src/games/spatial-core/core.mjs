/* psygames-spatial-core-core · VER 1 · 09.09.2026 */
/* LOCAL REV spatial-lab/2026-09-09.2 · psygames-codex-mac · not an app release */
/** Spatial transformations v0.1.0. Pure, immutable; no UI, clock or persistence. Canonical source. */
function integer(n, lo, hi, name) {
  if (!Number.isSafeInteger(n) || n < lo || n > hi) throw new RangeError(name);
}
const mod = (n, d) => ((n % d) + d) % d;
export function board(width, height = width) {
  integer(width, 1, 100, 'width'); integer(height, 1, 100, 'height');
  return { width, height, cells: Array.from({ length: width * height }, (_, id) => ({ id, turns: 0 })) };
}
function validate(b) {
  integer(b.width, 1, 100, 'width'); integer(b.height, 1, 100, 'height');
  if (b.cells.length !== b.width * b.height) throw new RangeError('cells');
  if (new Set(b.cells.map(c => c.id)).size !== b.cells.length) throw new RangeError('duplicate ids');
  for (const c of b.cells) integer(c.turns, 0, 3, 'orientation');
}
export function apply(b, command) {
  validate(b);
  const { kind, amount = 1 } = command;
  integer(amount, -1000000, 1000000, 'amount');
  const cells = b.cells.map(c => ({ ...c }));
  const at = (r, c) => r * b.width + c;
  if (kind === 'tile') {
    integer(command.index, 0, cells.length - 1, 'index');
    cells[command.index].turns = mod(cells[command.index].turns + amount, 4);
  } else if (kind === 'block') {
    const { row, col, size } = command;
    integer(size, 2, Math.min(b.width, b.height), 'size');
    integer(row, 0, b.height - size, 'row'); integer(col, 0, b.width - size, 'col');
    if (command.orient !== undefined && typeof command.orient !== 'boolean') throw new TypeError('orient');
    // Positive quarter turn is clockwise in screen coordinates (row down).
    for (let t = 0; t < mod(amount, 4); t++) {
      const before = cells.map(c => ({ ...c }));
      for (let r = 0; r < size; r++) for (let c = 0; c < size; c++) {
        const cell = { ...before[at(row + r, col + c)] };
        // Twiddle numbers stay upright; directional tiles may rotate with block.
        if (command.orient) cell.turns = mod(cell.turns + 1, 4);
        cells[at(row + c, col + size - 1 - r)] = cell;
      }
    }
  } else if (kind === 'row' || kind === 'column') {
    const isRow = kind === 'row';
    integer(command.index, 0, (isRow ? b.height : b.width) - 1, 'index');
    const length = isRow ? b.width : b.height;
    for (let i = 0; i < length; i++) {
      const from = isRow ? at(command.index, i) : at(i, command.index);
      const to = isRow ? at(command.index, mod(i + amount, length)) : at(mod(i + amount, length), command.index);
      cells[to] = { ...b.cells[from] };
    }
  } else throw new TypeError('unknown command');
  return { width: b.width, height: b.height, cells };
}
export function inverse(command) { return { ...command, amount: -(command.amount ?? 1) }; }
export function replay(initial, commands) { return commands.reduce(apply, initial); }
export function solved(b) { return b.cells.every((c, i) => c.id === i && c.turns === 0); }
export function session(initial) {
  validate(initial);
  const copy = structuredClone(initial);
  return { initial: copy, present: structuredClone(copy), past: [], future: [] };
}
export function commit(s, command) {
  const copy = structuredClone(command);
  return { ...s, present: apply(s.present, copy), past: [...s.past, copy], future: [] };
}
export function undo(s) {
  if (!s.past.length) return s;
  const command = s.past.at(-1);
  return { ...s, present: apply(s.present, inverse(command)), past: s.past.slice(0, -1), future: [command, ...s.future] };
}
export function redo(s) {
  if (!s.future.length) return s;
  const [command, ...future] = s.future;
  return { ...s, present: apply(s.present, command), past: [...s.past, command], future };
}
export function rng(seed) {
  integer(seed, 0, 0xffffffff, 'seed');
  let n = seed;
  return () => { n = (Math.imul(n, 1664525) + 1013904223) >>> 0; return n / 4294967296; };
}
/** Guaranteed reachable by construction; depth is NOT a difficulty rating. */
export function scramble(seed, depth = 12) {
  integer(depth, 1, 1000, 'depth');
  const random = rng(seed), initial = board(4), commands = [];
  for (let i = 0; i < depth; i++) commands.push({ kind: 'block', row: Math.floor(random() * 3), col: Math.floor(random() * 3), size: 2, amount: random() < .5 ? -1 : 1 });
  let present = replay(initial, commands);
  if (solved(present)) { commands.push({kind:'block',row:0,col:0,size:2,amount:1}); present = replay(initial, commands); }
  return { initial: present, solution: commands.toReversed().map(inverse), scramble: commands };
}
/** Adapter: inject existing geometry.rotateShape, never duplicate 3D math. */
export function shapeAdapter(rotateShape) {
  return (shape, command) => {
    if (command.kind !== 'shape' || !['x','y','z'].includes(command.axis)) throw new TypeError('shape command');
    integer(command.amount ?? 1, -1000000, 1000000, 'amount');
    return rotateShape(structuredClone(shape), command.axis, command.amount ?? 1);
  };
}
