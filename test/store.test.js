const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { JsonStore } = require('../src/store');

function tempFile() {
  return path.join(os.tmpdir(), `campus-store-${process.pid}-${Date.now()}-${Math.random()}.json`);
}

test('用户、商品、失物和审核流程可持久化', () => {
  const file = tempFile();
  const store = new JsonStore(file, { seed: false });
  const student = store.createUser({ username: 'student01', password: 'Student123', displayName: '测试学生' });
  const admin = store.createUser({ username: 'admin01', password: 'Admin1234', role: 'admin', displayName: '测试管理员' });

  const market = store.createMarket({ title: '测试教材', description: '九成新教材', price: 20, category: '教材书籍', condition: '九成新', contact: 'test', tradePlace: '图书馆' }, student);
  assert.equal(market.status, 'pending');
  store.reviewMarket(market.id, 'approved', '', admin);
  assert.equal(store.getMarket(market.id).status, 'approved');

  const lost = store.createLostFound({ kind: 'lost', title: '测试校园卡', description: '尾号1234', category: '证件卡片', location: '食堂', eventDate: '2026-09-17', contact: 'test' }, student);
  store.reviewLostFound(lost.id, 'rejected', '信息不完整', admin);
  assert.equal(store.getLostFound(lost.id).reviewReason, '信息不完整');

  assert.equal(store.publicUser(student).passwordHash, undefined);
  assert.equal(store.toggleFavorite('market', market.id, student).favorited, true);
  assert.equal(store.favoriteCount('market', market.id), 1);

  const reloaded = new JsonStore(file, { seed: false });
  assert.equal(reloaded.getMarket(market.id).title, '测试教材');
  fs.rmSync(file, { force: true });
});