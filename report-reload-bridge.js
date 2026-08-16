const reportState=document.getElementById('reportState');
const reviewPanel=document.getElementById('reviewPanel');
if(reportState&&reviewPanel){
  let timer;
  const observer=new MutationObserver(()=>{
    clearTimeout(timer);
    timer=setTimeout(()=>{
      const id=reviewPanel.dataset.engagement;
      if(id&&/Draft v\d+ saved/i.test(reportState.textContent||'')){
        window.dispatchEvent(new CustomEvent('opportunity-report-built',{detail:{engagementId:id}}));
      }
    },150);
  });
  observer.observe(reportState,{childList:true,subtree:true,characterData:true});
}
