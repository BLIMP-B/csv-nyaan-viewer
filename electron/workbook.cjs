'use strict';
const fs=require('node:fs');
const XLSX=require('@e965/xlsx');
const {CsvFile}=require('./engine.cjs');
const {meaningfulBounds,workbookProfile,sampleProfile,identitySpec,rowKey}=require('./analysis-profile.cjs');
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
    const sheet=this.workbook.Sheets[name],{width,height}=meaningfulBounds(sheet,XLSX);
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
  analysisProfile(){this.analysisProfiles??=new Map();if(!this.analysisProfiles.has(this.sheet))this.analysisProfiles.set(this.sheet,workbookProfile(this));return this.analysisProfiles.get(this.sheet);}
  analysisSample(selections,all=false,limits={},visibility={}){
    const profile=this.analysisProfile();
    if(all){
      // Different metric rows are separate populations, never mixed units.
      if(profile.tables.length>1)return {headers:[],rows:[],sampleOrdinals:[],populationRows:0,populationColumns:0,truncated:false,keySchema:'partition:'+this.sheet,diagnostics:{...profile.diagnostics,notes:[...profile.diagnostics.notes,'全シートの一括結合では項目別表を除外します。分析シートで各項目を選択するか、指定テーブルを使用してください。']}};
      return profile.tables.length?sampleProfile(profile.tables[0],limits):{headers:[],rows:[],sampleOrdinals:[],populationRows:0,populationColumns:0,truncated:false,diagnostics:profile.diagnostics};
    }
    const sample=super.analysisSample(selections,all,limits,visibility),byColumn=new Map(profile.columns.map((c,i)=>[c,profile.headers[i]]));
    sample.headers=sample.sourceColumns.map((c,i)=>byColumn.get(c)||sample.headers[i]);
    const fullHeaders=Array.from({length:this.columns},(_,c)=>byColumn.get(c)||this.metadata().headers[c]),spec=identitySpec(fullHeaders,this.cells.slice(profile.headerRow+1,profile.headerRow+50));
    sample.columnRoles=sample.sourceColumns.map(c=>spec.roles[c]);sample.keySchema=spec.schema;sample.keyColumns=spec.keys.map(c=>fullHeaders[c]);
    if(spec.keys.length)sample.rowLabels=sample.sourceRows.map(r=>rowKey(this.cells[r-1],spec));
    sample.diagnostics={layout:'指定範囲',notes:['指定したセルを対象にします。識別番号・期間・分類は多変量分析の測定変量から除外します。'],excludedColumns:sample.headers.filter((_,c)=>sample.columnRoles[c]!=='measure'),keyColumns:sample.keyColumns};
    return sample;
  }
  tableSnapshot(selections,visibility={},raw=false){
    const table=super.tableSnapshot(selections,visibility,raw),profile=this.analysisProfile(),byColumn=new Map(profile.columns.map((c,i)=>[c,profile.headers[i]]));
    table.headers=table.sourceColumns.map((c,i)=>byColumn.get(c)||table.headers[i]);
    const headers=Array.from({length:this.columns},(_,c)=>byColumn.get(c)||this.metadata().headers[c]),spec=identitySpec(headers,this.cells.slice(profile.headerRow+1,profile.headerRow+50));
    table.columnRoles=table.sourceColumns.map(c=>spec.roles[c]);table.keySchema=spec.schema;table.keyColumns=spec.keys.map(c=>headers[c]);
    if(spec.keys.length)table.rowLabels=table.sourceRows.map(r=>rowKey(this.cells[r],spec));return table;
  }
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
