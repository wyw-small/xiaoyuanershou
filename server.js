const http = require('http');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');
const { JsonStore } = require('./src/store');
const { createToken, verifyToken, verifyPassword } = require('./src/auth');

const PUBLIC_DIR = path.join(__dirname, 'public');
const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon'
};

function sendJson(res, status, data) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store'
  });
  res.end(JSON.stringify(data));
}

function sendError(res, status, message, details) {
  sendJson(res, status, { ok: false, message, details });
}

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => {
      body += chunk;
      if (Buffer.byteLength(body) > 1024 * 1024) {
        reject(new Error('请求体过大'));
        req.destroy();
      }
    });
    req.on('end', () => {
      if (!body) return resolve({});
      try {
        resolve(JSON.parse(body));
      } catch {
        reject(new Error('JSON 格式错误'));
      }
    });
    req.on('error', reject);
  });
}

function normalizeText(value, max = 500) {
  return String(value || '').trim().replace(/\s+/g, ' ').slice(0, max);
}

function validateRegistration(body) {
  const username = normalizeText(body.username, 20);
  const displayName = normalizeText(body.displayName || username, 20);
  const password = String(body.password || '');
  if (!/^[A-Za-z0-9_]{3,20}$/.test(username)) return '用户名需为3-20位字母、数字或下划线';
  if (!displayName) return '请输入姓名或昵称';
  if (password.length < 8 || !/[A-Za-z]/.test(password) || !/\d/.test(password)) return '密码至少8位且同时包含字母和数字';
  return null;
}

function validateMarket(body) {
  if (!normalizeText(body.title, 50)) return '请输入商品标题';
  if (!normalizeText(body.description, 1000)) return '请输入商品描述';
  if (!Number.isFinite(Number(body.price)) || Number(body.price) < 0 || Number(body.price) > 99999) return '请输入有效价格';
  if (!normalizeText(body.contact, 80)) return '请输入联系方式';
  return null;
}

function validateLostFound(body) {
  if (!['lost', 'found'].includes(body.kind)) return '请选择失物或招领';
  if (!normalizeText(body.title, 50)) return '请输入标题';
  if (!normalizeText(body.description, 1000)) return '请输入详细描述';
  if (!normalizeText(body.location, 80)) return '请输入地点';
  if (!normalizeText(body.contact, 80)) return '请输入联系方式';
  return null;
}
function getAuth(req, store, secret) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  const claims = verifyToken(token, secret);
  if (!claims) return null;
  return store.findUserById(claims.sub);
}

function decorateMarket(item, store, user) {
  const owner = store.findUserById(item.ownerId);
  return {
    ...item,
    owner: owner ? store.publicUser(owner) : null,
    favoriteCount: store.favoriteCount('market', item.id),
    favorited: user ? store.isFavorite('market', item.id, user.id) : false
  };
}

function decorateLostFound(item, store, user) {
  const owner = store.findUserById(item.ownerId);
  return {
    ...item,
    owner: owner ? store.publicUser(owner) : null,
    favoriteCount: store.favoriteCount('lostfound', item.id),
    favorited: user ? store.isFavorite('lostfound', item.id, user.id) : false
  };
}

function filterAndPage(items, url, defaultSort = 'newest') {
  const q = normalizeText(url.searchParams.get('q'), 50).toLowerCase();
  const category = normalizeText(url.searchParams.get('category'), 30);
  const status = normalizeText(url.searchParams.get('status'), 20);
  const sort = normalizeText(url.searchParams.get('sort') || defaultSort, 20);
  const page = Math.max(1, Number(url.searchParams.get('page') || 1));
  const pageSize = Math.min(50, Math.max(1, Number(url.searchParams.get('pageSize') || 12)));
  let result = items.filter(item => {
    const text = `${item.title} ${item.description}`.toLowerCase();
    if (q && !text.includes(q)) return false;
    if (category && item.category !== category) return false;
    if (status && item.status !== status) return false;
    return true;
  });
  result.sort((a, b) => {
    if (sort === 'priceAsc') return Number(a.price || 0) - Number(b.price || 0);
    if (sort === 'priceDesc') return Number(b.price || 0) - Number(a.price || 0);
    return new Date(b.createdAt) - new Date(a.createdAt);
  });
  const total = result.length;
  const start = (page - 1) * pageSize;
  return { items: result.slice(start, start + pageSize), total, page, pageSize };
}

