const state = {
  token: localStorage.getItem('campus_token') || '',
  user: null,
  activeView: 'home',
  market: [],
  lostfound: []
};

const $ = selector => document.querySelector(selector);
const $$ = selector => [...document.querySelectorAll(selector)];

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
}

function formatDate(value) {
  if (!value) return '未填写';
  return new Date(value).toLocaleString('zh-CN', { hour12: false, year: 'numeric', month: '2-digit', day: '2-digit' });
}

function statusBadge(status) {
  const map = {
    approved: ['已通过', ''],
    pending: ['待审核', 'warn'],
    rejected: ['已驳回', 'danger'],
    sold: ['已成交', ''],
    closed: ['已结束', '']
  };
  const [text, cls] = map[status] || [status || '未知', ''];
  return `<span class="badge ${cls}">${escapeHtml(text)}</span>`;
}

function toast(message, type = '') {
  const node = $('#toast');
  node.textContent = message;
  node.className = `toast show ${type}`;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => node.className = 'toast', 2800);
}

async function api(path, options = {}) {
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
  if (state.token) headers.Authorization = `Bearer ${state.token}`;
  const response = await fetch(path, { ...options, headers });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.message || `请求失败（${response.status}）`);
  return data;
}

function showView(name) {
  if ((name === 'publish' || name === 'profile') && !state.user) {
    toast('请先登录后再使用该功能', 'error');
    openLogin();
    return;
  }
  if (name === 'admin' && state.user?.role !== 'admin') {
    toast('需要管理员权限', 'error');
    return;
  }
  state.activeView = name;
  $$('.view').forEach(node => node.classList.toggle('active', node.id === `view-${name}`));
  $$('.nav-btn').forEach(node => node.classList.toggle('active', node.dataset.view === name));
  window.scrollTo({ top: 0, behavior: 'smooth' });
  if (name === 'market') loadMarket();
  if (name === 'lostfound') loadLostFound();
  if (name === 'profile') loadProfile();
  if (name === 'admin') loadAdmin();
}

async function loadPublicStats() {
  try {
    const data = await api('/api/stats');
    $('#heroMarket').textContent = data.stats.marketApproved;
    $('#heroLost').textContent = data.stats.lostfoundApproved;
    $('#heroUsers').textContent = data.stats.users;
  } catch (error) {
    console.warn(error);
  }
}

function updateAuthUi() {
  const logged = Boolean(state.user);
  $('#loginButton').classList.toggle('hidden', logged);
  $('#userChip').classList.toggle('hidden', !logged);
  $$('.admin-only').forEach(node => node.classList.toggle('hidden', state.user?.role !== 'admin'));
  if (logged) $('#userName').textContent = `${state.user.displayName}（${state.user.role === 'admin' ? '管理员' : '学生'}）`;
}

function openLogin() {
  $('#loginDialog').showModal();
  switchAuthForm('login');
}

function switchAuthForm(mode) {
  $('#showLogin').classList.toggle('active', mode === 'login');
  $('#showRegister').classList.toggle('active', mode === 'register');
  $('#loginForm').classList.toggle('active', mode === 'login');
  $('#registerForm').classList.toggle('active', mode === 'register');
  $('#loginHint').textContent = mode === 'login' ? '使用账号登录，或创建一个新账号。' : '注册后即可发布信息，管理员账号由系统初始化。';
}

async function restoreSession() {
  if (!state.token) return;
  try {
    const data = await api('/api/auth/me');
    state.user = data.user;
  } catch {
    state.token = '';
    localStorage.removeItem('campus_token');
  }
  updateAuthUi();
}
function categoryIcon(category) {
  const icons = { '数码产品': '⌨', '教材书籍': '书', '生活用品': '灯', '运动户外': '球', '证件卡片': '卡', '学习用品': '笔', '随身物品': '包', '其他': '物' };
  return icons[category] || '物';
}

function marketCard(item, manage = false) {
  const owner = item.owner?.displayName || '校园用户';
  const canManage = state.user && (state.user.role === 'admin' || state.user.id === item.ownerId);
  return `
    <article class="card">
      <div class="card-top"><span class="badge">${escapeHtml(item.category || '其他')}</span>${manage ? statusBadge(item.status) : `<span class="badge">${categoryIcon(item.category)}</span>`}</div>
      <h3>${escapeHtml(item.title)}</h3>
      <p>${escapeHtml(item.description).slice(0, 96)}${item.description.length > 96 ? '…' : ''}</p>
      <div class="price">¥ ${Number(item.price).toFixed(2)}</div>
      <div class="card-meta"><span>${escapeHtml(item.condition || '成色不限')}</span><span>${escapeHtml(item.tradePlace || '校内面交')}</span><span>${escapeHtml(owner)}</span></div>
      ${item.reviewReason ? `<p class="badge danger">驳回原因：${escapeHtml(item.reviewReason)}</p>` : ''}
      <div class="card-actions">
        <button data-market-detail="${item.id}">查看详情</button>
        <button data-market-fav="${item.id}">${item.favorited ? '取消收藏' : '收藏'} · ${item.favoriteCount || 0}</button>
        ${manage && canManage ? `<button class="danger" data-market-delete="${item.id}">删除</button>` : ''}
      </div>
    </article>`;
}

