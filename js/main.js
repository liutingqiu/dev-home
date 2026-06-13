(()=>{
'use strict';

// ============ 淡入 ============
const obs=new IntersectionObserver(es=>{es.forEach(e=>{if(e.isIntersecting){e.target.classList.add('visible');obs.unobserve(e.target);}})},{threshold:.1});
document.querySelectorAll('.fade-in').forEach(el=>obs.observe(el));
setTimeout(()=>{document.querySelectorAll('.hero .fade-in').forEach(el=>el.classList.add('visible'))},100);

// ============ 截图点击放大 ============
const overlay=document.getElementById('zoomOverlay');
const zoomImg=document.getElementById('zoomImg');
if (overlay && zoomImg) {
  document.querySelectorAll('.ss').forEach(item=>{
    item.addEventListener('click',()=>{
      zoomImg.src=item.dataset.src;
      overlay.classList.add('active');
    });
  });
  overlay.addEventListener('click',()=>{overlay.classList.remove('active')});
}

// ============ 联系表单 ============
const form=document.getElementById('contactForm');
const fb=document.getElementById('formFeedback');
form?.addEventListener('submit',async e=>{
  e.preventDefault();
  const btn=e.target.querySelector('button[type="submit"]');
  const data=Object.fromEntries(new FormData(form));
  fb.className='form-feedback';fb.textContent='';btn.disabled=true;btn.textContent='提交中...';
  try{
    if(location.protocol==='https:'){
      fb.className='form-feedback error';fb.textContent='请访问服务器版提交';return;
    }
    const res=await fetch('/api/contact',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});
    const r=await res.json();
    if(res.ok){fb.className='form-feedback success';fb.textContent='发送成功！我会通过你留下的手机号联系你。';form.reset()}
    else{fb.className='form-feedback error';fb.textContent=r.error||'发送失败'}
  }catch{fb.className='form-feedback error';fb.textContent='网络错误'}
  finally{btn.disabled=false;btn.textContent='提交留言'}
});

// ============ 复制 ============
const toast=document.getElementById('copyToast');
if (toast) {
document.querySelectorAll('.cc-item').forEach(el=>{
  el.addEventListener('click',()=>{
    const t=el.dataset.copy;
    if(navigator.clipboard?.writeText)navigator.clipboard.writeText(t).then(showToast);
    else{const ta=document.createElement('textarea');ta.value=t;ta.style.cssText='position:fixed;opacity:0';document.body.appendChild(ta);ta.select();document.execCommand('copy');document.body.removeChild(ta);showToast()}
  });
});
function showToast(){toast.textContent='已复制到剪贴板';toast.classList.add('show');setTimeout(()=>toast.classList.remove('show'),1500)}
}
})();
