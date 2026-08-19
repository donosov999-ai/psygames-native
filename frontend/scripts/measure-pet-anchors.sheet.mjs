/**
 * Контактные листы «как вещь сидит на самом деле» — вспомогательный режим
 * measure-pet-anchors.mjs (`--sheet`). В сборке не участвует.
 *
 * Считает положение предмета ТОЙ ЖЕ арифметикой, что и AccessoryOverlay в
 * PetSprite.tsx (крепление к якорю + кромка + поле внутри PNG), и накладывает
 * настоящую картинку аксессуара на каждый из 20 кадров облика. Линии на кадре —
 * это не проверка: проверка — видеть предмет на питомце.
 */
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';

const HERE = dirname(fileURLToPath(import.meta.url));
const FRONT = join(HERE, '..');
const require = createRequire(join(FRONT, 'package.json'));
const sharp = require('sharp');

const STATES = ['walk', 'idle', 'wave', 'jump', 'sleep'];
const TILE = 170;
/** Поле вокруг кадра: высокий колпак на низко опущенной голове вылезает ВЫШЕ
 *  кадра питомца (в приложении это нормально — вид не обрезает), а composite
 *  сюда рисовать не умеет. Без поля лист врал бы про обрезанный колпак. */
const PAD = 60;

// Держится вручную в согласии с PetSprite.tsx; расхождение ловит гейт (см. тест
// «лист-проверка считает вещь той же арифметикой, что и компонент»).
const MOUNT = {
  party_hat: { at: 'head_top', edge: 'bottom' },
  bow:       { at: 'head_top', edge: 'center' },
  glasses:   { at: 'eyes',     edge: 'center' },
  bow_tie:   { at: 'neck',     edge: 'top' },
};
const REL   = { party_hat: 0.46, bow: 0.50, glasses: 0.60, bow_tie: 0.44 };
const INSET = {
  party_hat: { top: 0.059, height: 0.881 },
  bow:       { top: 0.297, height: 0.402 },
  glasses:   { top: 0.318, height: 0.361 },
  bow_tie:   { top: 0.287, height: 0.426 },
};
const IMG = {
  party_hat: 'party_hat.png', bow: 'bow.png', glasses: 'glasses.png', bow_tie: 'bow_blue.png',
};
const SCALE = { cat: 1.0, robot: 0.896, constellation: 0.817 };

// Не в репозиторий: это черновик для глаз, а не артефакт сборки.
export async function sheets(res, out = join(tmpdir(), 'psygames-pet-sheets')) {
  mkdirSync(out, { recursive: true });
  for (const skin of Object.keys(res)) {
    for (const kind of Object.keys(MOUNT)) {
      const m = MOUNT[kind], ins = INSET[kind];
      const tiles = [];
      for (let r = 0; r < STATES.length; r++) {
        const rows = res[skin].frames.filter((x) => x.state === STATES[r]);
        for (let f = 0; f < rows.length; f++) {
          const x = rows[f];
          const size = TILE;
          const a = x[m.at];
          const ax = (a.x / 100) * size, ay = (a.y / 100) * size;
          const img = REL[kind] * size * SCALE[skin];
          const top = m.edge === 'bottom' ? ay - img * (ins.top + ins.height)
                    : m.edge === 'top'    ? ay - img * ins.top
                    :                       ay - img * (ins.top + ins.height / 2);
          const left = ax - img / 2;
          const base = await sharp(await sharp(join(FRONT, `assets/images/pet/${skin}/${x.state}${x.frame}.webp`))
            .resize(size, size).png().toBuffer())
            .extend({ top: PAD, bottom: PAD, left: PAD, right: PAD, background: '#efefef' })
            .flatten({ background: '#efefef' }).png().toBuffer();
          const acc = await sharp(join(FRONT, `assets/images/pet/accessories/${IMG[kind]}`))
            .resize(Math.round(img), Math.round(img), { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
            .png().toBuffer();
          const label = Buffer.from(`<svg width="${size + 2 * PAD}" height="${size + 2 * PAD}">
            <rect x="${PAD}" y="${PAD}" width="${size}" height="${size}" fill="none" stroke="#bbb" stroke-width="1"/>
            <circle cx="${ax + PAD}" cy="${ay + PAD}" r="3" fill="#f0f" stroke="#fff" stroke-width="1"/>
            <text x="${PAD + 3}" y="${PAD + 12}" font-size="11" fill="#111">${x.state}${x.frame}</text></svg>`);
          const tile = await sharp(base).composite([
            { input: acc, left: Math.round(left) + PAD, top: Math.round(top) + PAD },
            { input: label },
          ]).png().toBuffer();
          tiles.push({ input: tile, left: f * (size + 2 * PAD), top: r * (size + 2 * PAD) });
        }
      }
      const cell = TILE + 2 * PAD;
      await sharp({ create: { width: 4 * cell, height: 5 * cell, channels: 3, background: '#fff' } })
        .composite(tiles).png().toFile(join(out, `${skin}-${kind}.png`));
    }
  }
  console.log('листы:', out);
}
