'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const html=fs.readFileSync('owner.html','utf8');
function extract(name){
  const marker='    function '+name+'(';
  const index=html.indexOf(marker);
  assert(index>=0,'function not found: '+name);
  const match=html.slice(index).match(/^[\s\S]*?\n    \}\n/);
  assert(match,'closing bracket not found: '+name);
  return match[0];
}
class FixedDate extends Date{
  constructor(...a){ super(...(a.length?a:['2026-10-12T03:00:00Z'])); }
}
const elements={};
const $=id=>(elements[id]??={value:'',innerHTML:'',textContent:'',disabled:false,className:''});
const state={
  token:'isolated-test-session',taskFocus:'all',exportTasks:[],tasks:[],
  keywords:[{id:'k',keyword:'SEO search'}],pages:[{id:'p',page_name:'DPRO SHOP トップページ'}],
  managementSummary:{},taskImpactSummary:{}
};
const doc={
  querySelectorAll:()=>[],
  created:[],
  body:{ appendChild(a){ doc.created.push(a); }},
  createElement(kind){
    assert.equal(kind,'a');
    return {href:'',download:'',clicked:false,removed:false,
      click(){this.clicked=true;},remove(){this.removed=true;}};
  }
};
let calls=0,alerts=[],downloads=[],revoked=[],timeouts=[];
const urlMock={createObjectURL(blob){downloads.push(blob);return 'blob:test-csv';},
  revokeObjectURL(url){revoked.push(url);}};
class FakeBlob{constructor(chunks,config){this.text=chunks.join('');this.type=config.type;}}
const escapeHtml=x=>String(x??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
const ctx={
 $,state,document:doc,Date:FixedDate,URL:urlMock,Blob:FakeBlob,
 setTimeout:cb=>{timeouts.push(cb);return 1;},
 toast:(...a)=>alerts.push(a),api:()=>{calls++},escapeHtml,
 TASK_STATUS_OPTIONS:[['todo','未着手'],['paused','保留'],['done','完了'],['excluded','対象外']],
 optionLabel:(opts,v)=>opts.find(([k])=>k===v)?.[1]||v,
 summaryItems:()=>'',renderTaskImpact:()=>'',taskStatusBadge:()=>'',renderTaskNextActions:()=>{},
 console
};
vm.createContext(ctx);
const names=['parsePauseNotes','taskPauseReviewState','renderTasks','escapeTaskCsvCell','buildTaskCsv','exportVisibleTasksCsv'];
vm.runInContext(names.map(extract).join('\n')+';\nglobalThis.qa={renderTasks,escapeTaskCsvCell,buildTaskCsv,exportVisibleTasksCsv};',ctx);
const {renderTasks:render,escapeTaskCsvCell:csvCell,buildTaskCsv:build,exportVisibleTasksCsv:exportCsv}=ctx.qa;

assert.equal(csvCell('=SUM(A1:A2)'),'"\'=SUM(A1:A2)"','Excel formula protection');
assert.equal(csvCell('  +1+2'),'"\'  +1+2"','leading whitespace formula protection');
assert.equal(csvCell('-2'),'"\'-2"','minus formula protection');
assert.equal(csvCell('@call'),'"\'@call"','at sign formula protection');
assert.equal(csvCell('安全, "CSV"'),'"安全, ""CSV"""','quoted CSV escaping');
assert.equal(csvCell('normal'),'\"normal\"');
assert.equal(csvCell('\t=cmd'),'"\'\t=cmd"');
assert.equal(csvCell('a\nb'),'"a\nb"','multiline quoted text');
assert.equal(csvCell(null),'""');

const pausedAction=[
  '既存の推奨作業を保持',
  '',
  '[保留管理]',
  '保留理由：点数低下',
  '再開条件：再検証完了',
  '次回確認日：2026-10-19',
  '[/保留管理]'
].join('\n');
state.tasks=[
  {id:'a',title:'=HYPERLINK("https://example.org")',target_keyword_id:'k',landing_page_id:'p',
    priority:1,status:'todo',due_date:'2026-08-13',
    reason:'作業理由,カンマ\n改行テスト',recommended_action:'実際の修正作業',
    baseline_metrics:{performanceScore:91,source:'pagespeed'},result_metrics:{}},
  {id:'b',title:'JavaScript削減',target_keyword_id:null,landing_page_id:'p',priority:1,
    status:'paused',due_date:'2026-08-13',reason:'QA FAIL',recommended_action:pausedAction,
    baseline_metrics:{performanceScore:91},result_metrics:{before:{performanceScore:91},after:{performanceScore:88},humanQa:{status:'rollback'}}}
];
render();
assert.equal(state.exportTasks.length,2);
assert.equal($('taskCsvExportButton').disabled,false);
assert.equal($('taskCsvExportButton').textContent,'表示中2件をCSV出力');
let result=build(state.exportTasks,'2026-10-12');
assert(result.startsWith('"タスク名","対象キーワード"'));
assert(result.includes('"\'=HYPERLINK(""https://example.org"")"'));
assert(result.includes('"作業理由,カンマ\n改行テスト"'),'multiline CSV correctly quoted');
assert(result.includes('"点数低下","再検証完了","2026-10-19","7日以内"'));
assert(result.includes('"91","88","rollback"'));
assert(result.includes('"既存の推奨作業を保持"'));
assert(!result.includes('[保留管理]'),'structured block is not duplicated in export');
assert(result.endsWith('\r\n'),'CRLF format');
assert.equal((result.match(/\r\n/g)||[]).length,3,'header and two rows CRLF; embedded newline must remain enclosed');

$('taskStatusFilter').value='paused';render();
assert.equal(state.exportTasks.length,1);
assert.equal(state.exportTasks[0].id,'b','export follows visible table filter');
exportCsv();
assert.equal(downloads.length,1);
assert.equal(doc.created.length,1);
assert.equal(doc.created[0].download,'DPRO_SHUKYAKU_TASKS_20261012.csv');
assert.equal(doc.created[0].clicked,true);
assert.equal(doc.created[0].removed,true);
assert.equal(downloads[0].type,'text/csv;charset=utf-8');
assert(downloads[0].text.startsWith('\uFEFF"タスク名"'),'UTF-8 BOM for Japanese Excel');
assert.equal(timeouts.length,1);
timeouts[0]();
assert.deepEqual(revoked,['blob:test-csv']);
assert.equal(calls,0,'export must not perform server-side mutations');

$('taskStatusFilter').value='';$('taskReviewFilter').value='due';
render();
assert.equal(state.exportTasks.length,0,'empty filter produces no CSV rows');
assert.equal($('taskCsvExportButton').disabled,true);
exportCsv();
assert.equal(downloads.length,1,'blocked export must not download');
state.token='';
$('taskReviewFilter').value='';render();
assert.equal($('taskCsvExportButton').disabled,true);
exportCsv();
assert.equal(downloads.length,1,'logged-out export must not download');
assert(alerts.some(x=>x[1]==='warn'),'guard message is shown');
console.log('SHUKYAKU-22 CSV FILTER MATCH, JAPANESE BOM, FORMULA SAFETY, NO-MUTATION QA PASS');
