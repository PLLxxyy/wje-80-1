// ── State ─────────────────────────────────────────────────────────────────────
let currentView = 'wall';
let flowers = [];
let likedIds = new Set();
let todayLikeCount = 0;
let maxDailyLikes = 3;
let wallPage = 1;
let wallTotal = 0;
let selectedFlowerType = '';
let adminToken = '';
let adminFilter = 'all';
let flowerTypesCache = [];

const $ = s => document.querySelector(s);
const $$ = s => document.querySelectorAll(s);

// ── Toast ─────────────────────────────────────────────────────────────────────
function showToast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 2500);
}

// ── Navigation ────────────────────────────────────────────────────────────────
$$('.nav-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    $$('.nav-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    $$('.view').forEach(v => v.classList.remove('active'));
    const viewId = 'view-' + btn.dataset.view;
    $('#' + viewId).classList.add('active');
    currentView = btn.dataset.view;
    if (currentView === 'wall') loadWall(true);
  });
});

// ── Flower Wall ───────────────────────────────────────────────────────────────
async function loadWall(reset = false) {
  if (reset) { wallPage = 1; flowers = []; }
  try {
    const res = await fetch(`/api/flowers?page=${wallPage}&limit=20`);
    const data = await res.json();
    flowers = reset ? data.flowers : [...flowers, ...data.flowers];
    likedIds = new Set(data.likedIds);
    todayLikeCount = data.todayLikeCount;
    maxDailyLikes = data.maxDailyLikes;
    wallTotal = data.total;
    renderWall();
  } catch (e) { console.error(e); }
}

function renderWall() {
  const grid = $('#wall-grid');
  const empty = $('#empty-wall');
  const loadMore = $('#load-more');
  const remain = $('#like-remaining');

  remain.textContent = `今日剩余送花: ${maxDailyLikes - todayLikeCount}/${maxDailyLikes}`;

  if (flowers.length === 0) {
    grid.innerHTML = '';
    empty.style.display = 'block';
    loadMore.style.display = 'none';
    return;
  }
  empty.style.display = 'none';

  grid.innerHTML = flowers.map(f => {
    const ft = flowerTypesCache.find(t => t.type === f.flower_type);
    const emoji = ft ? ft.emoji : '🌸';
    const liked = likedIds.has(f.id);
    const canLike = !liked && (maxDailyLikes - todayLikeCount > 0);
    return `
      <div class="flower-card" data-id="${f.id}" style="--card-color:${f.color}">
        <style>.flower-card[data-id="${f.id}"]::before{background:${f.color}}</style>
        <span class="card-emoji">${emoji}</span>
        <div class="card-type">${f.flower_type} · 花语：${f.flower_lang}</div>
        <div class="card-msg">${escapeHtml(f.message)}</div>
        <div class="card-footer">
          <button class="like-btn ${liked ? 'liked' : ''}" data-id="${f.id}" ${!canLike && !liked ? 'disabled' : ''}>
            <span class="heart">${liked ? '❤️' : '🤍'}</span>
            <span>${f.likes}</span>
          </button>
          <span class="card-time">${formatTime(f.created_at)}</span>
        </div>
      </div>`;
  }).join('');

  loadMore.style.display = flowers.length < wallTotal ? 'block' : 'none';

  // Card click -> modal
  grid.querySelectorAll('.flower-card').forEach(card => {
    card.addEventListener('click', e => {
      if (e.target.closest('.like-btn')) return;
      openModal(parseInt(card.dataset.id));
    });
  });

  // Like buttons
  grid.querySelectorAll('.like-btn').forEach(btn => {
    btn.addEventListener('click', async e => {
      e.stopPropagation();
      await likeFlower(parseInt(btn.dataset.id));
    });
  });
}

$('#load-more').addEventListener('click', () => { wallPage++; loadWall(false); });

async function likeFlower(id) {
  try {
    const res = await fetch(`/api/flowers/${id}/like`, { method: 'POST' });
    if (!res.ok) {
      const err = await res.json();
      showToast(err.error);
      return;
    }
    const data = await res.json();
    likedIds.add(id);
    todayLikeCount = data.todayLikeCount;
    const f = flowers.find(x => x.id === id);
    if (f) f.likes = data.likes;
    renderWall();
    showToast('送花成功！');
  } catch (e) { showToast('操作失败'); }
}

