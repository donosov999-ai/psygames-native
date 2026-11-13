// VER 1 · 2026-11-05 · psygames-claude-mac: геометрия цифр «Числового забега» для Flutter (задача 84bcf2c9).
// Те же параметры TextGeometry, что в src/games/number-run/runner-numerals.mjs, — цифры в 3D-сцене Flutter
// выдавлены из того же шрифта helvetiker_bold и совпадают с вебом один в один. Пишет
// flutter/assets/number_run/numerals.json: для каждого знака — ширина, лицо (группа 0) и бока (группа 1),
// треугольники без индексов: позиции и нормали. Лицензия шрифта — runner-font-license.txt рядом.
// Запуск: node scripts/gen-runner-numerals-mesh.mjs
import {readFileSync, writeFileSync, copyFileSync} from 'node:fs';
import {FontLoader} from 'three/examples/jsm/loaders/FontLoader.js';
import {TextGeometry} from 'three/examples/jsm/geometries/TextGeometry.js';
const fontData = JSON.parse(readFileSync(new URL('../node_modules/three/examples/fonts/helvetiker_bold.typeface.json', import.meta.url)));
const font = new FontLoader().parse(fontData);
const r = v => Math.round(v * 1e4) / 1e4;
const out = {font: 'helvetiker_bold (three.js examples)', glyphs: {}};
for (const char of '0123456789+-x') {
  const g = new TextGeometry(char, {font, size: 1, depth: .22, curveSegments: 3, bevelEnabled: true, bevelThickness: .025, bevelSize: .018, bevelSegments: 1, steps: 1});
  g.computeBoundingBox();
  const b = g.boundingBox, width = b.max.x - b.min.x;
  g.translate(-b.min.x, 0, -.11);
  g.computeVertexNormals();
  const pos = g.attributes.position.array, nor = g.attributes.normal.array;
  const part = group => {
    const p = [], n = [];
    for (let v = group.start; v < group.start + group.count; v++) {
      for (let k = 0; k < 3; k++) { p.push(r(pos[v * 3 + k])); n.push(r(nor[v * 3 + k])); }
    }
    return {p, n};
  };
  const [face, side] = [0, 1].map(m => g.groups.filter(x => x.materialIndex === m).map(part).reduce((a, x) => ({p: a.p.concat(x.p), n: a.n.concat(x.n)}), {p: [], n: []}));
  out.glyphs[char] = {width: r(width), face, side};
}
writeFileSync(new URL('../../flutter/assets/number_run/numerals.json', import.meta.url), JSON.stringify(out));
copyFileSync(new URL('../src/games/number-run/runner-font-license.txt', import.meta.url), new URL('../../flutter/assets/number_run/numerals-font-license.txt', import.meta.url));
console.log(Object.entries(out.glyphs).map(([c, g]) => `${c}:${g.face.p.length / 9 | 0}+${g.side.p.length / 9 | 0}`).join(' '));
