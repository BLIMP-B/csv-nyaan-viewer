'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
const scope={exports:{}};vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/dock-state.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,scope);
const d=scope.exports,plain=v=>JSON.parse(JSON.stringify(v));
function valid(layout){const ids=d.POSITIONS.flatMap(p=>layout.groups[p]);assert.equal(ids.length,6);assert.equal(new Set(ids).size,6);assert.ok(d.PANES.every(id=>ids.includes(id)));for(const p of d.POSITIONS)if(layout.groups[p].length){assert.ok(layout.groups[p].includes(layout.active[p]));const open=layout.groups[p].filter(id=>layout.open.includes(id));assert.ok(open.length===0||open.length===layout.groups[p].length);}}
test('以前のペイン位置を移行し、破損設定でも全タブを重複なく復元する',()=>{
  const migrated=d.defaultDockLayout({previewPosition:'top',mergePosition:'left'});assert.deepEqual(plain(migrated.groups.top),['chart','table']);assert.ok(migrated.groups.left.includes('merge'));valid(migrated);
  const repaired=d.normalizeDockLayout({groups:{left:['workspace','workspace','bad'],right:['chart']},open:['bad','chart','chart'],active:{right:'table'}});valid(repaired);assert.deepEqual(plain(repaired.open),['chart','merge']);assert.equal(repaired.active.right,'chart');
});
test('閉じたタブの移動は結合先全体を開き、全方向の移動で一意性と領域の開閉を保つ',()=>{
  let state=d.showPane(d.showPane(d.defaultDockLayout(),'workspace'),'chart');
  state=d.movePane(state,'table','right');assert.ok(state.open.includes('table'));assert.equal(state.active.right,'table');assert.ok(state.groups.bottom.includes('chart'));
  for(const position of d.POSITIONS)for(const id of d.PANES){state=d.movePane(state,id,position);valid(state);assert.equal(d.panePosition(state,id),position);assert.equal(state.active[position],id);}
});
test('タブ順の変更と領域単位の開閉を保持し、グラフ自動表示はテーブルのフォーカスを奪わない',()=>{
  let state=d.showPane(d.showPane(d.defaultDockLayout(),'chart'),'table');state=d.showPane(state,'chart',false);assert.equal(state.active.bottom,'table');state=d.movePane(state,'table','bottom','chart');assert.deepEqual(plain(state.groups.bottom),['table','chart']);
  state=d.closePane(state,'table');assert.equal(state.active.bottom,'table');assert.ok(!state.open.includes('chart'));assert.ok(!state.open.includes('table'));state=d.togglePane(state,'table');assert.equal(state.active.bottom,'table');assert.ok(state.open.includes('chart'));valid(state);
});
test('JSON保存・復元は配置、並び順、開閉状態、選択タブを保持する',()=>{
  let state=d.movePane(d.defaultDockLayout(),'multivariate','right');state=d.movePane(state,'chart','right','multivariate');state=d.closePane(state,'chart');assert.deepEqual(plain(d.normalizeDockLayout(plain(state))),plain(state));valid(state);
});

test('上下左右のどのタブからでも同じ領域全体を開閉し、他の領域に影響しない',()=>{
  let state=d.defaultDockLayout();state=d.movePane(state,'selection','top');state=d.movePane(state,'multivariate','top');state=d.closePane(state,'selection');
  for(const position of d.POSITIONS){const ids=[...state.groups[position]];for(const id of ids){const before=state.open.filter(p=>!ids.includes(p));state=d.toggleGroup(state,id);assert.ok(ids.every(p=>state.open.includes(p)));assert.deepEqual(plain(state.open.filter(p=>!ids.includes(p))),plain(before));state=d.toggleGroup(state,ids.find(p=>p!==id)||id);assert.ok(ids.every(p=>!state.open.includes(p)));assert.deepEqual(plain(state.open.filter(p=>!ids.includes(p))),plain(before));valid(state);}}
});
test('旧版の部分開閉を領域単位に移行し、全最小化から選択タブと順序を復元する',()=>{
  const state=d.normalizeDockLayout({groups:{left:['workspace','selection','multivariate'],bottom:['table','chart'],right:['merge'],top:[]},open:['selection','chart'],active:{left:'selection',bottom:'table',right:'merge'}});assert.ok(['workspace','selection','multivariate','chart','table'].every(id=>state.open.includes(id)));assert.ok(!state.open.includes('merge'));valid(state);
  const closed=d.closePane(state,'chart'),restored=d.showPane(closed,'table');assert.deepEqual(plain(restored.groups),plain(state.groups));assert.equal(restored.active.bottom,'table');assert.deepEqual(plain(d.normalizeDockLayout(plain(restored))),plain(restored));
});
