import { supabase } from './supabase-config.js';

const reviewPanel=document.getElementById('reviewPanel');
const host=document.getElementById('reportEditor');
let currentReport=null,currentSections=[],currentClient='',currentAccent='#17263b';
const esc=(v='')=>String(v??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
const pdfText=(v='')=>String(v??'').replace(/[\u2013\u2014]/g,'-').replace(/[\u2018\u2019]/g,"'").replace(/[\u201c\u201d]/g,'"');
const severityOrder={critical:0,needs_attention:1,opportunity:2,strong:3};

async function loadLatestReport(engagementId){
  host.hidden=true;host.innerHTML='';currentReport=null;currentSections=[];
  if(!engagementId)return;
  const [{data:report,error:rErr},{data:eng}]=await Promise.all([
    supabase.from('reports').select('id,version,status,pdf_storage_path,locked_at,created_at').eq('engagement_id',engagementId).order('version',{ascending:false}).limit(1).maybeSingle(),
    supabase.from('engagements').select('client:clients(id,name,client_brand_profiles(primary_color,created_at))').eq('id',engagementId).single()
  ]);
  if(rErr){console.error(rErr);return}
  currentClient=eng?.client?.name||'Client';
  const brands=eng?.client?.client_brand_profiles||[];currentAccent=brands.sort((a,b)=>String(b.created_at).localeCompare(String(a.created_at)))[0]?.primary_color||'#17263b';
  if(!report)return;
  const {data:sections,error:sErr}=await supabase.from('report_sections').select('id,section_type,heading,content,sort_order').eq('report_id',report.id).order('sort_order');
  if(sErr){console.error(sErr);return}
  currentReport=report;currentSections=sections||[];renderEditor();
}

function section(type){return currentSections.find(s=>s.section_type===type)}
function move(arr,index,delta){const j=index+delta;if(j<0||j>=arr.length)return arr;const copy=[...arr];[copy[index],copy[j]]=[copy[j],copy[index]];return copy}
function reportLocked(){return currentReport?.status==='locked'}

function renderEditor(){
  if(!currentReport)return;
  host.hidden=false;
  const executive=section('executive_snapshot'),strengths=section('strengths'),findings=section('priority_findings'),workstreams=section('recommended_workstreams'),focus=section('ninety_day_focus');
  const fItems=[...(findings?.content?.items||[])];
  const wItems=[...(workstreams?.content?.items||[])];
  const focusItems=[...(focus?.content?.items||[])];
  const locked=reportLocked();
  host.innerHTML=`<div class="report-editor-head"><div><div class="eyebrow compact">CLIENT-READY REPORT</div><h2>${esc(currentClient)} · v${currentReport.version}</h2><p class="muted">Edit the wording and order here. Changes are saved to this report version only.</p></div><div class="report-toolbar"><span class="status ${locked?'status-strong':'status-opportunity'}">${locked?'Client-ready':'Draft'}</span><button id="saveReportDraft" class="secondary tiny" type="button" ${locked?'disabled':''}>Save draft</button><button id="exportReportPdf" class="primary tiny" type="button">Export PDF</button><button id="lockReport" class="secondary tiny" type="button" ${locked?'disabled':''}>${locked?'Client-ready':'Mark client-ready'}</button></div></div>
  <div id="reportEditorMessage" class="analysis-message" hidden></div>
  <div class="report-edit-grid">
    ${editorSection(executive,'Executive snapshot',`<textarea class="report-textarea" data-field="text" ${locked?'disabled':''}>${esc(executive?.content?.text||'')}</textarea>`) }
    ${editorSection(strengths,"What's already working",(strengths?.content?.items||[]).map((it,i)=>`<div class="report-edit-item strength-item"><strong>${esc(it.name||'Strength')}</strong><span>${esc(it.status||'strong')} · ${esc(it.score??'')} internal signal</span></div>`).join('')||'<p class="muted">No strengths have been included yet.</p>')}
    ${editorSection(findings,'Priority findings',fItems.map((it,i)=>findingEditor(it,i,fItems.length,locked)).join('')||'<p class="muted">No approved findings in this report.</p>')}
    ${editorSection(workstreams,'Recommended workstreams',wItems.map((it,i)=>workstreamEditor(it,i,wItems.length,locked)).join('')||'<p class="muted">No workstreams linked yet.</p>')}
    ${editorSection(focus,'90-day focus',focusItems.map((it,i)=>focusEditor(it,i,focusItems.length,locked)).join('')||'<p class="muted">No 90-day sequence has been set yet.</p>')}
  </div>`;
  bindEditorActions();
}

function editorSection(sec,label,body){if(!sec)return'';return `<section class="report-edit-section" data-section-id="${sec.id}" data-section-type="${sec.section_type}"><div class="report-edit-heading"><label>Section heading</label><input class="admin-input report-heading-input" value="${esc(sec.heading||label)}" ${reportLocked()?'disabled':''}></div>${body}</section>`}
function orderButtons(index,total,kind,locked){return `<div class="order-buttons"><button class="secondary icon-btn move-item" data-kind="${kind}" data-index="${index}" data-delta="-1" type="button" ${index===0||locked?'disabled':''}>↑</button><button class="secondary icon-btn move-item" data-kind="${kind}" data-index="${index}" data-delta="1" type="button" ${index===total-1||locked?'disabled':''}>↓</button></div>`}
function findingEditor(it,i,total,locked){return `<article class="report-edit-item finding-edit" data-index="${i}">${orderButtons(i,total,'finding',locked)}<div class="report-edit-fields"><div class="field-row"><input class="admin-input finding-title" value="${esc(it.title||'')}" ${locked?'disabled':''}><select class="admin-input severity-select" ${locked?'disabled':''}><option value="critical" ${it.severity==='critical'?'selected':''}>Critical</option><option value="needs_attention" ${it.severity==='needs_attention'?'selected':''}>Needs attention</option><option value="opportunity" ${it.severity==='opportunity'?'selected':''}>Opportunity</option><option value="strong" ${it.severity==='strong'?'selected':''}>Strong</option></select></div><label>Consultant commentary</label><textarea class="report-textarea finding-commentary" ${locked?'disabled':''}>${esc(it.commentary||it.observation||'')}</textarea>${it.evidence?.length?`<div class="evidence-chips">${it.evidence.map(e=>`<span class="evidence-chip">Evidence ${esc(e)}</span>`).join('')}</div>`:''}</div></article>`}
function workstreamEditor(it,i,total,locked){return `<article class="report-edit-item workstream-edit" data-index="${i}">${orderButtons(i,total,'workstream',locked)}<div class="report-edit-fields"><input class="admin-input workstream-name" value="${esc(it.name||'')}" ${locked?'disabled':''}><textarea class="report-textarea compact-area workstream-description" ${locked?'disabled':''}>${esc(it.description||'')}</textarea></div></article>`}
function focusEditor(it,i,total,locked){return `<article class="report-edit-item focus-edit" data-index="${i}">${orderButtons(i,total,'focus',locked)}<div class="focus-number">${i+1}</div><div class="report-edit-fields"><input class="admin-input focus-name" value="${esc(it.name||'')}" ${locked?'disabled':''}><textarea class="report-textarea compact-area focus-description" ${locked?'disabled':''}>${esc(it.description||'')}</textarea></div></article>`}

function collect(){
  const updates=[];
  host.querySelectorAll('.report-edit-section').forEach(el=>{
    const id=el.dataset.sectionId,type=el.dataset.sectionType,heading=el.querySelector('.report-heading-input')?.value.trim()||'';
    let content={};
    if(type==='executive_snapshot')content={text:el.querySelector('[data-field="text"]')?.value.trim()||''};
    else if(type==='strengths')content=section(type)?.content||{items:[]};
    else if(type==='priority_findings')content={items:[...el.querySelectorAll('.finding-edit')].map(card=>({title:card.querySelector('.finding-title').value.trim(),severity:card.querySelector('.severity-select').value,commentary:card.querySelector('.finding-commentary').value.trim(),observation:card.querySelector('.finding-commentary').value.trim(),evidence:(section(type)?.content?.items?.[Number(card.dataset.index)]?.evidence)||[]}))};
    else if(type==='recommended_workstreams')content={items:[...el.querySelectorAll('.workstream-edit')].map(card=>({name:card.querySelector('.workstream-name').value.trim(),description:card.querySelector('.workstream-description').value.trim(),code:section(type)?.content?.items?.[Number(card.dataset.index)]?.code||null}))};
    else if(type==='ninety_day_focus')content={items:[...el.querySelectorAll('.focus-edit')].map((card,i)=>({phase:i+1,name:card.querySelector('.focus-name').value.trim(),description:card.querySelector('.focus-description').value.trim()}))};
    updates.push({id,type,heading,content});
  });return updates;
}

async function saveDraft(show=true){
  if(!currentReport||reportLocked())return;
  const updates=collect();
  for(const u of updates){const {error}=await supabase.from('report_sections').update({heading:u.heading,content:u.content}).eq('id',u.id);if(error)throw error;const local=currentSections.find(s=>s.id===u.id);if(local){local.heading=u.heading;local.content=u.content}}
  if(show)message('Draft saved.');
}
function message(text,error=false){const el=document.getElementById('reportEditorMessage');if(!el)return;el.hidden=false;el.textContent=text;el.classList.toggle('error',error);setTimeout(()=>{if(!error)el.hidden=true},2500)}

function bindEditorActions(){
  document.getElementById('saveReportDraft').onclick=async()=>{try{await saveDraft(true)}catch(e){message(e.message||'Could not save draft',true)}};
  document.getElementById('exportReportPdf').onclick=exportPdf;
  document.getElementById('lockReport').onclick=lockReport;
  host.querySelectorAll('.move-item').forEach(btn=>btn.onclick=()=>reorder(btn.dataset.kind,Number(btn.dataset.index),Number(btn.dataset.delta)));
}
function reorder(kind,index,delta){
  if(reportLocked())return;
  const map={finding:'priority_findings',workstream:'recommended_workstreams',focus:'ninety_day_focus'};const type=map[kind],sec=section(type);if(!sec)return;
  sec.content={...sec.content,items:move(sec.content?.items||[],index,delta)};renderEditor();
}

async function lockReport(){
  if(!currentReport||reportLocked())return;
  if(!confirm('Mark this report version as client-ready? This locks the wording and ordering for this version.'))return;
  try{await saveDraft(false);const now=new Date().toISOString();const {error}=await supabase.from('reports').update({status:'locked',locked_at:now}).eq('id',currentReport.id);if(error)throw error;currentReport.status='locked';currentReport.locked_at=now;renderEditor();message('Report marked client-ready. You can still export this version as PDF.')}catch(e){message(e.message||'Could not lock report',true)}
}

function hexRgb(hex){const v=(hex||'#17263b').replace('#','');return [parseInt(v.slice(0,2),16)||23,parseInt(v.slice(2,4),16)||38,parseInt(v.slice(4,6),16)||59]}
function safeName(v){return String(v||'client').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'')}
function addPageNumber(doc){const n=doc.getNumberOfPages();for(let i=2;i<=n;i++){doc.setPage(i);doc.setFontSize(8);doc.setTextColor(130);doc.text(String(i),195,286,{align:'right'})}}
function addSectionTitle(doc,title,y,accent){if(y>260){doc.addPage();y=24}doc.setFont('helvetica','bold');doc.setFontSize(9);doc.setTextColor(...accent);doc.text(pdfText(title).toUpperCase(),18,y);doc.setDrawColor(...accent);doc.setLineWidth(.7);doc.line(18,y+3,48,y+3);return y+13}
function body(doc,text,y,{size=11,bold=false,maxWidth=174,leading=5.7}={}){doc.setFont('helvetica',bold?'bold':'normal');doc.setFontSize(size);doc.setTextColor(40);const lines=doc.splitTextToSize(pdfText(text),maxWidth);for(const line of lines){if(y>276){doc.addPage();y=24}doc.text(line,18,y);y+=leading}return y}
function small(doc,text,y){doc.setFont('helvetica','normal');doc.setFontSize(8.5);doc.setTextColor(105);const lines=doc.splitTextToSize(pdfText(text),165);for(const line of lines){if(y>277){doc.addPage();y=24}doc.text(line,25,y);y+=4.5}return y}

