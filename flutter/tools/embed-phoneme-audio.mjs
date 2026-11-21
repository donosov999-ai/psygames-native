// Regenerate the offline phoneme clips from the repository's synthetic voice bank.
// Uses afconvert on macOS or ffmpeg on other systems. No network is used.
import {execFileSync} from 'node:child_process';
import {existsSync, mkdirSync, readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';

const root = new URL('../../', import.meta.url);
const file = path => fileURLToPath(new URL(path, root));
const data = JSON.parse(readFileSync(file('flutter/assets/vocab/phoneme-pairs.json'))).pairs;
const voices = JSON.parse(readFileSync(file('flutter/assets/voice/voice-index.json'))).samples;
const output = 'flutter/assets/voice/phoneme-pairs/';
const jobs = [];
for (const [lang, pairs] of Object.entries(data)) {
  for (const word of new Set(pairs.flat())) {
    const name = voices[lang]?.[word];
    if (!/^[0-9a-f]{16}\.opus$/.test(name)) throw new Error(`No source: ${lang} ${word}`);
    const source = file(`voice/${lang}/${name}`);
    if (!existsSync(source)) throw new Error(`Missing clip: ${source}`);
    jobs.push([source, file(`${output}${lang}-${name.replace(/\.opus$/, '.m4a')}`)]);
  }
}
mkdirSync(file(output), {recursive: true});
for (const [source, target] of jobs) {
  if (process.platform === 'darwin') {
    execFileSync('/usr/bin/afconvert', ['-f', 'm4af', '-d', 'aac', '-b', '48000',
      source, target], {stdio: 'inherit'});
  } else {
    execFileSync('ffmpeg', ['-nostdin', '-hide_banner', '-loglevel', 'error', '-y', '-i',
      source, '-map_metadata', '-1', '-ac', '1', '-c:a', 'aac', '-b:a', '48k',
      '-movflags', '+faststart', target], {stdio: 'inherit'});
  }
}
console.log(`Phoneme Pairs: ${jobs.length} offline AAC clips across ${Object.keys(data).length} languages`);
