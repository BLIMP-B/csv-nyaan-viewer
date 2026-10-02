'use strict';
const fs = require('node:fs');
const iconv = require('iconv-lite');
const { TextDecoder } = require('node:util');
const MarkdownIt = require('markdown-it');
const path = require('node:path');
const crypto = require('node:crypto');
const BLOCK = 1024 * 1024;
const MAX_RECORD = 64 * BLOCK;
const ENCODINGS = ['utf8', 'cp932', 'euc-jp', 'utf16le', 'utf16be', 'utf32le', 'utf32be', 'windows1252', 'latin1'];

function detectEncoding(bytes) {
  if (bytes.length >= 4 && bytes.subarray(0, 4).equals(Buffer.from([255,254,0,0]))) return { encoding: 'utf32le', bom: 4 };
  if (bytes.length >= 4 && bytes.subarray(0, 4).equals(Buffer.from([0,0,254,255]))) return { encoding: 'utf32be', bom: 4 };
  if (bytes.subarray(0,3).equals(Buffer.from([239,187,191]))) return { encoding: 'utf8', bom: 3 };
  if (bytes.subarray(0,2).equals(Buffer.from([255,254]))) return { encoding: 'utf16le', bom: 2 };
  if (bytes.subarray(0,2).equals(Buffer.from([254,255]))) return { encoding: 'utf16be', bom: 2 };
  if (bytes.length > 4) {
    let even = 0, odd = 0;
    for (let i = 0; i < bytes.length; i++) if (bytes[i] === 0) i % 2 ? odd++ : even++;
    if (odd > bytes.length / 5 && even < odd / 4) return { encoding: 'utf16le', bom: 0 };
    if (even > bytes.length / 5 && odd < even / 4) return { encoding: 'utf16be', bom: 0 };
  }
  try { new TextDecoder('utf-8', { fatal: true }).decode(bytes, { stream: true }); return { encoding: 'utf8', bom: 0 }; }
  catch { return { encoding: 'cp932', bom: 0 }; }
}

function parseRecord(text, delimiter = ',') {
  const cells = []; let cell = '', quoted = false, start = true;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') { cell += '"'; i++; } else quoted = false;
      } else cell += ch;
    } else if (ch === delimiter) { cells.push(cell); cell = ''; start = true; }
    else if (ch === '"' && start) { quoted = true; start = false; }
    else { cell += ch; start = false; }
  }
  cells.push(cell); return cells;
}