async function exportPdf(){
  const btn=document.getElementById('exportReportPdf');btn.disabled=true;btn.textContent='Creating PDF…';
  try{
    if(!reportLocked())await saveDraft(false);
    const {jsPDF}=window.jspdf||{};if(!jsPDF)throw new Error('PDF generator did not load. Refresh the page and try again.');
    const accent=hexRgb(currentAccent),doc=new jsPDF({unit:'mm',format:'a4',compress:true});
    const executive=section('executive_snapshot'),strengths=section('strengths'),findings=section('priority_findings'),workstreams=section('recommended_workstreams'),focus=section('ninety_day_focus');
    doc.setFillColor(...accent);doc.rect(0,0,210,297,'F');doc.setTextColor(255);doc.setFont('helvetica','bold');doc.setFontSize(11);doc.text('GROWTH OPPORTUNITY MAP',18,26);doc.setFontSize(30);const titleLines=doc.splitTextToSize(pdfText(currentClient),170);doc.text(titleLines,18,78);doc.setFont('helvetica','normal');doc.setFontSize(12);doc.text(`Prepared by Coris Leachman · ${new Date().toLocaleDateString('en-GB',{day:'numeric',month:'long',year:'numeric'})}`,18,258);doc.setFontSize(9);doc.text(`Report version ${currentReport.version}${reportLocked()?' · Client-ready':' · Draft'}`,18,267);
    doc.addPage();let y=24;y=addSectionTitle(doc,executive?.heading||'Executive snapshot',y,accent);y=body(doc,executive?.content?.text||'',y,{size:13,leading:7});
    if(strengths?.content?.items?.length){y+=10;y=addSectionTitle(doc,strengths.heading||"What's already working",y,accent);for(const s of strengths.content.items){if(y>260){doc.addPage();y=24}doc.setFont('helvetica','bold');doc.setFontSize(11);doc.setTextColor(35);doc.text(pdfText(s.name||'Strength'),18,y);doc.setFont('helvetica','normal');doc.setFontSize(9);doc.setTextColor(105);doc.text(`${s.score??''}/100 internal signal`,18,y+5);y+=14}}
    if(findings?.content?.items?.length){doc.addPage();y=24;y=addSectionTitle(doc,findings.heading||'Priority findings',y,accent);for(let i=0;i<findings.content.items.length;i++){const f=findings.content.items[i];if(y>245){doc.addPage();y=24}doc.setFillColor(245,245,242);doc.roundedRect(18,y-4,174,10,2,2,'F');doc.setFont('helvetica','bold');doc.setFontSize(8);doc.setTextColor(...accent);doc.text(`${i+1}. ${pdfText(String(f.severity||'priority').replaceAll('_',' ')).toUpperCase()}`,22,y+2);y+=13;y=body(doc,f.title||'Finding',y,{size:14,bold:true,leading:6.8});y+=2;y=body(doc,f.commentary||f.observation||'',y,{size:10.5,leading:5.5});if(f.evidence?.length){y+=2;y=small(doc,`Evidence: ${f.evidence.join(', ')}`,y)}y+=10}}
    if(workstreams?.content?.items?.length){doc.addPage();y=24;y=addSectionTitle(doc,workstreams.heading||'Recommended workstreams',y,accent);for(let i=0;i<workstreams.content.items.length;i++){const w=workstreams.content.items[i];if(y>250){doc.addPage();y=24}doc.setFillColor(...accent);doc.circle(23,y-1,4,'F');doc.setTextColor(255);doc.setFont('helvetica','bold');doc.setFontSize(8);doc.text(String(i+1),23,y+1,{align:'center'});doc.setTextColor(35);doc.setFontSize(12);doc.text(pdfText(w.name||'Workstream'),31,y);y+=7;y=small(doc,w.description||'',y);y+=9}}
    if(focus?.content?.items?.length){y+=4;y=addSectionTitle(doc,focus.heading||'90-day focus',y,accent);for(let i=0;i<focus.content.items.length;i++){const f=focus.content.items[i];if(y>252){doc.addPage();y=24}doc.setFont('helvetica','bold');doc.setFontSize(11);doc.setTextColor(35);doc.text(`Phase ${i+1}: ${pdfText(f.name||'Priority')}`,18,y);y+=6;y=small(doc,f.description||'',y);y+=8}}
    addPageNumber(doc);
    const blob=doc.output('blob');const path=`${reviewPanel.dataset.engagement}/opportunity-map-v${currentReport.version}.pdf`;
    const {error:upErr}=await supabase.storage.from('opportunity-maps').upload(path,blob,{contentType:'application/pdf',upsert:true});if(upErr)throw upErr;
    const {error:rErr}=await supabase.from('reports').update({pdf_storage_path:path}).eq('id',currentReport.id);if(rErr)throw rErr;currentReport.pdf_storage_path=path;
    doc.save(`${safeName(currentClient)}-growth-opportunity-map-v${currentReport.version}.pdf`);message('PDF exported and archived in Supabase.');
  }catch(e){console.error(e);message(e.message||'Could not export PDF',true)}finally{btn.disabled=false;btn.textContent='Export PDF'}
}

window.addEventListener('opportunity-report-built',e=>loadLatestReport(e.detail?.engagementId||reviewPanel.dataset.engagement));
const observer=new MutationObserver(()=>{const id=reviewPanel.dataset.engagement;if(id)setTimeout(()=>loadLatestReport(id),350)});observer.observe(reviewPanel,{attributes:true,attributeFilter:['data-engagement']});
