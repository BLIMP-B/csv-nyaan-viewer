'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
function read(file,modules={}){const scope={exports:{},require:name=>modules[name]??require(name)};vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,scope);return scope.exports;}
const {objText}=read('src/analysis-plot.ts',{'./plot-layout':read('src/plot-layout.ts')}),{plotData}=require('../electron/analysis-export.cjs');
const mask=()=>({width:5,height:7,runs:[[0,0,5],[0,1,1],[4,1,1],[0,2,5],[0,3,1],[4,3,1],[0,4,1],[4,4,1],[0,5,1],[4,5,1],[0,6,5]]});
const model={title:'test',labels:['PC1 / 売上','PC2 / 費用','PC3 / 利益'],points:[{x:-4,y:1,z:2,row:2,cluster:0,series:0},{x:4,y:-2,z:-1,row:3,cluster:1,series:0},{x:2,y:3,z:-2,row:2,cluster:0,series:1}],dimension:3,lines:true,seriesNames:['PC','元列']};
function parse(source){
  const vertices=[],objects=new Map(),groups=new Map(),connections=[];let object='',group='';
  for(const line of source.trim().split('\n')){const [kind,...values]=line.trim().split(/\s+/);if(kind==='v'){assert.equal(values.length,3);const p=values.map(Number);assert.ok(p.every(Number.isFinite));vertices.push(p);}else if(kind==='o'){object=values.join(' ');objects.set(object,[]);}else if(kind==='g'){group=values.join(' ');groups.set(group,[]);}else if(kind==='f'||kind==='l'){const ids=values.map(Number);assert.ok(ids.every(id=>Number.isInteger(id)&&id>0&&id<=vertices.length));if(kind==='f'){assert.equal(ids.length,3);objects.get(object).push(ids);groups.get(group)?.push(ids);}else connections.push(ids);}else assert.ok(['#','s'].includes(kind),'unexpected OBJ primitive '+kind);}
  return {vertices,objects,groups,connections};
}
test('OBJの各プロットは元座標を中心とする大きな閉じた球体で、三角形と系列線を読み込める',()=>{
  const output=objText(model,mask),mesh=parse(output),radius=.1;
  assert.deepEqual(mesh.vertices.slice(0,model.points.length),model.points.map(({x,y,z})=>[x,y,z]));assert.equal(mesh.connections.length,1);assert.deepEqual(mesh.connections[0],[1,2]);assert.ok(plotData(output,'obj').length>0);
  model.points.forEach((point,index)=>{const faces=mesh.groups.get('point_'+(index+1));assert.equal(faces.length,168);const ids=new Set(faces.flat()),edges=new Map();assert.equal(ids.size,86);
    for(const id of ids){const v=mesh.vertices[id-1];assert.ok(Math.abs(Math.hypot(v[0]-point.x,v[1]-point.y,v[2]-point.z)-radius)<1e-10);}
    for(const [a,b,c] of faces){const u=mesh.vertices[b-1].map((v,i)=>v-mesh.vertices[a-1][i]),v=mesh.vertices[c-1].map((n,i)=>n-mesh.vertices[a-1][i]),normal=[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]],center=mesh.vertices[a-1].map((n,i)=>n-[point.x,point.y,point.z][i]);assert.ok(normal.reduce((n,v,i)=>n+v*center[i],0)>0,'sphere faces point outward');for(const [s,e] of [[a,b],[b,c],[c,a]]){const key=[s,e].sort((x,y)=>x-y).join('/'),edge=edges.get(key)||{count:0,direction:0};edge.count++;edge.direction+=s<e?1:-1;edges.set(key,edge);}}
    assert.ok([...edges.values()].every(e=>e.count===2&&e.direction===0),'sphere is watertight');
  });
});
test('XYZの矢印付き軸と実体のある軸名を単一OBJへ含め、負の値と日本語名を保持する',()=>{
  const labels=[],mesh=parse(objText(model,text=>{labels.push(text);return mask();}));assert.deepEqual(labels,['X: PC1 / 売上','Y: PC2 / 費用','Z: PC3 / 利益']);
  for(let axis=0;axis<3;axis++){const name='XYZ'[axis],shaft=mesh.objects.get('axis_'+name),letter=mesh.objects.get('axis_label_'+name);assert.equal(shaft.length,72);assert.ok(letter.length>0);const coordinates=[...new Set(shaft.flat())].map(id=>mesh.vertices[id-1][axis]);assert.ok(Math.max(...coordinates)>Math.max(...model.points.map(p=>p[['x','y','z'][axis]])));assert.ok(Math.min(...coordinates)<Math.min(...model.points.map(p=>p[['x','y','z'][axis]])));}
});
test('点のない退化軸や2Dにも有限の形状を出力し、線の指定・不正座標・空の文字描画を扱う',()=>{
  const flat={...model,dimension:2,lines:false,points:[{...model.points[0],x:0,y:0,z:0,series:0}],seriesNames:['zero']},mesh=parse(objText(flat,mask));assert.equal(mesh.connections.length,0);assert.ok(mesh.objects.has('axis_X'));assert.ok(mesh.objects.has('axis_Y'));assert.ok(!mesh.objects.has('axis_Z'));assert.ok(!mesh.objects.has('axis_label_Z'));
  const faces=mesh.groups.get('point_1');assert.ok([...new Set(faces.flat())].map(id=>Math.hypot(...mesh.vertices[id-1])).every(r=>Math.abs(r-.025)<1e-10));assert.throws(()=>objText({...model,points:[{...model.points[0],x:NaN}]},mask),/座標/);assert.throws(()=>objText(model,()=>({width:0,height:0,runs:[]})),/軸名/);
});
