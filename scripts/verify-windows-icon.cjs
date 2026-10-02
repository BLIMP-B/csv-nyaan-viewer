'use strict';
// Verify the built executable's PE resources, rather than only its build settings.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const asar = require('@electron/asar');
const root = path.resolve(__dirname, '..');
const executable = path.resolve(process.argv[2] || path.join(root, 'release/win-unpacked/CSV nyaan Viewer.exe'));
const digest = data => crypto.createHash('sha256').update(data).digest('hex');

function iconFrames(data) {
  if (data.readUInt16LE(0) !== 0 || data.readUInt16LE(2) !== 1) throw Error('Invalid ICO header');
  const frames = [];
  for (let i = 0; i < data.readUInt16LE(4); i++) {
    const entry = 6 + i * 16, size = data.readUInt32LE(entry + 8), offset = data.readUInt32LE(entry + 12);
    if (offset + size > data.length) throw Error('Truncated ICO frame');
    frames.push({ width: data[entry] || 256, height: data[entry + 1] || 256, hash: digest(data.subarray(offset, offset + size)) });
  }
  if (!frames.length) throw Error('ICO has no images');
  return frames;
}

function peResources(data) {
  const pe = data.readUInt32LE(0x3c);
  if (data.toString('ascii', pe, pe + 4) !== 'PE\0\0') throw Error('Invalid Windows executable');
  const optional = pe + 24, magic = data.readUInt16LE(optional);
  if (![0x10b, 0x20b].includes(magic)) throw Error('Unsupported PE header');
  const directories = optional + (magic === 0x20b ? 112 : 96);
  const resourceRva = data.readUInt32LE(directories + 16);
  const sections = optional + data.readUInt16LE(pe + 20), count = data.readUInt16LE(pe + 6);
  function offsetOf(rva) {
    for (let i = 0; i < count; i++) {
      const s = sections + i * 40, address = data.readUInt32LE(s + 12), size = data.readUInt32LE(s + 16);
      if (rva >= address && rva < address + size) return data.readUInt32LE(s + 20) + rva - address;
    }
    throw Error('PE resource address is outside file sections');
  }
  const resourceRoot = offsetOf(resourceRva), resources = [];
  function walk(relative, ids) {
    if (ids.length > 3) throw Error('Invalid PE resource depth');
    const directory = resourceRoot + relative, entries = data.readUInt16LE(directory + 12) + data.readUInt16LE(directory + 14);
    for (let i = 0; i < entries; i++) {
      const entry = directory + 16 + i * 8, id = data.readUInt32LE(entry), target = data.readUInt32LE(entry + 4);
      const next = [...ids, id];
      if (target & 0x80000000) walk(target & 0x7fffffff, next);
      else {
        const value = resourceRoot + target, start = offsetOf(data.readUInt32LE(value)), size = data.readUInt32LE(value + 4);
        if (start + size > data.length) throw Error('Truncated PE resource');
        resources.push({ ids: next, hash: digest(data.subarray(start, start + size)), data: data.subarray(start, start + size) });
      }
    }
  }
  walk(0, []);
  return resources;
}

function verify() {
  const frames = iconFrames(fs.readFileSync(path.join(root, 'assets/icon.ico')));
  const resources = peResources(fs.readFileSync(executable));
  const groups = resources.filter(r => r.ids[0] === 14);
  const group = groups.find(g => {
    const data = g.data;
    if (data.length < 6 || data.readUInt16LE(2) !== 1) return false;
    const hashes = [];
    for (let i = 0; i < data.readUInt16LE(4); i++) {
      const entry = 6 + i * 14;
      if (entry + 14 > data.length) return false;
      const id = data.readUInt16LE(entry + 12);
      const image = resources.find(r => r.ids[0] === 3 && r.ids[1] === id && r.ids[2] === g.ids[2]);
      if (!image || image.data.length !== data.readUInt32LE(entry + 8)) return false;
      hashes.push(image.hash);
    }
    return frames.every(f => hashes.includes(f.hash));
  });
  if (!group) {
    const details = groups.map(g => ({ id: g.ids[1], lang: g.ids[2], directory: g.data.toString('hex') }));
    throw Error('Executable does not contain the supplied ICO images in an icon group: ' + JSON.stringify(details));
  }
  const bundled = asar.extractFile(path.join(path.dirname(executable), 'resources/app.asar'), 'assets/icon.png');
  const original = fs.readFileSync(path.join(root, 'assets/icon.png'));
  if (!bundled.equals(original)) throw Error('Packaged app PNG does not match the supplied icon');
  console.log(JSON.stringify({ executable: path.basename(executable), iconGroup: group.ids[1], iconSizes: frames.map(f => f.width), bundledPngSHA256: digest(bundled) }));
}
try { verify(); } catch (error) { console.error(error.message); process.exitCode = 1; }
