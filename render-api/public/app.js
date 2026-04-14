/* ═══════════════════════════════════════════════════════════════
   Meu Ativador — app.js
   ═══════════════════════════════════════════════════════════════ */

// ── state ─────────────────────────────────────────────────────────────────────
const State = {
  user: null,
  codes: {},
  resellers: {},
  settings: {},
  currentPage: 'dashboard',
  selectedCodes: new Set(),
  filterStatus: 'all',
  filterOwner: 'all',
  searchQuery: '',
};

// ── APK download codes (from reference) ──────────────────────────────────────
const APK_CODES = { 'v5.1': '9618997', 'v5.2': '3582656', 'v5.4.0': '7383464' };

// ── DOM helpers ───────────────────────────────────────────────────────────────
const $ = id => document.getElementById(id);
const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html !== undefined) e.innerHTML = html; return e; };

function showLoading(v) {
  $('loading-overlay').classList.toggle('active', v);
}

let toastTimer;
function toast(msg, type = 'info') {
  const t = $('toast');
  const colors = { success: '#16a34a', error: '#dc2626', info: '#2563eb', warn: '#d97706' };
  t.style.borderColor = colors[type] || colors.info;
  t.textContent = msg;
  t.style.opacity = '1';
  t.style.transform = 'translateY(0)';
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.style.opacity = '0'; t.style.transform = 'translateY(10px)'; }, 3200);
}

function showModal(html, onClose) {
  const mc = $('modal-container');
  $('modal-inner').innerHTML = `<div class="modal-content bg-card rounded-2xl shadow-2xl border border-dark w-full max-w-lg p-6" style="border:1px solid #334155;border-radius:1rem;background:#1e293b;width:100%;max-width:512px;padding:1.5rem;">${html}</div>`;
  mc.classList.add('active');
  mc.onclick = e => { if (e.target === mc) closeModal(onClose); };
}
function closeModal(cb) {
  $('modal-container').classList.remove('active');
  $('modal-inner').innerHTML = '';
  if (cb) cb();
}

// ── API ───────────────────────────────────────────────────────────────────────
async function api(action, data = {}) {
  try {
    const fd = new FormData();
    fd.append('action', action);
    for (const [k, v] of Object.entries(data)) fd.append(k, v);
    const res = await fetch('api.php', { method: 'POST', body: fd });
    if (!res.ok) return { ok: false, msg: 'Erro HTTP ' + res.status };
    return await res.json();
  } catch (e) {
    return { ok: false, msg: 'Sem conexão com o servidor' };
  }
}
async function apiGet(action, params = {}) {
  try {
    const qs = new URLSearchParams({ action, ...params }).toString();
    const res = await fetch('api.php?' + qs);
    if (!res.ok) return { ok: false, msg: 'Erro HTTP ' + res.status };
    return await res.json();
  } catch (e) {
    return { ok: false, msg: 'Sem conexão com o servidor' };
  }
}

// ── auth ──────────────────────────────────────────────────────────────────────
async function checkSession() {
  showLoading(true);
  const r = await api('getData');
  showLoading(false);
  if (r.ok) {
    applyData(r);
    showPanel();
  } else {
    showLogin();
  }
}

function showLogin() {
  $('login-container').style.display = 'flex';
  $('panel-container').style.display = 'none';
}
function showPanel() {
  $('login-container').style.display = 'none';
  $('panel-container').style.display = 'block';
  const tb = $('mobile-topbar');
  if (tb) tb.style.display = '';
  buildSidebar();
  navigate(State.currentPage);
  lucide.createIcons();
  // força reload dos dados após mostrar painel
  refreshData().then(() => {
    buildSidebar();
    if (State.currentPage === 'codes') renderCodes();
    if (State.currentPage === 'dashboard') renderDashboard();
  });
}

$('login-form').addEventListener('submit', async e => {
  e.preventDefault();
  const fd = new FormData(e.target);
  const btn = e.target.querySelector('button[type=submit]');
  btn.disabled = true;
  btn.textContent = 'Entrando...';
  const r = await api('login', { username: fd.get('username'), password: fd.get('password') });
  btn.disabled = false;
  btn.textContent = 'Entrar';
  if (r.ok) {
    const d = await api('getData');
    if (d.ok) { applyData(d); showPanel(); }
    else { showLoginError('Erro ao carregar dados'); }
  } else {
    showLoginError(r.msg || 'Usuário ou senha inválidos');
  }
});

function showLoginError(msg) {
  const err = $('login-error');
  err.textContent = msg;
  err.style.display = 'block';
}

$('logout-btn').addEventListener('click', async () => {
  await api('logout');
  State.user = null;
  showLogin();
});

// ── data ──────────────────────────────────────────────────────────────────────
function applyData(r) {
  State.user      = r.user;
  State.codes     = r.codes || {};
  State.resellers = r.resellers || {};
  State.settings  = r.settings || {};
}

async function refreshData() {
  const r = await api('getData');
  if (r.ok) applyData(r);
  // silently ignore errors on background refresh
}

// ── sidebar ───────────────────────────────────────────────────────────────────
function buildSidebar() {
  const nav = $('sidebar-nav');
  const role = State.user?.role;
  const isAdmin = role === 'admin' || role === 'superadmin';

  const items = [
    { id: 'dashboard',  icon: 'layout-dashboard', label: 'Dashboard' },
    { id: 'codes',      icon: 'key-round',         label: 'Meus Códigos' },
    ...(isAdmin ? [
      { id: 'generate', icon: 'plus-circle',       label: 'Gerar Códigos' },
      { id: 'resellers',icon: 'users',             label: 'Revendedores' },
      { id: 'logins',   icon: 'user-check',        label: 'Logins Clientes' },
    ] : []),
    { id: 'instructions', icon: 'book-open',       label: 'Instruções' },
    { id: 'settings',   icon: 'settings',          label: 'Configurações' },
  ];

  nav.innerHTML = items.map(it => `
    <button data-page="${it.id}" class="sidebar-item touch-btn" style="width:100%;display:flex;align-items:center;gap:.75rem;padding:.625rem 1rem;border-radius:.5rem;font-size:.875rem;font-weight:500;background:none;border:none;cursor:pointer;text-align:left;">
      <i data-lucide="${it.icon}" style="width:16px;height:16px;flex-shrink:0;"></i>${it.label}
    </button>`).join('');

  nav.querySelectorAll('[data-page]').forEach(btn => {
    btn.addEventListener('click', () => { navigate(btn.dataset.page); closeMobileMenu(); });
  });

  $('username-display').textContent = State.user?.name || State.user?.username || '';
  updateCodesCount();
  lucide.createIcons();
}