function lostCard(item, manage = false) {
  const owner = item.owner?.displayName || '校园用户';
  const canManage = state.user && (state.user.role === 'admin' || state.user.id === item.ownerId);
  const kind = item.kind === 'found' ? '失物招领' : '寻物启事';
  return `
    <article class="card">
      <div class="card-top"><span class="badge ${item.kind === 'found' ? '' : 'warn'}">${kind}</span>${manage ? statusBadge(item.status) : `<span class="badge">${escapeHtml(item.category)}</span>`}</div>
      <h3>${escapeHtml(item.title)}</h3>
      <p>${escapeHtml(item.description).slice(0, 100)}${item.description.length > 100 ? '…' : ''}</p>
      <div class="card-meta"><span>${escapeHtml(item.location)}</span><span>${escapeHtml(item.eventDate || '日期未填写')}</span><span>${escapeHtml(owner)}</span></div>
      ${item.reviewReason ? `<p class="badge danger">驳回原因：${escapeHtml(item.reviewReason)}</p>` : ''}
      <div class="card-actions">
        <button data-lost-detail="${item.id}">查看详情</button>
        <button data-lost-fav="${item.id}">${item.favorited ? '取消收藏' : '收藏'} · ${item.favoriteCount || 0}</button>
        ${manage && canManage ? `<button class="danger" data-lost-delete="${item.id}">删除</button>` : ''}
      </div>
    </article>`;
}

function renderCollection(items, target, renderer, manage = false) {
  const node = $(target);
  node.innerHTML = items.map(item => renderer(item, manage)).join('');
}

async function loadHome() {
  await loadPublicStats();
  const data = await api('/api/market?pageSize=3&sort=newest');
  renderCollection(data.items, '#homeMarket', marketCard);
}

async function loadMarket() {
  const params = new URLSearchParams({ pageSize: 50, sort: $('#marketSort').value, q: $('#marketSearch').value, category: $('#marketCategory').value });
  const data = await api(`/api/market?${params}`);
  state.market = data.items;
  renderCollection(data.items, '#marketList', marketCard);
  $('#marketEmpty').classList.toggle('hidden', data.items.length > 0);
}

async function loadLostFound() {
  const params = new URLSearchParams({ pageSize: 50, q: $('#lostSearch').value, kind: '', category: $('#lostCategory').value });
  const data = await api(`/api/lostfound?${params}`);
  const kind = $('#lostKind').value;
  const filtered = kind ? data.items.filter(item => item.kind === kind) : data.items;
  state.lostfound = filtered;
  renderCollection(filtered, '#lostList', lostCard);
  $('#lostEmpty').classList.toggle('hidden', filtered.length > 0);
}

async function loadProfile() {
  if (!state.user) {
    $('#profileGuest').classList.remove('hidden');
    $('#profileContent').classList.add('hidden');
    return;
  }
  $('#profileGuest').classList.add('hidden');
  $('#profileContent').classList.remove('hidden');
  const [marketData, lostData] = await Promise.all([
    api('/api/market?mine=1&pageSize=50'),
    api('/api/lostfound?mine=1&pageSize=50')
  ]);
  renderCollection(marketData.items, '#myMarket', marketCard, true);
  renderCollection(lostData.items, '#myLost', lostCard, true);
}

function detailContent(item, type) {
  const isMarket = type === 'market';
  return `
    <div class="dialog-head"><span class="eyebrow">${isMarket ? 'MARKET DETAIL' : 'LOST & FOUND'}</span><h2>${escapeHtml(item.title)}</h2></div>
    <div class="detail-grid">
      <div><span>${isMarket ? '价格' : '类型'}：</span>${isMarket ? `¥ ${Number(item.price).toFixed(2)}` : (item.kind === 'found' ? '失物招领' : '寻物启事')}</div>
      <div><span>分类：</span>${escapeHtml(item.category)}</div>
      <div><span>${isMarket ? '成色' : '地点'}：</span>${escapeHtml(isMarket ? item.condition : item.location)}</div>
      <div><span>${isMarket ? '交易地点' : '日期'}：</span>${escapeHtml(isMarket ? item.tradePlace : item.eventDate)}</div>
      <div><span>发布者：</span>${escapeHtml(item.owner?.displayName || '校园用户')}</div>
      <div><span>联系方式：</span><strong>${escapeHtml(item.contact)}</strong></div>
      <div><span>发布时间：</span>${formatDate(item.createdAt)}</div>
    </div>
    <p>${escapeHtml(item.description)}</p>`;
}