function sampleRecords(text, delimiter, limit = 25) {
  const records = []; let start = 0, quoted = false, fieldStart = true;
  for (let i = 0; i < text.length && records.length < limit; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"') { if (text[i + 1] === '"') i++; else quoted = false; }
    } else if (ch === '"' && fieldStart) { quoted = true; fieldStart = false; }
    else if (ch === delimiter) fieldStart = true;
    else if (ch === '\n' || ch === '\r') {
      records.push(parseRecord(text.slice(start, i), delimiter));
      if (ch === '\r' && text[i + 1] === '\n') i++;
      start = i + 1; fieldStart = true;
    } else fieldStart = false;
  }
  if (!quoted && start < text.length && records.length < limit) records.push(parseRecord(text.slice(start), delimiter));
  return records;
}
function detectDelimiter(text, path = '') {
  const candidates = [',', '\t', ';', '|'];
  let best = path.toLowerCase().endsWith('.tsv') ? '\t' : ',', bestScore = -1;
  for (const candidate of candidates) {
    const rows = sampleRecords(text, candidate).filter(r => r.some(Boolean));
    if (!rows.length) continue;
    const frequencies = new Map();
    for (const row of rows) frequencies.set(row.length, (frequencies.get(row.length) || 0) + 1);
    for (const [width, count] of frequencies) {
      if (width < 2) continue;
      const score = count / rows.length * 100 + Math.min(width, 50) / 100;
      if (score > bestScore) { bestScore = score; best = candidate; }
    }
  }
  return best;
}
function columnName(n) {
  let name = ''; for (n++; n > 0; n = Math.floor((n - 1) / 26)) name = String.fromCharCode(65 + (n - 1) % 26) + name;
  return name;
}
// Decimal string comparison avoids rounding long IDs or precise decimals.
function decimalParts(value) {
  const m = value.trim().match(/^([+-]?)(\d*)(?:\.(\d*))?$/);
  if (!m || !(m[2] || m[3])) return null;
  const whole = (m[2] || '0').replace(/^0+(?=\d)/, ''), fraction = (m[3] || '').replace(/0+$/, '');
  return { sign: whole === '0' && !fraction ? 1 : m[1] === '-' ? -1 : 1, whole, fraction };
}
function compareDecimal(a, b) {
  const x = decimalParts(a), y = decimalParts(b);
  if (!x || !y) return null;
  if (x.sign !== y.sign) return x.sign - y.sign;
  let result = x.whole.length - y.whole.length;
  if (!result) result = x.whole < y.whole ? -1 : x.whole > y.whole ? 1 : 0;
  if (!result) { const length = Math.max(x.fraction.length, y.fraction.length); const xf = x.fraction.padEnd(length, '0'), yf = y.fraction.padEnd(length, '0'); result = xf < yf ? -1 : xf > yf ? 1 : 0; }
  return result === 0 ? 0 : result * x.sign;
}
function makeMatcher(rule) {
  const value = String(rule.value ?? ''), sensitive = !!rule.caseSensitive;
  const normalize = s => sensitive ? s : s.toLocaleLowerCase();
  const needle = normalize(value);
  let regex;
  if (rule.mode === 'regex') { if (value.length > 256) throw new Error('正規表現は256文字以内で指定してください。'); regex = new RegExp(value, sensitive ? 'u' : 'iu'); }
  return text => {
    const str = normalize(text);
    switch (rule.mode) {
      case 'equals': return str === needle;
      case 'notContains': return !str.includes(needle);
      case 'starts': return str.startsWith(needle);
      case 'ends': return str.endsWith(needle);
      case 'empty': return text === '';
      case 'notEmpty': return text !== '';
      case 'regex': return regex.test(text);
      case 'gt': return compareDecimal(text, value) > 0;
      case 'lt': { const c = compareDecimal(text, value); return c !== null && c < 0; }
      case 'gte': { const c = compareDecimal(text, value); return c !== null && c >= 0; }
      case 'lte': { const c = compareDecimal(text, value); return c !== null && c <= 0; }
      default: return str.includes(needle);
    }
  };
}
class CsvFile {
  constructor(path, options = {}, progress = () => {}) {
    this.path = path; this.kind = options.kind || (/\.md$/i.test(path) ? 'markdown' : /\.txt$/i.test(path) ? 'text' : 'csv'); this.literal = this.kind !== 'csv'; this.fd = fs.openSync(path, 'r'); this.closed = false;
    this.cache = new Map(); this.rowCache = new Map(); this.cacheBytes = 0;
    try {
      const stat = fs.fstatSync(this.fd);
      if (!stat.isFile()) throw new Error('通常のファイルを指定してください。');
      this.size = stat.size; this.mtime = stat.mtimeMs; this.lastCheck = 0;
      const sample = Buffer.alloc(Math.min(this.size, 128 * 1024)); fs.readSync(this.fd, sample, 0, sample.length, 0);
      const detected = detectEncoding(sample);
      this.encoding = options.encoding && options.encoding !== 'auto' ? options.encoding : detected.encoding;
      if (!ENCODINGS.includes(this.encoding)) throw new Error('未対応の文字コードです。');
      this.bom = detected.encoding === this.encoding ? detected.bom : 0;
      const decoded = iconv.decode(sample.subarray(this.bom), this.encoding);
      this.delimiter = options.delimiter && options.delimiter !== 'auto' ? options.delimiter : detectDelimiter(decoded, path);
      if (this.delimiter.length !== 1 || !/^[\x09\x20-\x7e]$/.test(this.delimiter) || this.delimiter === '"') throw new Error('区切り文字には引用符以外のASCII 1文字を指定してください。');
      this.starts = []; this.ends = []; this.widths = []; this.columns = 0; this.warnings = [];
      this.newlines = { CRLF: 0, LF: 0, CR: 0 }; this.index(progress);
      this.headerRows = Math.min(options.headerRows ?? (this.literal ? 0 : 1), this.starts.length); this.view = null;
      this.filters = []; this.sorts = []; this.configure({ headerRows: this.headerRows });
    } catch (error) { this.close(); throw error; }
  }
  index(progress) {
    const width = this.encoding.startsWith('utf32') ? 4 : this.encoding.startsWith('utf16') ? 2 : 1;
    const be = this.encoding.endsWith('be'), sep = this.delimiter.charCodeAt(0);
    const buffer = Buffer.alloc(BLOCK); let rowStart = this.bom, quoted = false, pendingQuote = false, fieldStart = true, pendingCR = false, skipUnits = 0, fieldCount = 1;
    const add = end => {
      if (end - rowStart > MAX_RECORD) throw new Error('1レコードが64 MiBを超えています。読み込みを中止しました。');
      this.starts.push(rowStart); this.ends.push(end); this.widths.push(fieldCount); this.columns = Math.max(this.columns, fieldCount); fieldCount = 1;
    };
    // BLOCK is divisible by each supported code-unit width, including BOM offsets.
    for (let pos = this.bom; pos < this.size; pos += BLOCK) {
      const read = fs.readSync(this.fd, buffer, 0, Math.min(BLOCK, this.size - pos), pos);
      for (let i = 0; i + width <= read; i += width) {
        const offset = pos + i;
        if (skipUnits) { skipUnits--; continue; }
        const code = width === 4 ? (be ? buffer.readUInt32BE(i) : buffer.readUInt32LE(i)) : width === 2 ? (be ? buffer.readUInt16BE(i) : buffer.readUInt16LE(i)) : buffer[i];
        if (width === 1 && this.encoding === 'cp932' && ((code >= 0x81 && code <= 0x9f) || (code >= 0xe0 && code <= 0xfc))) { skipUnits = 1; fieldStart = false; continue; }
        if (width === 1 && this.encoding === 'euc-jp' && code >= 0x8e) { skipUnits = code === 0x8f ? 2 : 1; fieldStart = false; continue; }
        if (pendingCR) {
          pendingCR = false;
          if (code === 10) { rowStart = offset + width; this.newlines.CRLF++; this.newlines.CR--; continue; }
        }
        if (quoted) {
          if (pendingQuote) {
            pendingQuote = false;
            if (code === 34) continue;
            quoted = false;
          } else { if (code === 34) pendingQuote = true; continue; }
        }
        if (!this.literal && code === 34 && fieldStart) { quoted = true; fieldStart = false; }
        else if (!this.literal && code === sep) { fieldCount++; fieldStart = true; }
        else if (code === 13 || code === 10) {
          add(offset); rowStart = offset + width; fieldStart = true;
          if (code === 13) { pendingCR = true; this.newlines.CR++; } else this.newlines.LF++;
        } else fieldStart = false;
        if (offset - rowStart > MAX_RECORD) throw new Error('1レコードが64 MiBを超えています。');
      }
      progress(Math.min(1, (pos + read) / Math.max(this.size, 1)));
    }
    if ((this.size - this.bom) % width) this.warnings.push('文字コードの単位に合わない末尾バイトがあります。文字コード指定を確認してください。');
    if (quoted && !pendingQuote) this.warnings.push('閉じられていない引用符があります。末尾までを1レコードとして表示します。');
    if (rowStart < this.size) add(this.size);
    if (this.widths.some(n => n !== this.columns)) this.warnings.push('列数が異なるレコードがあります。空欄を補って表示しています。');
    // Typed indexes keep retained memory proportional to records, not file bytes.
    this.starts = Float64Array.from(this.starts); this.ends = Float64Array.from(this.ends); this.widths = Uint32Array.from(this.widths);
  }
  checkChanged() {
    if (this.closed) throw new Error('ファイルは閉じられています。');
    const now = Date.now(); if (now - this.lastCheck < 1000) return;
    this.lastCheck = now;
    const stat = fs.statSync(this.path), openStat = fs.fstatSync(this.fd);
    if (stat.size !== this.size || stat.mtimeMs !== this.mtime || stat.ino !== openStat.ino) throw new Error('元ファイルが変更されました。再読み込みしてください。');
  }
  readBytes(start, end) {
    const length = end - start;
    if (!length) return Buffer.alloc(0);
    const blockStart = Math.floor(start / BLOCK) * BLOCK;
    if (end <= blockStart + BLOCK) {
      let block = this.cache.get(blockStart);
      if (!block) {
        block = Buffer.alloc(Math.min(BLOCK, this.size - blockStart)); fs.readSync(this.fd, block, 0, block.length, blockStart);
        if (this.cache.size >= 8) this.cache.delete(this.cache.keys().next().value);
        this.cache.set(blockStart, block);
      }
      return block.subarray(start - blockStart, end - blockStart);
    }
    const bytes = Buffer.alloc(length); fs.readSync(this.fd, bytes, 0, length, start); return bytes;
  }
  row(index) {
    if (index < 0 || index >= this.starts.length) return [];
    if (this.rowCache.has(index)) return this.rowCache.get(index);
    const bytes = this.readBytes(this.starts[index], this.ends[index]);
    const text = iconv.decode(bytes, this.encoding);
    const row = this.literal ? [text] : parseRecord(text, this.delimiter);
    // Bound retained cell text, including pathological wide/long records.
    if (bytes.length < BLOCK) {
      if (this.rowCache.size >= 500 || this.cacheBytes + bytes.length > 16 * BLOCK) { this.rowCache.clear(); this.cacheBytes = 0; }
      this.rowCache.set(index, row); this.cacheBytes += bytes.length;
    }
    return row;
  }
  metadata() {
    const headers = [];
    for (let c = 0; c < this.columns; c++) {
      const values = []; for (let r = 0; r < this.headerRows; r++) values.push(this.row(r)[c] || '');
      headers.push(values.filter(Boolean).join(' / ') || columnName(c));
    }
    const lineEndings = Object.entries(this.newlines).filter(([,n]) => n > 0).map(([type]) => type).join(' / ') || 'なし';
    return { kind: this.kind, path: this.path, size: this.size, encoding: this.encoding, delimiter: this.delimiter, bom: this.bom, records: this.starts.length, columns: this.columns, headerRows: this.headerRows, headers, count: this.count, lineEndings, warnings: this.warnings };
  }
  get count() { return this.view ? this.view.length : Math.max(0, this.starts.length - this.headerRows); }
  sourceIndex(index) { return this.view ? this.view[index] : index + this.headerRows; }
  configure(options = {}, progress = () => {}) {
    this.checkChanged();
    const headerRows = Math.max(0, Math.min(30, this.starts.length, options.headerRows ?? this.headerRows));
    const filters = options.filters ?? this.filters, sorts = options.sorts ?? this.sorts;
    if (!Array.isArray(filters) || filters.length > 30 || !Array.isArray(sorts) || sorts.length > 8) throw new Error('条件が多すぎます。');
    const matchers = filters.map(rule => ({ rule, match: makeMatcher(rule) }));
    let view = null;
    if (filters.length || sorts.length) {
      const indices = [];
      for (let r = headerRows; r < this.starts.length; r++) {
        const row = this.row(r);
        if (matchers.every(({rule, match}) => rule.column === -1 ? row.some(match) : match(row[rule.column] ?? ''))) indices.push(r);
        if (r % 20000 === 0) progress(r / Math.max(this.starts.length, 1) * 0.7);
      }
      if (sorts.length) {
        const collator = new Intl.Collator('ja', { numeric: true, sensitivity: 'variant' });
        const keys = new Map(indices.map(i => [i, sorts.map(s => this.row(i)[s.column] || '')]));
        indices.sort((a, b) => {
          const ak = keys.get(a), bk = keys.get(b);
          for (let s = 0; s < sorts.length; s++) {
            const compare = sorts[s].mode === 'numeric' ? compareDecimal(ak[s], bk[s]) : null;
            const result = compare ?? collator.compare(ak[s], bk[s]);
            if (result) return sorts[s].direction === 'desc' ? -result : result;
          }
          return a - b;
        });
      }
      view = Uint32Array.from(indices);
    }
    // Commit only after all validation and computation succeed.
    this.headerRows = headerRows; this.filters = filters; this.sorts = sorts; this.view = view;
    progress(1); return this.metadata();
  }
  page(start, limit = 120) {
    this.checkChanged(); start = Math.max(0, Math.min(this.count, Math.floor(start))); limit = Math.max(0, Math.min(250, Math.floor(limit)));
    const rows = [];
    for (let i = start; i < Math.min(this.count, start + limit); i++) { const source = this.sourceIndex(i); rows.push({ index: i, source, cells: this.row(source) }); }
    return { start, rows, count: this.count };
  }
  find(query, after = { row: 0, column: -1 }, backwards = false) {
    this.checkChanged(); if (!this.count || !this.columns) return null;
    const match = makeMatcher({ ...query, mode: query.regex ? 'regex' : query.whole ? 'equals' : 'contains' });
    const startRow = Math.max(0, Math.min(this.count - 1, after.row));
    let r = startRow, c = after.column, attempts = 0;
    for (;;) {
      c += backwards ? -1 : 1;
      if (c >= this.columns) { r = (r + 1) % this.count; c = 0; }
      if (c < 0) { r = (r - 1 + this.count) % this.count; c = this.columns - 1; }
      if (match(this.row(this.sourceIndex(r))[c] || '')) return { row: r, column: c };
      if (++attempts >= this.count * this.columns) return null;
    }
  }
  copy(selection, delimiter = '\t') {
    this.checkChanged();
    const r0 = Math.max(0, Math.min(selection.row0, selection.row1)), r1 = Math.min(this.count - 1, Math.max(selection.row0, selection.row1));
    const c0 = Math.max(0, Math.min(selection.col0, selection.col1)), c1 = Math.min(this.columns - 1, Math.max(selection.col0, selection.col1));
    if ((r1 - r0 + 1) * (c1 - c0 + 1) > 1000000) throw new Error('コピーは100万セル以内の範囲を選んでください。');
    const quote = s => s.includes(delimiter) || /["\r\n]/.test(s) ? '"' + s.replaceAll('"', '""') + '"' : s;
    const lines = []; let size = 0;
    for (let r = r0; r <= r1; r++) {
      const row = this.row(this.sourceIndex(r)); const cells = [];
      for (let c = c0; c <= c1; c++) cells.push(quote(row[c] || ''));
      const line = cells.join(delimiter); size += line.length;
      if (size > 16 * BLOCK) throw new Error('コピー内容が16 Mi文字を超えています。範囲を小さくしてください。');
      lines.push(line);
    }
    return lines.join('\r\n');
  }
  selectionTable(selection, maxCells = 100000, sample = false, infer = false) {
    this.checkChanged();
    const ranges = (Array.isArray(selection) ? selection : [selection]).filter(Boolean).slice(0,100).map(s=>({r0:Math.max(0,Math.min(s.row0,s.row1)),r1:Math.min(this.count-1,Math.max(s.row0,s.row1)),c0:Math.max(0,Math.min(s.col0,s.col1)),c1:Math.min(this.columns-1,Math.max(s.col0,s.col1))}));
    if (!ranges.length) return {headers:[],rows:[]};
    const colSet=new Set(); for(const range of ranges)for(let c=range.c0;c<=range.c1;c++)colSet.add(c);
    const cols=[...colSet].sort((a,b)=>a-b), rowSet=new Set();
    const rowCap=Math.floor(maxCells/Math.max(cols.length,1));let truncated=false;
    // Enforce a bound before materializing a potentially enormous selection.
    for(const range of [...ranges].sort((a,b)=>a.r0-b.r0))for(let r=range.r0;r<=range.r1;r++) {if(rowSet.has(r))continue;if(rowSet.size>=rowCap){truncated=true;break;}rowSet.add(r);}
    if(truncated&&!sample)throw new Error('選択範囲が大きすぎます。範囲を小さくしてください。');
    const indices=[...rowSet].sort((a,b)=>a-b), rows=[];let textLength=0;
    for(const r of indices){const source=this.row(this.sourceIndex(r));const values=cols.map(c=>ranges.some(s=>r>=s.r0&&r<=s.r1&&c>=s.c0&&c<=s.c1)?source[c]||'':'');textLength+=values.reduce((n,v)=>n+v.length,0);if(textLength>16*BLOCK)throw new Error('選択内容が16 Mi文字を超えています。');rows.push(values);}
    const allHeaders=this.metadata().headers;const headers=cols.map(c=>allHeaders[c]);const inferred=[];
    const textual=s=>!!s?.trim()&&!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(s.trim());
    if(infer&&indices.length){
      for(let n=0;n<cols.length;n++){
        const c=cols[n];if(this.headerRows&&headers[n]!==columnName(c))continue;
        const first=indices.find(r=>ranges.some(s=>r>=s.r0&&r<=s.r1&&c>=s.c0&&c<=s.c1));
        if(first===undefined)continue;
        for(let src=this.sourceIndex(first)-1;src>=0;src--){const candidate=this.row(src)[c];if(textual(candidate)){headers[n]=candidate;inferred.push(columnName(c)+'列: '+candidate);break;}}
      }
      const labelSelected=cols.some((_,c)=>rows.some(row=>textual(row[c])));
      if(!labelSelected){
        const labels=indices.map(r=>{const row=this.row(this.sourceIndex(r));const selectedMin=Math.min(...ranges.filter(s=>r>=s.r0&&r<=s.r1).map(s=>s.c0));for(let c=selectedMin-1;c>=0;c--)if(textual(row[c]))return row[c];return String(this.sourceIndex(r)+1);});
        headers.unshift('行ラベル（推定）');for(let i=0;i<rows.length;i++)rows[i].unshift(labels[i]);inferred.push('行ラベル: A列方向へ走査（候補がなければ元レコード番号）');
      }
    }
    return {headers,rows,total:rows.length*cols.length,truncated,inferred};
  }
  text() {
    this.checkChanged();
    if (this.size > 16 * BLOCK) throw new Error('プレビューは16 MiB以内です。ソース表示で大容量ファイルを閲覧してください。');
    return iconv.decode(this.readBytes(this.bom, this.size), this.encoding);
  }
  exportFile(options, progress = () => {}) {
    this.checkChanged();
    const target = options.path, format = options.format;
    if (!['csv','tsv','md','txt'].includes(format)) throw new Error('未対応の出力形式です。');
    const normalize = p => process.platform === 'win32' ? path.resolve(p).toLowerCase() : path.resolve(p);
    if (normalize(target) === normalize(this.path)) throw new Error('元ファイルにはエクスポートできません。別の名前を指定してください。');
    if (fs.existsSync(target)) {
      const src = fs.fstatSync(this.fd), dst = fs.statSync(target);
      if (src.dev === dst.dev && src.ino === dst.ino) throw new Error('元ファイルへの出力はできません。');
    }
    const temp = path.join(path.dirname(target), '.csv-lens-' + crypto.randomUUID() + '.tmp');
    let out;
    try {
      out = fs.openSync(temp, 'wx');
      const encoding = options.encoding === 'source' ? this.encoding : 'utf8';
      const write = value => fs.writeSync(out, iconv.encode(value, encoding));
      if (options.bom) fs.writeSync(out, iconv.encode('\ufeff', encoding));
      if (this.literal && (format === 'txt' || format === 'md')) {
        // Stream original source text; rendering never replaces Markdown source.
        const decoder = iconv.getDecoder(this.encoding); const buffer = Buffer.alloc(BLOCK);
        for (let pos = this.bom; pos < this.size; pos += BLOCK) {
          const n = fs.readSync(this.fd, buffer, 0, Math.min(BLOCK, this.size - pos), pos);
          write(decoder.write(buffer.subarray(0, n))); progress((pos + n) / this.size);
        }
        write(decoder.end());
      } else {
        let rows;
        if (this.kind === 'markdown' && options.markdownTable) {
          const tokens = new MarkdownIt().parse(this.text(), {}); rows = [];
          let inTable = false, inCell = false, row = [];
          for (const token of tokens) {
            if (token.type === 'table_open') { if (rows.length) break; inTable = true; }
            if (!inTable) continue;
            if (token.type === 'tr_open') row = [];
            if (token.type === 'td_open' || token.type === 'th_open') inCell = true;
            if (token.type === 'inline' && inCell) row.push((token.children || []).map(t => t.type === 'softbreak' || t.type === 'hardbreak' ? '\n' : ['text','code_inline','html_inline'].includes(t.type) ? t.content : t.type === 'image' ? t.content : '').join(''));
            if (token.type === 'td_close' || token.type === 'th_close') inCell = false;
            if (token.type === 'tr_close') rows.push(row);
            if (token.type === 'table_close') break;
          }
          if (!rows.length) throw new Error('Markdownに表がありません。ソース行としての出力を選んでください。');
        }
        const current = options.scope === 'view';
        if (options.scope === 'selection' && (options.selections || options.selection)) { const table = this.selectionTable(options.selections || options.selection, 1000000); rows = [table.headers, ...table.rows]; }
        const count = rows ? rows.length : current ? this.headerRows + this.count : this.starts.length;
        const getRow = n => rows ? rows[n] : this.row(current && n >= this.headerRows ? this.sourceIndex(n - this.headerRows) : n);
        const delimiter = format === 'csv' ? ',' : '\t';
        const quote = s => s.includes(delimiter) || /["\r\n]/.test(s) ? '"' + s.replaceAll('"', '""') + '"' : s;
        const md = s => s.replaceAll('\\', '\\\\').replaceAll('|', '\\|').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replace(/\r\n|\r|\n/g, '<br>');
        const width = rows ? Math.max(...rows.map(r => r.length)) : this.columns;
        for (let r = 0; r < count; r++) {
          const row = getRow(r); const cells = Array.from({ length: width }, (_, c) => row[c] || '');
          if (format === 'md') {
            write('| ' + cells.map(md).join(' | ') + ' |\r\n');
            if (r === 0) write('| ' + cells.map(() => '---').join(' | ') + ' |\r\n');
          } else write(cells.map(quote).join(delimiter) + '\r\n');
          if (r % 20000 === 0) progress(r / Math.max(count, 1));
        }
      }
      this.lastCheck = 0; this.checkChanged(); fs.fsyncSync(out); fs.closeSync(out); out = undefined;
      fs.renameSync(temp, target); progress(1); return { path: target, size: fs.statSync(target).size };
    } finally { if (out !== undefined) fs.closeSync(out); if (fs.existsSync(temp)) fs.unlinkSync(temp); }
  }
  close() { if (!this.closed) { this.closed = true; fs.closeSync(this.fd); } }
}
module.exports = { CsvFile, parseRecord, detectEncoding, detectDelimiter, makeMatcher, compareDecimal, columnName, ENCODINGS };