function updateCodesCount() {
  const unavail = Object.values(State.codes).filter(c => c.status === 'active').length;
  $('codes-count-value').textContent = unavail;
  $('codes-count-mobile').textContent = unavail;
}

function setActivePage(page) {
  document.querySelectorAll('[data-page]').forEach(b => {
    b.classList.toggle('active', b.dataset.page === page);
  });
}

// ── navigation ────────────────────────────────────────────────────────────────
function navigate(page) {
  State.currentPage = page;
  setActivePage(page);
  const pages = {
    dashboard:    renderDashboard,
    codes:        renderCodes,
    generate:     renderGenerate,
    resellers:    renderResellers,
    logins:       renderLogins,
    instructions: renderInstructions,
    settings:     renderSettings,
  };
  (pages[page] || renderDashboard)();
  lucide.createIcons();
}

// ── mobile menu ───────────────────────────────────────────────────────────────
$('mobile-menu-btn').addEventListener('click', () => {
  document.querySelector('.sidebar').classList.add('open');
  $('mobile-overlay').style.display = 'block';
});
function closeMobileMenu() {
  document.querySelector('.sidebar').classList.remove('open');
  $('mobile-overlay').style.display = 'none';
}
$('mobile-overlay').addEventListener('click', closeMobileMenu);

// ══════════════════════════════════════════════════════════════════════════════
// PAGES
// ══════════════════════════════════════════════════════════════════════════════

// ── Dashboard ─────────────────────────────────────────────────────────────────
function renderDashboard() {
  const codes  = Object.values(State.codes);
  const total  = codes.length;
  const active = codes.filter(c => c.status === 'active').length;
  const avail  = total - active;
  const role   = State.user?.role;

  $('main-content').innerHTML = `
    <div class="mb-6">
      <h2 class="text-xl font-bold text-light">Dashboard</h2>
      <p class="text-muted text-sm">Bem-vindo, ${State.user?.name || ''}!</p>
    </div>
    <div class="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
      ${statCard('Códigos Totais', total, 'key-round', 'blue')}
      ${statCard('Ativos', active, 'check-circle', 'green')}
      ${statCard('Disponíveis', avail, 'circle', 'orange')}
    </div>
    ${role === 'superadmin' || role === 'admin' ? `
    <div class="bg-card rounded-xl border border-dark p-5 mb-4">
      <h3 class="font-semibold text-light mb-3 flex items-center gap-2"><i data-lucide="zap" class="h-4 w-4 text-yellow-400"></i> Ações Rápidas</h3>
      <div class="flex flex-wrap gap-3">
        <button onclick="navigate('generate')" class="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition-colors flex items-center gap-2">
          <i data-lucide="plus-circle" class="h-4 w-4"></i> Gerar Códigos
        </button>
        <button onclick="navigate('resellers')" class="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg text-sm font-medium transition-colors flex items-center gap-2">
          <i data-lucide="users" class="h-4 w-4"></i> Revendedores
        </button>
      </div>
    </div>` : ''}
    <div class="bg-card rounded-xl border border-dark p-5">
      <h3 class="font-semibold text-light mb-3 flex items-center gap-2"><i data-lucide="info" class="h-4 w-4 text-blue-400"></i> Sobre o Sistema</h3>
      <p class="text-muted text-sm">Sistema de gerenciamento de ativações para Android TV. Gere e distribua arquivos <code class="bg-dark px-1 rounded text-xs">.config</code> para ativar o UniTV Free nos dispositivos dos seus clientes.</p>
    </div>`;
  lucide.createIcons();
}

function statCard(label, value, icon, color) {
  const colors = { blue: 'text-blue-400 bg-blue-900', green: 'text-green-400 bg-green-900', orange: 'text-orange-400 bg-orange-900' };
  const [tc, bc] = (colors[color] || colors.blue).split(' ');
  return `<div class="bg-card rounded-xl border border-dark p-5 flex items-center gap-4">
    <div class="w-12 h-12 ${bc} bg-opacity-30 rounded-xl flex items-center justify-center flex-shrink-0">
      <i data-lucide="${icon}" class="h-6 w-6 ${tc}"></i>
    </div>
    <div><p class="text-2xl font-bold text-light">${value}</p><p class="text-muted text-sm">${label}</p></div>
  </div>`;
}