async function openMarketDetail(id) {
  try {
    const data = await api(`/api/market/${id}`);
    $('#detailContent').innerHTML = detailContent(data.item, 'market');
    $('#detailDialog').showModal();
  } catch (error) {
    toast(error.message, 'error');
  }
}

async function openLostDetail(id) {
  try {
    const data = await api(`/api/lostfound/${id}`);
    $('#detailContent').innerHTML = detailContent(data.item, 'lostfound');
    $('#detailDialog').showModal();
  } catch (error) {
    toast(error.message, 'error');
  }
}

async function toggleFavorite(type, id) {
  if (!state.user) return openLogin();
  try {
    const result = await api(`/api/${type}/${id}/favorite`, { method: 'POST' });
    toast(result.favorited ? '已收藏' : '已取消收藏');
    if (type === 'market') loadMarket();
    else loadLostFound();
  } catch (error) {
    toast(error.message, 'error');
  }
}

async function deleteItem(type, id) {
  if (!confirm('确定删除这条信息吗？删除后不可恢复。')) return;
  try {
    await api(`/api/${type}/${id}`, { method: 'DELETE' });
    toast('删除成功');
    if (type === 'market') {
      loadMarket(); loadHome();
    } else {
      loadLostFound();
    }
    if (state.activeView === 'profile') loadProfile();
  } catch (error) {
    toast(error.message, 'error');
  }
}

async function loadAdmin() {
  try {
    const [statsData, pendingData] = await Promise.all([api('/api/admin/stats'), api('/api/admin/pending')]);
    const stats = statsData.stats;
    $('#adminStats').innerHTML = [
      ['注册用户', stats.users], ['商品总数', stats.marketTotal], ['商品待审', stats.marketPending],
      ['失物总数', stats.lostfoundTotal], ['失物待审', stats.lostfoundPending]
    ].map(([label, value]) => `<div class="stat-card"><strong>${value}</strong><span>${label}</span></div>`).join('');
    $('#pendingMarket').innerHTML = pendingData.market.length ? pendingData.market.map(item => `
      <div class="review-item"><div><strong>${escapeHtml(item.title)}</strong><p>${escapeHtml(item.description)} · ¥${Number(item.price).toFixed(2)}</p></div>
      <div class="review-actions"><button data-review="market" data-id="${item.id}" data-status="approved">通过</button><button class="reject" data-review="market" data-id="${item.id}" data-status="rejected">驳回</button></div></div>`).join('') : '<p class="empty">暂无待审核商品</p>';
    $('#pendingLost').innerHTML = pendingData.lostfound.length ? pendingData.lostfound.map(item => `
      <div class="review-item"><div><strong>${escapeHtml(item.title)}</strong><p>${escapeHtml(item.description)} · ${escapeHtml(item.location)}</p></div>
      <div class="review-actions"><button data-review="lostfound" data-id="${item.id}" data-status="approved">通过</button><button class="reject" data-review="lostfound" data-id="${item.id}" data-status="rejected">驳回</button></div></div>`).join('') : '<p class="empty">暂无待审核信息</p>';
  } catch (error) {
    toast(error.message, 'error');
  }
}

async function reviewItem(type, id, status) {
  const reason = status === 'rejected' ? prompt('请输入驳回原因：') : '';
  if (status === 'rejected' && !reason) return;
  try {
    await api(`/api/admin/${type}/${id}/review`, { method: 'PATCH', body: JSON.stringify({ status, reason }) });
    toast(status === 'approved' ? '审核通过' : '已驳回');
    loadAdmin();
  } catch (error) {
    toast(error.message, 'error');
  }
}

function formToObject(form) {
  return Object.fromEntries(new FormData(form).entries());
}

async function handleLogin(event) {
  event.preventDefault();
  try {
    const data = await api('/api/auth/login', { method: 'POST', body: JSON.stringify(formToObject(event.target)) });
    state.token = data.token;
    state.user = data.user;
    localStorage.setItem('campus_token', data.token);
    updateAuthUi();
    $('#loginDialog').close();
    toast('登录成功');
    showView(state.activeView === 'home' ? 'market' : state.activeView);
  } catch (error) {
    toast(error.message, 'error');
  }
}

