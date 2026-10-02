'use strict';
const fs=require('node:fs');
const XLSX=require('@e965/xlsx');
const {CsvFile}=require('./engine.cjs');
const EXCEL_EXT=/\.(?:xlsx|xls|xlsm|xlsb|xltx|xltm|xlt|xlam|xla|ods|fods|xml|gsheet-cache)$/i;
class WorkbookFile extends CsvFile {
  constructor(filePath,options={}) {
    // Workbook cells are read directly; no intermediate CSV or workbook rewrite.
    const instance=Object.create(new.target.prototype);
    instance.path=filePath;instance.fd=fs.openSync(filePath,'r');instance.closed=false;
    try {
      const stat=fs.fstatSync(instance.fd);if(!stat.isFile()||stat.size>256*1024*1024)throw Error('Excelファイルは256 MiB以内の通常ファイルを指定してください。');
      instance.size=stat.size;instance.mtime=stat.mtimeMs;instance.lastCheck=0;
      if(/\.gsheet-cache$/i.test(filePath)){const data=JSON.parse(fs.readFileSync(instance.fd,'utf8'));instance.workbook={SheetNames:data.sheets.map(s=>s.name),Sheets:Object.fromEntries(data.sheets.map(s=>[s.name,XLSX.utils.aoa_to_sheet(s.values.map(row=>row.map(String)))]))};}
      else instance.workbook=XLSX.read(fs.readFileSync(instance.fd),{type:'buffer',cellText:true,cellDates:false,cellNF:true,bookVBA:false});
      if(!instance.workbook.SheetNames.length)throw Error('ワークシートがありません。');
      instance.kind='excel';instance.literal=false;instance.encoding='workbook';instance.delimiter='';instance.bom=0;instance.newlines={};instance.warnings=['数式は保存済みの値を表示します。マクロ・数式の再計算は実行しません。'];instance.filters=[];instance.sorts=[];instance.excludedRows=[];instance.view=null;
      instance.setSheet(options.sheet||instance.workbook.SheetNames[0],options.headerRows??1);
      return instance;
    }catch(error){instance.close();throw error;}
  }
  setSheet(name,headerRows=this.requestedHeaderRows??1){
    if(!this.workbook.SheetNames.includes(name))throw Error('シートが見つかりません。');
    const sheet=this.workbook.Sheets[name],range=sheet['!ref']?XLSX.utils.decode_range(sheet['!ref']):null;
    const width=range?range.e.c+1:0, height=range?range.e.r+1:0;
    if(width*height>5000000)throw Error('Excelシートは500万セル以内です。');
    // Empty/short sheets clamp the effective count, but must not overwrite the
    // user's heading setting when returning to a longer sheet.
    this.requestedHeaderRows=Math.max(0,Math.min(30,headerRows));
    this.sheet=name;this.columns=width;this.starts=new Float64Array(height);this.headerRows=Math.min(this.requestedHeaderRows,height);
    this.cells=Array.from({length:height},(_,r)=>Array.from({length:width},(_,c)=>{
      const cell=sheet[XLSX.utils.encode_cell({r,c})];if(!cell)return '';
      if(cell.f&&cell.v===undefined)return '='+cell.f;
      return cell.w??XLSX.utils.format_cell(cell);
    }));
    this.view=null;this.filters=[];this.sorts=[];this.excludedRows=[];
    return super.configure({headerRows:this.headerRows});
  }
  row(index){return this.cells[index]||[];}
  metadata(){return {...super.metadata(),sheets:this.workbook.SheetNames,sheet:this.sheet,requestedHeaderRows:this.requestedHeaderRows,encoding:'workbook'};}
  configure(options={},progress){
    if(options.sheet&&options.sheet!==this.sheet){this.setSheet(options.sheet,options.headerRows??this.requestedHeaderRows);return super.configure({filters:options.filters||[],sorts:options.sorts||[],excludedRows:options.excludedRows||[]},progress);}
    const result=super.configure(options,progress);
    if(options.headerRows!==undefined)this.requestedHeaderRows=Math.max(0,Math.min(30,options.headerRows));
    return {...result,requestedHeaderRows:this.requestedHeaderRows};
  }
  text(){return this.cells.map(row=>row.join('\t')).join('\n');}
}
module.exports={WorkbookFile,EXCEL_EXT};
