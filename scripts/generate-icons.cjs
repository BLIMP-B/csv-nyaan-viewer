'use strict';
// Convert the supplied artwork to application formats without redrawing it.
// Requires ImageMagick's `convert` command; not used by the app or normal builds.
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const assets = path.resolve(__dirname, '../assets');
function convert(args) {
  const result = spawnSync('convert', args, { maxBuffer: 16 * 1024 * 1024 });
  if (result.error || result.status !== 0) throw result.error || Error(result.stderr.toString());
  return result.stdout;
}
fs.writeFileSync(path.join(assets, 'icon.png'), convert([path.join(assets, 'icon-source.jpg'), '-strip', 'PNG32:-']));
const sizes = [256, 128, 64, 48, 32, 24, 16];
const frames = sizes.map(size => convert([path.join(assets, 'icon.png'), '-filter', 'point', '-resize', `${size}x${size}`, '-strip', 'PNG32:-']));
// Use PNG for every frame. The resource editor's 16-bit size field cannot
// describe a 128px uncompressed RGBA icon (over 64 KiB).
const directory = Buffer.alloc(6 + sizes.length * 16);
directory.writeUInt16LE(1, 2);
directory.writeUInt16LE(sizes.length, 4);
let offset = directory.length;
frames.forEach((frame, i) => {
  if (frame.length > 65535) throw Error('ICO frame exceeds the Windows resource editor size limit');
  const entry = 6 + i * 16;
  directory[entry] = directory[entry + 1] = sizes[i] === 256 ? 0 : sizes[i];
  directory.writeUInt16LE(1, entry + 4);
  directory.writeUInt16LE(32, entry + 6);
  directory.writeUInt32LE(frame.length, entry + 8);
  directory.writeUInt32LE(offset, entry + 12);
  offset += frame.length;
});
fs.writeFileSync(path.join(assets, 'icon.ico'), Buffer.concat([directory, ...frames]));
console.log(JSON.stringify({ sizes, frameBytes: frames.map(frame => frame.length), icoBytes: offset }));
