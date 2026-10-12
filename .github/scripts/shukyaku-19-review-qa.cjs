'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const html = fs.readFileSync('owner.html', 'utf8');
function extract(name) {
  const start = html.indexOf('    function ' + name + '(');
  assert(start >= 0, 'function missing: ' + name);
  const match = html.slice(start).match(/^[\s\S]*?\n    \}\n/);
  assert(match, 'function closing brace missing: ' + name);
  return match[0];
}
class FixedDate extends Date {
  constructor(...args) { super(...(args.length ? args : ['2026-10-12T03:00:00Z'])); }
}
const elements = {};
const $ = id => (elements[id] ??= {value: '', textContent: '', innerHTML: '', className: ''});
const state = {
  tasks: [], keywords: [], pages:[{id:'p',page_name:'Example'}],
  managementSummary:{}, taskImpactSummary:{}
};
const escapeHtml = x=>String(x??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
const ctx = {$, state, Date:FixedDate, escapeHtml, document:{querySelectorAll:()=>[]},TASK_STATUS_OPTIONS:[['todo','未着手'],['paused','保留'],['done','完了']],
  summaryItems:()=>'', renderTaskImpact:()=>'', taskStatusBadge:()=>'', optionLabel:()=>'',window:{SHUKYAKU:{}},console};
vm.createContext(ctx);
vm.runInContext(['parsePauseNotes','taskPauseReviewState','renderTasks'].map(extract).join('\n')+
  ';globalThis.qa={taskPauseReviewState,renderTasks};',ctx);
const {taskPauseReviewState:review,renderTasks:render}=ctx.qa;
const make=(id,status,date,due_date='2026-08-13')=>({
  id,title:'TASK_'+id, status, priority:1, due_date, landing_page_id:'p',
  reason:'', result_metrics:{humanQa:{status:status==='paused'?'rollback':null}},
  recommended_action:date==null?'':['Existing text','','[保留管理]','保留理由：留保','再開条件：検証','次回確認日：'+date,'[/保留管理]'].join('\n')
});
assert.equal(review(make('a','paused','2026-10-11'),'2026-10-12'),'due');
assert.equal(review(make('a','paused','2026-10-12'),'2026-10-12'),'due');
assert.equal(review(make('a','paused','2026-10-13'),'2026-10-12'),'soon');
assert.equal(review(make('a','paused','2026-10-19'),'2026-10-12'),'soon');
assert.equal(review(make('a','paused','2026-10-20'),'2026-10-12'),'later');
assert.equal(review(make('a','paused',null),'2026-10-12'),'missing');
assert.equal(review(make('a','paused','2026-02-30'),'2026-10-12'),'missing');
assert.equal(review(make('a','done','2026-10-11'),'2026-10-12'),'not-paused');
state.tasks = [
  make('LATE','paused','2026-10-11'),
  make('FUTURE','paused','2026-10-20'),
  make('SOON','paused','2026-10-19'),
  make('NONE','paused',null),
  make('ACTIVE','todo',null),
  make('DONE','done','2026-10-10')
];
render();
let out=$('taskTableBody').innerHTML;
assert.equal($('taskReviewSummary').textContent,'保留確認：要確認1件・7日以内1件');
assert.match($('taskCountBadge').textContent,/6件（期限超過1件）/);
const order=['TASK_ACTIVE','TASK_LATE','TASK_SOON'];
for(let i=0;i<order.length-1;i++)assert(out.indexOf(order[i])<out.indexOf(order[i+1]),'incorrect task sort: '+order.join(','));
assert(out.includes('確認日超過：2026-10-11'));
assert(out.includes('7日以内の確認：2026-10-19'));
const pausedRow=out.split('TASK_SOON')[1].split('</tr>')[0];
assert(!pausedRow.includes('measureTask('),'paused rollback measurement must stay blocked');
$('taskReviewFilter').value='due';
render();
assert.match($('taskCountBadge').textContent,/1件/);
assert($('taskTableBody').innerHTML.includes('TASK_LATE'));
assert(!$('taskTableBody').innerHTML.includes('TASK_SOON'));
assert.equal($('taskReviewSummary').textContent,'保留確認：要確認1件・7日以内1件','reminders should remain global');
$('taskReviewFilter').value='soon';
render();
assert($('taskTableBody').innerHTML.includes('TASK_SOON'));
assert(!$('taskTableBody').innerHTML.includes('TASK_ACTIVE'));
$('taskReviewFilter').value='missing';
render();
assert($('taskTableBody').innerHTML.includes('TASK_NONE'));
assert(!$('taskTableBody').innerHTML.includes('TASK_FUTURE'));
$('taskReviewFilter').value='';
$('taskStatusFilter').value='todo';
render();
assert($('taskTableBody').innerHTML.includes('TASK_ACTIVE'));
assert(!$('taskTableBody').innerHTML.includes('TASK_LATE'));
$('taskStatusFilter').value='';
$('taskSearch').value='TASK_SOON';
render();
assert($('taskTableBody').innerHTML.includes('TASK_SOON'));
assert(!$('taskTableBody').innerHTML.includes('TASK_ACTIVE'));
console.log('SHUKYAKU-19 REVIEW DATES, COUNTS, FILTERS, SORT & ROLLBACK QA PASS');
