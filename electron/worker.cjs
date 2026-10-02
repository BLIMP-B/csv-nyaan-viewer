'use strict';
const { parentPort } = require('node:worker_threads');
const { CsvFile } = require('./engine.cjs');
let file;
parentPort.on('message', ({ requestId, method, args }) => {
  const progress = value => parentPort.postMessage({ progress: value });
  try {
    let result;
    switch (method) {
      case 'open': if (file) file.close(); file = new CsvFile(args.path, args.options, progress); result = file.metadata(); break;
      case 'configure': result = file.configure(args, progress); break;
      case 'page': result = file.page(args.start, args.limit); break;
      case 'find': result = file.find(args.query, args.after, args.backwards); break;
      case 'selection': result = file.selectionTable(args.selections || args.selection, args.maxCells, args.sample, args.infer); break;
      case 'text': result = file.text(); break;
      case 'export': result = file.exportFile(args, progress); break;
      case 'copy': result = file.copy(args.selection, args.delimiter); break;
      default: throw new Error('未対応の操作です。');
    }
    parentPort.postMessage({ requestId, result });
  } catch (error) { parentPort.postMessage({ requestId, error: error.message }); }
});
