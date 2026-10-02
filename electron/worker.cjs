'use strict';
const { parentPort } = require('node:worker_threads');
const { CsvFile } = require('./engine.cjs');
const {WorkbookFile,EXCEL_EXT}=require('./workbook.cjs');
const {analyze}=require('./statistics.cjs');
let file;
function onSheet(args,task){
  if(!file.workbook){return task();}
  const keys=['sheet','cells','starts','columns','headerRows','requestedHeaderRows','view','filters','sorts','excludedRows','headers'],saved=Object.fromEntries(keys.map(key=>[key,file[key]]));
  try{if(args.sheet&&args.sheet!==file.sheet)file.setSheet(args.sheet,saved.requestedHeaderRows);if(args.view)file.configure({filters:args.view.filters||[],sorts:args.view.sorts||[],excludedRows:args.view.excludedRows||[]});return task();}
  finally{Object.assign(file,saved);}
}
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
      case 'analysisSampleSheet': result=onSheet(args,()=>file.analysisSample(args.selections,args.all,args.limits,args.visibility));break;
      case 'createTable': result=onSheet(args,()=>{let selections=args.selections,raw=false;if(args.address){const {parseAddress}=require('./analysis-export.cjs');selections=[parseAddress(args.address)];const r=selections[0];if(Math.max(r.row0,r.row1)>=file.starts.length||Math.max(r.col0,r.col1)>=file.columns)throw Error('セル番地がシートの範囲外です。');raw=true;}return file.tableSnapshot(selections,args.visibility,raw);});break;
      case 'analyze':
        if(args.all&&file.workbook&&file.workbook.SheetNames.length>1){
          const active=file.sheet,names=file.workbook.SheetNames,sheets=names.map(name=>({name,result:onSheet({sheet:name},()=>analyze(file.analysisSample(null,true,{rows:Math.max(1,Math.floor(5000/names.length)),cells:Math.max(256,Math.floor(250000/names.length))}),true,{correlatedOnly:true}))}));
          result={...sheets.find(s=>s.name===active).result,sheets};
        }else result=analyze(file.analysisSample(args.selections||args.selection,args.all,{},args.all?{}:args.visibility),args.all,{correlatedOnly:!!args.all});break;
      case 'text': result = file.text(); break;
      case 'export': result = file.exportFile(args, progress); break;
      case 'copy': result = file.copy(args.selection, args.delimiter,args.columns); break;
      default: throw new Error('未対応の操作です。');
    }
    parentPort.postMessage({ requestId, result });
  } catch (error) { parentPort.postMessage({ requestId, error: error.message }); }
});
