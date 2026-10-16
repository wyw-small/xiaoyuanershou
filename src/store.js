const fs = require('fs');
const path = require('path');
const { hashPassword } = require('./auth');

const clone = value => JSON.parse(JSON.stringify(value));
const nowIso = () => new Date().toISOString();

class JsonStore {
  constructor(filePath, options = {}) {
    this.filePath = filePath;
    this.seed = options.seed !== false;
    this.data = this.load();
    if (this.seed) this.ensureSeedData();
  }

  load() {
    if (fs.existsSync(this.filePath)) {
      const parsed = JSON.parse(fs.readFileSync(this.filePath, 'utf8'));
      return {
        counters: parsed.counters || { users: 0, market: 0, lostfound: 0, favorites: 0 },
        users: parsed.users || [],
        market: parsed.market || [],
        lostfound: parsed.lostfound || [],
        favorites: parsed.favorites || []
      };
    }
    return {
      counters: { users: 0, market: 0, lostfound: 0, favorites: 0 },
      users: [], market: [], lostfound: [], favorites: []
    };
  }

  save() {
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    const temp = `${this.filePath}.tmp`;
    fs.writeFileSync(temp, JSON.stringify(this.data, null, 2), 'utf8');
    fs.renameSync(temp, this.filePath);
  }

  nextId(type) {
    this.data.counters[type] = Number(this.data.counters[type] || 0) + 1;
    return this.data.counters[type];
  }

  publicUser(user) {
    if (!user) return null;
    const { passwordHash, salt, ...safe } = user;
    return safe;
  }

  findUserById(id) {
    return this.data.users.find(user => user.id === Number(id)) || null;
  }

  findUserByUsername(username) {
    const normalized = String(username || '').trim().toLowerCase();
    return this.data.users.find(user => user.username.toLowerCase() === normalized) || null;
  }

  createUser({ username, password, role = 'student', displayName }) {
    if (this.findUserByUsername(username)) throw new Error('用户名已存在');
    const credential = hashPassword(password);
    const user = {
      id: this.nextId('users'),
      username: String(username).trim(),
      displayName: String(displayName || username).trim(),
      role: role === 'admin' ? 'admin' : 'student',
      salt: credential.salt,
      passwordHash: credential.hash,
      createdAt: nowIso()
    };
    this.data.users.push(user);
    this.save();
    return user;
  }
  createMarket(input, owner) {
    const item = {
      id: this.nextId('market'),
      ownerId: owner.id,
      title: String(input.title).trim(),
      description: String(input.description).trim(),
      price: Number(input.price || 0),
      category: String(input.category || '其他').trim(),
      condition: String(input.condition || '九成新').trim(),
      contact: String(input.contact || '').trim(),
      tradePlace: String(input.tradePlace || '校内面交').trim(),
      status: owner.role === 'admin' ? 'approved' : 'pending',
      reviewReason: '',
      reviewerId: owner.role === 'admin' ? owner.id : null,
      reviewedAt: owner.role === 'admin' ? nowIso() : null,
      createdAt: nowIso(),
      updatedAt: nowIso()
    };
    this.data.market.push(item);
    this.save();
    return item;
  }

  updateMarket(id, patch, actor) {
    const item = this.getMarket(id);
    if (!item) throw new Error('商品不存在');
    if (actor.role !== 'admin' && item.ownerId !== actor.id) throw new Error('无权修改该商品');
    const allowed = ['title', 'description', 'price', 'category', 'condition', 'contact', 'tradePlace', 'status'];
    for (const key of allowed) {
      if (patch[key] !== undefined) item[key] = key === 'price' ? Number(patch[key]) : String(patch[key]).trim();
    }
    if (actor.role !== 'admin') {
      item.status = 'pending';
      item.reviewReason = '';
      item.reviewedAt = null;
      item.reviewerId = null;
    }
    item.updatedAt = nowIso();
    this.save();
    return item;
  }

  getMarket(id) {
    return this.data.market.find(item => item.id === Number(id)) || null;
  }

  deleteMarket(id, actor) {
    const index = this.data.market.findIndex(item => item.id === Number(id));
    if (index < 0) throw new Error('商品不存在');
    const item = this.data.market[index];
    if (actor.role !== 'admin' && item.ownerId !== actor.id) throw new Error('无权删除该商品');
    this.data.market.splice(index, 1);
    this.data.favorites = this.data.favorites.filter(fav => !(fav.targetType === 'market' && fav.targetId === item.id));
    this.save();
  }

  reviewMarket(id, status, reason, admin) {
    const item = this.getMarket(id);
    if (!item) throw new Error('商品不存在');
    item.status = status;
    item.reviewReason = status === 'rejected' ? String(reason || '').trim() : '';
    item.reviewerId = admin.id;
    item.reviewedAt = nowIso();
    item.updatedAt = nowIso();
    this.save();
    return item;
  }

  createLostFound(input, owner) {
    const item = {
      id: this.nextId('lostfound'),
      ownerId: owner.id,
      kind: input.kind === 'found' ? 'found' : 'lost',
      title: String(input.title).trim(),
      description: String(input.description).trim(),
      category: String(input.category || '其他').trim(),
      location: String(input.location || '').trim(),
      eventDate: String(input.eventDate || '').trim(),
      contact: String(input.contact || '').trim(),
      status: owner.role === 'admin' ? 'approved' : 'pending',
      reviewReason: '',
      reviewerId: owner.role === 'admin' ? owner.id : null,
      reviewedAt: owner.role === 'admin' ? nowIso() : null,
      createdAt: nowIso(),
      updatedAt: nowIso()
    };
    this.data.lostfound.push(item);
    this.save();
    return item;
  }

