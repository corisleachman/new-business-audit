import { supabase } from './supabase-config.js';

const reviewPanel=document.getElementById('reviewPanel');
const runBtn=document.getElementById('runAnalysis');
const analysisMessage=document.getElementById('analysisMessage');
const candidateHost=document.getElementById('candidateFindings');
const buildReportBtn=document.getElementById('buildReport');
const reportState=document.getElementById('reportState');
const reportPreview=document.getElementById('reportPreview');
let lastAutoRun=null;
let currentCandidates=[];

const esc=(v='')=>String(v??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
const titleCase=(v='')=>String(v).replaceAll('_',' ').replace(/\b\w/g,c=>c.toUpperCase());
function showMessage(text,isError=false){analysisMessage.hidden=false;analysisMessage.textContent=text;analysisMessage.classList.toggle('error',isError)}
function hideMessage(){analysisMessage.hidden=true;analysisMessage.textContent='';analysisMessage.classList.remove('error')}

async function runAnalysis(manual=false){
  const engagementId=reviewPanel.dataset.engagement;
  if(!engagementId)return;
  runBtn.disabled=true;runBtn.textContent='Analysing…';
  if(manual)showMessage('Reviewing direct scores and cross-answer patterns…');
  try{
    const {data,error}=await supabase.functions.invoke('analyse-engagement',{body:{engagement_id:engagementId}});
    if(error)throw error;
    currentCandidates=data?.candidates||[];
    renderCandidates(currentCandidates,engagementId);
    if(data?.scores){
      document.getElementById('reviewSignals').textContent=data.scores.length;
      const signalList=document.getElementById('signalList');
      signalList.innerHTML=data.scores.sort((a,b)=>a.score-b.score).map(s=>`<div class="signal-row"><div><strong>${esc(titleCase(s.category))}</strong><span>${esc(titleCase(statusFromScore(s.score)))}</span></div><div class="signal-bar"><i style="width:${Number(s.score)||0}%"></i></div><b>${Number(s.score)||0}</b></div>`).join('')||'<p class="muted">No scored answers yet.</p>';
    }
    showMessage(`${data?.answer_count||0} answers reviewed. ${currentCandidates.length} candidate finding${currentCandidates.length===1?'':'s'} surfaced for your judgement.`);
  }catch(err){
    console.error(err);showMessage(err?.message||'Could not run the diagnostic analysis.',true);
  }finally{runBtn.disabled=false;runBtn.textContent='Run full analysis'}
}
function statusFromScore(score){if(score>=75)return 'strong';if(score>=55)return 'opportunity';if(score>=35)return 'needs_attention';return 'critical'}

function renderCandidates(candidates,engagementId){
  if(!candidates.length){candidateHost.innerHTML='<p class="muted">There is not enough scored evidence yet to surface a meaningful finding.</p>';return}
  candidateHost.innerHTML=candidates.map((f,i)=>`<div class="finding candidate deep-candidate" data-index="${i}"><span class="status status-${esc(f.severity)}">${esc(titleCase(f.severity))}</span><h3>${esc(f.title)}</h3><p class="finding-body">${esc(f.observation)}</p>${f.evidence?.length?`<div class="evidence-chips">${f.evidence.map(code=>`<span class="evidence-chip">Evidence ${esc(code)}</span>`).join('')}</div>`:''}${f.interventions?.length?`<div class="intervention-chips">${f.interventions.map(it=>`<span class="intervention-chip">${esc(it.name)}</span>`).join('')}</div>`:''}<div class="finding-actions"><button class="primary tiny accept-deep" type="button">Accept</button><button class="secondary tiny edit-deep" type="button">Edit</button><button class="secondary tiny dismiss-deep" type="button">Dismiss</button></div></div>`).join('');
  candidateHost.querySelectorAll('.deep-candidate').forEach(card=>{
    const finding=candidates[Number(card.dataset.index)];
    card.querySelector('.accept-deep').onclick=()=>saveFinding(card,finding,engagementId,'accepted');
    card.querySelector('.dismiss-deep').onclick=()=>saveFinding(card,finding,engagementId,'dismissed');
    card.querySelector('.edit-deep').onclick=async()=>{const next=prompt('Edit finding',finding.observation);if(next===null)return;finding.observation=next.trim()||finding.observation;card.querySelector('.finding-body').textContent=finding.observation;await saveFinding(card,finding,engagementId,'edited')};
  });
}

async function saveFinding(card,finding,engagementId,state){
  card.querySelectorAll('button').forEach(b=>b.disabled=true);
  try{
    const payload={engagement_id:engagementId,title:finding.title,observation:finding.observation,severity:finding.severity,source:'rule',review_state:state,evidence_refs:finding.evidence||[],consultant_commentary:state==='edited'?finding.observation:null};
    const {data:existing,error:findError}=await supabase.from('findings').select('id').eq('engagement_id',engagementId).eq('title',finding.title).maybeSingle();if(findError)throw findError;
    let saved;
    if(existing?.id){const {data,error}=await supabase.from('findings').update(payload).eq('id',existing.id).select('id').single();if(error)throw error;saved=data}else{const {data,error}=await supabase.from('findings').insert(payload).select('id').single();if(error)throw error;saved=data}
    await supabase.from('finding_interventions').delete().eq('finding_id',saved.id);
    if(state!=='dismissed'&&finding.interventions?.length){const rows=finding.interventions.map(it=>({finding_id:saved.id,intervention_id:it.id,rationale:`Recommended from ${finding.evidence?.length?'evidence '+finding.evidence.join(', '):'diagnostic pattern'}.`}));const {error}=await supabase.from('finding_interventions').insert(rows);if(error)throw error}
    card.classList.add('reviewed');const note=document.createElement('span');note.className='saved-state';note.textContent=state==='dismissed'?'Dismissed':'Saved to Opportunity Map';card.appendChild(note);
    await updateReportState(engagementId);
  }catch(err){card.querySelectorAll('button').forEach(b=>b.disabled=false);alert(err?.message||'Could not save finding')}
}

async function updateReportState(engagementId){
  const {data}=await supabase.from('findings').select('id,review_state').eq('engagement_id',engagementId).in('review_state',['accepted','edited']);
  const count=data?.length||0;reportState.innerHTML=count?`<p><strong>${count} approved finding${count===1?'':'s'}</strong> ready to shape the report.</p>`:'<p class="muted">Accept or edit the findings you want to use, then build the first report draft.</p>';
}

async function buildReport(){
  const engagementId=reviewPanel.dataset.engagement;if(!engagementId)return;
  buildReportBtn.disabled=true;buildReportBtn.textContent='Building…';
  try{
    const {data:{session}}=await supabase.auth.getSession();if(!session)throw new Error('Please sign in again.');
    const [{data:eng,error:engErr},{data:findings,error:findErr},{data:results,error:resErr}]=await Promise.all([
      supabase.from('engagements').select('id,client:clients(name),contact:client_contacts(name),status').eq('id',engagementId).single(),
      supabase.from('findings').select('id,title,observation,severity,review_state,evidence_refs,finding_interventions(intervention:interventions(id,code,name,description))').eq('engagement_id',engagementId).in('review_state',['accepted','edited']).order('created_at'),
      supabase.from('diagnostic_results').select('status,internal_score,category:diagnostic_categories(code,name)').eq('engagement_id',engagementId).is('signal_id',null)
    ]);
    if(engErr)throw engErr;if(findErr)throw findErr;if(resErr)throw resErr;if(!findings?.length)throw new Error('Accept or edit at least one finding before building the Opportunity Map.');
    const {data:versions,error:vErr}=await supabase.from('reports').select('version').eq('engagement_id',engagementId).order('version',{ascending:false}).limit(1);if(vErr)throw vErr;const nextVersion=(versions?.[0]?.version||0)+1;
    const {data:report,error:rErr}=await supabase.from('reports').insert({engagement_id:engagementId,version:nextVersion,status:'draft',created_by:session.user.id}).select('id,version').single();if(rErr)throw rErr;
    const strengths=(results||[]).filter(r=>Number(r.internal_score)>=75).sort((a,b)=>Number(b.internal_score)-Number(a.internal_score)).slice(0,4);
    const priorities=findings.flatMap(f=>(f.finding_interventions||[]).map(x=>x.intervention)).filter(Boolean).filter((it,index,all)=>all.findIndex(x=>x.id===it.id)===index).slice(0,5);
    const critical=findings.filter(f=>f.severity==='critical');
    const executive=critical.length?`${critical.length} priority constraint${critical.length===1?'':'s'} should be addressed before the business simply increases new-business activity. The strongest route forward is to fix the commercial system in a deliberate sequence.`:`The diagnostic points to a focused set of commercial improvements rather than a wholesale rebuild. The next step is to turn the approved findings into a sequenced 90-day plan.`;
    const sections=[
      {report_id:report.id,section_type:'executive_snapshot',heading:'Executive snapshot',content:{text:executive},sort_order:1},
      {report_id:report.id,section_type:'strengths',heading:"What's already working",content:{items:strengths.map(s=>({name:s.category?.name,score:s.internal_score,status:s.status}))},sort_order:2},
      {report_id:report.id,section_type:'priority_findings',heading:'What is getting in the way',content:{items:findings.map(f=>({title:f.title,observation:f.observation,severity:f.severity,evidence:f.evidence_refs||[]}))},sort_order:3},
      {report_id:report.id,section_type:'recommended_workstreams',heading:'Recommended workstreams',content:{items:priorities.map(p=>({code:p.code,name:p.name,description:p.description}))},sort_order:4},
      {report_id:report.id,section_type:'ninety_day_focus',heading:'90-day focus',content:{items:priorities.slice(0,3).map((p,i)=>({phase:i+1,name:p.name,description:p.description}))},sort_order:5}
    ];
    const {error:sErr}=await supabase.from('report_sections').insert(sections);if(sErr)throw sErr;
    renderReportPreview(eng.client?.name||'Client',report.version,executive,strengths,findings,priorities);
    reportState.innerHTML=`<p><strong>Draft v${report.version} saved.</strong> This is an internal working draft. It has not been sent or published.</p>`;
  }catch(err){alert(err?.message||'Could not build report')}finally{buildReportBtn.disabled=false;buildReportBtn.textContent='Build draft Opportunity Map'}
}

function renderReportPreview(clientName,version,executive,strengths,findings,priorities){
  reportPreview.hidden=false;
  reportPreview.innerHTML=`<div class="report-cover"><span>Growth Opportunity Map · Draft v${version}</span><h3>${esc(clientName)}</h3></div><div class="report-section"><h3>Executive snapshot</h3><p>${esc(executive)}</p></div>${strengths.length?`<div class="report-section"><h3>What's already working</h3>${strengths.map(s=>`<div class="report-finding"><strong>${esc(s.category?.name||'Strength')}</strong><p>${esc(s.internal_score)} / 100 internal diagnostic signal</p></div>`).join('')}</div>`:''}<div class="report-section"><h3>What is getting in the way</h3>${findings.map(f=>`<div class="report-finding"><strong>${esc(f.title)}</strong><p>${esc(f.observation)}</p></div>`).join('')}</div><div class="report-section"><h3>Recommended workstreams</h3>${priorities.map((p,i)=>`<div class="report-priority"><b>${i+1}</b><div><strong>${esc(p.name)}</strong><br><span>${esc(p.description||'')}</span></div></div>`).join('')||'<p class="muted">No interventions linked yet.</p>'}</div>`;
  reportPreview.scrollIntoView({behavior:'smooth',block:'start'});
}

runBtn.onclick=()=>runAnalysis(true);
buildReportBtn.onclick=buildReport;
const observer=new MutationObserver(()=>{const id=reviewPanel.dataset.engagement;if(id&&id!==lastAutoRun){lastAutoRun=id;hideMessage();setTimeout(()=>{runAnalysis(false);updateReportState(id)},250)}});
observer.observe(reviewPanel,{attributes:true,attributeFilter:['data-engagement']});