// ── Codes page ────────────────────────────────────────────────────────────────
function renderCodes() {
  const isAdmin = ['admin','superadmin'].includes(State.user?.role);
  const owners  = [...new Set(Object.values(State.codes).map(c => c.owner))];

  $('main-content').innerHTML = `
    <div class="flex flex-wrap items-center justify-between gap-3 mb-5">
      <h2 class="text-xl font-bold text-light">Meus Códigos</h2>
      <div id="bulk-actions" class="hidden flex-wrap gap-2"></div>
    </div>
    <div class="bg-card rounded-xl border border-dark p-4 mb-4 flex flex-wrap gap-3 items-center">
      <input id="search-codes" type="text" placeholder="Buscar código..." value="${State.searchQuery}"
        class="search-input flex-1 min-w-[160px] px-3 py-2 rounded-lg text-sm" />
      <select id="filter-status" class="search-input px-3 py-2 rounded-lg text-sm">
        <option value="all" ${State.filterStatus==='all'?'selected':''}>Todos</option>
        <option value="available" ${State.filterStatus==='available'?'selected':''}>Disponíveis</option>
        <option value="active" ${State.filterStatus==='active'?'selected':''}>Ativos</option>
      </select>
      ${isAdmin ? `<select id="filter-owner" class="search-input px-3 py-2 rounded-lg text-sm">
        <option value="all">Todos donos</option>
        ${owners.map(o=>`<option value="${o}" ${State.filterOwner===o?'selected':''}>${o}</option>`).join('')}
      </select>` : ''}
      <button onclick="refreshAndRender()" class="action-btn action-btn-blue text-blue-400 px-3 py-2 rounded-lg text-sm flex items-center gap-1">
        <i data-lucide="refresh-cw" class="h-4 w-4"></i>
      </button>
    </div>
    <div class="bg-card rounded-xl border border-dark overflow-hidden">
      <div class="codes-table-container">
        <table class="w-full text-sm">
          <thead class="sticky top-0 bg-darker">
            <tr class="text-muted text-xs uppercase">
              <th class="px-4 py-3 text-left w-8"><input type="checkbox" id="select-all" class="rounded" /></th>
              <th class="px-4 py-3 text-left">Código</th>
              ${isAdmin ? '<th class="px-4 py-3 text-left hidden sm:table-cell">Dono</th>' : ''}
              <th class="px-4 py-3 text-left">Status</th>
              <th class="px-4 py-3 text-left hidden md:table-cell">Criado</th>
              <th class="px-4 py-3 text-right">Ações</th>
            </tr>
          </thead>
          <tbody id="codes-tbody"></tbody>
        </table>
      </div>
      <div id="codes-footer" class="px-4 py-3 border-t border-dark text-xs text-muted"></div>
    </div>`;

  // events
  $('search-codes').addEventListener('input', e => { State.searchQuery = e.target.value; renderCodesRows(); });
  $('filter-status').addEventListener('change', e => { State.filterStatus = e.target.value; renderCodesRows(); });
  if (isAdmin) $('filter-owner').addEventListener('change', e => { State.filterOwner = e.target.value; renderCodesRows(); });
  $('select-all').addEventListener('change', e => {
    const visible = getFilteredCodes().map(c => c.id);
    if (e.target.checked) visible.forEach(id => State.selectedCodes.add(id));
    else visible.forEach(id => State.selectedCodes.delete(id));
    renderCodesRows();
    updateBulkActions();
  });

  renderCodesRows();
  lucide.createIcons();
}

function getFilteredCodes() {
  return Object.values(State.codes).filter(c => {
    if (State.filterStatus !== 'all' && c.status !== State.filterStatus) return false;
    if (State.filterOwner !== 'all' && c.owner !== State.filterOwner) return false;
    if (State.searchQuery && !c.id.toLowerCase().includes(State.searchQuery.toLowerCase())) return false;
    return true;
  });
}

function renderCodesRows() {
  const isAdmin = ['admin','superadmin'].includes(State.user?.role);
  const codes   = getFilteredCodes();
  const tbody   = $('codes-tbody');
  if (!tbody) return;

  if (!codes.length) {
    tbody.innerHTML = `<tr><td colspan="6" class="text-center py-10 text-muted">Nenhum código encontrado</td></tr>`;
    $('codes-footer').textContent = '0 códigos';
    return;
  }

  tbody.innerHTML = codes.map(c => {
    const checked = State.selectedCodes.has(c.id);
    const statusBadge = c.status === 'active'
      ? '<span class="px-2 py-0.5 bg-green-900 text-green-400 rounded-full text-xs">Ativo</span>'
      : '<span class="px-2 py-0.5 bg-slate-700 text-slate-300 rounded-full text-xs">Disponível</span>';
    const created = c.created_at ? new Date(c.created_at).toLocaleDateString('pt-BR') : '-';
    return `<tr class="border-t border-dark hover:bg-dark transition-colors ${checked ? 'bg-blue-900 bg-opacity-20' : ''}">
      <td class="px-4 py-3"><input type="checkbox" class="code-check rounded" data-id="${c.id}" ${checked?'checked':''}></td>
      <td class="px-4 py-3 font-mono text-xs text-light">${c.id}</td>
      ${isAdmin ? `<td class="px-4 py-3 text-muted hidden sm:table-cell text-xs">${c.owner}</td>` : ''}
      <td class="px-4 py-3">${statusBadge}</td>
      <td class="px-4 py-3 text-muted hidden md:table-cell text-xs">${created}</td>
      <td class="px-4 py-3">
        <div class="flex items-center justify-end gap-1">
          <button title="Ver Config" onclick="viewConfig('${c.id}')" class="action-btn action-btn-blue text-blue-400"><i data-lucide="file-text" class="h-4 w-4"></i></button>
          <button title="Baixar Config" onclick="downloadConfig('${c.id}')" class="action-btn action-btn-green text-green-400"><i data-lucide="download" class="h-4 w-4"></i></button>
          <button title="Copiar Instruções" onclick="copyInstructions('${c.id}')" class="action-btn action-btn-purple text-purple-400"><i data-lucide="clipboard-copy" class="h-4 w-4"></i></button>
          ${c.status === 'active'
            ? `<button title="Desativar" onclick="deactivateCode('${c.id}')" class="action-btn action-btn-orange text-orange-400"><i data-lucide="x-circle" class="h-4 w-4"></i></button>`
            : `<button title="Ativar" onclick="activateCode('${c.id}')" class="action-btn action-btn-green text-green-400"><i data-lucide="check-circle" class="h-4 w-4"></i></button>`}
          <button title="Desvincular Dispositivo" onclick="unbindDevice('${c.id}')" class="action-btn action-btn-yellow text-yellow-400"><i data-lucide="unlink" class="h-4 w-4"></i></button>
          <button title="Deletar" onclick="deleteCode('${c.id}')" class="action-btn action-btn-red text-red-400"><i data-lucide="trash-2" class="h-4 w-4"></i></button>
        </div>
      </td>
    </tr>`;
  }).join('');

  $('codes-footer').textContent = `${codes.length} código(s) — ${State.selectedCodes.size} selecionado(s)`;

  tbody.querySelectorAll('.code-check').forEach(cb => {
    cb.addEventListener('change', e => {
      const id = e.target.dataset.id;
      if (e.target.checked) State.selectedCodes.add(id);
      else State.selectedCodes.delete(id);
      renderCodesRows();
      updateBulkActions();
    });
  });

  updateBulkActions();
  lucide.createIcons();
}

