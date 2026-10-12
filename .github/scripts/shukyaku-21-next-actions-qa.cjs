'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const html=fs.readFileSync('owner.html','utf8');
function extract(name) {
  const start=html.indexOf('    function '+name+'(');
  assert(start>=0,'missing '+name);
  const match=html.slice(start).match(/^[\s\S]*?\n    \}\n/);
  assert(match,'missing closure '+name);
  return match[0];
}
class FixedDate extends Date {
  constructor(...args){ super(...(args.length?args:['2026-10-12T03:00:00Z'])); }
}
const elements={};
const $=id=>(elements[id]??={value:'',hidden:false,innerHTML:''});
const state={taskFocus:'all',tasks:[]};
const escapeHtml=x=>String(x??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
let apiCalls=0, editorCalls=[];
const ctx={ $,state,Date:FixedDate,escapeHtml,
  TASK_STATUS_OPTIONS:[['todo','未着手'],['doing','対応中'],['paused','保留'],['done','完了']],
  optionLabel:(opts,value)=>opts.find(x=>x[0]===value)?.[1]||value,
  openEditor:(type,item)=>editorCalls.push({type,id:item.id}),api:()=>{apiCalls++},
  console
};
vm.createContext(ctx);
vm.runInContext(['renderTaskNextActions','openNextTaskEditor'].map(extract).join('\n')+
  ';globalThis.qa={renderTaskNextActions,openNextTaskEditor};',ctx);
const {renderTaskNextActions:render,openNextTaskEditor:open}=ctx.qa;
const task=(id,status='todo',priority=1,due_date='2026-08-13',recommended_action='推奨作業を確認')=>({
  id,title:id,priority,status,due_date,recommended_action,
  reason:'改善理由',result_metrics:{humanQa:{status:status==='paused'?'rollback':null}}
});
state.tasks=[
  task('NEXT_SECOND','todo',2),
  task('NEXT_FIRST','todo',1),
  task('SAFE_LATER','doing',1,'2026-11-01'),
  task('PAUSED','paused',1),
  task('DONE','done',1),
  task('ROLLBACK','todo',1),
];
state.tasks[5].result_metrics.humanQa.status='rollback';
render();
assert.equal($('taskNextActions').hidden,false,'priority panel should be shown without filters');
const markup=$('taskNextActions').innerHTML;
assert(markup.includes('全体の優先対応タスク'));
assert(markup.indexOf('NEXT_FIRST') < markup.indexOf('NEXT_SECOND'),'overdue and priority ordering');
assert(!markup.includes('PAUSED')&&!markup.includes('DONE')&&!markup.includes('ROLLBACK'),'unsafe tasks hidden');
assert(!markup.includes('SAFE_LATER'),'limit to two');
assert(markup.includes('未完了・対応可能 3件'));
assert.equal((markup.match(/data-task-open-id=/g)||[]).length,2,'exactly two visible edit controls');
open({target:{closest:()=>({dataset:{taskOpenId:'NEXT_FIRST'}})}});
assert.deepEqual(editorCalls,[{type:'task',id:'NEXT_FIRST'}],'existing editor invoked with selected task');
open({target:{closest:()=>({dataset:{taskOpenId:'ROLLBACK'}})}});
open({target:{closest:()=>({dataset:{taskOpenId:'PAUSED'}})}});
open({target:{closest:()=>({dataset:{taskOpenId:'UNKNOWN'}})}});
open({target:{closest:()=>null}});
assert.equal(editorCalls.length,1,'blocked/missing buttons must not open editor');
assert.equal(apiCalls,0,'never write data or measure on shortlist click');
$('taskReviewFilter').value='soon';
render();
assert.equal($('taskNextActions').hidden,true,'manual filter hides global card');
assert.equal($('taskNextActions').innerHTML,'');
$('taskReviewFilter').value='';
state.taskFocus='overdue';
render();
assert.equal($('taskNextActions').hidden,true,'focus mode hides global card');
state.taskFocus='all';
state.tasks=[task('<img src=x onerror=alert(1)>','todo',1,'2026-08-13','<script>bad()</script>')];
render();
assert.equal($('taskNextActions').hidden,false);
const escaped=$('taskNextActions').innerHTML;
assert(!escaped.includes('<img')&&!escaped.includes('<script>'),'title and advice must be escaped');
assert(escaped.includes('&lt;img')&&escaped.includes('&lt;script&gt;'));
state.tasks=[task('PAUSED','paused')];
render();
assert.equal($('taskNextActions').hidden,true,'no eligible tasks hides priority card');
assert.equal($('taskNextActions').innerHTML,'');
assert.equal(apiCalls,0);
console.log('SHUKYAKU-21 PRIORITY QUEUE, FILTER ISOLATION, XSS, EDIT-ONLY QA PASS');
