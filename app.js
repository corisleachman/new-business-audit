const questions=window.OPP_QUESTIONS||[];
const params=new URLSearchParams(location.search);
const clientKey=params.get('client')||'demo';
const company=params.get('company')||'Your business';
const contact=params.get('contact')||'';
const accent=params.get('accent');
if(accent && /^#[0-9a-f]{6}$/i.test(accent)) document.documentElement.style.setProperty('--client-accent',accent);
const companyEls=document.querySelectorAll('[data-company]');companyEls.forEach(el=>el.textContent=company);
const contactEl=document.querySelector('[data-contact]');if(contactEl&&contact)contactEl.textContent=contact;
const storageKey=`opp-map:${clientKey}:answers`;
const metaKey=`opp-map:${clientKey}:meta`;
let index=0;
let answers=JSON.parse(localStorage.getItem(storageKey)||'{}');
const meta={clientKey,company,contact,startedAt:new Date().toISOString(),updatedAt:new Date().toISOString(),complete:false};
localStorage.setItem(metaKey,JSON.stringify({...JSON.parse(localStorage.getItem(metaKey)||'{}'),...meta}));
const welcome=document.getElementById('welcome'),questionnaire=document.getElementById('questionnaire'),complete=document.getElementById('complete'),host=document.getElementById('questionHost');
function show(el){[welcome,questionnaire,complete].forEach(x=>x.classList.remove('active'));el.classList.add('active')}
function visibleQuestions(){return questions.filter(q=>!q.showIf||q.showIf(answers));}
function render(){const qs=visibleQuestions();if(index>=qs.length)index=qs.length-1;const q=qs[index];if(!q)return;document.getElementById('chapterName').textContent=q.chapter;document.getElementById('progress').style.width=`${((index+1)/qs.length)*100}%`;document.getElementById('progressText').textContent=`${q.chapter} · ${Math.round(((index+1)/qs.length)*100)}%`;
let body=`<div class="question-code">${q.id}</div><h2 class="question-title">${escapeHtml(q.title)}</h2><p class="question-help">${escapeHtml(q.help||'')}</p>`;
const current=answers[q.id];
if(q.type==='textarea') body+=`<textarea class="textarea" id="answerInput" placeholder="Type your answer here…">${escapeHtml(current||'')}</textarea>`;
if(q.type==='text') body+=`<input class="text-input" id="answerInput" value="${escapeAttr(current||'')}" placeholder="Type your answer…">`;
if(q.type==='number') body+=`<div class="number-wrap">${q.prefix?`<span>${q.prefix}</span>`:''}<input class="text-input number-input" type="number" min="0" id="answerInput" value="${escapeAttr(current??'')}" placeholder="0"></div>`;
if(q.type==='options') body+=`<div class="option-grid">${q.options.map(o=>{const label=typeof o==='string'?o:o.label;return `<button class="option ${current===label?'selected':''}" data-value="${escapeAttr(label)}">${escapeHtml(label)}</button>`}).join('')}</div>`;
if(q.type==='multi'){const selected=Array.isArray(current)?current:[];body+=`<div class="option-grid">${q.options.map(label=>`<button class="option multi-option ${selected.includes(label)?'selected':''}" data-value="${escapeAttr(label)}">${escapeHtml(label)}</button>`).join('')}</div><div class="question-help small">Choose up to three.</div>`}
host.innerHTML=body;document.getElementById('backBtn').style.visibility=index===0?'hidden':'visible';document.getElementById('nextBtn').textContent=index===qs.length-1?'Finish':'Continue';
document.querySelectorAll('.option:not(.multi-option)').forEach(btn=>btn.onclick=()=>{answers[q.id]=btn.dataset.value;save();render()});
document.querySelectorAll('.multi-option').forEach(btn=>btn.onclick=()=>{const list=Array.isArray(answers[q.id])?[...answers[q.id]]:[];const value=btn.dataset.value;const pos=list.indexOf(value);if(pos>=0)list.splice(pos,1);else if(list.length<3)list.push(value);answers[q.id]=list;save();render()});
}
function capture(){const q=visibleQuestions()[index];const input=document.getElementById('answerInput');if(input){answers[q.id]=q.type==='number'?(input.value===''?'':Number(input.value)):input.value.trim();save()}}
function save(){localStorage.setItem(storageKey,JSON.stringify(answers));const old=JSON.parse(localStorage.getItem(metaKey)||'{}');localStorage.setItem(metaKey,JSON.stringify({...old,updatedAt:new Date().toISOString(),answerCount:Object.keys(answers).length,totalQuestions:visibleQuestions().length}))}
function completeDiagnostic(){capture();const old=JSON.parse(localStorage.getItem(metaKey)||'{}');localStorage.setItem(metaKey,JSON.stringify({...old,complete:true,completedAt:new Date().toISOString(),answerCount:Object.keys(answers).length,totalQuestions:visibleQuestions().length}));show(complete)}
function escapeHtml(value){return String(value).replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]))}
function escapeAttr(value){return escapeHtml(value)}
document.getElementById('startBtn').onclick=()=>{show(questionnaire);render()};document.getElementById('backBtn').onclick=()=>{capture();if(index>0){index--;render()}};document.getElementById('nextBtn').onclick=()=>{capture();const qs=visibleQuestions();if(index<qs.length-1){index++;render()}else completeDiagnostic()};document.getElementById('restartBtn').onclick=()=>{index=0;show(welcome)};