function updateBulkActions() {
  const ba = $('bulk-actions');
  if (!ba) return;
  const n = State.selectedCodes.size;
  if (n === 0) { ba.classList.add('hidden'); ba.innerHTML = ''; return; }
  ba.classList.remove('hidden');
  ba.innerHTML = `
    <span class="selected-count-badge">${n} selecionado(s)</span>
    <button onclick="bulkDelete()" class="px-3 py-1.5 bg-red-700 hover:bg-red-800 text-white rounded-lg text-xs font-medium flex items-center gap-1">
      <i data-lucide="trash-2" class="h-3 w-3"></i> Deletar
    </button>
    <button onclick="openTransferModal()" class="px-3 py-1.5 bg-purple-700 hover:bg-purple-800 text-white rounded-lg text-xs font-medium flex items-center gap-1">
      <i data-lucide="send" class="h-3 w-3"></i> Transferir
    </button>`;
  lucide.createIcons();
}

async function refreshAndRender() {
  showLoading(true);
  await refreshData();
  showLoading(false);
  renderCodes();
}

// ── code actions ──────────────────────────────────────────────────────────────
async function activateCode(id) {
  showLoading(true);
  const r = await api('activateCode', { code_id: id });
  showLoading(false);
  if (r.ok) { toast('Código ativado!', 'success'); await refreshData(); renderCodesRows(); updateCodesCount(); }
  else toast(r.msg, 'error');
}

async function deactivateCode(id) {
  showLoading(true);
  const r = await api('deactivateCode', { code_id: id });
  showLoading(false);
  if (r.ok) { toast('Código desativado', 'info'); await refreshData(); renderCodesRows(); updateCodesCount(); }
  else toast(r.msg, 'error');
}

async function deleteCode(id) {
  if (!confirm('Deletar este código? Esta ação não pode ser desfeita.')) return;
  showLoading(true);
  const r = await api('deleteCode', { code_id: id });
  showLoading(false);
  if (r.ok) { toast('Código deletado', 'success'); State.selectedCodes.delete(id); await refreshData(); renderCodesRows(); updateCodesCount(); }
  else toast(r.msg, 'error');
}

async function bulkDelete() {
  const ids = [...State.selectedCodes];
  if (!ids.length) return;
  if (!confirm(`Deletar ${ids.length} código(s)? Esta ação não pode ser desfeita.`)) return;
  showLoading(true);
  const r = await api('deleteCodes', { ids: JSON.stringify(ids) });
  showLoading(false);
  if (r.ok) { toast(`${r.deleted} código(s) deletado(s)`, 'success'); State.selectedCodes.clear(); await refreshData(); renderCodesRows(); updateCodesCount(); }
  else toast(r.msg, 'error');
}

async function unbindDevice(id) {
  if (!confirm('Desvincular dispositivo? Um novo arquivo .config será gerado.')) return;
  showLoading(true);
  const r = await api('unbindDevice', { code_id: id });
  showLoading(false);
  if (r.ok) { toast('Dispositivo desvinculado e config regenerada', 'success'); await refreshData(); renderCodesRows(); }
  else toast(r.msg, 'error');
}

async function viewConfig(id) {
  showLoading(true);
  const r = await api('getConfigContent', { code_id: id });
  showLoading(false);
  if (!r.ok) { toast(r.msg, 'error'); return; }
  showModal(`
    <div class="flex items-center justify-between mb-4">
      <h3 class="font-bold text-light flex items-center gap-2"><i data-lucide="file-text" class="h-5 w-5 text-blue-400"></i> Arquivo .config</h3>
      <button onclick="closeModal()" class="text-muted hover:text-light"><i data-lucide="x" class="h-5 w-5"></i></button>
    </div>
    <pre class="bg-darker rounded-lg p-4 text-xs text-green-400 overflow-x-auto whitespace-pre-wrap break-all font-mono">${escHtml(r.content)}</pre>
    <div class="flex gap-2 mt-4">
      <button onclick="downloadConfig('${id}');closeModal()" class="flex-1 py-2 bg-green-700 hover:bg-green-800 text-white rounded-lg text-sm font-medium">Baixar</button>
      <button onclick="closeModal()" class="flex-1 py-2 bg-dark hover:bg-darker text-light rounded-lg text-sm font-medium">Fechar</button>
    </div>`);
  lucide.createIcons();
}

function downloadConfig(id) {
  window.open('api.php?action=downloadConfig&code_id=' + id, '_blank');
}

function copyInstructions(id) {
  const code = State.codes[id];
  if (!code) return;
  const text = buildInstructions(id);
  navigator.clipboard.writeText(text).then(() => toast('Instruções copiadas!', 'success')).catch(() => toast('Erro ao copiar', 'error'));
}

function buildInstructions(id) {
  return `📺 INSTRUÇÕES DE ATIVAÇÃO — Meu Ativador

1. Baixe o App Downloader na sua TV Android:
   • Abra a Play Store ou App Downloader
   • Código de download: ${APK_CODES['v5.4.0']} (v5.4.0)

2. Instale o Ativador:
   • No App Downloader, acesse: https://meuativador.com/apk
   • Permita instalação de fontes desconhecidas quando solicitado

3. Ative sua TV:
   • Abra o Ativador instalado
   • Clique em "Selecionar Config"
   • Escolha o arquivo .config enviado por seu revendedor
   • Aguarde a ativação automática

Código: ${id}
Suporte: Entre em contato com seu revendedor.`;
}

