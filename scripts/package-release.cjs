'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const JSZip = require('jszip');

async function packageRelease() {
  const root = path.resolve(__dirname, '..');
  const destination = path.resolve(process.argv[2] || path.join(root, 'release'));
  const { version } = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  if (!/^\d+\.\d+\.\d+(?:-[\w.-]+)?$/.test(version)) throw Error('Invalid package version');
  const prefix = `CSV-nyaan-Viewer-${version}`;
  const windows = path.join(destination, `${prefix}-Windows-x64.zip`);
  if (!fs.statSync(windows).isFile()) throw Error('Windows ZIP is missing');
  const archive = new JSZip();
  function add(relative) {
    const full = path.join(root, relative), stat = fs.lstatSync(full);
    if (stat.isSymbolicLink()) return;
    if (stat.isDirectory()) {
      for (const entry of fs.readdirSync(full).sort()) add(path.join(relative, entry));
    } else if (stat.isFile()) {
      archive.file('csv-viewer/' + relative.split(path.sep).join('/'), fs.readFileSync(full), { date: stat.mtime, unixPermissions: 0o100644 });
    }
  }
  for (const item of ['.github', '.gitignore', 'LICENSE', 'README.md', 'docs', 'electron', 'index.html', 'package.json', 'package-lock.json', 'playwright.config.ts', 'samples', 'scripts', 'src', 'tests', 'tsconfig.json', 'vite.config.ts']) add(item);
  const source = path.join(destination, `${prefix}-source.zip`);
  fs.writeFileSync(source, await archive.generateAsync({ type: 'nodebuffer', platform: 'UNIX', compression: 'DEFLATE', compressionOptions: { level: 9 } }));
  const lines = [];
  for (const file of [windows, source]) {
    const hash = crypto.createHash('sha256');
    for await (const chunk of fs.createReadStream(file)) hash.update(chunk);
    lines.push(`${hash.digest('hex')}  ${path.basename(file)}`);
  }
  fs.writeFileSync(path.join(destination, 'SHA256SUMS.txt'), lines.join('\n') + '\n');
  if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, `version=${version}\n`);
  console.log(`Packaged Windows ZIP, source and checksums for ${version}`);
}
packageRelease().catch(error => { console.error(error.message); process.exitCode = 1; });