async function handleApi(req, res, url, store, secret) {
  const method = req.method.toUpperCase();
  const segments = url.pathname.split('/').filter(Boolean);
  const user = getAuth(req, store, secret);

  if (method === 'GET' && url.pathname === '/api/stats') {
    return sendJson(res, 200, { ok: true, stats: store.getStats() });
  }

  if (method === 'GET' && url.pathname === '/api/health') {
    return sendJson(res, 200, { ok: true, service: 'campus-service-system', now: new Date().toISOString() });
  }

  if (method === 'POST' && url.pathname === '/api/auth/register') {
    const body = await parseBody(req);
    const error = validateRegistration(body);
    if (error) return sendError(res, 400, error);
    const created = store.createUser({
      username: body.username,
      password: body.password,
      displayName: body.displayName
    });
    const token = createToken(created, secret);
    return sendJson(res, 201, { ok: true, token, user: store.publicUser(created) });
  }

  if (method === 'POST' && url.pathname === '/api/auth/login') {
    const body = await parseBody(req);
    const found = store.findUserByUsername(body.username);
    if (!found || !verifyPassword(String(body.password || ''), found.salt, found.passwordHash)) {
      return sendError(res, 401, '用户名或密码错误');
    }
    const token = createToken(found, secret);
    return sendJson(res, 200, { ok: true, token, user: store.publicUser(found) });
  }

  if (method === 'GET' && url.pathname === '/api/auth/me') {
    if (!user) return sendError(res, 401, '请先登录');
    return sendJson(res, 200, { ok: true, user: store.publicUser(user) });
  }

  if (method === 'GET' && url.pathname === '/api/market') {
    const all = url.searchParams.get('all') === '1' && user?.role === 'admin';
    const mine = url.searchParams.get('mine') === '1' && user;
    let list = store.data.market.map(item => decorateMarket(item, store, user));
    if (mine) list = list.filter(item => item.ownerId === user.id);
    else if (!all) list = list.filter(item => item.status === 'approved');
    return sendJson(res, 200, { ok: true, ...filterAndPage(list, url, 'newest') });
  }

  if (method === 'POST' && url.pathname === '/api/market') {
    if (!user) return sendError(res, 401, '请先登录');
    const body = await parseBody(req);
    const error = validateMarket(body);
    if (error) return sendError(res, 400, error);
    const item = store.createMarket(body, user);
    return sendJson(res, 201, { ok: true, item: decorateMarket(item, store, user) });
  }

  if (segments[0] === 'api' && segments[1] === 'market' && segments[2]) {
    const id = Number(segments[2]);
    if (method === 'GET' && segments.length === 3) {
      const item = store.getMarket(id);
      if (!item || (item.status !== 'approved' && item.ownerId !== user?.id && user?.role !== 'admin')) {
        return sendError(res, 404, '商品不存在或尚未通过审核');
      }
      return sendJson(res, 200, { ok: true, item: decorateMarket(item, store, user) });
    }
    if (method === 'PUT' && segments.length === 3) {
      if (!user) return sendError(res, 401, '请先登录');
      const body = await parseBody(req);
      const error = validateMarket({ ...store.getMarket(id), ...body });
      if (error) return sendError(res, 400, error);
      const item = store.updateMarket(id, body, user);
      return sendJson(res, 200, { ok: true, item: decorateMarket(item, store, user) });
    }
    if (method === 'DELETE' && segments.length === 3) {
      if (!user) return sendError(res, 401, '请先登录');
      store.deleteMarket(id, user);
      return sendJson(res, 200, { ok: true });
    }
    if (segments.length === 4 && segments[3] === 'favorite' && ['POST', 'DELETE'].includes(method)) {
      if (!user) return sendError(res, 401, '请先登录');
      if (method === 'POST') {
        const result = store.toggleFavorite('market', id, user);
        return sendJson(res, 200, { ok: true, ...result });
      }
      if (store.isFavorite('market', id, user.id)) store.toggleFavorite('market', id, user);
      return sendJson(res, 200, { ok: true, favorited: false });
    }
  }

  if (method === 'GET' && url.pathname === '/api/lostfound') {
    const all = url.searchParams.get('all') === '1' && user?.role === 'admin';
    const mine = url.searchParams.get('mine') === '1' && user;
    let list = store.data.lostfound.map(item => decorateLostFound(item, store, user));
    if (mine) list = list.filter(item => item.ownerId === user.id);
    else if (!all) list = list.filter(item => item.status === 'approved');
    return sendJson(res, 200, { ok: true, ...filterAndPage(list, url, 'newest') });
  }

  if (method === 'POST' && url.pathname === '/api/lostfound') {
    if (!user) return sendError(res, 401, '请先登录');
    const body = await parseBody(req);
    const error = validateLostFound(body);
    if (error) return sendError(res, 400, error);
    const item = store.createLostFound(body, user);
    return sendJson(res, 201, { ok: true, item: decorateLostFound(item, store, user) });
  }

  if (segments[0] === 'api' && segments[1] === 'lostfound' && segments[2]) {
    const id = Number(segments[2]);
    if (method === 'GET' && segments.length === 3) {
      const item = store.getLostFound(id);
      if (!item || (item.status !== 'approved' && item.ownerId !== user?.id && user?.role !== 'admin')) {
        return sendError(res, 404, '信息不存在或尚未通过审核');
      }
      return sendJson(res, 200, { ok: true, item: decorateLostFound(item, store, user) });
    }
    if (method === 'PUT' && segments.length === 3) {
      if (!user) return sendError(res, 401, '请先登录');
      const body = await parseBody(req);
      const error = validateLostFound({ ...store.getLostFound(id), ...body });
      if (error) return sendError(res, 400, error);
      const item = store.updateLostFound(id, body, user);
      return sendJson(res, 200, { ok: true, item: decorateLostFound(item, store, user) });
    }
    if (method === 'DELETE' && segments.length === 3) {
      if (!user) return sendError(res, 401, '请先登录');
      store.deleteLostFound(id, user);
      return sendJson(res, 200, { ok: true });
    }
  }

  if (method === 'GET' && url.pathname === '/api/admin/stats') {
    if (!user || user.role !== 'admin') return sendError(res, 403, '需要管理员权限');
    return sendJson(res, 200, { ok: true, stats: store.getStats() });
  }

  if (method === 'GET' && url.pathname === '/api/admin/pending') {
    if (!user || user.role !== 'admin') return sendError(res, 403, '需要管理员权限');
    return sendJson(res, 200, {
      ok: true,
      market: store.data.market.filter(item => item.status === 'pending').map(item => decorateMarket(item, store, user)),
      lostfound: store.data.lostfound.filter(item => item.status === 'pending').map(item => decorateLostFound(item, store, user))
    });
  }

  if (segments[0] === 'api' && segments[1] === 'admin' && segments[3] && segments[4] === 'review') {
    if (!user || user.role !== 'admin') return sendError(res, 403, '需要管理员权限');
    if (method !== 'PATCH') return sendError(res, 405, '请求方法不支持');
    const resource = segments[2];
    const id = Number(segments[3]);
    const body = await parseBody(req);
    const status = String(body.status || '');
    if (!['approved', 'rejected'].includes(status)) return sendError(res, 400, '审核状态无效');
    if (status === 'rejected' && !normalizeText(body.reason, 100)) return sendError(res, 400, '驳回时请填写原因');
    if (resource === 'market') {
      const item = store.reviewMarket(id, status, body.reason, user);
      return sendJson(res, 200, { ok: true, item: decorateMarket(item, store, user) });
    }
    if (resource === 'lostfound') {
      const item = store.reviewLostFound(id, status, body.reason, user);
      return sendJson(res, 200, { ok: true, item: decorateLostFound(item, store, user) });
    }
  }

  return sendError(res, 404, '接口不存在');
}

