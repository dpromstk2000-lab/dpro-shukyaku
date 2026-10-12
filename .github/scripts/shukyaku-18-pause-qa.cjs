'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const html=fs.readFileSync('owner.html','utf8');
function extract(name) {
  const marker='    function '+name+'(';
  const start=html.indexOf(marker);
  assert(start>=0, 'missing function '+name);
  const rest=html.slice(start);
  const match=rest.match(/^[\s\S]*?\n    \}\n/);
  assert(match,'missing closing brace of '+name);
  return match[0];
}
function extractAsync(name) {
  const marker='    async function '+name+'(';
  const start=html.indexOf(marker);
  assert(start>=0,'missing async function '+name);
  const match=html.slice(start).match(/^[\s\S]*?\n    \}\n/);
  assert(match,'missing closing brace of '+name);
  return match[0];
}
const $cache={};
const $=id=>($cache[id]??={value:'',textContent:'',innerHTML:'',disabled:false});
const state={editor:{type:'task',id:'x',pauseOriginal:{reason:'',resume:'',review:''}},tasks:[],keywords:[],pages:[{id:'p',page_name:'Test'}],loadedViews:new Set(),bootstrap:null,managementSummary:{},taskImpactSummary:{}};
const escapeHtml=value=>String(value??'').replace(/[&<>'"]/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[char]));
const ctx={$,state,escapeHtml,document:{querySelectorAll:()=>[]},TASK_STATUS_OPTIONS:[['todo','未着手'],['paused','保留'],['done','完了'],['excluded','対象外']],console,Date,summaryItems:()=>'',renderTaskNextActions:()=>{},renderTaskImpact:()=>'',taskStatusBadge:()=>'',optionLabel:()=>'',field:()=>'',selectField:()=>'',textareaField:()=>'',setLoading:()=>{},toast:()=>{},closeEditor:()=>{},loadManagementView:async()=>{},refreshBootstrap:async()=>{},api:async()=>{}};
vm.createContext(ctx);
vm.runInContext(['parsePauseNotes','buildPauseNotes','taskPauseHelper','taskPauseReviewState','renderTasks'].map(extract).join('\n')+extractAsync('saveEditor')+'\n;globalThis.qa={parsePauseNotes,buildPauseNotes,taskPauseHelper,renderTasks,saveEditor};',ctx);
const {parsePauseNotes,buildPauseNotes,taskPauseHelper,renderTasks,saveEditor}=ctx.qa;
const original='Keep this existing recommendation.\nDo not remove.';
const notes={reason:'動作確認が必要',resume:'安全な代替策が確定',review:'2026-10-22'};
let combined=buildPauseNotes(original,notes);
assert(combined.startsWith(original),'original recommendation must be preserved');
assert.equal(parsePauseNotes(combined).reason,notes.reason);
assert.equal(parsePauseNotes(combined).resume,notes.resume);
assert.equal(parsePauseNotes(combined).review,notes.review);
const updated=buildPauseNotes(combined,{...notes,review:'2026-10-30'});
assert.equal((updated.match(/\[保留管理\]/g)||[]).length,1,'must not duplicate block');
assert(updated.startsWith(original),'update must preserve original');
assert.equal(parsePauseNotes(updated).review,'2026-10-30');
assert.equal(buildPauseNotes(updated,{reason:'',resume:'',review:''}),original,'clear notes without clearing original');
assert.equal(parsePauseNotes('legacy free text').review,'');
assert(taskPauseHelper({status:'paused',recommended_action:combined}).includes('pauseReviewDraft'));
assert(taskPauseHelper({status:'paused',recommended_action:combined}).includes('2026-10-22'));
assert(taskPauseHelper({status:'todo',recommended_action:''}).includes('id="pauseNotesHelper" hidden'));
assert(!taskPauseHelper({status:'paused',recommended_action:'[保留管理]\n保留理由：<script>alert(1)</script>\n再開条件：\n次回確認日：\n[/保留管理]'}).includes('<script>'),'escaped editor content required');
state.tasks=[
  {id:'1',title:'Paused task',reason:'',recommended_action:combined,status:'paused',priority:1,due_date:'2026-08-13',landing_page_id:'p',result_metrics:{humanQa:{status:'rollback'}}},
  {id:'2',title:'Active task',reason:'',recommended_action:'',status:'todo',priority:1,due_date:'2026-08-13',landing_page_id:'p',result_metrics:{}}
];
renderTasks();
const markup=$('taskTableBody').innerHTML;
assert(markup.indexOf('Active task') < markup.indexOf('Paused task'),'overdue tasks remain first');
assert(markup.includes('次回確認：2026-10-22')||markup.includes('確認日超過：2026-10-22'),'review date visible');
assert(markup.includes('再開条件：安全な代替策が確定'),'resume condition visible');
const pausedRow=markup.split('Paused task')[1].split('</tr>')[0];
assert(!pausedRow.includes('measureTask('),'paused task cannot be measured');
const activeRow=markup.split('Active task')[1].split('</tr>')[0];
assert(activeRow.includes('measureTask('),'active task remains measurable');
let apiCalls=[];
ctx.api=async(path,options)=>{apiCalls.push({path,options});return {}};
let messages=[];
ctx.showMessage=(...args)=>messages.push(args);
const editorForm=$('editorForm');
const mkEvent=()=>({preventDefault(){}});
editorForm.fields=[
 ['title','Paused task'],['priority','1'],['status','paused'],['recommendedAction',original],
 ['pauseReasonDraft',notes.reason],['pauseResumeDraft',notes.resume],['pauseReviewDraft',notes.review]
];
ctx.FormData=class {constructor(el){this.fields=el.fields} entries(){return this.fields[Symbol.iterator]()}};
(async()=>{
  await saveEditor(mkEvent());
  assert.equal(apiCalls.length,1,'saving notes should result in one API call');
  assert.equal(apiCalls[0].options.method,'PATCH');
  assert(apiCalls[0].options.body.recommendedAction.startsWith(original));
  for(const k of ['pauseReasonDraft','pauseResumeDraft','pauseReviewDraft']) {
    assert(!(k in apiCalls[0].options.body),'do not send frontend helper fields to Worker');
  }
  assert.equal(parsePauseNotes(apiCalls[0].options.body.recommendedAction).review,notes.review);
  apiCalls=[];
  state.editor={type:'task',id:'x',pauseOriginal:{reason:'',resume:'',review:''}};
  editorForm.fields[2]=['status','todo'];
  await saveEditor(mkEvent());
  assert.equal(apiCalls.length,0,'must not silently discard notes when not paused');
  assert(messages.length>0,'must show validation message');
  apiCalls=[];messages=[];
  const existing=buildPauseNotes(original,notes);
  state.editor={type:'task',id:'x',pauseOriginal:{...notes}};
  editorForm.fields=[['title','Paused task'],['priority','1'],['status','paused'],['recommendedAction',existing+'\nmanual add'],['pauseReasonDraft',notes.reason],['pauseResumeDraft',notes.resume],['pauseReviewDraft',notes.review]];
  await saveEditor(mkEvent());
  assert.equal(apiCalls[0].options.body.recommendedAction,existing+'\nmanual add','unchanged helper should not overwrite hand-edited original content');
  console.log('SHUKYAKU-18 PAUSED EDITOR, XSS, SAFE SAVE & RENDER QA PASS');
})().catch(error=>{console.error(error);process.exit(1)});