  updateLostFound(id, patch, actor) {
    const item = this.getLostFound(id);
    if (!item) throw new Error('失物信息不存在');
    if (actor.role !== 'admin' && item.ownerId !== actor.id) throw new Error('无权修改该信息');
    const allowed = ['kind', 'title', 'description', 'category', 'location', 'eventDate', 'contact', 'status'];
    for (const key of allowed) {
      if (patch[key] !== undefined) item[key] = String(patch[key]).trim();
    }
    if (!['lost', 'found'].includes(item.kind)) item.kind = 'lost';
    if (actor.role !== 'admin') {
      item.status = 'pending';
      item.reviewReason = '';
      item.reviewedAt = null;
      item.reviewerId = null;
    }
    item.updatedAt = nowIso();
    this.save();
    return item;
  }

  getLostFound(id) {
    return this.data.lostfound.find(item => item.id === Number(id)) || null;
  }

  deleteLostFound(id, actor) {
    const index = this.data.lostfound.findIndex(item => item.id === Number(id));
    if (index < 0) throw new Error('失物信息不存在');
    const item = this.data.lostfound[index];
    if (actor.role !== 'admin' && item.ownerId !== actor.id) throw new Error('无权删除该信息');
    this.data.lostfound.splice(index, 1);
    this.save();
  }

  reviewLostFound(id, status, reason, admin) {
    const item = this.getLostFound(id);
    if (!item) throw new Error('失物信息不存在');
    item.status = status;
    item.reviewReason = status === 'rejected' ? String(reason || '').trim() : '';
    item.reviewerId = admin.id;
    item.reviewedAt = nowIso();
    item.updatedAt = nowIso();
    this.save();
    return item;
  }

  toggleFavorite(targetType, targetId, user) {
    if (!['market', 'lostfound'].includes(targetType)) throw new Error('收藏类型无效');
    const target = targetType === 'market' ? this.getMarket(targetId) : this.getLostFound(targetId);
    if (!target) throw new Error('目标内容不存在');
    const index = this.data.favorites.findIndex(fav =>
      fav.userId === user.id && fav.targetType === targetType && fav.targetId === target.id
    );
    if (index >= 0) {
      this.data.favorites.splice(index, 1);
      this.save();
      return { favorited: false };
    }
    this.data.favorites.push({
      id: this.nextId('favorites'),
      userId: user.id,
      targetType,
      targetId: target.id,
      createdAt: nowIso()
    });
    this.save();
    return { favorited: true };
  }

  isFavorite(targetType, targetId, userId) {
    return this.data.favorites.some(fav =>
      fav.userId === userId && fav.targetType === targetType && fav.targetId === Number(targetId)
    );
  }

  favoriteCount(targetType, targetId) {
    return this.data.favorites.filter(fav => fav.targetType === targetType && fav.targetId === Number(targetId)).length;
  }

  getStats() {
    const count = (arr, status) => status ? arr.filter(item => item.status === status).length : arr.length;
    return {
      users: this.data.users.length,
      marketTotal: count(this.data.market),
      marketPending: count(this.data.market, 'pending'),
      marketApproved: count(this.data.market, 'approved'),
      lostfoundTotal: count(this.data.lostfound),
      lostfoundPending: count(this.data.lostfound, 'pending'),
      lostfoundApproved: count(this.data.lostfound, 'approved'),
      favorites: this.data.favorites.length
    };
  }

  ensureSeedData() {
    let admin = this.findUserByUsername(process.env.ADMIN_USERNAME || 'admin');
    if (!admin) {
      admin = this.createUser({
        username: process.env.ADMIN_USERNAME || 'admin',
        password: process.env.ADMIN_PASSWORD || 'Admin1234',
        role: 'admin',
        displayName: '系统管理员'
      });
    }
    let demo = this.findUserByUsername('demo');
    if (!demo) {
      demo = this.createUser({
        username: 'demo',
        password: process.env.DEMO_PASSWORD || 'Demo1234',
        role: 'student',
        displayName: '演示学生'
      });
    }
    if (this.data.market.length || this.data.lostfound.length) return;
    this.createMarket({ title: '九成新机械键盘', description: '自用机械键盘，青轴，功能正常，带原装数据线。', price: 89, category: '数码产品', condition: '九成新', contact: 'QQ：12345678', tradePlace: '学生公寓A区门口' }, demo);
    this.createMarket({ title: '高数教材与习题册', description: '教材有少量笔记，适合期末复习，可单本购买。', price: 18, category: '教材书籍', condition: '八成新', contact: '微信：demo_student', tradePlace: '图书馆一楼' }, demo);
    this.createMarket({ title: '收一个宿舍小台灯', description: '希望亮度可调、无频闪，价格面议。', price: 30, category: '生活用品', condition: '不限', contact: '站内联系', tradePlace: '校内面交' }, demo);
    this.createLostFound({ kind: 'lost', title: '丢失一张校园卡', description: '姓名为演示学生，尾号1024，捡到请联系，非常感谢。', category: '证件卡片', location: '二食堂附近', eventDate: '2026-09-16', contact: 'QQ：12345678' }, demo);
    this.createLostFound({ kind: 'found', title: '捡到黑色蓝牙耳机', description: '在操场看台捡到，有充电盒，请描述特征认领。', category: '数码产品', location: '田径场看台', eventDate: '2026-09-17', contact: '站内联系' }, demo);
    for (const item of this.data.market.filter(item => item.status === 'pending')) {
      this.reviewMarket(item.id, 'approved', '', admin);
    }
    for (const item of this.data.lostfound.filter(item => item.status === 'pending')) {
      this.reviewLostFound(item.id, 'approved', '', admin);
    }
  }
}

module.exports = { JsonStore, clone, nowIso };