function serveStatic(req, res, url) {
  let relative = decodeURIComponent(url.pathname);
  if (relative === '/') relative = '/index.html';
  const filePath = path.resolve(PUBLIC_DIR, `.${relative}`);
  if (filePath !== PUBLIC_DIR && !filePath.startsWith(PUBLIC_DIR + path.sep)) return sendError(res, 403, '禁止访问');
  const target = fs.existsSync(filePath) && fs.statSync(filePath).isFile() ? filePath : path.join(PUBLIC_DIR, 'index.html');
  const ext = path.extname(target).toLowerCase();
  res.writeHead(200, { 'Content-Type': MIME_TYPES[ext] || 'application/octet-stream' });
  fs.createReadStream(target).pipe(res);
}

function createApp(options = {}) {
  const dataFile = options.dataFile || process.env.DATA_FILE || path.join(__dirname, 'data', 'store.json');
  const secret = options.secret || process.env.APP_SECRET || 'change-this-secret-in-production';
  const store = options.store || new JsonStore(dataFile, { seed: options.seed !== false });
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, `http://${req.headers.host || '127.0.0.1'}`);
    if (req.method === 'OPTIONS') {
      res.writeHead(204, { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type, Authorization', 'Access-Control-Allow-Methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS' });
      return res.end();
    }
    try {
      if (url.pathname.startsWith('/api/')) return await handleApi(req, res, url, store, secret);
      return serveStatic(req, res, url);
    } catch (error) {
      const status = /不存在|无权/.test(error.message) ? 404 : 400;
      return sendError(res, status, error.message || '服务器内部错误');
    }
  });
  server.store = store;
  return server;
}

if (require.main === module) {
  const port = Number(process.env.PORT || 3000);
  const host = process.env.HOST || '127.0.0.1';
  const server = createApp();
  server.listen(port, host, () => {
    console.log(`Campus service system running at http://${host}:${port}`);
    console.log('Default admin: admin / Admin1234');
    console.log('Default student: demo / Demo1234');
  });
}

module.exports = { createApp };
