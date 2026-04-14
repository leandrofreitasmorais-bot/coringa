const express   = require('express');
const bcrypt    = require('bcryptjs');
const session   = require('express-session');
const cors      = require('cors');
const fs        = require('fs');
const path      = require('path');
const crypto    = require('crypto');
const multer    = require('multer');
const upload    = multer();

const app  = express();
const PORT = process.env.PORT || 3000;

const DATA_DIR    = path.join(__dirname, 'data');
const DB_FILE     = path.join(DATA_DIR, 'db.json');
const CONFIGS_DIR = path.join(DATA_DIR, 'configs');

// ── setup dirs ────────────────────────────────────────────────────────────────
if (!fs.existsSync(DATA_DIR))    fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(CONFIGS_DIR)) fs.mkdirSync(CONFIGS_DIR, { recursive: true });

// ── middleware ────────────────────────────────────────────────────────────────
app.use(cors({ origin: true, credentials: true }));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(session({
  secret: process.env.SESSION_SECRET || 'coringa-secret-2025',
  resave: false,
  saveUninitialized: false,
  cookie: { secure: false, maxAge: 86400000 }
}));

// serve o painel (index.html + app.js)
app.use(express.static(path.join(__dirname, 'public')));

// ── db helpers ────────────────────────────────────────────────────────────────
function loadDB() {
  if (!fs.existsSync(DB_FILE)) return initDB();
  const db = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
  // first-run: hash sentinel password
  if (db.users?.admin?.password === 'INIT') {
    db.users.admin.password = bcrypt.hashSync('ignite', 10);
    saveDB(db);
  }
  return db;
}
function saveDB(db) {
  fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2), 'utf8');
}
function initDB() {
  const db = {
    users: {
      admin: {
        password:   bcrypt.hashSync('ignite', 10),
        role:       'superadmin',
        name:       'Administrador',
        codes:      [],
        created_at: new Date().toISOString()
      }
    },
    codes:    {},
    settings: { site_name: 'Meu Ativador' },
    logins:   []
  };
  saveDB(db);
  return db;
}

// ── auth helpers ──────────────────────────────────────────────────────────────
function requireLogin(req, res, next) {
  if (!req.session.user) return res.json({ ok: false, msg: 'Não autenticado' });
  next();
}
function currentUser(db, req) { return db.users[req.session.user] ?? null; }
function isSuperAdmin(db, req) { const u = currentUser(db, req); return u?.role === 'superadmin'; }
function isAdmin(db, req)      { const u = currentUser(db, req); return u && ['superadmin','admin'].includes(u.role); }

// ── config generator ──────────────────────────────────────────────────────────
function generateConfigContent() {
  const deviceHex = crypto.randomBytes(18).toString('hex');
  const snHex     = crypto.randomBytes(24).toString('hex');
  const days   = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const now    = new Date();
  const dateStr = `${days[now.getDay()]} ${months[now.getMonth()]} ${String(now.getDate()).padStart(2,'0')} ${now.toTimeString().slice(0,8)} GMT-03:00 ${now.getFullYear()}`;
  return `#personal info#${dateStr}\nkey_device_id_unitvfree=${deviceHex}\nkey_sn_token_unitvfree=${snHex}\n`;
}