async function handleRegister(event) {
  event.preventDefault();
  try {
    const data = await api('/api/auth/register', { method: 'POST', body: JSON.stringify(formToObject(event.target)) });
    state.token = data.token;
    state.user = data.user;
    localStorage.setItem('campus_token', data.token);
    updateAuthUi();
    $('#loginDialog').close();
    toast('注册成功');
    showView('publish');
  } catch (error) {
    toast(error.message, 'error');
  }
}

async function submitMarket(event) {
  event.preventDefault();
  try {
    await api('/api/market', { method: 'POST', body: JSON.stringify(formToObject(event.target)) });
    event.target.reset();
    toast('商品已提交，等待管理员审核');
    showView('profile');
  } catch (error) {
    toast(error.message, 'error');
  }
}

async function submitLostFound(event) {
  event.preventDefault();
  try {
    await api('/api/lostfound', { method: 'POST', body: JSON.stringify(formToObject(event.target)) });
    event.target.reset();
    toast('信息已提交，等待管理员审核');
    showView('profile');
  } catch (error) {
    toast(error.message, 'error');
  }
}

function bindEvents() {
  document.addEventListener('click', event => {
    const viewButton = event.target.closest('[data-view]');
    if (viewButton) {
      event.preventDefault();
      const publishTab = viewButton.dataset.publishTab;
      showView(viewButton.dataset.view);
      if (publishTab) switchPublishTab(publishTab);
      return;
    }
    const marketDetail = event.target.closest('[data-market-detail]');
    if (marketDetail) return openMarketDetail(marketDetail.dataset.marketDetail);
    const lostDetail = event.target.closest('[data-lost-detail]');
    if (lostDetail) return openLostDetail(lostDetail.dataset.lostDetail);
    const marketFav = event.target.closest('[data-market-fav]');
    if (marketFav) return toggleFavorite('market', marketFav.dataset.marketFav);
    const lostFav = event.target.closest('[data-lost-fav]');
    if (lostFav) return toggleFavorite('lostfound', lostFav.dataset.lostFav);
    const marketDelete = event.target.closest('[data-market-delete]');
    if (marketDelete) return deleteItem('market', marketDelete.dataset.marketDelete);
    const lostDelete = event.target.closest('[data-lost-delete]');
    if (lostDelete) return deleteItem('lostfound', lostDelete.dataset.lostDelete);
    const review = event.target.closest('[data-review]');
    if (review) return reviewItem(review.dataset.review, review.dataset.id, review.dataset.status);
    const close = event.target.closest('[data-close-dialog]');
    if (close) return $(`#${close.dataset.closeDialog}`).close();
    const publishTab = event.target.closest('[data-publish-tab]');
    if (publishTab) switchPublishTab(publishTab.dataset.publishTab);
  });

  $('#marketSearchBtn').addEventListener('click', loadMarket);
  $('#lostSearchBtn').addEventListener('click', loadLostFound);
  $('#marketSearch').addEventListener('keydown', event => event.key === 'Enter' && loadMarket());
  $('#lostSearch').addEventListener('keydown', event => event.key === 'Enter' && loadLostFound());
  $('#loginButton').addEventListener('click', openLogin);
  $('#logoutButton').addEventListener('click', () => {
    state.token = ''; state.user = null; localStorage.removeItem('campus_token'); updateAuthUi(); toast('已退出登录'); showView('home');
  });
  $('#showLogin').addEventListener('click', () => switchAuthForm('login'));
  $('#showRegister').addEventListener('click', () => switchAuthForm('register'));
  $('#loginForm').addEventListener('submit', handleLogin);
  $('#registerForm').addEventListener('submit', handleRegister);
  $('#marketForm').addEventListener('submit', submitMarket);
  $('#lostForm').addEventListener('submit', submitLostFound);
  $('#refreshAdmin').addEventListener('click', loadAdmin);
  document.querySelectorAll('dialog').forEach(dialog => dialog.addEventListener('click', event => { if (event.target === dialog) dialog.close(); }));
}

function switchPublishTab(tab) {
  $$('[data-publish-tab]').forEach(node => node.classList.toggle('active', node.dataset.publishTab === tab));
  $('#marketForm').classList.toggle('active', tab === 'market');
  $('#lostForm').classList.toggle('active', tab === 'lostfound');
}

async function init() {
  bindEvents();
  await restoreSession();
  await loadHome();
  updateAuthUi();
}

init().catch(error => {
  console.error(error);
  toast(error.message || '页面初始化失败', 'error');
});
