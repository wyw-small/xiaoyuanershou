const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createApp } = require('../server');

async function request(base, route, options = {}) {
  const response = await fetch(`${base}${route}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) }
  });
  return { status: response.status, body: await response.json() };
}

test('核心 API 完成注册、发布、登录和管理员审核', async t => {
  const file = path.join(os.tmpdir(), `campus-api-${process.pid}-${Date.now()}.json`);
  const server = createApp({ dataFile: file, seed: false, secret: 'api-test-secret' });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => {
    server.close();
    fs.rmSync(file, { force: true });
  });
  const base = `http://127.0.0.1:${server.address().port}`;

  const registered = await request(base, '/api/auth/register', {
    method: 'POST',
    body: JSON.stringify({ username: 'student02', displayName: 'API测试', password: 'Student123' })
  });
  assert.equal(registered.status, 201);
  assert.equal(registered.body.user.role, 'student');
  const studentToken = registered.body.token;

  const created = await request(base, '/api/market', {
    method: 'POST',
    headers: { Authorization: `Bearer ${studentToken}` },
    body: JSON.stringify({ title: 'API测试商品', description: '用于接口测试', price: 15, category: '其他', condition: '九成新', contact: 'test', tradePlace: '校内' })
  });
  assert.equal(created.status, 201);
  assert.equal(created.body.item.status, 'pending');

  server.store.createUser({ username: 'admin_api', password: 'Admin1234', role: 'admin', displayName: 'API管理员' });
  const login = await request(base, '/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ username: 'admin_api', password: 'Admin1234' })
  });
  assert.equal(login.status, 200);

  const review = await request(base, `/api/admin/market/${created.body.item.id}/review`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${login.body.token}` },
    body: JSON.stringify({ status: 'approved' })
  });
  assert.equal(review.status, 200);
  assert.equal(review.body.item.status, 'approved');

  const publicList = await request(base, '/api/market');
  assert.equal(publicList.status, 200);
  assert.equal(publicList.body.items.length, 1);
  assert.equal(publicList.body.items[0].title, 'API测试商品');
});