// ── Modal ─────────────────────────────────────────────────────────────────────
function openModal(id) {
  const f = flowers.find(x => x.id === id);
  if (!f) return;
  const ft = flowerTypesCache.find(t => t.type === f.flower_type);
  const emoji = ft ? ft.emoji : '🌸';
  const liked = likedIds.has(id);

  $('#modal-emoji').textContent = emoji;
  $('#modal-type').textContent = f.flower_type;
  $('#modal-lang').textContent = '花语：' + f.flower_lang;
  $('#modal-msg').textContent = f.message;
  $('#modal-time').textContent = formatTime(f.created_at);
  $('#modal-footer').innerHTML = `
    <button class="like-btn ${liked ? 'liked' : ''}" data-id="${id}" ${liked ? 'disabled' : ''}>
      <span class="heart">${liked ? '❤️' : '🤍'}</span>
      <span>${f.likes}</span>
    </button>`;
  $('#modal-footer .like-btn').addEventListener('click', async () => {
    await likeFlower(id);
    openModal(id); // refresh
  });
  $('#modal-overlay').classList.add('show');
}
$('#modal-close').addEventListener('click', () => $('#modal-overlay').classList.remove('show'));
$('#modal-overlay').addEventListener('click', e => {
  if (e.target === $('#modal-overlay')) $('#modal-overlay').classList.remove('show');
});

// ── Post ──────────────────────────────────────────────────────────────────────
async function loadFlowerTypes() {
  try {
    const res = await fetch('/api/flower-types');
    flowerTypesCache = await res.json();
    renderFlowerSelect();
  } catch (e) { console.error(e); }
}

function renderFlowerSelect() {
  const sel = $('#flower-select');
  sel.innerHTML = flowerTypesCache.map(ft => `
    <div class="flower-opt" data-type="${ft.type}" style="border-color:${ft.color}33">
      <span class="emoji">${ft.emoji}</span>
      <span class="name">${ft.type}</span>
    </div>
  `).join('');

  sel.querySelectorAll('.flower-opt').forEach(opt => {
    opt.addEventListener('click', () => {
      sel.querySelectorAll('.flower-opt').forEach(o => o.classList.remove('selected'));
      opt.classList.add('selected');
      selectedFlowerType = opt.dataset.type;
      checkPostReady();
    });
  });
}

$('#msg-input').addEventListener('input', () => {
  $('#char-count').textContent = $('#msg-input').value.length;
  checkPostReady();
});

function checkPostReady() {
  $('#post-btn').disabled = !(selectedFlowerType && $('#msg-input').value.trim());
}

$('#post-btn').addEventListener('click', async () => {
  const btn = $('#post-btn');
  btn.disabled = true;
  try {
    const res = await fetch('/api/flowers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ flowerType: selectedFlowerType, message: $('#msg-input').value }),
    });
    if (!res.ok) {
      const err = await res.json();
      showToast(err.error);
      btn.disabled = false;
      return;
    }
    $('#success-msg').classList.add('show');
    $('#msg-input').value = '';
    $('#char-count').textContent = '0';
    selectedFlowerType = '';
    $$('.flower-opt').forEach(o => o.classList.remove('selected'));
    setTimeout(() => {
      $('#success-msg').classList.remove('show');
      btn.disabled = false;
      checkPostReady();
    }, 3000);
  } catch (e) {
    showToast('发送失败，请稍后再试');
    btn.disabled = false;
  }
});

// ── Admin ─────────────────────────────────────────────────────────────────────
$('#admin-login-btn').addEventListener('click', () => {
  adminToken = $('#admin-token').value.trim();
  if (!adminToken) return;
  loadAdmin();
});

$('#admin-token').addEventListener('keydown', e => {
  if (e.key === 'Enter') { adminToken = $('#admin-token').value.trim(); loadAdmin(); }
});

