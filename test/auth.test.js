const test = require('node:test');
const assert = require('node:assert/strict');
const { hashPassword, verifyPassword, createToken, verifyToken } = require('../src/auth');

test('密码哈希可验证且不保存明文', () => {
  const credential = hashPassword('Demo1234');
  assert.equal(verifyPassword('Demo1234', credential.salt, credential.hash), true);
  assert.equal(verifyPassword('Wrong1234', credential.salt, credential.hash), false);
  assert.notEqual(credential.hash, 'Demo1234');
});

test('令牌包含用户信息并可通过签名验证', () => {
  const token = createToken({ id: 7, username: 'tester', role: 'student' }, 'unit-test-secret');
  const payload = verifyToken(token, 'unit-test-secret');
  assert.equal(payload.sub, 7);
  assert.equal(payload.username, 'tester');
  assert.equal(payload.role, 'student');
});

test('篡改令牌后验证失败', () => {
  const token = createToken({ id: 1, username: 'a', role: 'student' }, 'secret-a');
  assert.equal(verifyToken(`${token}x`, 'secret-a'), null);
  assert.equal(verifyToken(token, 'secret-b'), null);
});

test('过期令牌验证失败', () => {
  const token = createToken({ id: 1, username: 'a', role: 'student' }, 'secret', -1);
  assert.equal(verifyToken(token, 'secret'), null);
});