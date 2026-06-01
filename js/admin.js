(()=>{
'use strict';

// ============ Auth & API ============
const TOKEN = localStorage.getItem('adminToken');
const HEADERS = { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + TOKEN };

async function api(url, opts = {}) {
  showLoading(true);
  try {
    const res = await fetch(url, { ...opts, headers: { ...HEADERS, ...opts.headers } });
    if (res.status === 401) { localStorage.removeItem('adminToken'); location.reload(); return; }
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || '请求失败');
    return data;
  } catch (err) {
    showToast(err.message, 'error');
    throw err;
  } finally {
    showLoading(false);
  }
}

// ============ UI: Loading & Toast ============
function showLoading(show) {
  const el = document.getElementById('loadingOverlay');
  if (el) el.classList.toggle('active', show);
}

function showToast(msg, type = 'info') {
  const container = document.getElementById('toastContainer');
  if (!container) return;
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = msg;
  container.appendChild(toast);
  setTimeout(() => toast.remove(), 3000);
}

// ============ Login ============
document.getElementById('loginForm')?.addEventListener('submit', async e => {
  e.preventDefault();
  const u = document.getElementById('loginUser').value;
  const p = document.getElementById('loginPass').value;
  try {
    const res = await fetch('/api/admin/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: u, password: p })
    });
    const d = await res.json();
    if (d.token) { localStorage.setItem('adminToken', d.token); location.reload(); }
    else { document.getElementById('loginError').style.display = 'block'; }
  } catch {
    document.getElementById('loginError').style.display = 'block';
  }
});

// ============ Init ============
if (TOKEN) {
  document.getElementById('loginPage')?.classList.remove('active');
  document.getElementById('adminLayout')?.classList.add('active');
  loadDashboard();
}

// ============ Sidebar ============
document.querySelectorAll('.admin-nav a[data-tab]').forEach(a => {
  a.addEventListener('click', e => { e.preventDefault(); loadTab(a.dataset.tab); });
});
document.getElementById('sidebarCollapseBtn')?.addEventListener('click', () => {
  document.getElementById('sidebar')?.classList.toggle('collapsed');
});
document.getElementById('sidebarToggle')?.addEventListener('click', () => {
  document.getElementById('adminNav')?.classList.toggle('open');
  document.getElementById('sidebarOverlay')?.classList.toggle('open');
});
document.getElementById('sidebarOverlay')?.addEventListener('click', () => {
  document.getElementById('adminNav')?.classList.remove('open');
  document.getElementById('sidebarOverlay')?.classList.remove('open');
});
document.getElementById('logoutBtn')?.addEventListener('click', () => {
  localStorage.removeItem('adminToken'); location.href = '/';
});

let currentTab = 'dashboard';
const TAB_LOADERS = {
  dashboard: loadDashboard,
  projects: loadProjects,
  messages: loadMessages,
  applications: loadApplications,
  settings: loadSettings,
  users: () => {}
};

function loadTab(tab) {
  currentTab = tab;
  document.querySelectorAll('.admin-nav a').forEach(a => a.classList.remove('active'));
  document.querySelector(`.admin-nav a[data-tab="${tab}"]`)?.classList.add('active');
  document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
  document.getElementById('tab-' + tab)?.classList.add('active');
  document.getElementById('adminNav')?.classList.remove('open');
  document.getElementById('sidebarOverlay')?.classList.remove('open');
  TAB_LOADERS[tab]?.();
}

window.refreshCurrentTab = function () {
  const btn = document.querySelector('.tab-content.active .btn-refresh');
  if (btn) btn.classList.add('spinning');
  const done = () => { if (btn) btn.classList.remove('spinning'); };
  const loader = TAB_LOADERS[currentTab];
  if (loader) Promise.resolve(loader()).then(done).catch(done);
  else done();
};

// ============ Dashboard ============
async function loadDashboard() {
  try {
    const [proj, msgs, apps] = await Promise.all([
      api('/api/admin/projects').catch(() => []),
      api('/api/admin/messages').catch(() => []),
      api('/api/admin/applications').catch(() => [])
    ]);
    document.getElementById('statCards').innerHTML = `
      <div class="stat-card"><div class="label">项目总数</div><div class="value">${proj.length || 0}</div></div>
      <div class="stat-card"><div class="label">未读留言</div><div class="value">${(msgs || []).filter(m => !m.read).length}</div></div>
      <div class="stat-card"><div class="label">项目申请</div><div class="value">${(apps || []).length}</div></div>
      <div class="stat-card"><div class="label">系统状态</div><div class="value" style="color:var(--c-cyan);font-size:20px">运行中</div></div>`;
  } catch { /* toast shown by api() */ }
}