// ── router ────────────────────────────────────────────────────────────────────
app.post('/api.php', upload.none(), async (req, res) => {
  const action = req.body.action || req.query.action || '';
  res.setHeader('Content-Type', 'application/json; charset=utf-8');

  const resp = (ok, data = {}, msg = '') => res.json({ ok, msg, ...data });

  switch (action) {

    case 'login': {
      const { username, password } = req.body;
      const db   = loadDB();
      const user = db.users[username];
      if (!user || !bcrypt.compareSync(password, user.password))
        return resp(false, {}, 'Usuário ou senha inválidos');
      req.session.user = username;
      return resp(true, { role: user.role, name: user.name });
    }

    case 'logout': {
      req.session.destroy();
      return resp(true);
    }

    case 'getData': {
      if (!req.session.user) return resp(false, {}, 'Não autenticado');
      const db   = loadDB();
      const user = currentUser(db, req);
      const me   = req.session.user;
      const codes = {};
      for (const [id, code] of Object.entries(db.codes)) {
        if (isSuperAdmin(db, req) || isAdmin(db, req) || code.owner === me) codes[id] = code;
      }
      const resellers = {};
      if (isSuperAdmin(db, req)) {
        for (const [uname, udata] of Object.entries(db.users)) {
          resellers[uname] = { name: udata.name, role: udata.role, codes: Object.values(db.codes).filter(c => c.owner === uname).length };
        }
      } else if (isAdmin(db, req)) {
        for (const [uname, udata] of Object.entries(db.users)) {
          if (udata.created_by === me || uname === me) {
            resellers[uname] = { name: udata.name, role: udata.role, codes: Object.values(db.codes).filter(c => c.owner === uname).length };
          }
        }
      }
      return resp(true, { user: { username: me, name: user.name, role: user.role }, codes, resellers, settings: db.settings });
    }

    case 'generateCodes': {
      if (!req.session.user) return resp(false, {}, 'Não autenticado');
      const db = loadDB();
      if (!isAdmin(db, req)) return resp(false, {}, 'Sem permissão');
      const qty   = Math.min(parseInt(req.body.qty) || 1, 500);
      const owner = isSuperAdmin(db, req) ? (req.body.owner || req.session.user) : req.session.user;
      if (!db.users[owner]) return resp(false, {}, 'Usuário destino inválido');
      const generated = [];
      for (let i = 0; i < qty; i++) {
        const id      = crypto.randomBytes(8).toString('hex').toUpperCase();
        const content = generateConfigContent();
        fs.writeFileSync(path.join(CONFIGS_DIR, id + '.config'), content);
        db.codes[id] = { id, owner, status: 'available', device_id: null, activated_at: null, created_at: new Date().toISOString(), config_file: id + '.config' };
        generated.push(id);
      }
      saveDB(db);
      return resp(true, { generated, count: generated.length });
    }

    case 'activateCode': {
      if (!req.session.user) return resp(false, {}, 'Não autenticado');
      const db     = loadDB();
      const codeId = (req.body.code_id || '').toUpperCase();
      const code   = db.codes[codeId];
      if (!code) return resp(false, {}, 'Código não encontrado');
      if (!isSuperAdmin(db, req) && !isAdmin(db, req) && code.owner !== req.session.user) return resp(false, {}, 'Sem permissão');
      if (code.status === 'active') return resp(false, {}, 'Código já ativado');
      db.codes[codeId].status       = 'active';
      db.codes[codeId].activated_at = new Date().toISOString();
      saveDB(db);
      return resp(true);
    }

    case 'deactivateCode': {
      if (!req.session.user) return resp(false, {}, 'Não autenticado');
      const db     = loadDB();
      const codeId = (req.body.code_id || '').toUpperCase();
      const code   = db.codes[codeId];
      if (!code) return resp(false, {}, 'Código não encontrado');
      if (!isAdmin(db, req) && code.owner !== req.session.user) return resp(false, {}, 'Sem permissão');
      db.codes[codeId].status       = 'available';
      db.codes[codeId].device_id    = null;
      db.codes[codeId].activated_at = null;
      saveDB(db);
      return resp(true);
    }

    case 'deleteCode': {
      if (!req.session.user) return resp(false, {}, 'Não autenticado');
      const db     = loadDB();
      const codeId = (req.body.code_id || '').toUpperCase();
      const code   = db.codes[codeId];
      if (!code) return resp(false, {}, 'Código não encontrado');
      if (!isAdmin(db, req) && code.owner !== req.session.user) return resp(false, {}, 'Sem permissão');
      const f = path.join(CONFIGS_DIR, code.config_file || '');
      if (fs.existsSync(f)) fs.unlinkSync(f);
      delete db.codes[codeId];
      saveDB(db);
      return resp(true);
    }

    case 'deleteCodes': {
      if (!req.session.user) return resp(false, {}, 'Não autenticado');
      const db  = loadDB();
      const ids = JSON.parse(req.body.ids || '[]');
      let deleted = 0;
      for (const raw of ids) {
        const codeId = raw.toUpperCase();
        const code   = db.codes[codeId];
        if (!code) continue;
        if (!isAdmin(db, req) && code.owner !== req.session.user) continue;
        const f = path.join(CONFIGS_DIR, code.config_file || '');
        if (fs.existsSync(f)) fs.unlinkSync(f);
        delete db.codes[codeId];
        deleted++;
      }
      saveDB(db);
      return resp(true, { deleted });
    }

    case 'transferCodes': {
      if (!req.session.user) return resp(false, {}, 'Não autenticado');
      const db     = loadDB();
      const ids    = JSON.parse(req.body.ids || '[]');
      const target = req.body.target?.trim();
      if (!db.users[target]) return resp(false, {}, 'Usuário destino não encontrado');
      let moved = 0;
      for (const raw of ids) {
        const codeId = raw.toUpperCase();
        const code   = db.codes[codeId];
        if (!code) continue;
        if (!isSuperAdmin(db, req) && !isAdmin(db, req) && code.owner !== req.session.user) continue;
        db.codes[codeId].owner = target;
        moved++;
      }
      saveDB(db);
      return resp(true, { moved });
    }

    case 'unbindDevice': {
      if (!req.session.user) return resp(false, {}, 'Não autenticado');
      const db     = loadDB();
      const codeId = (req.body.code_id || '').toUpperCase();
      const code   = db.codes[codeId];
      if (!code) return resp(false, {}, 'Código não encontrado');
      if (!isAdmin(db, req) && code.owner !== req.session.user) return resp(false, {}, 'Sem permissão');
      const content  = generateConfigContent();
      const filePath = path.join(CONFIGS_DIR, code.config_file || codeId + '.config');
      fs.writeFileSync(filePath, content);
      db.codes[codeId].device_id    = null;
      db.codes[codeId].status       = 'available';
      db.codes[codeId].activated_at = null;
      saveDB(db);
      return resp(true);
    }

    case 'getConfigContent': {
      if (!req.session.user) return resp(false, {}, 'Não autenticado');
      const db     = loadDB();
      const codeId = (req.body.code_id || req.query.code_id || '').toUpperCase();
      const code   = db.codes[codeId];
      if (!code) return resp(false, {}, 'Código não encontrado');
      if (!isAdmin(db, req) && code.owner !== req.session.user) return resp(false, {}, 'Sem permissão');
      const f = path.join(CONFIGS_DIR, code.config_file || '');
      if (!fs.existsSync(f)) return resp(false, {}, 'Arquivo não encontrado');
      return resp(true, { content: fs.readFileSync(f, 'utf8'), filename: path.basename(f) });
    }

    case 'createReseller': {
      if (!req.session.user) return resp(false, {}, 'Não autenticado');
      const db       = loadDB();
      if (!isAdmin(db, req)) return resp(false, {}, 'Sem permissão');
      const username = req.body.username?.trim();
      const password = req.body.password;
      const name     = req.body.name?.trim() || username;
      const role     = isSuperAdmin(db, req) ? (req.body.role || 'reseller') : 'reseller';
      if (!/^[a-zA-Z0-9_]{3,30}$/.test(username)) return resp(false, {}, 'Nome de usuário inválido');
      if (!password || password.length < 4) return resp(false, {}, 'Senha muito curta');
      if (db.users[username]) return resp(false, {}, 'Usuário já existe');
      db.users[username] = { password: bcrypt.hashSync(password, 10), role, name, created_by: req.session.user, created_at: new Date().toISOString() };
      saveDB(db);
      return resp(true);
    }

    case 'deleteReseller': {
      if (!req.session.user) return resp(false, {}, 'Não autenticado');
      const db       = loadDB();
      const username = req.body.username?.trim();
      if (!isAdmin(db, req)) return resp(false, {}, 'Sem permissão');
      if (username === req.session.user) return resp(false, {}, 'Não pode deletar a si mesmo');
      if (!db.users[username]) return resp(false, {}, 'Usuário não encontrado');
      for (const id of Object.keys(db.codes)) {
        if (db.codes[id].owner === username) db.codes[id].owner = req.session.user;
      }
      delete db.users[username];
      saveDB(db);
      return resp(true);
    }

    case 'changePassword': {
      if (!req.session.user) return resp(false, {}, 'Não autenticado');
      const db    = loadDB();
      const me    = req.session.user;
      const user  = db.users[me];
      if (!bcrypt.compareSync(req.body.current, user.password)) return resp(false, {}, 'Senha atual incorreta');
      if (!req.body.new || req.body.new.length < 4) return resp(false, {}, 'Nova senha muito curta');
      db.users[me].password = bcrypt.hashSync(req.body.new, 10);
      saveDB(db);
      return resp(true);
    }

    case 'saveSettings': {
      if (!req.session.user) return resp(false, {}, 'Não autenticado');
      const db = loadDB();
      if (!isSuperAdmin(db, req)) return resp(false, {}, 'Sem permissão');
      db.settings.site_name = req.body.site_name?.trim() || 'Meu Ativador';
      saveDB(db);
      return resp(true);
    }

    // ── logins clientes ───────────────────────────────────────────────────────
    case 'validateLogin': {
      const user = req.body.user?.trim();
      const pass = req.body.pass?.trim();
      if (!user || !pass) return resp(false, {}, 'Dados inválidos');
      const db = loadDB();
      if (!db.logins) db.logins = [];
      const idx = db.logins.findIndex(l => l.user === user && l.pass === pass);
      if (idx === -1) return resp(false, {}, 'Usuário ou senha inválidos');
      const login = db.logins[idx];
      if (login.expires_at && new Date(login.expires_at) < new Date()) return resp(false, {}, 'Login expirado');
      const maxUses  = parseInt(login.max_uses) || 1;
      const usedCount = parseInt(login.used_count) || 0;
      if (usedCount >= maxUses) return resp(false, {}, 'Limite de usos atingido');
      db.logins[idx].used_count    = usedCount + 1;
      db.logins[idx].last_used_at  = new Date().toISOString();
      if (usedCount + 1 >= maxUses) db.logins[idx].used = true;
      saveDB(db);
      return resp(true, { uses_left: maxUses - (usedCount + 1) });
    }

    case 'createLogin': {
      if (!req.session.user) return resp(false, {}, 'Não autenticado');
      const db = loadDB();
      if (!isAdmin(db, req)) return resp(false, {}, 'Sem permissão');
      const user       = req.body.user?.trim();
      const pass       = req.body.pass?.trim();
      const max_uses   = Math.max(1, parseInt(req.body.max_uses) || 1);
      const expires_at = req.body.expires_at?.trim() || null;
      if (!user || !pass) return resp(false, {}, 'Dados inválidos');
      if (!db.logins) db.logins = [];
      if (db.logins.find(l => l.user === user)) return resp(false, {}, 'Usuário já existe');
      db.logins.push({ user, pass, max_uses, used_count: 0, used: false, expires_at, created_at: new Date().toISOString(), last_used_at: null });
      saveDB(db);
      return resp(true);
    }

    case 'listLogins': {
      if (!req.session.user) return resp(false, {}, 'Não autenticado');
      const db = loadDB();
      if (!isAdmin(db, req)) return resp(false, {}, 'Sem permissão');
      return resp(true, { logins: db.logins || [] });
    }

    case 'deleteLogin': {
      if (!req.session.user) return resp(false, {}, 'Não autenticado');
      const db   = loadDB();
      const user = req.body.user?.trim();
      if (!isAdmin(db, req)) return resp(false, {}, 'Sem permissão');
      db.logins = (db.logins || []).filter(l => l.user !== user);
      saveDB(db);
      return resp(true);
    }

    case 'getConfigById': {
      const db     = loadDB();
      const codeId = (req.body.code_id || req.query.code_id || '').toUpperCase();
      if (!codeId) return resp(false, {}, 'ID não informado');
      const code = db.codes[codeId];
      if (!code) return resp(false, {}, 'Código não encontrado');
      const f = path.join(CONFIGS_DIR, code.config_file || '');
      if (!fs.existsSync(f)) return resp(false, {}, 'Arquivo não encontrado');
      db.codes[codeId].status       = 'active';
      db.codes[codeId].activated_at = new Date().toISOString();
      saveDB(db);
      return res.json({ ok: true, msg: '', content: fs.readFileSync(f, 'utf8'), code_id: codeId });
    }

    case 'getPublicConfig': {
      const db = loadDB();
      for (const [id, code] of Object.entries(db.codes)) {
        if (code.status === 'available') {
          const f = path.join(CONFIGS_DIR, code.config_file || '');
          if (fs.existsSync(f)) {
            db.codes[id].status       = 'active';
            db.codes[id].activated_at = new Date().toISOString();
            saveDB(db);
            return resp(true, { content: fs.readFileSync(f, 'utf8'), code_id: id });
          }
        }
      }
      return resp(false, {}, 'Nenhuma configuração disponível');
    }

    default:
      return resp(false, {}, 'Ação desconhecida');
  }
});

// GET para downloadConfig
app.get('/api.php', (req, res) => {
  const action = req.query.action;
  if (action === 'downloadConfig') {
    if (!req.session.user) return res.status(403).send('Forbidden');
    const db     = loadDB();
    const codeId = (req.query.code_id || '').toUpperCase();
    const code   = db.codes[codeId];
    if (!code) return res.status(404).send('Not found');
    const f = path.join(CONFIGS_DIR, code.config_file || '');
    if (!fs.existsSync(f)) return res.status(404).send('Config not found');
    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="${path.basename(f)}"`);
    return res.send(fs.readFileSync(f));
  }
  // redireciona para o painel
  res.redirect('/');
});

app.listen(PORT, () => console.log(`Servidor rodando na porta ${PORT}`));
