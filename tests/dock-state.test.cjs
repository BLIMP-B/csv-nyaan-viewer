'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
const scope={exports:{}};vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/dock-state.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,scope);
const d=scope.exports,plain=v=>JSON.parse(JSON.stringify(v));
function valid(layout){const ids=d.POSITIONS.flatMap(p=>layout.groups[p]);assert.equal(ids.length,6);assert.equal(new Set(ids).size,6);assert.ok(d.PANES.every(id=>ids.includes(id)));for(const p of d.POSITIONS)if(layout.groups[p].length)assert.ok(layout.groups[p].includes(layout.active[p]));}
test('以前のペイン位置を移行し、破損設定でも全タブを重複なく復元する',()=>{
  const migrated=d.defaultDockLayout({previewPosition:'top',mergePosition:'left'});assert.deepEqual(plain(migrated.groups.top),['chart','table']);assert.ok(migrated.groups.left.includes('merge'));valid(migrated);
  const repaired=d.normalizeDockLayout({groups:{left:['workspace','workspace','bad'],right:['chart']},open:['bad','chart','chart'],active:{right:'table'}});valid(repaired);assert.deepEqual(plain(repaired.open),['chart']);assert.equal(repaired.active.right,'chart');
});
test('閉じたタブの移動はそのタブだけを開き、全方向の移動でも一意性と元グループを保つ',()=>{
  let state=d.showPane(d.showPane(d.defaultDockLayout(),'workspace'),'chart');
  state=d.movePane(state,'table','right');assert.ok(state.open.includes('table'));assert.equal(state.active.right,'table');assert.ok(state.groups.bottom.includes('chart'));
  for(const position of d.POSITIONS)for(const id of d.PANES){state=d.movePane(state,id,position);valid(state);assert.equal(d.panePosition(state,id),position);assert.equal(state.active[position],id);}
});
test('タブ順の変更と個別開閉は他のタブを閉じず、グラフ自動表示はテーブルのフォーカスを奪わない',()=>{
  let state=d.showPane(d.showPane(d.defaultDockLayout(),'chart'),'table');state=d.showPane(state,'chart',false);assert.equal(state.active.bottom,'table');state=d.movePane(state,'table','bottom','chart');assert.deepEqual(plain(state.groups.bottom),['table','chart']);
  state=d.closePane(state,'table');assert.equal(state.active.bottom,'chart');assert.ok(state.open.includes('chart'));assert.ok(!state.open.includes('table'));state=d.togglePane(state,'table');assert.equal(state.active.bottom,'table');assert.ok(state.open.includes('chart'));valid(state);
});
test('JSON保存・復元は配置、並び順、開閉状態、選択タブを保持する',()=>{
  let state=d.movePane(d.defaultDockLayout(),'multivariate','right');state=d.movePane(state,'chart','right','multivariate');state=d.closePane(state,'chart');assert.deepEqual(plain(d.normalizeDockLayout(plain(state))),plain(state));valid(state);
});
