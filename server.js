const express = require('express');
const path = require('path');
const Database = require('better-sqlite3');
const crypto = require('crypto');

const app = express();
const PORT = 3003;

// ── Database ──────────────────────────────────────────────────────────────────
const db = new Database(path.join(__dirname, 'flower_wall.db'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS flowers (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    flower_type TEXT    NOT NULL,
    message     TEXT    NOT NULL,
    flower_lang TEXT    NOT NULL DEFAULT '',
    color       TEXT    NOT NULL DEFAULT '#e91e63',
    likes       INTEGER NOT NULL DEFAULT 0,
    approved    INTEGER NOT NULL DEFAULT 1,
    created_at  TEXT    NOT NULL DEFAULT (datetime('now','localtime')),
    user_hash   TEXT    NOT NULL DEFAULT ''
  );

  CREATE TABLE IF NOT EXISTS likes (
    id        INTEGER PRIMARY KEY AUTOINCREMENT,
    flower_id INTEGER NOT NULL,
    user_hash TEXT    NOT NULL,
    created_at TEXT   NOT NULL DEFAULT (datetime('now','localtime')),
    UNIQUE(flower_id, user_hash),
    FOREIGN KEY (flower_id) REFERENCES flowers(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS comments (
    id        INTEGER PRIMARY KEY AUTOINCREMENT,
    flower_id INTEGER NOT NULL,
    parent_id INTEGER,
    content   TEXT    NOT NULL,
    user_hash TEXT    NOT NULL,
    created_at TEXT   NOT NULL DEFAULT (datetime('now','localtime')),
    FOREIGN KEY (flower_id) REFERENCES flowers(id) ON DELETE CASCADE,
    FOREIGN KEY (parent_id) REFERENCES comments(id) ON DELETE CASCADE
  );
`);

// ── Middleware ─────────────────────────────────────────────────────────────────
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ── Flower types ──────────────────────────────────────────────────────────────
const FLOWER_TYPES = [
  { type: '玫瑰', emoji: '🌹', lang: '热情、真爱、浪漫', color: '#e91e63' },
  { type: '向日葵', emoji: '🌻', lang: '阳光、希望、忠诚', color: '#ffc107' },
  { type: '百合', emoji: '🌷', lang: '纯洁、高雅、祝福', color: '#ab47bc' },
  { type: '康乃馨', emoji: '🌸', lang: '母爱、温馨、感恩', color: '#ec407a' },
  { type: '薰衣草', emoji: '💜', lang: '等待、浪漫、宁静', color: '#7e57c2' },
  { type: '满天星', emoji: '⭐', lang: '关怀、纯洁、守望', color: '#42a5f5' },
  { type: '牡丹', emoji: '🌺', lang: '富贵、圆满、吉祥', color: '#f06292' },
  { type: '雏菊', emoji: '🌼', lang: '天真、快乐、希望', color: '#ffee58' },
  { type: '茉莉', emoji: '🤍', lang: '纯洁、亲切、质朴', color: '#f5f5f5' },
  { type: '桃花', emoji: '🍑', lang: '爱情、好运、美丽', color: '#ff8a80' },
];

// ── Seed data ─────────────────────────────────────────────────────────────────
const seedCount = db.prepare('SELECT COUNT(*) AS cnt FROM flowers').get();
if (seedCount.cnt === 0) {
  const seeds = [
    { ft: '玫瑰', msg: '愿你的生活像玫瑰一样绚烂多彩，每一天都充满爱与美好！', uid: 'seed1' },
    { ft: '向日葵', msg: '愿你永远向着阳光生长，无论风雨，心中都有温暖的光芒。', uid: 'seed2' },
    { ft: '百合', msg: '祝福你平安喜乐，所有的美好都如期而至。', uid: 'seed3' },
    { ft: '康乃馨', msg: '感恩生命中每一个温暖的瞬间，感谢有你。', uid: 'seed4' },
    { ft: '薰衣草', msg: '愿你拥有一片宁静的心田，在繁忙中也能感受到花香。', uid: 'seed5' },
    { ft: '满天星', msg: '虽然我们素不相识，但这份祝福是真心的——愿你一切都好。', uid: 'seed6' },
    { ft: '牡丹', msg: '愿你前程似锦，富贵花开，人生如意。', uid: 'seed7' },
    { ft: '雏菊', msg: '希望这朵小花能带给你一天的好心情！', uid: 'seed8' },
    { ft: '桃花', msg: '桃花开，好运来。愿你所期待的一切都在路上。', uid: 'seed9' },
    { ft: '茉莉', msg: '赠你一缕花香，愿你岁月静好，现世安稳。', uid: 'seed10' },
    { ft: '玫瑰', msg: '给陌生的你：生活不会总是如意，但总有人在默默祝福你。加油！', uid: 'seed11' },
    { ft: '向日葵', msg: '今天也要元气满满哦！笑一笑，没什么大不了。', uid: 'seed12' },
  ];

  const insertSeed = db.prepare(`
    INSERT INTO flowers (flower_type, message, flower_lang, color, likes, user_hash)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  for (const s of seeds) {
    const ft = FLOWER_TYPES.find(f => f.type === s.ft) || FLOWER_TYPES[0];
    const likes = Math.floor(Math.random() * 30) + 5;
    insertSeed.run(ft.type, s.msg, ft.lang, ft.color, likes, s.uid);
  }
  console.log('Seeded 12 sample flowers');
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function getUserHash(req) {
  const ip = req.ip || req.connection.remoteAddress || 'unknown';
  const ua = req.headers['user-agent'] || '';
  return crypto.createHash('md5').update(ip + '|' + ua).digest('hex').slice(0, 16);
}

function getTodayStr() {
  return new Date().toISOString().slice(0, 10);
}

// ── API Routes ────────────────────────────────────────────────────────────────

// GET /api/flowers - list approved flowers (paginated)
app.get('/api/flowers', (req, res) => {
  const page = Math.max(1, parseInt(req.query.page) || 1);
  const limit = Math.min(50, Math.max(1, parseInt(req.query.limit) || 20));
  const offset = (page - 1) * limit;

  const total = db.prepare('SELECT COUNT(*) AS cnt FROM flowers WHERE approved = 1').get().cnt;
  const rows = db.prepare(
    'SELECT * FROM flowers WHERE approved = 1 ORDER BY created_at DESC LIMIT ? OFFSET ?'
  ).all(limit, offset);

  const userHash = getUserHash(req);
  const likedIds = db.prepare('SELECT flower_id FROM likes WHERE user_hash = ?')
    .all(userHash)
    .map(r => r.flower_id);

  const todayCount = db.prepare(
    "SELECT COUNT(*) AS cnt FROM likes WHERE user_hash = ? AND created_at >= date('now','localtime')"
  ).get(userHash).cnt;

  res.json({
    flowers: rows,
    total,
    page,
    limit,
    likedIds,
    todayLikeCount: todayCount,
    maxDailyLikes: 3,
  });
});

// GET /api/flowers/:id - single flower detail
app.get('/api/flowers/:id', (req, res) => {
  const id = parseInt(req.params.id);
  if (!id) return res.status(400).json({ error: 'Invalid id' });

  const row = db.prepare('SELECT * FROM flowers WHERE id = ?').get(id);
  if (!row) return res.status(404).json({ error: 'Flower not found' });

  res.json(row);
});

// POST /api/flowers - create a new flower
app.post('/api/flowers', (req, res) => {
  const { flowerType, message } = req.body;
  if (!flowerType || !message || !message.trim()) {
    return res.status(400).json({ error: '请选择花种并填写祝福语' });
  }
  if (message.length > 200) {
    return res.status(400).json({ error: '祝福语不能超过200字' });
  }

  const ft = FLOWER_TYPES.find(f => f.type === flowerType);
  if (!ft) return res.status(400).json({ error: '无效的花种' });

  const userHash = getUserHash(req);
  const result = db.prepare(
    'INSERT INTO flowers (flower_type, message, flower_lang, color, user_hash) VALUES (?, ?, ?, ?, ?)'
  ).run(ft.type, message.trim(), ft.lang, ft.color, userHash);

  const newFlower = db.prepare('SELECT * FROM flowers WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json(newFlower);
});

// POST /api/flowers/:id/like - like a flower
app.post('/api/flowers/:id/like', (req, res) => {
  const id = parseInt(req.params.id);
  if (!id) return res.status(400).json({ error: 'Invalid id' });

  const userHash = getUserHash(req);

  // Check daily limit
  const todayCount = db.prepare(
    "SELECT COUNT(*) AS cnt FROM likes WHERE user_hash = ? AND created_at >= date('now','localtime')"
  ).get(userHash).cnt;

  if (todayCount >= 3) {
    return res.status(429).json({ error: '今天已经送出3朵花了，明天再来吧！' });
  }

  // Check if already liked
  const existing = db.prepare('SELECT id FROM likes WHERE flower_id = ? AND user_hash = ?').get(id, userHash);
  if (existing) {
    return res.status(409).json({ error: '你已经给这朵花点过赞了' });
  }

  try {
    db.prepare('INSERT INTO likes (flower_id, user_hash) VALUES (?, ?)').run(id, userHash);
    db.prepare('UPDATE flowers SET likes = likes + 1 WHERE id = ?').run(id);
    const updated = db.prepare('SELECT likes FROM flowers WHERE id = ?').get(id);
    res.json({ likes: updated.likes, todayLikeCount: todayCount + 1 });
  } catch (e) {
    res.status(409).json({ error: '你已经给这朵花点过赞了' });
  }
});

// DELETE /api/flowers/:id/like - unlike a flower
app.delete('/api/flowers/:id/like', (req, res) => {
  const id = parseInt(req.params.id);
  if (!id) return res.status(400).json({ error: 'Invalid id' });

  const userHash = getUserHash(req);
  const result = db.prepare('DELETE FROM likes WHERE flower_id = ? AND user_hash = ?').run(id, userHash);
  if (result.changes > 0) {
    db.prepare('UPDATE flowers SET likes = MAX(0, likes - 1) WHERE id = ?').run(id);
  }
  const updated = db.prepare('SELECT likes FROM flowers WHERE id = ?').get(id);
  res.json({ likes: updated ? updated.likes : 0 });
});

// GET /api/flowers/:id/comments - get comments for a flower
app.get('/api/flowers/:id/comments', (req, res) => {
  const id = parseInt(req.params.id);
  if (!id) return res.status(400).json({ error: 'Invalid id' });

  const flower = db.prepare('SELECT id FROM flowers WHERE id = ?').get(id);
  if (!flower) return res.status(404).json({ error: 'Flower not found' });

  const rows = db.prepare(
    'SELECT * FROM comments WHERE flower_id = ? ORDER BY created_at DESC'
  ).all(id);

  res.json(rows);
});

// POST /api/flowers/:id/comments - add a comment or reply to a flower
app.post('/api/flowers/:id/comments', (req, res) => {
  const id = parseInt(req.params.id);
  if (!id) return res.status(400).json({ error: 'Invalid id' });

  const { content, parentId } = req.body;
  if (!content || !content.trim()) {
    return res.status(400).json({ error: '请输入评论内容' });
  }
  if (content.length > 200) {
    return res.status(400).json({ error: '评论不能超过200字' });
  }

  const flower = db.prepare('SELECT id FROM flowers WHERE id = ?').get(id);
  if (!flower) return res.status(404).json({ error: 'Flower not found' });

  let parent_id = null;
  if (parentId) {
    parent_id = parseInt(parentId);
    const parent = db.prepare('SELECT id FROM comments WHERE id = ? AND flower_id = ?').get(parent_id, id);
    if (!parent) return res.status(400).json({ error: '无效的回复目标' });
  }

  const userHash = getUserHash(req);
  const result = db.prepare(
    'INSERT INTO comments (flower_id, parent_id, content, user_hash) VALUES (?, ?, ?, ?)'
  ).run(id, parent_id, content.trim(), userHash);

  const newComment = db.prepare('SELECT * FROM comments WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json(newComment);
});

// GET /api/flower-types - available flower types
app.get('/api/flower-types', (req, res) => {
  res.json(FLOWER_TYPES);
});

// ── Admin API ─────────────────────────────────────────────────────────────────
const ADMIN_TOKEN = 'flower_admin_2026';

function requireAdmin(req, res, next) {
  const token = req.headers['x-admin-token'] || req.query.token;
  if (token !== ADMIN_TOKEN) {
    return res.status(403).json({ error: '需要管理员权限' });
  }
  next();
}

// GET /api/admin/flowers - list all flowers (including unapproved)
app.get('/api/admin/flowers', requireAdmin, (req, res) => {
  const filter = req.query.filter; // 'all', 'pending', 'approved'
  let sql = 'SELECT * FROM flowers';
  if (filter === 'pending') sql += ' WHERE approved = 0';
  else if (filter === 'approved') sql += ' WHERE approved = 1';
  sql += ' ORDER BY created_at DESC';
  const rows = db.prepare(sql).all();
  res.json(rows);
});

// PUT /api/admin/flowers/:id/approve
app.put('/api/admin/flowers/:id/approve', requireAdmin, (req, res) => {
  const id = parseInt(req.params.id);
  db.prepare('UPDATE flowers SET approved = 1 WHERE id = ?').run(id);
  res.json({ success: true });
});

// PUT /api/admin/flowers/:id/reject
app.put('/api/admin/flowers/:id/reject', requireAdmin, (req, res) => {
  const id = parseInt(req.params.id);
  db.prepare('UPDATE flowers SET approved = 0 WHERE id = ?').run(id);
  res.json({ success: true });
});

// DELETE /api/admin/flowers/:id
app.delete('/api/admin/flowers/:id', requireAdmin, (req, res) => {
  const id = parseInt(req.params.id);
  db.prepare('DELETE FROM flowers WHERE id = ?').run(id);
  res.json({ success: true });
});

// GET /api/admin/stats
app.get('/api/admin/stats', requireAdmin, (req, res) => {
  const total = db.prepare('SELECT COUNT(*) AS cnt FROM flowers').get().cnt;
  const approved = db.prepare('SELECT COUNT(*) AS cnt FROM flowers WHERE approved = 1').get().cnt;
  const pending = db.prepare('SELECT COUNT(*) AS cnt FROM flowers WHERE approved = 0').get().cnt;
  const totalLikes = db.prepare('SELECT COALESCE(SUM(likes), 0) AS cnt FROM flowers').get().cnt;
  res.json({ total, approved, pending, totalLikes });
});

// ── SPA Fallback ──────────────────────────────────────────────────────────────
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ── Start ─────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`🌸 Flower Wall running at http://localhost:${PORT}`);
});
