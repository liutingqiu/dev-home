#!/usr/bin/env node
/**
 * 柳亭秋 — 上线前全功能自动化测试
 * 用法: node test.js [--port=3458] [--host=localhost]
 * 覆盖: 页面/API/安全/认证/数据完整性
 */

const BASE = `http://${process.env.HOST||'localhost'}:${process.env.PORT||3000}`;
let passed=0,failed=0,warned=0;

function pass(label,msg){passed++;console.log('  ✓',label+':',msg)}
function fail(label,msg){failed++;console.log('  ✗',label+':',msg)}
function warn(label,msg){warned++;console.log('  ⚠',label+':',msg)}

async function get(path,headers={}){
  try{const r=await fetch(BASE+path,{redirect:'manual',headers});const t=await r.text();let j=null;try{j=JSON.parse(t)}catch{}return{status:r.status,headers:r.headers,text:t,json:j}}
  catch(e){return{status:0,error:e.message}}
}
async function post(path,body,token){
  const h={'Content-Type':'application/json'};if(token)h.Authorization='Bearer '+token;
  try{const r=await fetch(BASE+path,{method:'POST',headers:h,body:JSON.stringify(body)});const t=await r.text();let j=null;try{j=JSON.parse(t)}catch{}return{status:r.status,json:j}}
  catch(e){return{status:0,error:e.message}}
}
async function put(path,body,token){
  const r=await fetch(BASE+path,{method:'PUT',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},body:JSON.stringify(body)});const t=await r.text();let j=null;try{j=JSON.parse(t)}catch{}return{status:r.status,json:j}
}
async function del(path,token){
  const r=await fetch(BASE+path,{method:'DELETE',headers:{Authorization:'Bearer '+token}});const t=await r.text();let j=null;try{j=JSON.parse(t)}catch{}return{status:r.status,json:j}
}
async function sleep(ms){return new Promise(r=>setTimeout(r,ms))}

