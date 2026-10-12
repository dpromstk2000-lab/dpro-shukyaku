'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const html = fs.readFileSync('owner.html', 'utf8');
function extract(name) {
  const i = html.indexOf('    function ' + name + '(');
  assert(i >= 0, 'missing function: ' + name);
  const matched = html.slice(i).match(/^[\s\S]*?\n    \}\n/);
  assert(matched, 'unclosed function: ' + name);
  return matched[0];
}
class FixedDate extends Date {
  constructor(...args) { super(...(args.length ? args : ['2026-10-12T03:00:00Z'])); }
}
const controls = ['all','overdue','due','soon','missing'].map(key => ({
  dataset: {taskFocus:key}, textContent:'', className:'', pressed:'',
  classList: { toggle(className, active) {this[className] = active;} },
  setAttribute(name,value) {if (name === 'aria-pressed') this.pressed = value;}
}));
const elems = {};
let scrollCount = 0, mutationCount = 0;
const $ = id => (elems[id] ??= {
  value:'', textContent:'',innerHTML:'',className:'',
  closest:()=>({scrollIntoView:()=>{scrollCount++}})
});
const document={querySelectorAll: selector => {
  assert.equal(selector,'[data-task-focus]');
  return controls;
}};
const state={
  taskFocus:'all',tasks:[],keywords:[],pages:[{id:'p',page_name:'Test'}],
  managementSummary:{},taskImpactSummary:{}
};
const escapeHtml=value=>String(value??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
const ctx={$ ,document,state,Date:FixedDate,escapeHtml,console,
  TASK_STATUS_OPTIONS:[['todo','未着手'],['doing','対応中'],['paused','保留'],['done','完了']],
  summaryItems:()=>'',renderTaskNextActions:()=>{},renderTaskImpact:()=>'',taskStatusBadge:()=>'',optionLabel:()=>'',window:{SHUKYAKU:{}},
  api:()=>{mutationCount++;throw Error('No API calls expected')}
};
vm.createContext(ctx);
const names=['parsePauseNotes','taskPauseReviewState','focusTaskList','resetTaskFocusFromManualFilter','renderTasks'];
vm.runInContext(names.map(extract).join('\n')+';globalThis.qa={focusTaskList,resetTaskFocusFromManualFilter,renderTasks};',ctx);
const {focusTaskList,resetTaskFocusFromManualFilter,renderTasks}=ctx.qa;
const make=(id,status,review=null,due='2026-08-13')=>({
  id,title:id,reason:'',status,priority:1,due_date:due,landing_page_id:'p',
  recommended_action:review===null?'':['[保留管理]','保留理由：待機','再開条件：検査','次回確認日：'+review,'[/保留管理]'].join('\n'),
  result_metrics:{humanQa:{status:status==='paused'?'rollback':null}}
});
state.tasks=[
 make('OVERDUE_A','todo',null),make('OVERDUE_B','doing',null,'2026-09-30'),
 make('PAUSED_DUE','paused','2026-10-11'),make('PAUSED_SOON','paused','2026-10-19'),
 make('PAUSED_MISSING','paused',null),make('DONE','done',null,'2026-07-01')
];
function ids(){return $('taskTableBody').innerHTML;}
renderTasks();
const counts=Object.fromEntries(controls.map(c=>[c.dataset.taskFocus,c.textContent]));
assert.equal(counts.all,'すべて表示');
assert.equal(counts.overdue,'期限超過 2件');
assert.equal(counts.due,'確認日到来 1件');
assert.equal(counts.soon,'7日以内 1件');
assert.equal(counts.missing,'確認日未設定 1件');
assert.equal($('taskReviewSummary').textContent,'保留確認：要確認1件・7日以内1件');
assert(ids().indexOf('OVERDUE_A') < ids().indexOf('PAUSED_DUE'));
$('taskSearch').value='hidden filter';
$('taskStatusFilter').value='done';
$('taskPriorityFilter').value='5';
$('taskReviewFilter').value='soon';
focusTaskList('overdue');
for (const id of ['taskSearch','taskStatusFilter','taskPriorityFilter','taskReviewFilter']) assert.equal($(id).value,'','one-click focus clears '+id);
assert.equal(state.taskFocus,'overdue');
assert(ids().includes('OVERDUE_A')&&ids().includes('OVERDUE_B'));
assert(!ids().includes('PAUSED_DUE')&&!ids().includes('PAUSED_SOON'));
assert.equal(controls[1].pressed,'true');
assert.equal(controls[1].classList['is-active'],true);
assert.equal(controls[0].pressed,'false');
assert.equal($('taskCountBadge').textContent,'2件（期限超過2件）');
focusTaskList('due');
assert(ids().includes('PAUSED_DUE')&&!ids().includes('OVERDUE_A'));
focusTaskList('soon');
assert(ids().includes('PAUSED_SOON')&&!ids().includes('PAUSED_DUE'));
focusTaskList('missing');
assert(ids().includes('PAUSED_MISSING')&&!ids().includes('PAUSED_SOON'));
focusTaskList('all');
assert.equal(state.taskFocus,'all');
assert.equal($('taskCountBadge').textContent,'6件（期限超過2件）');
assert(ids().includes('DONE'));
assert.equal(scrollCount,5);
focusTaskList('invalid');
assert.equal(scrollCount,5,'reject unsupported task focus');
state.taskFocus='soon';
$('taskStatusFilter').value='todo';
resetTaskFocusFromManualFilter();
assert.equal(state.taskFocus,'all');
assert(ids().includes('OVERDUE_A')&&!ids().includes('PAUSED_SOON'),'manual filters still apply');
assert.equal(mutationCount,0);
console.log('SHUKYAKU-20 QUICK ACTIONS, RESET, COUNTS, FILTERS, SAFETY QA PASS');