function openTransferModal() {
  const ids = [...State.selectedCodes];
  if (!ids.length) return;
  const users = Object.keys(State.resellers).filter(u => u !== State.user?.username);
  if (!users.length) { toast('Nenhum usuário disponível para transferência', 'warn'); return; }
  showModal(`
    <div class="flex items-center justify-between mb-4">
      <h3 class="font-bold text-light flex items-center gap-2"><i data-lucide="send" class="h-5 w-5 text-purple-400"></i> Transferir Códigos</h3>
      <button onclick="closeModal()" class="text-muted hover:text-light"><i data-lucide="x" class="h-5 w-5"></i></button>
    </div>
    <p class="text-muted text-sm mb-4">Transferir <strong class="text-light">${ids.length}</strong> código(s) para:</p>
    <select id="transfer-target" class="search-input w-full px-3 py-2 rounded-lg text-sm mb-4">
      ${users.map(u => `<option value="${u}">${u} — ${State.resellers[u]?.name || ''}</option>`).join('')}
    </select>
    <div class="flex gap-2">
      <button onclick="doTransfer()" class="flex-1 py-2 bg-purple-700 hover:bg-purple-800 text-white rounded-lg text-sm font-medium">Transferir</button>
      <button onclick="closeModal()" class="flex-1 py-2 bg-dark hover:bg-darker text-light rounded-lg text-sm font-medium">Cancelar</button>
    </div>`);
  lucide.createIcons();
}

async function doTransfer() {
  const target = $('transfer-target')?.value;
  const ids    = [...State.selectedCodes];
  if (!target || !ids.length) return;
  closeModal();
  showLoading(true);
  const r = await api('transferCodes', { ids: JSON.stringify(ids), target });
  showLoading(false);
  if (r.ok) { toast(`${r.moved} código(s) transferido(s) para ${target}`, 'success'); State.selectedCodes.clear(); await refreshData(); renderCodesRows(); }
  else toast(r.msg, 'error');
}

// ── Generate Codes page ───────────────────────────────────────────────────────
function renderGenerate() {
  const isAdmin = ['admin','superadmin'].includes(State.user?.role);
  if (!isAdmin) { navigate('dashboard'); return; }
  const isSuperAdmin = State.user?.role === 'superadmin';
  const users = Object.keys(State.resellers);

  $('main-content').innerHTML = `
    <div class="mb-6">
      <h2 class="text-xl font-bold text-light">Gerar Códigos</h2>
      <p class="text-muted text-sm">Gere arquivos .config para ativação de dispositivos Android TV</p>
    </div>
    <div class="bg-card rounded-xl border border-dark p-6 max-w-md">
      <div class="space-y-4">
        <div>
          <label class="text-sm font-medium text-light block mb-1">Quantidade</label>
          <input id="gen-qty" type="number" min="1" max="500" value="1"
            class="search-input w-full px-3 py-2 rounded-lg text-sm" />
          <p class="text-xs text-muted mt-1">Máximo 500 por vez</p>
        </div>
        ${isSuperAdmin ? `<div>
          <label class="text-sm font-medium text-light block mb-1">Atribuir para</label>
          <select id="gen-owner" class="search-input w-full px-3 py-2 rounded-lg text-sm">
            ${users.map(u => `<option value="${u}" ${u===State.user?.username?'selected':''}>${u} — ${State.resellers[u]?.name||''}</option>`).join('')}
          </select>
        </div>` : ''}
        <button onclick="doGenerate()" class="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl transition-colors flex items-center justify-center gap-2">
          <i data-lucide="plus-circle" class="h-5 w-5"></i> Gerar Códigos
        </button>
      </div>
    </div>
    <div id="gen-result" class="mt-6"></div>`;
  lucide.createIcons();
}

async function doGenerate() {
  const qty   = parseInt($('gen-qty')?.value || '1');
  const owner = $('gen-owner')?.value || State.user?.username;
  if (!qty || qty < 1) { toast('Quantidade inválida', 'error'); return; }
  showLoading(true);
  const r = await api('generateCodes', { qty, owner });
  showLoading(false);
  if (r.ok) {
    toast(`${r.count} código(s) gerado(s)!`, 'success');
    await refreshData();
    updateCodesCount();
    const res = $('gen-result');
    if (res) res.innerHTML = `
      <div class="bg-card rounded-xl border border-dark p-5">
        <h3 class="font-semibold text-light mb-3 flex items-center gap-2"><i data-lucide="check-circle" class="h-4 w-4 text-green-400"></i> ${r.count} código(s) gerado(s)</h3>
        <div class="max-h-48 overflow-y-auto space-y-1">
          ${r.generated.map(id => `<div class="font-mono text-xs text-green-400 bg-darker px-3 py-1.5 rounded">${id}</div>`).join('')}
        </div>
        <button onclick="navigate('codes')" class="mt-4 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium">Ver Códigos</button>
      </div>`;
    lucide.createIcons();
  } else toast(r.msg, 'error');
}

