'use strict';
const { parentPort } = require('node:worker_threads');
const { CsvFile } = require('./engine.cjs');
const {WorkbookFile,EXCEL_EXT}=require('./workbook.cjs');
const {analyze}=require('./statistics.cjs');
let file;
parentPort.on('message', ({ requestId, method, args }) => {
  const progress = value => parentPort.postMessage({ progress: value });
  try {
    let result;
    switch (method) {
      case 'open': if (file) file.close(); file = EXCEL_EXT.test(args.path)?new WorkbookFile(args.path,args.options):new CsvFile(args.path, args.options, progress); result = file.metadata(); break;
      case 'configure': result = file.configure(args, progress); break;
      case 'excludeSelection': result=file.excludeSelection(args.selections,progress); break;
      case 'selectedSources': result=file.selectedSources(args.selections); break;
      case 'sortColumns': result=file.sortColumns(args.row,args.direction,args.columns); break;
      case 'move': result=file.moveCell(args); break;
      case 'page': result = file.page(args.start, args.limit); break;
      case 'find': result = file.find(args.query, args.after, args.backwards); break;
      case 'selection': result = file.selectionTable(args.selections || args.selection, args.maxCells, args.sample, args.infer,args.columns); break;
      case 'analyze':
        if(args.all&&file.workbook&&file.workbook.SheetNames.length>1){
          const saved=Object.fromEntries(['sheet','cells','starts','columns','headerRows','view','filters','sorts','excludedRows'].map(key=>[key,file[key]])),names=file.workbook.SheetNames,sheets=[];
          try{for(const name of names){file.setSheet(name,saved.headerRows);sheets.push({name,result:analyze(file.analysisSample(null,true,{rows:Math.max(1,Math.floor(5000/names.length)),cells:Math.max(256,Math.floor(250000/names.length))}),true)});}}
          finally{Object.assign(file,saved);}
          result={...sheets.find(s=>s.name===saved.sheet).result,sheets};
        }else result=analyze(file.analysisSample(args.selections||args.selection,args.all),args.all);break;
      case 'text': result = file.text(); break;
      case 'export': result = file.exportFile(args, progress); break;
      case 'copy': result = file.copy(args.selection, args.delimiter,args.columns); break;
      default: throw new Error('未対応の操作です。');
    }
    parentPort.postMessage({ requestId, result });
  } catch (error) { parentPort.postMessage({ requestId, error: error.message }); }
});