// ============ Table Renderer ============
function renderTable(tbodyId, cols, rows, emptyText) {
  const tbody = document.getElementById(tbodyId);
  if (!tbody) return;
  if (!rows || rows.length === 0) {
    tbody.innerHTML = `<tr><td colspan="${cols.length}" class="empty-state">${emptyText}</td></tr>`;
    return;
  }
  tbody.innerHTML = rows.map(row => {
    const cells = cols.map(col => {
      const val = col.render ? col.render(row) : (row[col.key] || '');
      return `<td>${val}</td>`;
    }).join('');
    return `<tr${row.read === false ? ' style="font-weight:600"' : ''}>${cells}</tr>`;
  }).join('');
}

// ============ Projects ============
async function loadProjects() {
  try {
    const data = await api('/api/admin/projects');
    document.getElementById('projCount').textContent = data.length;
    renderTable('projTable',
      [
        { key: 'name', render: p => `<strong>${esc(p.name)}</strong>` },
        { key: 'type' },
        { key: 'url', render: p => p.url ? `<a href="${esc(p.url)}" target="_blank" rel="noopener noreferrer" style="color:var(--c-cyan)">🔗</a>` : '' },
        { key: 'featured', render: p => p.featured ? '⭐' : '' },
        { key: '_actions', render: p => `<button class="btn-sm btn-edit" onclick="editProj('${p.id}')">编辑</button><button class="btn-sm btn-del" onclick="delProj('${p.id}')">删除</button>` }
      ],
      data, '暂无项目'
    );
  } catch { }
}

window.editProj = async id => {
  try {
    const data = await api('/api/admin/projects');
    const p = data.find(x => x.id === id);
    if (p) openProjModal(p);
  } catch { }
};
window.delProj = async id => {
  if (!confirm('确定删除？')) return;
  try {
    await api('/api/admin/projects?id=' + id, { method: 'DELETE' });
    showToast('删除成功', 'success');
    loadProjects(); loadDashboard();
  } catch { }
};

function openProjModal(data) {
  const isEdit = !!data;
  document.getElementById('modalContent').innerHTML = `
    <div class="modal-header"><h3>${isEdit ? '编辑' : '新增'}项目</h3><button class="modal-close" onclick="closeModal()" aria-label="关闭">&times;</button></div>
    <div class="modal-body">
      <form id="projForm">
        <input type="hidden" name="id" value="${data?.id || ''}">
        <div class="form-row"><div class="form-group"><label>项目名称</label><input name="name" value="${esc(data?.name || '')}" required></div><div class="form-group"><label>英文名</label><input name="nameEn" value="${esc(data?.nameEn || '')}"></div></div>
        <div class="form-row"><div class="form-group"><label>类型</label><input name="type" value="${esc(data?.type || '')}"></div><div class="form-group"><label>在线URL</label><input name="url" value="${esc(data?.url || '')}"></div></div>
        <div class="form-group"><label>描述</label><textarea name="description" rows="2">${esc(data?.description || '')}</textarea></div>
        <div class="form-group"><label>英文描述</label><textarea name="descriptionEn" rows="2">${esc(data?.descriptionEn || '')}</textarea></div>
        <div class="form-group"><label>特性（逗号分隔）</label><input name="featuresStr" value="${(data?.features || []).join(', ')}"></div>
        <div class="form-row"><div class="form-group"><label>推荐</label><select name="featured"><option value="0">否</option><option value="1" ${data?.featured ? 'selected' : ''}>是</option></select></div></div>
        <button type="submit" class="btn-save">${isEdit ? '保存' : '添加'}</button>
      </form>
    </div>`;
  document.getElementById('modalOverlay').classList.add('open');
  document.getElementById('projForm').addEventListener('submit', async e => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const body = {
      name: fd.get('name'), nameEn: fd.get('nameEn'), type: fd.get('type'), url: fd.get('url'),
      description: fd.get('description'), descriptionEn: fd.get('descriptionEn'),
      features: fd.get('featuresStr').split(',').map(s => s.trim()).filter(Boolean),
      featured: fd.get('featured') === '1'
    };
    if (fd.get('id')) { body.id = fd.get('id'); await api('/api/admin/projects', { method: 'PUT', body: JSON.stringify(body) }); }
    else { await api('/api/admin/projects', { method: 'POST', body: JSON.stringify(body) }); }
    showToast(isEdit ? '保存成功' : '添加成功', 'success');
    closeModal(); loadProjects(); loadDashboard();
  });
}