// ── Resellers page ────────────────────────────────────────────────────────────
function renderResellers() {
  const isAdmin = ['admin','superadmin'].includes(State.user?.role);
  if (!isAdmin) { navigate('dashboard'); return; }

  $('main-content').innerHTML = `
    <div class="flex flex-wrap items-center justify-between gap-3 mb-5">
      <h2 class="text-xl font-bold text-light">Revendedores</h2>
      <button onclick="openCreateResellerModal()" class="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium flex items-center gap-2">
        <i data-lucide="user-plus" class="h-4 w-4"></i> Novo Revendedor
      </button>
    </div>
    <div class="bg-card rounded-xl border border-dark overflow-hidden">
      <table class="w-full text-sm">
        <thead class="bg-darker">
          <tr class="text-muted text-xs uppercase">
            <th class="px-4 py-3 text-left">Usuário</th>
            <th class="px-4 py-3 text-left hidden sm:table-cell">Nome</th>
            <th class="px-4 py-3 text-left">Perfil</th>
            <th class="px-4 py-3 text-left hidden md:table-cell">Códigos</th>
            <th class="px-4 py-3 text-right">Ações</th>
          </tr>
        </thead>
        <tbody>
          ${Object.entries(State.resellers).map(([uname, u]) => {
            const roleBadge = u.role === 'superadmin'
              ? '<span class="px-2 py-0.5 bg-red-900 text-red-400 rounded-full text-xs">Superadmin</span>'
              : u.role === 'admin'
              ? '<span class="px-2 py-0.5 bg-blue-900 text-blue-400 rounded-full text-xs">Admin</span>'
              : '<span class="px-2 py-0.5 bg-slate-700 text-slate-300 rounded-full text-xs">Revendedor</span>';
            const isSelf = uname === State.user?.username;
            return `<tr class="border-t border-dark hover:bg-dark transition-colors">
              <td class="px-4 py-3 font-mono text-xs text-light">${uname}</td>
              <td class="px-4 py-3 text-muted hidden sm:table-cell text-sm">${u.name || '-'}</td>
              <td class="px-4 py-3">${roleBadge}</td>
              <td class="px-4 py-3 text-muted hidden md:table-cell text-sm">${u.codes ?? 0}</td>
              <td class="px-4 py-3">
                <div class="flex items-center justify-end gap-1">
                  ${!isSelf ? `<button title="Deletar" onclick="deleteReseller('${uname}')" class="action-btn action-btn-red text-red-400"><i data-lucide="trash-2" class="h-4 w-4"></i></button>` : ''}
                </div>
              </td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>
      ${!Object.keys(State.resellers).length ? '<p class="text-center py-8 text-muted text-sm">Nenhum revendedor cadastrado</p>' : ''}
    </div>`;
  lucide.createIcons();
}

function openCreateResellerModal() {
  const isSuperAdmin = State.user?.role === 'superadmin';
  showModal(`
    <div class="flex items-center justify-between mb-4">
      <h3 class="font-bold text-light flex items-center gap-2"><i data-lucide="user-plus" class="h-5 w-5 text-blue-400"></i> Novo Revendedor</h3>
      <button onclick="closeModal()" class="text-muted hover:text-light"><i data-lucide="x" class="h-5 w-5"></i></button>
    </div>
    <div class="space-y-3">
      <div>
        <label class="text-xs font-medium text-muted">Usuário</label>
        <input id="new-username" type="text" placeholder="ex: joao123" class="search-input w-full px-3 py-2 rounded-lg text-sm mt-1" />
      </div>
      <div>
        <label class="text-xs font-medium text-muted">Nome</label>
        <input id="new-name" type="text" placeholder="Nome completo" class="search-input w-full px-3 py-2 rounded-lg text-sm mt-1" />
      </div>
      <div>
        <label class="text-xs font-medium text-muted">Senha</label>
        <input id="new-password" type="password" placeholder="Mínimo 4 caracteres" class="search-input w-full px-3 py-2 rounded-lg text-sm mt-1" />
      </div>
      ${isSuperAdmin ? `<div>
        <label class="text-xs font-medium text-muted">Perfil</label>
        <select id="new-role" class="search-input w-full px-3 py-2 rounded-lg text-sm mt-1">
          <option value="reseller">Revendedor</option>
          <option value="admin">Admin</option>
        </select>
      </div>` : ''}
    </div>
    <div class="flex gap-2 mt-5">
      <button onclick="doCreateReseller()" class="flex-1 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium">Criar</button>
      <button onclick="closeModal()" class="flex-1 py-2 bg-dark hover:bg-darker text-light rounded-lg text-sm font-medium">Cancelar</button>
    </div>`);
  lucide.createIcons();
}

async function doCreateReseller() {
  const username = $('new-username')?.value?.trim();
  const name     = $('new-name')?.value?.trim();
  const password = $('new-password')?.value;
  const role     = $('new-role')?.value || 'reseller';
  if (!username || !password) { toast('Preencha usuário e senha', 'warn'); return; }
  closeModal();
  showLoading(true);
  const r = await api('createReseller', { username, name, password, role });
  showLoading(false);
  if (r.ok) { toast('Revendedor criado!', 'success'); await refreshData(); renderResellers(); }
  else toast(r.msg, 'error');
}

async function deleteReseller(username) {
  if (!confirm(`Deletar revendedor "${username}"? Os códigos serão transferidos para você.`)) return;
  showLoading(true);
  const r = await api('deleteReseller', { username });
  showLoading(false);
  if (r.ok) { toast('Revendedor deletado', 'success'); await refreshData(); renderResellers(); }
  else toast(r.msg, 'error');
}

// ── Instructions page ─────────────────────────────────────────────────────────
function renderInstructions() {
  $('main-content').innerHTML = `
    <div class="mb-6">
      <h2 class="text-xl font-bold text-light">Instruções para Clientes</h2>
      <p class="text-muted text-sm">Copie e envie para seus clientes</p>
    </div>
    <div class="grid gap-4">
      ${Object.entries(APK_CODES).map(([ver, code]) => `
      <div class="bg-card rounded-xl border border-dark p-5">
        <div class="flex items-center justify-between mb-3">
          <h3 class="font-semibold text-light">Ativador ${ver}</h3>
          <span class="font-mono text-blue-400 text-sm bg-blue-900 bg-opacity-30 px-3 py-1 rounded-lg">${code}</span>
        </div>
        <p class="text-muted text-xs mb-3">Código para App Downloader</p>
        <button onclick="copyCode('${code}')" class="px-3 py-1.5 bg-dark hover:bg-darker text-light rounded-lg text-xs flex items-center gap-1">
          <i data-lucide="copy" class="h-3 w-3"></i> Copiar código
        </button>
      </div>`).join('')}
      <div class="bg-card rounded-xl border border-dark p-5">
        <h3 class="font-semibold text-light mb-3 flex items-center gap-2"><i data-lucide="book-open" class="h-4 w-4 text-blue-400"></i> Modelo de Instruções</h3>
        <pre id="instructions-template" class="bg-darker rounded-lg p-4 text-xs text-slate-300 overflow-x-auto whitespace-pre-wrap font-mono">${escHtml(buildInstructions('SEU-CODIGO-AQUI'))}</pre>
        <button onclick="copyInstructionsTemplate()" class="mt-3 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium flex items-center gap-2">
          <i data-lucide="clipboard-copy" class="h-4 w-4"></i> Copiar Modelo
        </button>
      </div>
    </div>`;
  lucide.createIcons();
}

function copyCode(code) {
  navigator.clipboard.writeText(code).then(() => toast('Código copiado!', 'success'));
}
function copyInstructionsTemplate() {
  const text = $('instructions-template')?.textContent || '';
  navigator.clipboard.writeText(text).then(() => toast('Modelo copiado!', 'success'));
}

// ── Settings page ─────────────────────────────────────────────────────────────
function renderSettings() {
  const isSuperAdmin = State.user?.role === 'superadmin';
  $('main-content').innerHTML = `
    <div class="mb-6">
      <h2 class="text-xl font-bold text-light">Configurações</h2>
    </div>
    <div class="space-y-4 max-w-md">
      <div class="bg-card rounded-xl border border-dark p-5">
        <h3 class="font-semibold text-light mb-4 flex items-center gap-2"><i data-lucide="lock" class="h-4 w-4 text-orange-400"></i> Alterar Senha</h3>
        <div class="space-y-3">
          <input id="pw-current" type="password" placeholder="Senha atual" class="search-input w-full px-3 py-2 rounded-lg text-sm" />
          <input id="pw-new" type="password" placeholder="Nova senha" class="search-input w-full px-3 py-2 rounded-lg text-sm" />
          <input id="pw-confirm" type="password" placeholder="Confirmar nova senha" class="search-input w-full px-3 py-2 rounded-lg text-sm" />
          <button onclick="doChangePassword()" class="w-full py-2 bg-orange-600 hover:bg-orange-700 text-white rounded-lg text-sm font-medium">Alterar Senha</button>
        </div>
      </div>
      ${isSuperAdmin ? `
      <div class="bg-card rounded-xl border border-dark p-5">
        <h3 class="font-semibold text-light mb-4 flex items-center gap-2"><i data-lucide="settings" class="h-4 w-4 text-blue-400"></i> Configurações do Site</h3>
        <div class="space-y-3">
          <div>
            <label class="text-xs font-medium text-muted">Nome do Site</label>
            <input id="site-name" type="text" value="${escHtml(State.settings?.site_name || 'Meu Ativador')}" class="search-input w-full px-3 py-2 rounded-lg text-sm mt-1" />
          </div>
          <button onclick="doSaveSettings()" class="w-full py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium">Salvar</button>
        </div>
      </div>
      <div class="bg-card rounded-xl border border-dark p-5">
        <h3 class="font-semibold text-light mb-3 flex items-center gap-2"><i data-lucide="trash" class="h-4 w-4 text-red-400"></i> Manutenção</h3>
        <p class="text-muted text-xs mb-3">Remove arquivos .config órfãos do servidor</p>
        <button onclick="doCleanup()" class="px-4 py-2 bg-red-700 hover:bg-red-800 text-white rounded-lg text-sm font-medium">Limpar Sistema</button>
      </div>` : ''}
    </div>`;
  lucide.createIcons();
}

async function doChangePassword() {
  const current = $('pw-current')?.value;
  const newpw   = $('pw-new')?.value;
  const confirm = $('pw-confirm')?.value;
  if (!current || !newpw) { toast('Preencha todos os campos', 'warn'); return; }
  if (newpw !== confirm) { toast('As senhas não coincidem', 'error'); return; }
  showLoading(true);
  const r = await api('changePassword', { current, new: newpw });
  showLoading(false);
  if (r.ok) { toast('Senha alterada com sucesso!', 'success'); $('pw-current').value = ''; $('pw-new').value = ''; $('pw-confirm').value = ''; }
  else toast(r.msg, 'error');
}

async function doSaveSettings() {
  const site_name = $('site-name')?.value?.trim();
  showLoading(true);
  const r = await api('saveSettings', { site_name });
  showLoading(false);
  if (r.ok) { toast('Configurações salvas!', 'success'); await refreshData(); }
  else toast(r.msg, 'error');
}

async function doCleanup() {
  if (!confirm('Remover arquivos .config órfãos?')) return;
  showLoading(true);
  const r = await api('cleanupSystem');
  showLoading(false);
  if (r.ok) toast(`Limpeza concluída. ${r.deleted_files} arquivo(s) removido(s)`, 'success');
  else toast(r.msg, 'error');
}

// ── utils ─────────────────────────────────────────────────────────────────────
function escHtml(str) {
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ── init ──────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  lucide.createIcons();
  showLogin();
});

// ── Logins Clientes ───────────────────────────────────────────────────────────
async function renderLogins() {
  const isAdmin = ['admin','superadmin'].includes(State.user?.role);
  if (!isAdmin) { navigate('dashboard'); return; }

  showLoading(true);
  const r = await api('listLogins');
  showLoading(false);

  const logins = r.logins || [];

  $('main-content').innerHTML = `
    <div class="flex flex-wrap items-center justify-between gap-3 mb-5">
      <h2 class="text-xl font-bold text-light">Logins Clientes</h2>
      <button onclick="openCreateLoginModal()" class="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium flex items-center gap-2">
        <i data-lucide="user-plus" class="h-4 w-4"></i> Novo Login
      </button>
    </div>
    <div class="bg-card rounded-xl border border-dark overflow-hidden">
      <table class="w-full text-sm">
        <thead class="bg-darker">
          <tr class="text-muted text-xs uppercase">
            <th class="px-4 py-3 text-left">Usuário</th>
            <th class="px-4 py-3 text-left">Senha</th>
            <th class="px-4 py-3 text-left">Status</th>
            <th class="px-4 py-3 text-left hidden md:table-cell">Usos</th>
            <th class="px-4 py-3 text-left hidden md:table-cell">Expira em</th>
            <th class="px-4 py-3 text-left hidden md:table-cell">Último uso</th>
            <th class="px-4 py-3 text-right">Ações</th>
          </tr>
        </thead>
        <tbody>
          ${logins.length ? logins.map(l => {
            const usedCount = l.used_count || 0;
            const maxUses   = l.max_uses || 1;
            const expired   = l.expires_at && new Date(l.expires_at) < new Date();
            const exhausted = usedCount >= maxUses;
            const status    = expired ? 'Expirado' : exhausted ? 'Esgotado' : 'Disponível';
            const statusColor = expired || exhausted ? 'bg-red-900 text-red-400' : 'bg-green-900 text-green-400';
            const expDate   = l.expires_at ? new Date(l.expires_at).toLocaleDateString('pt-BR') : '∞ Sem limite';
            const lastUsed  = l.last_used_at ? new Date(l.last_used_at).toLocaleString('pt-BR') : '-';
            return `
            <tr class="border-t border-dark hover:bg-dark">
              <td class="px-4 py-3 font-mono text-xs text-light">${l.user}</td>
              <td class="px-4 py-3 font-mono text-xs text-muted">${l.pass}</td>
              <td class="px-4 py-3"><span class="px-2 py-0.5 ${statusColor} rounded-full text-xs">${status}</span></td>
              <td class="px-4 py-3 text-muted hidden md:table-cell text-xs">${usedCount}/${maxUses}</td>
              <td class="px-4 py-3 text-muted hidden md:table-cell text-xs ${expired ? 'text-red-400' : ''}">${expDate}</td>
              <td class="px-4 py-3 text-muted hidden md:table-cell text-xs">${lastUsed}</td>
              <td class="px-4 py-3 text-right">
                <button onclick="copyLoginInfo('${l.user}','${l.pass}')" class="action-btn action-btn-blue text-blue-400 mr-1" title="Copiar">
                  <i data-lucide="copy" class="h-4 w-4"></i>
                </button>
                <button onclick="deleteLogin('${l.user}')" class="action-btn action-btn-red text-red-400" title="Deletar">
                  <i data-lucide="trash-2" class="h-4 w-4"></i>
                </button>
              </td>
            </tr>`;
          }).join('') : '<tr><td colspan="7" class="text-center py-8 text-muted">Nenhum login cadastrado</td></tr>'}
        </tbody>
      </table>
    </div>`;
  lucide.createIcons();
}

function openCreateLoginModal() {
  const today = new Date().toISOString().split('T')[0];
  showModal(`
    <div class="flex items-center justify-between mb-4">
      <h3 class="font-bold text-light flex items-center gap-2"><i data-lucide="user-plus" class="h-5 w-5 text-blue-400"></i> Novo Login Cliente</h3>
      <button onclick="closeModal()" class="text-muted hover:text-light"><i data-lucide="x" class="h-5 w-5"></i></button>
    </div>
    <div class="space-y-3">
      <div>
        <label class="text-xs font-medium text-muted">Usuário</label>
        <input id="new-login-user" type="text" placeholder="ex: cliente01" class="search-input w-full px-3 py-2 rounded-lg text-sm mt-1" />
      </div>
      <div>
        <label class="text-xs font-medium text-muted">Senha</label>
        <div class="flex gap-2 mt-1">
          <input id="new-login-pass" type="text" placeholder="ex: senha123" class="search-input flex-1 px-3 py-2 rounded-lg text-sm" />
          <button onclick="generateLoginPass()" class="px-3 py-2 bg-dark hover:bg-darker text-blue-400 rounded-lg text-xs">Gerar</button>
        </div>
      </div>
      <div>
        <label class="text-xs font-medium text-muted">Quantidade de usos</label>
        <input id="new-login-uses" type="number" min="1" value="1" class="search-input w-full px-3 py-2 rounded-lg text-sm mt-1" />
        <p class="text-xs text-muted mt-1">Quantas vezes este login pode ser usado</p>
      </div>
      <div>
        <label class="text-xs font-medium text-muted">Data de expiração (opcional)</label>
        <input id="new-login-expires" type="date" min="${today}" class="search-input w-full px-3 py-2 rounded-lg text-sm mt-1" />
        <p class="text-xs text-muted mt-1">Deixe em branco para sem expiração</p>
      </div>
    </div>
    <div class="flex gap-2 mt-5">
      <button onclick="doCreateLogin()" class="flex-1 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium">Criar</button>
      <button onclick="closeModal()" class="flex-1 py-2 bg-dark hover:bg-darker text-light rounded-lg text-sm font-medium">Cancelar</button>
    </div>`);
  lucide.createIcons();
}

function generateLoginPass() {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  const pass  = Array.from({length: 8}, () => chars[Math.floor(Math.random() * chars.length)]).join('');
  const el    = $('new-login-pass');
  if (el) el.value = pass;
}

async function doCreateLogin() {
  const user    = $('new-login-user')?.value?.trim();
  const pass    = $('new-login-pass')?.value?.trim();
  const maxUses = $('new-login-uses')?.value || '1';
  const expires = $('new-login-expires')?.value || '';
  if (!user || !pass) { toast('Preencha usuário e senha', 'warn'); return; }
  closeModal();
  showLoading(true);
  const r = await api('createLogin', { user, pass, max_uses: maxUses, expires_at: expires });
  showLoading(false);
  if (r.ok) { toast('Login criado!', 'success'); renderLogins(); }
  else toast(r.msg, 'error');
}

async function deleteLogin(user) {
  if (!confirm(`Deletar login "${user}"?`)) return;
  showLoading(true);
  const r = await api('deleteLogin', { user });
  showLoading(false);
  if (r.ok) { toast('Login deletado', 'success'); renderLogins(); }
  else toast(r.msg, 'error');
}

function copyLoginInfo(user, pass) {
  const text = `Usuário: ${user}\nSenha: ${pass}`;
  navigator.clipboard.writeText(text).then(() => toast('Copiado!', 'success'));
}
