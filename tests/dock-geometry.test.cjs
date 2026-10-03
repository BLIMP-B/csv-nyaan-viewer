'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
function read(file,modules={}){const scope={exports:{},require:name=>modules[name]};vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,scope);return scope.exports;}
const dock=read('src/dock-state.ts'),g=read('src/dock-geometry.ts',{'./dock-state':dock});
function layout(){let l=dock.defaultDockLayout();l=dock.movePane(l,'selection','top');return dock.PANES.reduce((l,id)=>dock.showPane(l,id),l);}
const close=(a,b)=>assert.ok(Math.abs(a-b)<1e-8,a+' != '+b);
test('全ペインはデータとの比率を保って拡縮し、5領域で画面を隙間・重複なく覆う',()=>{
  const l=layout(),ratios={top:.35,bottom:.45,left:.25,right:.3};
  for(const bounds of [{width:1600,height:1000},{width:2000,height:1200},{width:1000,height:620}]){
    const a=g.dockGeometry(bounds,l,ratios),t=a.tracks;close(t.left+a.centerWidth+t.right,a.width);close(t.top+a.centerHeight+t.bottom,a.height);
    const area=(t.left+t.right)*a.height+(t.top+t.bottom)*a.centerWidth+a.centerWidth*a.centerHeight;close(area,a.width*a.height);
    assert.ok(a.centerWidth>=360);assert.ok(a.centerHeight>=320);for(const p of dock.POSITIONS)assert.ok(t[p]>=a.minimums[p]);
    if(bounds.width>=1600){close(t.left/a.centerWidth,ratios.left);close(t.right/a.centerWidth,ratios.right);}if(bounds.height>=1000){close(t.top/a.centerHeight,ratios.top);close(t.bottom/a.centerHeight,ratios.bottom);}
  }
});
test('最小サイズで止まっても元の比率を保持し、拡大すると復元する',()=>{
  const l=layout(),ratios={top:.1,bottom:3,left:.1,right:3},small=g.dockGeometry({width:1000,height:620},l,ratios),large=g.dockGeometry({width:8000,height:8000},l,ratios);close(small.tracks.top,180);close(small.tracks.left,190);assert.ok(small.centerHeight>=320);assert.ok(small.centerWidth>=360);close(large.tracks.top/large.centerHeight,.1);close(large.tracks.right/large.centerWidth,3);assert.equal(ratios.top,.1);
});
test('旧版のピクセル寸法を移行し、隙間を作った横幅・高さを共有トラックへ統合する',()=>{
  const l=layout(),bounds={width:1600,height:1000},prefs={dockSizes:{left:{width:240,height:250},right:{width:310,height:280},top:{height:200,width:500},bottom:{height:250,width:700}}},ratios=g.initialDockRatios(bounds,l,prefs),result=g.dockGeometry(bounds,l,ratios);close(result.tracks.left,240);close(result.tracks.right,310);close(result.tracks.top,200);close(result.tracks.bottom,250);close(result.centerWidth,1050);close(result.height,1000);
  const restored=g.dockGeometry(bounds,l,g.ratiosFromGeometry(result,ratios));for(const p of dock.POSITIONS)close(restored.tracks[p],result.tracks[p]);
});
test('閉じた領域は占有せず、破損比率とウィンドウより大きな旧設定でも有限の寸法へ修復する',()=>{
  const l=dock.defaultDockLayout(),closed=g.dockGeometry({width:1000,height:620},l,{left:NaN,right:Infinity,top:-1,bottom:0});close(closed.centerWidth,1000);close(closed.centerHeight,620);for(const p of dock.POSITIONS)close(closed.tracks[p],0);
  const open=layout(),ratios=g.initialDockRatios({width:1000,height:620},open,{dockSizes:{top:{height:99999},left:{width:99999}},dockRatios:{right:NaN}}),a=g.dockGeometry({width:1000,height:620},open,ratios);for(const n of Object.values(a.tracks))assert.ok(Number.isFinite(n));close(a.tracks.left+a.centerWidth+a.tracks.right,1000);close(a.tracks.top+a.centerHeight+a.tracks.bottom,680);assert.equal(g.dockWindowMinimum(open).height,714);assert.equal(g.dockWindowMinimum(l).height,560);
});