(async()=>{
console.log('\n╔══════════════════════════════════════════╗');
console.log('║   柳亭秋 · 全功能自动化测试              ║');
console.log('║   '+BASE+'                      ║');
console.log('╚══════════════════════════════════════════╝\n');

// ================================================================
// 一、前台页面可访问性 + SEO
// ================================================================
console.log('━━━ 一、前台页面可访问性 + SEO ━━━');
const pages=[
  {path:'/',name:'首页'},
  {path:'/login.html',name:'后台登录'},
  {path:'/cases.html',name:'案例详情'},
  {path:'/cooperation.html',name:'合作须知'},
  {path:'/apply.html',name:'项目申请'},
  {path:'/feat-menu.html',name:'功能-菜品浏览'},
  {path:'/feat-admin.html',name:'功能-后台管理'},
  {path:'/feat-responsive.html',name:'功能-响应式'},
  {path:'/feat-contact.html',name:'功能-留言'},
  {path:'/feat-seo.html',name:'功能-SEO'},
  {path:'/feat-security.html',name:'功能-安全'},
];
for(const p of pages){
  const{status,text}=await get(p.path);
  if(status===200&&text.includes('<!DOCTYPE html>')){
    const hasDesc=/meta name="description"/.test(text);
    const hasOG=/og:title/.test(text);
    const hasMain=/<main/.test(text)||/<article/.test(text);
    const tags=[];
    if(hasDesc)tags.push('meta');
    if(hasOG)tags.push('OG');
    if(hasMain)tags.push('语义HTML');
    if(tags.length)pass(p.name,`200 (${(text.length/1024).toFixed(1)}KB) [${tags.join(',')}]`);
    else warn(p.name,'200 但缺SEO/语义标签');
  }else{fail(p.name,`状态 ${status||'ERR'}`)}
}

// ================================================================
// 二、公共 API
// ================================================================
console.log('\n━━━ 二、公共 API 端点 ━━━');

const settings=await get('/api/settings');
if(settings.status===200&&settings.json)pass('GET /api/settings',settings.json.name||'OK');
else fail('GET /api/settings',`状态 ${settings.status}`);

const skills=await get('/api/skills');
if(skills.status===200&&Array.isArray(skills.json))pass('GET /api/skills',`${skills.json.length} 项`);
else fail('GET /api/skills',`状态 ${skills.status}`);

const projects=await get('/api/projects');
if(projects.status===200&&Array.isArray(projects.json))pass('GET /api/projects',`${projects.json.length} 个项目`);
else fail('GET /api/projects',`状态 ${projects.status}`);

// 联系表单
const contactRes=await post('/api/contact',{name:'测试用户',phone:'13800138000',content:'自动化测试留言'});
if(contactRes.status===200&&contactRes.json?.success)pass('POST /api/contact','提交成功');
else fail('POST /api/contact',contactRes.json?.error||`状态 ${contactRes.status}`);

// 联系表单-无手机号(可选字段)
const c2=await post('/api/contact',{name:'测试',phone:'',content:'无需电话'});
if(c2.status===200&&c2.json?.success)pass('POST /api/contact (无电话)','提交成功');
else fail('POST /api/contact (无电话)',`状态 ${c2.status}`);

// 联系表单-无效手机号
const c3=await post('/api/contact',{name:'测试',phone:'12345',content:'错号'});
if(c3.status===400)pass('POST /api/contact (错号)','400 格式错误');
else fail('POST /api/contact (错号)',`应为400，实际 ${c3.status}`);

// 项目申请
const applyRes=await post('/api/apply',{name:'测试用户',phone:'13800138000',email:'test@test.com',description:'需要一个餐厅网站，5个页面'});
if(applyRes.status===200&&applyRes.json?.success)pass('POST /api/apply','提交成功');
else fail('POST /api/apply',applyRes.json?.error||`状态 ${applyRes.status}`);

// 申请-缺必填
const a2=await post('/api/apply',{name:'',phone:'123',description:''});
if(a2.status===400)pass('POST /api/apply (缺字段)','400 校验拒绝');
else fail('POST /api/apply (缺字段)',`应为400，实际 ${a2.status}`);

// 申请-错邮箱
const a3=await post('/api/apply',{name:'x',phone:'13800138000',email:'bad',description:'test project request minimum 10 chars'});
if(a3.status===400)pass('POST /api/apply (错邮箱)','400 格式错误');
else fail('POST /api/apply (错邮箱)',`应为400，实际 ${a3.status}`);

// ================================================================
// 三、安全防护
// ================================================================
console.log('\n━━━ 三、安全防护验证 ━━━');

// Data 封锁
const d1=await get('/data/users.json');
if(d1.status===403)pass('/data/ 目录拦截','403');
else fail('/data/ 目录拦截',`${d1.status} — 数据可被下载!`);

const d2=await get('/Data/users.json');
if(d2.status===403)pass('/Data/ 大小写绕过','403');
else fail('/Data/ 大小写绕过',`${d2.status} — 可绕过!`);

// 安全头
const hh=(await get('/')).headers;
const checks={};
checks['X-Content-Type-Options']=hh.get('x-content-type-options')==='nosniff';
checks['X-Frame-Options']=hh.get('x-frame-options')==='DENY';
checks['Referrer-Policy']=!!hh.get('referrer-policy');
checks['CSP']=!!hh.get('content-security-policy');
for(const[k,v]of Object.entries(checks)){
  if(v)pass(k,'✓');else fail(k,'缺失');
}

// 路径遍历
const pt=await get('/../CLAUDE.md');
if(pt.status>=400)pass('路径遍历防护',`${pt.status}`);
else fail('路径遍历防护',`${pt.status} — 文件被读取!`);

// admin 无 Token 拦截
const unauth=await get('/api/admin/messages');
if(unauth.status===401)pass('无Token拦截','401');
else fail('无Token拦截',`${unauth.status}`);

// ================================================================
// 四、认证系统
// ================================================================
console.log('\n━━━ 四、认证系统 ━━━');

// 登录成功
const login=await post('/api/admin/login',{username:'admin',password:'admin2026'});
let token=null;
if(login.status===200&&login.json?.token){token=login.json.token;pass('登录成功','token 已获取')}
else{fail('登录失败',login.json?.error||`状态 ${login.status}`)}

// 错误密码
const badLogin=await post('/api/admin/login',{username:'admin',password:'wrong'});
if(badLogin.status===401)pass('错误密码→401','✓');
else fail('错误密码→401',`${badLogin.status}`);

// Token 验证
const check=await get('/api/admin/messages',{Authorization:'Bearer '+token});
if(check.status===200&&Array.isArray(check.json))pass('Token 有效','消息列表获取成功');
else fail('Token 有效',`${check.status}`);

// 过期/假 Token
const badToken=await get('/api/admin/messages',{Authorization:'Bearer badtoken123'});
if(badToken.status===401)pass('假Token→401','✓');
else fail('假Token→401',`${badToken.status}`);

// ================================================================
// 五、管理 CRUD — 留言
// ================================================================
console.log('\n━━━ 五、管理 CRUD — 留言 ━━━');
if(!token){console.log('  ⚠ 跳过 (无token)')}else{

// GET
const msgs=await get('/api/admin/messages',{Authorization:'Bearer '+token});
if(msgs.status===200)pass('GET 留言列表',`${msgs.json?.length||0} 条`);
else fail('GET 留言列表',msgs.status);

// PUT 标已读
if(msgs.json?.length>0){
  const mid=msgs.json[msgs.json.length-1].id;
  const rr=await put('/api/admin/messages',{id:mid,read:true},token);
  if(rr.status===200&&rr.json?.success)pass('PUT 标已读','✓');
  else fail('PUT 标已读',`${rr.status}`);

  // PUT 不存在的ID
  const r2=await put('/api/admin/messages',{id:'nonexistent',read:true},token);
  if(r2.status===404)pass('PUT 不存在ID→404','✓');
  else fail('PUT 不存在ID→404',`${r2.status}`);
}

// DELETE 不存在ID
const d3=await del('/api/admin/messages?id=nonexistent',token);
if(d3.status===404)pass('DELETE 不存在→404','✓');
else fail('DELETE 不存在→404',`${d3.status}`);
}

// ================================================================
// 六、管理 CRUD — 项目申请
// ================================================================
console.log('\n━━━ 六、管理 CRUD — 项目申请 ━━━');
if(!token){console.log('  ⚠ 跳过 (无token)')}else{

const apps=await get('/api/admin/applications',{Authorization:'Bearer '+token});
if(apps.status===200)pass('GET 申请列表',`${apps.json?.length||0} 条`);
else fail('GET 申请列表',apps.status);

if(apps.json?.length>0){
  const aid=apps.json[0].id;
  const ar=await put('/api/admin/applications',{id:aid,read:true},token);
  if(ar.status===200)pass('PUT 标已读','✓');
  else fail('PUT 标已读',`${ar.status}`);
}

const ad=await del('/api/admin/applications?id=nonexistent',token);
if(ad.status===404)pass('DELETE 不存在→404','✓');
else fail('DELETE 不存在→404',`${ad.status}`);
}

// ================================================================
// 七、管理 CRUD — 项目
// ================================================================
console.log('\n━━━ 七、管理 CRUD — 项目案例 ━━━');
if(!token){console.log('  ⚠ 跳过 (无token)')}else{

const projs=await get('/api/admin/projects',{Authorization:'Bearer '+token});
if(projs.status===200)pass('GET 项目列表',`${projs.json?.length||0} 个`);
else fail('GET 项目列表',projs.status);

// POST 新增
const newProj=await post('/api/admin/projects',{
  name:'测试项目'+Date.now().toString(36),
  type:'测试类型',
  url:'https://example.com',
  description:'自动化测试创建',
  features:['特性1','特性2'],
  featured:false
},token);
let pid=null;
if(newProj.status===200&&newProj.json?.id){pid=newProj.json.id;pass('POST 新增项目',pid)}
else fail('POST 新增项目',`${newProj.status}`);

// PUT 修改
if(pid){
  const up=await put('/api/admin/projects',{id:pid,name:'已修改项目'},token);
  if(up.status===200&&up.json?.name==='已修改项目')pass('PUT 修改项目','✓');
  else fail('PUT 修改项目',`${up.status}`);
}

// PUT 不存在
const p2=await put('/api/admin/projects',{id:'nonexistent',name:'x'},token);
if(p2.status===404)pass('PUT 不存在→404','✓');
else fail('PUT 不存在→404',`${p2.status}`);

// DELETE
if(pid){
  const dd=await del('/api/admin/projects?id='+pid,token);
  if(dd.status===200)pass('DELETE 项目','✓');
  else fail('DELETE 项目',`${dd.status}`);
}

const dd2=await del('/api/admin/projects?id=nonexistent',token);
if(dd2.status===404)pass('DELETE 不存在→404','✓');
else fail('DELETE 不存在→404',`${dd2.status}`);
}

// ================================================================
// 八、静态资源
// ================================================================
console.log('\n━━━ 八、静态资源 ━━━');
const staticFiles=[
  {path:'/css/style.css',type:'text/css'},
  {path:'/js/main.js',type:'application/javascript'},
];
for(const s of staticFiles){
  const r=await get(s.path);
  const ct=r.headers?.get('content-type')||'';
  if(r.status===200&&ct.includes(s.type))pass(s.path,'200 '+ct.split(';')[0]);
  else fail(s.path,`${r.status} ${ct}`);
}

// ================================================================
// 九、Gzip 压缩
// ================================================================
console.log('\n━━━ 九、Gzip 压缩 ━━━');
const gz=await fetch(BASE+'/css/style.css',{headers:{'Accept-Encoding':'gzip'}});
const ce=gz.headers.get('content-encoding');
if(ce==='gzip')pass('Gzip 生效','Content-Encoding: gzip');
else warn('Gzip','未压缩或客户端不支持');

// ================================================================
// 十、速率限制（放最后，不干扰后续测试）
// ================================================================
console.log('\n━━━ 十、速率限制 ━━━');
let rateLimited=false;
for(let i=0;i<65;i++){
  const r=await get('/api/settings');
  if(r.status===429){rateLimited=true;break}
}
if(rateLimited)pass('速率限制触发','429 ✓');
else fail('速率限制触发','未触发429');

// ================================================================
// 汇总
// ================================================================
console.log('\n╔══════════════════════════════════════════╗');
const total=passed+failed+warned;
console.log(`║  通过: ${passed}/${total}  |  失败: ${failed}  |  警告: ${warned}  ║`);
console.log('╚══════════════════════════════════════════╝\n');
process.exit(failed>0?1:0);
})();