// ============ Messages ============
async function loadMessages() {
  try {
    const data = await api('/api/admin/messages');
    renderTable('msgTable',
      [
        { key: 'name' },
        { key: 'phone' },
        { key: 'content', render: m => esc((m.content || '').substring(0, 25)) + '...' },
        { key: 'createdAt', render: m => new Date(m.createdAt).toLocaleDateString() },
        { key: 'read', render: m => `<span class="status-dot ${m.read ? 'active' : 'inactive'}"></span>${m.read ? '已读' : '未读'}` },
        { key: '_actions', render: m => `<button class="btn-sm btn-edit" onclick="toggleMsg('${m.id}',${!m.read})">${m.read ? '标未读' : '标已读'}</button><button class="btn-sm btn-del" onclick="delMsg('${m.id}')">删除</button>` }
      ],
      data.reverse(), '暂无留言'
    );
  } catch { }
}

window.toggleMsg = async (id, read) => {
  try {
    await api('/api/admin/messages', { method: 'PUT', body: JSON.stringify({ id, read }) });
    showToast('状态已更新', 'success');
    loadMessages(); loadDashboard();
  } catch { }
};
window.delMsg = async id => {
  if (!confirm('确定删除？')) return;
  try {
    await api('/api/admin/messages?id=' + id, { method: 'DELETE' });
    showToast('删除成功', 'success');
    loadMessages(); loadDashboard();
  } catch { }
};

// ============ Applications ============
async function loadApplications() {
  try {
    const data = await api('/api/admin/applications');
    renderTable('appTable',
      [
        { key: 'name' },
        { key: 'phone' },
        { key: 'email', render: a => a.email || '-' },
        { key: 'description', render: a => esc((a.description || '').substring(0, 30)) + '...' },
        { key: 'createdAt', render: a => new Date(a.createdAt).toLocaleDateString() },
        { key: 'read', render: a => `<span class="status-dot ${a.read ? 'active' : 'inactive'}"></span>${a.read ? '已读' : '未读'}` },
        { key: '_actions', render: a => `<button class="btn-sm btn-edit" onclick="toggleApp('${a.id}',${!a.read})">${a.read ? '标未读' : '标已读'}</button><button class="btn-sm btn-del" onclick="delApp('${a.id}')">删除</button>` }
      ],
      data.reverse(), '暂无项目申请'
    );
  } catch { }
}

window.toggleApp = async (id, read) => {
  try {
    await api('/api/admin/applications', { method: 'PUT', body: JSON.stringify({ id, read }) });
    showToast('状态已更新', 'success');
    loadApplications(); loadDashboard();
  } catch { }
};
window.delApp = async id => {
  if (!confirm('确定删除？')) return;
  try {
    await api('/api/admin/applications?id=' + id, { method: 'DELETE' });
    showToast('删除成功', 'success');
    loadApplications(); loadDashboard();
  } catch { }
};

// ============ Settings ============
async function loadSettings() {
  try {
    const data = await api('/api/admin/settings');
    const form = document.getElementById('settingsForm');
    if (!form) return;
    const mapping = {
      siteName: data.name,
      slogan: data.tagline,
      phone: data.contact?.phone,
      email: data.contact?.email,
      address: data.contact?.address,
      description: data.bio
    };
    Object.entries(mapping).forEach(([name, val]) => {
      const el = form.querySelector(`[name="${name}"]`);
      if (el && val !== undefined) el.value = val;
    });
  } catch { }
}

document.getElementById('settingsForm')?.addEventListener('submit', async e => {
  e.preventDefault();
  const btn = e.target.querySelector('button[type="submit"]');
  btn.disabled = true; btn.textContent = '保存中...';
  try {
    const fd = new FormData(e.target);
    const body = {
      name: fd.get('siteName'),
      tagline: fd.get('slogan'),
      bio: fd.get('description'),
      contact: { phone: fd.get('phone'), email: fd.get('email'), address: fd.get('address') }
    };
    await api('/api/admin/settings', { method: 'PUT', body: JSON.stringify(body) });
    showToast('设置已保存', 'success');
  } catch {
    showToast('保存失败，请重试', 'error');
  } finally {
    btn.disabled = false; btn.textContent = '保存设置';
  }
});

// ============ Users / Change Password ============
window.changePw = async () => {
  const o = document.getElementById('currentPw').value;
  const n = document.getElementById('newPw').value;
  const c = document.getElementById('confirmPw').value;
  if (n !== c) { showToast('两次密码不一致', 'error'); return; }
  if (n.length < 6) { showToast('新密码至少6位', 'error'); return; }
  try {
    const r = await api('/api/admin/change-password', { method: 'POST', body: JSON.stringify({ oldPassword: o, newPassword: n }) });
    showToast(r.message || '密码已修改', 'success');
    localStorage.removeItem('adminToken');
    setTimeout(() => location.reload(), 1500);
  } catch { }
};

// ============ Modal ============
window.closeModal = () => document.getElementById('modalOverlay')?.classList.remove('open');
document.getElementById('modalOverlay')?.addEventListener('click', e => {
  if (e.target === document.getElementById('modalOverlay')) closeModal();
});

// ============ Utils ============
function esc(s) {
  return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

})();
