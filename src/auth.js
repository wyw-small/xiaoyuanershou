const crypto = require('crypto');

const PASSWORD_KEY_LENGTH = 64;
const DEFAULT_SESSION_TTL = 7 * 24 * 60 * 60 * 1000;

function base64url(value) {
  return Buffer.from(value).toString('base64url');
}

function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  const hash = crypto.scryptSync(password, salt, PASSWORD_KEY_LENGTH).toString('hex');
  return { salt, hash };
}

function verifyPassword(password, salt, expectedHash) {
  const actual = crypto.scryptSync(password, salt, PASSWORD_KEY_LENGTH);
  const expected = Buffer.from(expectedHash, 'hex');
  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
}

function signPayload(payload, secret) {
  return crypto.createHmac('sha256', secret).update(payload).digest('base64url');
}

function createToken(user, secret, ttl = DEFAULT_SESSION_TTL) {
  const payload = base64url(JSON.stringify({
    sub: user.id,
    username: user.username,
    role: user.role,
    exp: Date.now() + ttl
  }));
  return `${payload}.${signPayload(payload, secret)}`;
}

function verifyToken(token, secret) {
  if (!token || typeof token !== 'string' || !token.includes('.')) return null;
  const [payload, signature] = token.split('.');
  if (!payload || !signature) return null;
  const expected = signPayload(payload, secret);
  const left = Buffer.from(signature);
  const right = Buffer.from(expected);
  if (left.length !== right.length || !crypto.timingSafeEqual(left, right)) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if (!data.sub || !data.exp || Date.now() >= data.exp) return null;
    return data;
  } catch {
    return null;
  }
}

module.exports = {
  hashPassword,
  verifyPassword,
  createToken,
  verifyToken,
  DEFAULT_SESSION_TTL
};