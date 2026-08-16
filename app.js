import { CLIENT_DIAGNOSTIC_ENDPOINT } from './supabase-config.js';

const params=new URLSearchParams(location.search),token=params.get('token');
const welcome=document.getElementById('welcome'),questionnaire=document.getElementById('questionnaire'),complete=document.getElementById('complete'),answerReview=document.getElementById('answerReview'),host=document.getElementById('questionHost');
let index=0,questions=[],sections=[],answers={},client=null,remote=Boolean(token),response=null,editMode=false;
const backupKey=remote?`opp-map-${token.slice(0,12)}`:'opp-map-demo';
const show=(el)=>{[welcome,questionnaire,complete,answerReview].forEach(x=>x.classList.remove('active'));el.classList.add('active')};
const esc=(v='')=>String(v??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
const wait=(ms)=>new Promise(r=>setTimeout(r,ms));
function storeBackup(){try{localStorage.setItem(backupKey,JSON.stringify(answers))}catch{}}
function readBackup(){try{return JSON.parse(localStorage.getItem(backupKey)||'{}')}catch{return {}}}
async function api(action,payload={}){
  let lastError;
  for(let attempt=0;attempt<4;attempt++){
    try{
      const r=await fetch(CLIENT_DIAGNOSTIC_ENDPOINT,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token,action,...payload})});
      const text=await r.text();let data={};try{data=text?JSON.parse(text):{}}catch{data={error:text||'Unexpected server response'}}
      if(!r.ok){const err=new Error(data.error||`Request failed (${r.status})`);err.status=r.status;throw err}
      return data;
    }catch(err){
      lastError=err;
      const retryable=!err?.status||err.status>=500||err.status===408||err.status===429;
      if(!retryable||attempt===3)break;
      await wait([300,700,1400,2200][attempt]);
    }
  }
  throw lastError||new Error('Could not save your answer');
}
async function bootstrap(){
  if(!remote){questions=(window.OPP_QUESTIONS||[]).map((q,i)=>({id:q.id,code:q.id,prompt:q.title,helper_text:q.help,response_type:q.type==='textarea'?'long_text':q.type==='number'?'number':q.type==='multi'?'multi_select':q.type==='text'?'short_text':'single_select',sort_order:i+1,section_title:q.chapter,required:!q.optional,config:{max_choices:q.maxChoices||3},question_options:(q.options||[]).map((o,j)=>({label:typeof o==='string'?o:o.label,value:typeof o==='string'?o:o.label,sort_order:j+1}))}));client={name:'Your business'};answers=readBackup();return}
  const data=await api('bootstrap');client=data.client;sections=data.sections||[];questions=(data.questions||[]).map(q=>({...q,section_title:sections.find(s=>s.id===q.section_id)?.title||'Opportunity mapping',question_options:[...(q.question_options||[])].sort((a,b)=>a.sort_order-b.sort_order)}));response=data.response;
  const local=readBackup();answers={...local};(data.answers||[]).forEach(a=>answers[a.question_id]=a.answer?.value??a.answer);storeBackup();
  document.querySelectorAll('[data-company]').forEach(el=>el.textContent=client?.name||'Your business');if(data.brand?.primary_color&&/^#[0-9a-f]{6}$/i.test(data.brand.primary_color))document.documentElement.style.setProperty('--client-accent',data.brand.primary_color);if(response?.status==='submitted')show(complete)
}
function isExclusiveOption(value=''){return /^(none|nothing|no obvious|none consistently|none of these)/i.test(String(value).trim())}
function render(){
  const q=questions[index];if(!q)return;
  document.getElementById('chapterName').textContent=q.section_title;document.getElementById('progress').style.width=`${((index+1)/questions.length)*100}%`;document.getElementById('progressText').textContent=editMode?'Editing your response':`${q.section_title} · ${Math.round(((index+1)/questions.length)*100)}%`;const current=answers[q.id];let body=`<div class="question-code">${esc(q.code||'')}</div><h2 class="question-title">${esc(q.prompt)}</h2><p class="question-help">${esc(q.helper_text||'')}${q.required===false?' <span class="optional-label">Optional</span>':''}</p>`;
  if(q.response_type==='long_text'||q.response_type==='short_text')body+=q.response_type==='long_text'?`<textarea class="textarea" id="answerInput" placeholder="Type your answer here…">${esc(current||'')}</textarea>`:`<input class="text-input" id="answerInput" value="${esc(current||'')}" placeholder="Type your answer…">`;
  else if(['number','currency','percentage'].includes(q.response_type))body+=`<div class="number-wrap">${q.response_type==='currency'?'<span>£</span>':''}<input class="text-input number-input" type="number" min="0" id="answerInput" value="${current??''}" placeholder="0"></div>`;
  else if(q.response_type==='multi_select'){
    const selected=Array.isArray(current)?current:[];const max=Number(q.config?.max_choices)||3;
    body+=`<div class="option-grid">${q.question_options.map(o=>`<button class="option multi-option ${selected.includes(o.value)?'selected':''}" data-value="${esc(o.value)}" type="button">${esc(o.label)}</button>`).join('')}</div><p class="question-help small">Select all that apply${max?`, up to ${max}`:''}.</p>`
  } else body+=`<div class="option-grid">${q.question_options.map(o=>`<button class="option ${current===o.value?'selected':''}" data-value="${esc(o.value)}" type="button">${esc(o.label)}</button>`).join('')}</div>`;
  host.innerHTML=body;document.getElementById('backBtn').style.visibility=editMode?'visible':index===0?'hidden':'visible';document.getElementById('backBtn').textContent=editMode?'Cancel':'Back';document.getElementById('nextBtn').textContent=editMode?'Save change':index===questions.length-1?'Finish':'Continue';
  document.querySelectorAll('.option:not(.multi-option)').forEach(btn=>btn.onclick=()=>{answers[q.id]=btn.dataset.value;storeBackup();render()});
  document.querySelectorAll('.multi-option').forEach(btn=>btn.onclick=()=>{
    let list=Array.isArray(answers[q.id])?[...answers[q.id]]:[];const value=btn.dataset.value,pos=list.indexOf(value),max=Number(q.config?.max_choices)||3;
    if(pos>=0)list.splice(pos,1);
    else if(isExclusiveOption(value))list=[value];
    else {list=list.filter(v=>!isExclusiveOption(v));if(!max||list.length<max)list.push(value)}
    answers[q.id]=list;storeBackup();render()
  })
}
async function save(q,value){storeBackup();if(!remote)return;const sectionCode=sections.find(s=>s.id===q.section_id)?.code||null;await api('save_answer',{question_id:q.id,answer:{value},section_code:sectionCode})}
async function capture(){const q=questions[index],input=document.getElementById('answerInput');let value=answers[q.id];if(input){value=['number','currency','percentage'].includes(q.response_type)?(input.value===''?'':Number(input.value)):input.value.trim();answers[q.id]=value;storeBackup()}if(value!==undefined)await save(q,value)}
async function finish(){await capture();if(remote)await api('submit');show(complete)}
function showSaveError(e){const message=e?.message==='Load failed'?'Your connection briefly dropped while saving. I retried it, but the answer has not reached the server yet. Your answer is safe in this browser. Please click Continue again.':(e?.message||'Could not save your answer. Your answer is safe in this browser. Please try again.');alert(message)}
function answerText(v){if(v===undefined||v===null||v==='')return '<span class="review-empty">Not answered</span>';if(Array.isArray(v))return esc(v.join(', '));return esc(v)}
function renderAnswerReview(){
  const list=document.getElementById('answerReviewList');let last='';
  list.innerHTML=questions.map((q,i)=>{const section=q.section_title||'Opportunity mapping',heading=section!==last?`<div class="review-section-heading"><span>${esc(section)}</span></div>`:'';last=section;return `${heading}<article class="review-answer-card"><div class="review-answer-main"><div class="question-code">${esc(q.code||'')}</div><h3>${esc(q.prompt)}</h3><p>${answerText(answers[q.id])}</p></div><button class="secondary tiny review-edit" data-index="${i}" type="button">Edit</button></article>`}).join('');
  list.querySelectorAll('.review-edit').forEach(btn=>btn.onclick=()=>{index=Number(btn.dataset.index);editMode=true;show(questionnaire);render();window.scrollTo({top:0,behavior:'smooth'})});
  show(answerReview);window.scrollTo({top:0,behavior:'smooth'});
}
function exitReview(){editMode=false;show(complete);window.scrollTo({top:0,behavior:'smooth'})}
document.getElementById('startBtn').onclick=()=>{show(questionnaire);render()};
document.getElementById('backBtn').onclick=async()=>{if(editMode){renderAnswerReview();return}const btn=document.getElementById('backBtn');btn.disabled=true;try{await capture();if(index>0){index--;render()}}catch(e){showSaveError(e)}finally{btn.disabled=false}};
document.getElementById('nextBtn').onclick=async()=>{const btn=document.getElementById('nextBtn');btn.disabled=true;btn.textContent='Saving…';try{await capture();if(editMode){editMode=false;renderAnswerReview()}else if(index<questions.length-1){index++;render()}else await finish()}catch(e){showSaveError(e);render()}finally{btn.disabled=false}};
document.getElementById('restartBtn').onclick=renderAnswerReview;
document.getElementById('reviewDoneBtn').onclick=exitReview;
document.getElementById('reviewDoneBottomBtn').onclick=exitReview;
bootstrap().catch(e=>{document.getElementById('welcome').innerHTML=`<div class="eyebrow">LINK PROBLEM</div><h1>This diagnostic link can’t be opened.</h1><p class="lede">${esc(e.message)}</p>`});