async function loadAdmin() {
  try {
    const res = await fetch('/api/admin/stats', { headers: { 'X-Admin-Token': adminToken } });
    if (!res.ok) { showToast('令牌无效'); return; }
    const stats = await res.json();
    $('#admin-login').style.display = 'none';
    $('#admin-panel').style.display = 'block';
    renderStats(stats);
    loadAdminList();
  } catch (e) { showToast('连接失败'); }
}

function renderStats(stats) {
  $('#stats-bar').innerHTML = `
    <div class="stat-card"><div class="num">${stats.total}</div><div class="label">总数</div></div>
    <div class="stat-card"><div class="num">${stats.approved}</div><div class="label">已通过</div></div>
    <div class="stat-card"><div class="num">${stats.pending}</div><div class="label">待审核</div></div>
    <div class="stat-card"><div class="num">${stats.totalLikes}</div><div class="label">总点赞</div></div>`;
}

$$('.filter-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    $$('.filter-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    adminFilter = btn.dataset.filter;
    loadAdminList();
  });
});

async function loadAdminList() {
  try {
    const res = await fetch(`/api/admin/flowers?filter=${adminFilter}`, {
      headers: { 'X-Admin-Token': adminToken },
    });
    if (!res.ok) return;
    const list = await res.json();
    renderAdminList(list);
  } catch (e) { console.error(e); }
}

function renderAdminList(list) {
  const el = $('#admin-list');
  if (!list.length) {
    el.innerHTML = '<div class="empty-wall"><div class="big">📭</div><p>暂无内容</p></div>';
    return;
  }
  el.innerHTML = list.map(f => {
    const ft = flowerTypesCache.find(t => t.type === f.flower_type);
    const emoji = ft ? ft.emoji : '🌸';
    const statusBadge = f.approved
      ? '<span style="color:#2e7d32;font-size:.8em">✓ 已通过</span>'
      : '<span style="color:#e65100;font-size:.8em">⏳ 待审核</span>';
    return `
      <div class="admin-card">
        <span style="font-size:2em">${emoji}</span>
        <div class="admin-card-info">
          <div class="admin-card-type">${f.flower_type} ${statusBadge}</div>
          <div class="admin-card-msg">${escapeHtml(f.message)}</div>
          <div class="admin-card-meta">ID:${f.id} · 👍${f.likes} · ${formatTime(f.created_at)}</div>
        </div>
        <div class="admin-actions">
          ${!f.approved ? `<button class="btn-approve" onclick="adminAction(${f.id},'approve')">通过</button>` : ''}
          ${f.approved ? `<button class="btn-reject" onclick="adminAction(${f.id},'reject')">下架</button>` : ''}
          <button class="btn-delete" onclick="adminAction(${f.id},'delete')">删除</button>
        </div>
      </div>`;
  }).join('');
}

async function adminAction(id, action) {
  if (action === 'delete' && !confirm('确认删除？')) return;
  const method = action === 'delete' ? 'DELETE' : 'PUT';
  const url = action === 'delete'
    ? `/api/admin/flowers/${id}`
    : `/api/admin/flowers/${id}/${action}`;
  try {
    await fetch(url, { method, headers: { 'X-Admin-Token': adminToken } });
    loadAdmin();
    showToast(action === 'delete' ? '已删除' : action === 'approve' ? '已通过' : '已下架');
  } catch (e) { showToast('操作失败'); }
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function escapeHtml(s) {
  const d = document.createElement('div');
  d.textContent = s;
  return d.innerHTML;
}

function formatTime(str) {
  if (!str) return '';
  const d = new Date(str.replace(' ', 'T'));
  const now = new Date();
  const diff = now - d;
  if (diff < 60000) return '刚刚';
  if (diff < 3600000) return Math.floor(diff / 60000) + '分钟前';
  if (diff < 86400000) return Math.floor(diff / 3600000) + '小时前';
  if (diff < 604800000) return Math.floor(diff / 86400000) + '天前';
  return str.slice(0, 16);
}

// ── Init ──────────────────────────────────────────────────────────────────────
loadFlowerTypes().then(() => loadWall(true));