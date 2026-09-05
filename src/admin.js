import { Router } from 'express';
import multer from 'multer';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { requireAuth, loginLimiter, createSession, destroySession, loginUser, logActivity, getTokenFromRequest } from './auth.js';
import { supabase, list, get, create, update, remove, getSiteConfig, upsertSiteConfig, getSetting, setSetting, getAllSettings } from './supabase.js';
import { uploadPdf, uploadVideo, uploadImage, deleteImage, deleteVideo, getPdfThumbnailUrl } from './cloudinary.js';
import { broadcast } from './events.js';
import { validate, loginSchema, adminContentSchemas } from './validation.js';
import nodemailer from 'nodemailer';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.join(__dirname, '..');

const router = Router();

const FIELD_MAP = {
  imageSlot: 'image_slot',
  categoryId: 'image_slot',
  groupType: 'group_type',
  mediaType: 'media_type',
  mediaUrl: 'media_url'
};

function mapFields(body, direction = 'toDb') {
  if (direction === 'toDb') {
    const result = {};
    for (const [key, value] of Object.entries(body)) {
      result[FIELD_MAP[key] || key] = value;
    }
    return result;
  }
  const rev = {};
  for (const [k, v] of Object.entries(FIELD_MAP)) { rev[v] = k; }
  const result = {};
  for (const [key, value] of Object.entries(body)) {
    result[rev[key] || key] = value;
  }
  return result;
}

function schemaError(err) {
  if (err && (err.code === '42703' || (err.message && err.message.includes('does not exist')))) {
    return { error: 'La base de données n\'est pas à jour. Exécutez la migration SQL (voir docs/TEAM_SERVICES_UPGRADE.sql).', code: err.code };
  }
  return null;
}

function camelizeKeys(obj) {
  if (!obj || typeof obj !== 'object') return obj;
  const result = {};
  for (const [key, value] of Object.entries(obj)) {
    const camelKey = key.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
    result[camelKey] = value;
  }
  if (Array.isArray(result.images) && result.images.length > 0 && !result.image) {
    result.image = result.images[0];
  }
  return result;
}

const LOCAL_ENTITY_FILES = {
  team_members: 'team.json',
  services: 'services.json',
  projects: 'projects.json',
  products: 'products.json',
  blog_posts: 'blog.json'
};

export function isMissingTableError(err) {
  if (!err) return false;
  const code = err.code || '';
  const message = `${err.message || ''} ${err.details || ''} ${err.hint || ''}`.toLowerCase();
  return code === 'PGRST205' || code === '42P01' || message.includes('could not find the table') || message.includes('does not exist');
}

export function readLocalEntityData(tableName) {
  const fileName = LOCAL_ENTITY_FILES[tableName];
  if (!fileName) return [];
  const filePath = path.join(projectRoot, 'data', fileName);
  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    console.warn(`Local fallback unavailable for ${tableName}:`, error.message);
    return [];
  }
}

function writeLocalEntityData(tableName, items) {
  const fileName = LOCAL_ENTITY_FILES[tableName];
  if (!fileName) return;
  const filePath = path.join(projectRoot, 'data', fileName);
  fs.writeFileSync(filePath, JSON.stringify(items, null, 2));
}

function escapeHtml(text) {
  if (!text) return '';
  const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' };
  return text.replace(/[&<>"']/g, m => map[m]);
}

function sanitizeHtmlValue(value) {
  if (typeof value !== 'string') return value;
  return value
    .replace(/<\/?(script|iframe|object|embed|style|link|meta)[^>]*>/gi, '')
    .replace(/\s(on[a-z]+|formaction|srcdoc)\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(/(href|src)\s*=\s*(["'])\s*javascript:[^"']*\2/gi, '$1="#"');
}

function sanitizeSectionContent(value) {
  if (Array.isArray(value)) return value.map(sanitizeSectionContent);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, sanitizeSectionContent(item)]));
  }
  return sanitizeHtmlValue(value);
}

// ─── LOGIN ───
router.post('/login', loginLimiter, validate(loginSchema), async (req, res) => {
  const { username, password } = req.body;
  const user = await loginUser(username, password);
  if (!user) {
    logActivity('login_failed', `Tentative de connexion échouée pour: ${username}`);
    return res.status(401).json({ error: 'Identifiants invalides' });
  }
  const token = await createSession(user);
  logActivity('login', 'Connexion réussie', user.username);
  const isSecure = req.secure || req.headers['x-forwarded-proto'] === 'https';
  res.clearCookie('admin_token', { path: '/api/admin' });
  res.cookie('admin_token', token, {
    httpOnly: true,
    secure: isSecure,
    sameSite: 'strict',
    maxAge: 24 * 60 * 60 * 1000,
    path: '/api'
  });
  res.json({ success: true });
});

// ─── LOGOUT ───
router.post('/logout', requireAuth, async (req, res) => {
  logActivity('logout', 'Déconnexion', req.admin.username);
  const token = getTokenFromRequest(req);
  if (token) await destroySession(token);
  res.clearCookie('admin_token', { path: '/api' });
  res.clearCookie('admin_token', { path: '/api/admin' });
  res.json({ success: true });
});

// ─── CONTACTS ───
router.get('/contacts', requireAuth, async (req, res) => {
  try {
    const contacts = await list('contacts', { order: [['date', 'desc']] });
    res.json(contacts.map(c => camelizeKeys(c)));
  } catch (err) {
    console.error('Contacts list error:', err);
    res.status(500).json({ error: 'Failed to load contacts' });
  }
});

router.patch('/contacts/:id', requireAuth, async (req, res) => {
  try {
    const contact = await update('contacts', req.params.id, {
      read: req.body.read !== undefined ? req.body.read : undefined,
      resolved: req.body.resolved !== undefined ? req.body.resolved : undefined,
      notes: req.body.notes !== undefined ? req.body.notes : undefined
    });
    logActivity('contact_update', `Contact ${req.params.id} mis à jour`, req.admin.username);
    res.json({ success: true, contact });
  } catch (err) {
    console.error('Contact update error:', err);
    res.status(500).json({ error: 'Failed to update contact' });
  }
});

router.delete('/contacts/:id', requireAuth, async (req, res) => {
  try {
    const contact = await get('contacts', req.params.id);
    await remove('contacts', req.params.id);
    logActivity('contact_delete', `Contact supprimé: ${contact?.name || req.params.id}`, req.admin.username);
    res.json({ success: true });
  } catch (err) {
    console.error('Contact delete error:', err);
    res.status(500).json({ error: 'Failed to delete contact' });
  }
});

// ─── QUOTES ───
router.get('/quotes', requireAuth, async (req, res) => {
  try {
    const quotes = await list('quotes', { order: [['date', 'desc']] });
    res.json(quotes.map(q => camelizeKeys(q)));
  } catch (err) {
    console.error('Quotes list error:', err);
    res.status(500).json({ error: 'Failed to load quotes' });
  }
});

router.patch('/quotes/:id', requireAuth, async (req, res) => {
  try {
    const quote = await update('quotes', req.params.id, {
      status: req.body.status !== undefined ? req.body.status : undefined,
      notes: req.body.notes !== undefined ? req.body.notes : undefined
    });
    logActivity('quote_update', `Devis ${req.params.id} mis à jour (statut: ${req.body.status})`, req.admin.username);
    res.json({ success: true, quote });
  } catch (err) {
    console.error('Quote update error:', err);
    res.status(500).json({ error: 'Failed to update quote' });
  }
});

router.delete('/quotes/:id', requireAuth, async (req, res) => {
  try {
    const quote = await get('quotes', req.params.id);
    await remove('quotes', req.params.id);
    logActivity('quote_delete', `Devis supprimé: ${quote?.quoteNumber || req.params.id}`, req.admin.username);
    res.json({ success: true });
  } catch (err) {
    console.error('Quote delete error:', err);
    res.status(500).json({ error: 'Failed to delete quote' });
  }
});

// ─── SUBSCRIBERS ───
router.get('/subscribers', requireAuth, async (req, res) => {
  try {
    const subscribers = await list('subscribers', { order: [['date', 'desc']] });
    res.json(subscribers);
  } catch (err) {
    console.error('Subscribers list error:', err);
    res.status(500).json({ error: 'Failed to load subscribers' });
  }
});

router.delete('/subscribers/:email', requireAuth, async (req, res) => {
  try {
    const sub = await get('subscribers', req.params.email, 'email');
    if (!sub) return res.status(404).json({ error: 'Abonné non trouvé' });
    await remove('subscribers', req.params.email, 'email');
    logActivity('subscriber_delete', `Abonné supprimé: ${req.params.email}`, req.admin.username);
    res.json({ success: true });
  } catch (err) {
    console.error('Subscriber delete error:', err);
    res.status(500).json({ error: 'Failed to delete subscriber' });
  }
});

// ─── STATS ───
router.get('/stats', requireAuth, async (req, res) => {
  try {
    const { count: totalContacts } = await supabase.from('contacts').select('*', { count: 'exact', head: true });
    const { count: unreadContacts } = await supabase.from('contacts').select('*', { count: 'exact', head: true }).eq('read', false);
    const { count: totalQuotes } = await supabase.from('quotes').select('*', { count: 'exact', head: true });
    const { count: pendingQuotesByStatus } = await supabase.from('quotes').select('*', { count: 'exact', head: true }).eq('status', 'pending');
    const { count: pendingQuotesWithoutStatus } = await supabase.from('quotes').select('*', { count: 'exact', head: true }).is('status', null);
    const { count: totalSubscribers } = await supabase.from('subscribers').select('*', { count: 'exact', head: true });

    const now = new Date();
    const firstOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
    const { count: contactsThisMonth } = await supabase.from('contacts')
      .select('*', { count: 'exact', head: true })
      .gte('date', firstOfMonth);

    res.json({
      totalContacts: totalContacts || 0,
      unreadContacts: unreadContacts || 0,
      totalQuotes: totalQuotes || 0,
      pendingQuotes: (pendingQuotesByStatus || 0) + (pendingQuotesWithoutStatus || 0),
      totalSubscribers: totalSubscribers || 0,
      contactsThisMonth: contactsThisMonth || 0,
      lastUpdate: new Date().toISOString()
    });
  } catch (err) {
    console.error('Stats error:', err);
    res.status(500).json({ error: 'Failed to load stats' });
  }
});

// ─── ACTIVITY LOG ───
router.get('/activity', requireAuth, async (req, res) => {
  try {
    const logs = await list('activity_logs', { order: [['timestamp', 'desc']], limit: 100 });
    res.json(logs);
  } catch (err) {
    console.error('Activity log error:', err);
    res.status(500).json({ error: 'Failed to load activity' });
  }
});

// ─── EMAIL NOTIFICATION FOR BLOG PUBLISH ───
function createBlogTransporter() {
  return nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 587,
    secure: false,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS
    }
  });
}

async function notifySubscribersOnPublish(post) {
  try {
    const { data: subs } = await supabase.from('subscribers').select('email');
    if (!subs || subs.length === 0) return;
    const emails = subs.map(s => s.email);

    const siteUrl = process.env.SITE_URL || 'https://nordinvest.mg';
    const postUrl = post.slug ? `${siteUrl}/blog/${encodeURIComponent(post.slug)}` : siteUrl;
    const excerpt = post.excerpt || '';
    const title = post.title || 'Nouvel article';

    const html = `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto">
        <div style="background:#8B3A2A;color:#fff;padding:24px;text-align:center;border-radius:8px 8px 0 0">
          <h1 style="margin:0;font-size:20px">Nord Invest Madagascar</h1>
        </div>
        <div style="background:#fff;padding:32px;border:1px solid #e0d6d2;border-top:0;border-radius:0 0 8px 8px">
          <h2 style="color:#2d1810;margin-top:0">${escapeHtml(title)}</h2>
          <p style="color:#555;line-height:1.6;font-size:15px">${escapeHtml(excerpt)}</p>
          <a href="${postUrl}" style="display:inline-block;background:#8B3A2A;color:#fff;text-decoration:none;padding:12px 28px;border-radius:6px;font-weight:bold;margin:16px 0">Lire l'article</a>
          <hr style="border:none;border-top:1px solid #eee;margin:24px 0">
          <p style="color:#999;font-size:12px">Vous recevez cet email car vous êtes abonné à la newsletter de Nord Invest Madagascar.</p>
          <p style="color:#999;font-size:12px">${siteUrl}</p>
        </div>
      </div>
    `;

    const transporter = createBlogTransporter();
    await transporter.sendMail({
      from: `"Nord Invest Madagascar" <${process.env.SMTP_USER}>`,
      bcc: emails.join(','),
      subject: `Nouvel article : ${title}`,
      html
    });

    console.log(`Blog notification sent to ${emails.length} subscribers for: ${title}`);
  } catch (err) {
    console.error('Failed to send blog notification emails:', err.message);
  }
}

// ─── GENERIC CRUD HELPER ───
function crudRoutes(entityName, tableName, orderOption = [['order', 'asc']], callbacks = {}) {
  router.get(`/${entityName}`, requireAuth, async (req, res) => {
    try {
      let items;
      try {
        items = await list(tableName, { order: orderOption });
      } catch (err) {
        if (!isMissingTableError(err)) throw err;
        items = readLocalEntityData(tableName);
      }
      res.json(items.map(i => camelizeKeys(i)));
    } catch (err) {
      console.error(`${entityName} list error:`, err);
      res.status(500).json({ error: `Failed to load ${entityName}` });
    }
  });

  router.post(`/${entityName}`, requireAuth, validate(adminContentSchemas[entityName].create), async (req, res) => {
    try {
      const newItem = {
        id: `${entityName.slice(0, -1)}_${Date.now()}`,
        ...mapFields(req.body),
        created_at: new Date().toISOString()
      };
      if (tableName === 'projects' && newItem.image && typeof newItem.image === 'string') {
        newItem.images = [newItem.image];
        delete newItem.image;
      }
      let result;
      try {
        result = await create(tableName, newItem);
      } catch (err) {
        if (!isMissingTableError(err)) throw err;
        const items = readLocalEntityData(tableName);
        items.push({ ...newItem });
        writeLocalEntityData(tableName, items);
        result = { ...newItem };
      }
      logActivity(`${entityName}_create`, `${entityName.slice(0, -1)} créé: ${result.name || result.title || result.id}`, req.admin.username);
      if (callbacks.onCreate) callbacks.onCreate(result, req);
      broadcast(entityName, { action: 'create', id: result.id });
      res.json({ success: true, item: camelizeKeys(result) });
    } catch (err) {
      console.error(`${entityName} create error:`, err);
      const schema = schemaError(err);
      if (schema) return res.status(500).json(schema);
      res.status(500).json({ error: `Failed to create ${entityName.slice(0, -1)}` });
    }
  });

  router.patch(`/${entityName}/:id`, requireAuth, validate(adminContentSchemas[entityName].update), async (req, res) => {
    try {
      const data = {
        ...mapFields(req.body),
        updated_at: new Date().toISOString()
      };
      if (tableName === 'projects' && data.image && typeof data.image === 'string') {
        data.images = [data.image];
        delete data.image;
      }
      let item;
      try {
        item = await update(tableName, req.params.id, data);
      } catch (err) {
        if (!isMissingTableError(err)) throw err;
        const items = readLocalEntityData(tableName);
        const index = items.findIndex(entry => entry.id === req.params.id);
        if (index === -1) return res.status(404).json({ error: 'Not found' });
        items[index] = { ...items[index], ...data };
        writeLocalEntityData(tableName, items);
        item = items[index];
      }
      logActivity(`${entityName}_update`, `${entityName.slice(0, -1)} modifié: ${item.name || item.title || req.params.id}`, req.admin.username);
      if (callbacks.onUpdate) callbacks.onUpdate(item, req);
      broadcast(entityName, { action: 'update', id: req.params.id });
      res.json({ success: true, item: camelizeKeys(item) });
    } catch (err) {
      console.error(`${entityName} update error:`, err);
      if (err.code === 'PGRST116') return res.status(404).json({ error: 'Not found' });
      const schema = schemaError(err);
      if (schema) return res.status(500).json(schema);
      res.status(500).json({ error: `Failed to update ${entityName.slice(0, -1)}` });
    }
  });

  router.delete(`/${entityName}/:id`, requireAuth, async (req, res) => {
    try {
      let item;
      try {
        item = await get(tableName, req.params.id);
      } catch (err) {
        if (!isMissingTableError(err)) throw err;
        const items = readLocalEntityData(tableName);
        item = items.find(entry => entry.id === req.params.id) || null;
      }
      if (!item) return res.status(404).json({ error: 'Not found' });

      try {
        await remove(tableName, req.params.id);
      } catch (err) {
        if (!isMissingTableError(err)) throw err;
        const items = readLocalEntityData(tableName).filter(entry => entry.id !== req.params.id);
        writeLocalEntityData(tableName, items);
      }
      logActivity(`${entityName}_delete`, `${entityName.slice(0, -1)} supprimé: ${item.name || item.title || req.params.id}`, req.admin.username);
      broadcast(entityName, { action: 'delete', id: req.params.id });
      res.json({ success: true });
    } catch (err) {
      console.error(`${entityName} delete error:`, err);
      res.status(500).json({ error: `Failed to delete ${entityName.slice(0, -1)}` });
    }
  });
}

router.post('/products/upload', requireAuth, (req, res) => {
  const mediaUpload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 100 * 1024 * 1024 },
    fileFilter: (request, file, cb) => {
      if (file.mimetype.startsWith('image/') || file.mimetype.startsWith('video/')) cb(null, true);
      else cb(new Error('Sélectionnez une image ou une vidéo'));
    }
  });
  mediaUpload.single('media')(req, res, async (err) => {
    if (err) return res.status(400).json({ error: err.code === 'LIMIT_FILE_SIZE' ? 'Le fichier ne doit pas dépasser 100 Mo' : err.message });
    if (!req.file) return res.status(400).json({ error: 'Aucun fichier sélectionné' });
    try {
      const isVideo = req.file.mimetype.startsWith('video/');
      const publicId = `product-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const result = isVideo
        ? await uploadVideo(req.file.buffer, { folder: 'products', publicId })
        : await uploadImage(req.file.buffer, { folder: 'products', publicId, mimetype: req.file.mimetype });
      res.json({ success: true, url: result.secure_url, mediaType: isVideo ? 'video' : 'image' });
    } catch (uploadErr) {
      console.error('Product media upload failed:', uploadErr);
      res.status(500).json({ error: 'Échec de l\'upload du média' });
    }
  });
});

crudRoutes('team', 'team_members');
crudRoutes('services', 'services');
crudRoutes('projects', 'projects');
crudRoutes('products', 'products');
crudRoutes('blog', 'blog_posts', [['date', 'desc']], {
  onCreate: async (item) => {
    if (item.published) {
      notifySubscribersOnPublish(item);
    }
  },
  onUpdate: async (item) => {
    if (item.published) {
      notifySubscribersOnPublish(item);
    }
  }
});

// ─── BLOG CATEGORIES MANAGEMENT ───
router.get('/blog-categories', requireAuth, async (req, res) => {
  try {
    let categories = await getSetting('blog_categories');
    if (!categories || !Array.isArray(categories) || categories.length === 0) {
      categories = [
        { id: 'blog-construction', label: 'Construction', icon: '', color: 'var(--rust)', svg: 'construction.svg', image: '' },
        { id: 'blog-forage', label: 'Forage', icon: '', color: 'var(--blue, #2563eb)', svg: 'forage.svg', image: '' },
        { id: 'blog-immobilier', label: 'Immobilier', icon: '', color: 'var(--green, #16a34a)', svg: 'immobilier.svg', image: '' }
      ];
      await setSetting('blog_categories', categories);
    }
    res.json(categories);
  } catch (err) {
    console.error('Blog categories get error:', err);
    res.status(500).json({ error: 'Failed to load blog categories' });
  }
});

router.put('/blog-categories', requireAuth, async (req, res) => {
  try {
    const categories = req.body;
    if (!Array.isArray(categories)) {
      return res.status(400).json({ error: 'Categories must be an array' });
    }
    for (const cat of categories) {
      if (!cat.id || !cat.label) {
        return res.status(400).json({ error: 'Each category must have an id and label' });
      }
    }
    await setSetting('blog_categories', categories);
    logActivity('blog_categories_update', 'Catégories du blog mises à jour', req.admin.username);
    broadcast('blog-categories');
    res.json({ success: true });
  } catch (err) {
    console.error('Blog categories save error:', err);
    res.status(500).json({ error: 'Failed to save blog categories' });
  }
});

// ─── TEAM POSITIONS MANAGEMENT ───
const DEFAULT_TEAM_POSITIONS = [
  { id: 'Directeur Général', label: 'Directeur Général' },
  { id: 'Ingénieur', label: 'Ingénieur' },
  { id: 'Chef de chantier', label: 'Chef de chantier' },
  { id: 'Technicien', label: 'Technicien' },
  { id: 'Comptable', label: 'Comptable' }
];

router.get('/team-positions', requireAuth, async (req, res) => {
  try {
    let positions = await getSetting('team_positions');
    if (!positions || !Array.isArray(positions) || positions.length === 0) {
      positions = DEFAULT_TEAM_POSITIONS;
      await setSetting('team_positions', positions);
    }
    res.json(positions);
  } catch (err) {
    console.error('Team positions get error:', err);
    res.status(500).json({ error: 'Failed to load team positions' });
  }
});

router.put('/team-positions', requireAuth, async (req, res) => {
  try {
    const positions = req.body;
    if (!Array.isArray(positions)) {
      return res.status(400).json({ error: 'Positions must be an array' });
    }
    for (const pos of positions) {
      if (!pos.id || !pos.label) {
        return res.status(400).json({ error: 'Each position must have an id and label' });
      }
    }
    await setSetting('team_positions', positions);
    logActivity('team_positions_update', 'Postes de l\'équipe mis à jour', req.admin.username);
    broadcast('team-positions');
    res.json({ success: true });
  } catch (err) {
    console.error('Team positions save error:', err);
    res.status(500).json({ error: 'Failed to save team positions' });
  }
});

// ─── PRICING MANAGEMENT ───
router.get('/pricing', requireAuth, async (req, res) => {
  try {
    const cfg = await getSiteConfig();
    res.json(cfg.pricing || {});
  } catch (err) {
    console.error('Pricing get error:', err);
    res.status(500).json({ error: 'Failed to load pricing' });
  }
});

router.put('/pricing', requireAuth, async (req, res) => {
  try {
    const validCategories = ['construction', 'rehabilitation', 'forage'];
    const incoming = req.body;

    for (const cat of validCategories) {
      if (incoming[cat]) {
        for (const tier of Object.keys(incoming[cat])) {
          const t = incoming[cat][tier];
          if (typeof t.name !== 'string' || !t.name.trim()) {
            return res.status(400).json({ error: `Le champ "name" est requis pour ${cat}/${tier}` });
          }
          if (cat === 'forage') {
            const foragePrice = t.pricePerML || t.price || 0;
            if (typeof foragePrice !== 'number' || foragePrice <= 0) {
              return res.status(400).json({ error: `Prix invalide pour ${cat}/${tier}` });
            }
          } else {
            const flatPrice = t.pricePerM2 || t.price || 0;
            if (typeof flatPrice !== 'number' || flatPrice <= 0) {
              return res.status(400).json({ error: `Prix invalide pour ${cat}/${tier}` });
            }
          }
          if (!Array.isArray(t.features)) {
            return res.status(400).json({ error: `"features" doit être un tableau pour ${cat}/${tier}` });
          }
        }
      }
    }

    const cfg = await getSiteConfig();
    await upsertSiteConfig({ ...cfg, pricing: incoming });
    logActivity('pricing_update', 'Grille tarifaire mise à jour', req.admin.username);
    broadcast('pricing');
    res.json({ success: true });
  } catch (err) {
    console.error('Pricing update error:', err);
    res.status(500).json({ error: 'Failed to update pricing' });
  }
});

// ─── CONTACT INFO ───
router.get('/contact-info', requireAuth, async (req, res) => {
  try {
    const cfg = await getSiteConfig();
    res.json({
      contact: cfg.contact || {},
      social: cfg.social || {},
      mission: cfg.mission || '',
      vision: cfg.vision || '',
      team: cfg.team_stats || {},
      founded: cfg.founded || 2015,
      experience_years: cfg.experience_years || 10
    });
  } catch (err) {
    console.error('Contact info get error:', err);
    res.status(500).json({ error: 'Failed to load contact info' });
  }
});

router.put('/contact-info', requireAuth, async (req, res) => {
  try {
    const cfg = await getSiteConfig();
    const updates = {};
    if (req.body.contact) updates.contact = req.body.contact;
    if (req.body.social) updates.social = req.body.social;
    if (req.body.mission) updates.mission = req.body.mission;
    if (req.body.vision) updates.vision = req.body.vision;
    if (req.body.team_stats) updates.team_stats = req.body.team_stats;
    if (req.body.experience_years) updates.experience_years = req.body.experience_years;
    if (req.body.founded) updates.founded = req.body.founded;
    if (req.body.team) updates.team_stats = req.body.team;
    await upsertSiteConfig({ ...cfg, ...updates });
    logActivity('contact_info_update', 'Informations de contact mises à jour', req.admin.username);
    broadcast('config');
    res.json({ success: true });
  } catch (err) {
    console.error('Contact info update error:', err);
    res.status(500).json({ error: 'Failed to update contact info' });
  }
});

// ─── SITE SETTINGS ───
router.get('/settings', requireAuth, async (req, res) => {
  try {
    const settings = await getAllSettings();
    res.json({
      googleAnalyticsId: settings.googleAnalyticsId || process.env.GOOGLE_ANALYTICS_ID || 'G-MQ14N6E1ZG',
      whatsappNumber: settings.whatsappNumber || '261328231280',
      siteUrl: settings.siteUrl || process.env.SITE_URL || 'https://nordinvest.mg',
      seoDescription: settings.seoDescription || 'Nord Invest Madagascar — Immobilier & Construction à Antsiranana. Expertise en bâtiment, forage, études et conception et vente immobilière.',
      seoKeywords: settings.seoKeywords || ['immobilier', 'construction', 'madagascar', 'antsiranana', 'diego-suarez', 'forage', 'études', 'conception']
    });
  } catch (err) {
    console.error('Settings get error:', err);
    res.status(500).json({ error: 'Failed to load settings' });
  }
});

router.put('/settings', requireAuth, async (req, res) => {
  try {
    for (const [key, value] of Object.entries(req.body)) {
      await setSetting(key, value);
    }
    logActivity('settings_update', 'Paramètres du site mis à jour', req.admin.username);
    broadcast('config');
    res.json({ success: true });
  } catch (err) {
    console.error('Settings update error:', err);
    res.status(500).json({ error: 'Failed to update settings' });
  }
});

// ─── EMAIL TEST ───
router.post('/test-email', requireAuth, async (req, res) => {
  const { to } = req.body;
  if (!to) return res.status(400).json({ error: 'Email destinataire requis' });

  try {
    const nodemailer = (await import('nodemailer')).default;
    const transporter = nodemailer.createTransport({
      host: 'smtp.gmail.com',
      port: 587,
      secure: false,
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS
      }
    });
    await transporter.sendMail({
      from: process.env.SMTP_USER,
      to,
      subject: 'Test — Nord Invest Madagascar',
      html: `<h2>Test d'envoi d'email</h2><p>Cet email confirme que votre configuration SMTP Gmail fonctionne correctement.</p><p><small>${new Date().toISOString()}</small></p>`
    });
    logActivity('email_test', `Email test envoyé à ${to}`, req.admin.username);
    res.json({ success: true, message: 'Email test envoyé avec succès' });
  } catch (err) {
    logActivity('email_test_failed', `Échec envoi test à ${to}: ${err.message}`, req.admin.username);
    res.status(500).json({ error: `Échec: ${err.message}` });
  }
});

// ─── DOSSIERS MANAGEMENT (PDF documents on Cloudinary) ───

router.get('/dossiers', requireAuth, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('dossiers')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) throw error;
    const dossiers = (data || []).map(d => ({
      id: d.id,
      name: d.name,
      size: d.size || 0,
      cloudinary_public_id: d.cloudinary_public_id,
      cloudinary_url: d.cloudinary_url,
      video_url: d.video_url || null,
      thumbnail_url: d.cloudinary_public_id ? getPdfThumbnailUrl(d.cloudinary_public_id) : null,
      created_at: d.created_at
    }));
    res.json(dossiers);
  } catch (err) {
    console.error('Dossiers list error:', err);
    res.status(500).json({ error: 'Failed to list dossiers' });
  }
});

router.post('/dossiers/:id/video', requireAuth, (req, res) => {
  const videoUpload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 100 * 1024 * 1024 },
    fileFilter: (request, file, cb) => {
      if (file.mimetype.startsWith('video/')) cb(null, true);
      else cb(new Error('Seules les vidéos sont acceptées'));
    }
  });
  videoUpload.single('video')(req, res, async (err) => {
    if (err) return res.status(400).json({ error: err.code === 'LIMIT_FILE_SIZE' ? 'La vidéo ne doit pas dépasser 100 Mo' : err.message });
    if (!req.file) return res.status(400).json({ error: 'Aucune vidéo sélectionnée' });

try {
      const { data: dossier, error } = await supabase.from('dossiers').select('*').eq('id', req.params.id).single();
      if (error || !dossier) return res.status(404).json({ error: 'Dossier introuvable' });
      const result = await uploadVideo(req.file.buffer, { folder: 'dossiers-videos', publicId: `${dossier.id}-${Date.now()}` });
      const { error: updateError } = await supabase.from('dossiers').update({ video_public_id: result.public_id, video_url: result.secure_url, updated_at: new Date().toISOString() }).eq('id', dossier.id);
      if (updateError) {
        const schema = schemaError(updateError);
        deleteVideo(result.public_id).catch(cleanupErr => console.error('Vidéo non supprimée après échec:', cleanupErr));
        if (schema) {
          console.error('Dossier video update failed (schema):', updateError.message);
          return res.status(500).json(schema);
        }
        return res.status(500).json({ error: 'Échec de l\'enregistrement de la vidéo' });
      }
      if (dossier.video_public_id) deleteVideo(dossier.video_public_id).catch(uploadErr => console.error('Ancienne vidéo non supprimée:', uploadErr));
      logActivity('dossier_video_upload', `Vidéo ajoutée au dossier: ${dossier.name}`, req.admin.username);
      broadcast('dossiers');
      res.json({ success: true, video_url: result.secure_url });
    } catch (uploadErr) {
      console.error('Dossier video upload failed:', uploadErr);
      const schema = schemaError(uploadErr);
      if (schema) return res.status(500).json(schema);
      res.status(500).json({ error: 'Échec de l’envoi de la vidéo' });
    }
  });
});

router.post('/dossiers', requireAuth, (req, res) => {
  const pdfUpload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 25 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
      if (file.mimetype === 'application/pdf') {
        cb(null, true);
      } else {
        cb(new Error('Seuls les fichiers PDF sont acceptés'));
      }
    }
  });
  pdfUpload.single('pdf')(req, res, async (err) => {
    if (err) {
      if (err instanceof multer.MulterError) {
        const message = err.code === 'LIMIT_FILE_SIZE' ? 'Le fichier PDF ne doit pas dépasser 25 Mo' : `Upload error: ${err.message}`;
        return res.status(400).json({ error: message });
      }
      return res.status(400).json({ error: err.message });
    }
    if (!req.file) return res.status(400).json({ error: 'Aucun fichier sélectionné' });

    const ext = '.pdf';
    const baseName = path.basename(req.file.originalname, ext).trim() || `dossier_${Date.now()}`;
    const publicId = `${baseName.toLowerCase().replace(/[^a-z0-9-_]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '')}-${Date.now()}`;
    const fileName = `${baseName}${ext}`;

    let cloudinaryResult;
    try {
      cloudinaryResult = await uploadPdf(req.file.buffer, {
        folder: 'dossiers',
        publicId
      });
    } catch (uploadErr) {
      console.error('Cloudinary PDF upload failed:', uploadErr);
      return res.status(500).json({ error: 'Échec de l\'upload vers Cloudinary' });
    }

    const id = `dossier_${Date.now()}`;
    try {
      await supabase.from('dossiers').insert({
        id,
        name: fileName,
        cloudinary_public_id: cloudinaryResult.public_id,
        cloudinary_url: cloudinaryResult.secure_url,
        size: req.file.size
      });
    } catch (dbErr) {
      console.error('Dossier DB insert failed:', dbErr);
      return res.status(500).json({ error: 'Échec de l\'enregistrement en base' });
    }

    logActivity('dossier_upload', `Dossier uploadé: ${fileName}`, req.admin.username);
    broadcast('dossiers');
    res.json({
      success: true,
      id,
      name: fileName,
      size: req.file.size,
      cloudinary_url: cloudinaryResult.secure_url,
      thumbnail_url: getPdfThumbnailUrl(cloudinaryResult.public_id)
    });
  });
});

router.patch('/dossiers/:id', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const { name: newName } = req.body;
    if (!newName || !newName.trim()) return res.status(400).json({ error: 'Nouveau nom requis' });
    let safeName = newName.trim();
    if (!safeName.toLowerCase().endsWith('.pdf')) safeName += '.pdf';

    const { data: existing } = await supabase.from('dossiers').select('id').eq('id', id).single();
    if (!existing) return res.status(404).json({ error: 'Dossier introuvable' });

    await supabase.from('dossiers').update({
      name: safeName,
      updated_at: new Date().toISOString()
    }).eq('id', id);

    logActivity('dossier_rename', `Dossier renommé en: ${safeName}`, req.admin.username);
    broadcast('dossiers');
    res.json({ success: true, name: safeName });
  } catch (err) {
    console.error('Dossier rename error:', err);
    res.status(500).json({ error: 'Failed to rename dossier' });
  }
});

router.delete('/dossiers/:id', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const { data: dossier, error: findError } = await supabase
      .from('dossiers')
      .select('*')
      .eq('id', id)
      .single();
    if (findError || !dossier) return res.status(404).json({ error: 'Dossier introuvable' });

    if (dossier.cloudinary_public_id) {
      try {
        await deleteImage(dossier.cloudinary_public_id);
      } catch (cloudErr) {
        console.error('Cloudinary delete error:', cloudErr);
      }
    }
    if (dossier.video_public_id) {
      try { await deleteVideo(dossier.video_public_id); }
      catch (cloudErr) { console.error('Cloudinary video delete error:', cloudErr); }
    }

    await supabase.from('dossiers').delete().eq('id', id);

    logActivity('dossier_delete', `Dossier supprimé: ${dossier.name}`, req.admin.username);
    broadcast('dossiers');
    res.json({ success: true });
  } catch (err) {
    console.error('Dossier delete error:', err);
    res.status(500).json({ error: 'Failed to delete dossier' });
  }
});

// ─── SECTIONS CONTENT MANAGEMENT ───
const DEFAULT_SECTIONS_CONTENT = {
  hero: { tag: null, title: null, subtitle: null, badge: null, badgeYear: '2015', stat1Label: null, stat2Label: null, stat3Label: null, stat4Label: null, btnPricing: null, btnContact: null },
  about: { tag: null, title: null, lead: null, feat1Title: null, feat1Desc: null, feat2Title: null, feat2Desc: null, feat3Title: null, feat3Desc: null },
  standards: { tag: null, title: null, lead: null, item1Title: null, item1Desc: null, item2Title: null, item2Desc: null, item2Badge: null, item3Title: null, item3Desc: null, item4Title: null, item4Desc: null },
  values: { title1: null, desc1: null, title2: null, desc2: null, title3: null, desc3: null },
  team: { tag: null, title: null, lead: null },
  services: { tag: null, title: null, lead: null },
  pricing: { tag: null, title: null, lead: null, tab1: null, tab2: null, tab3: null, note: null },
  calculator: { tag: null, title: null, lead: null },
  projects: { tag: null, title: null, lead: null },
  dossiers: { tag: null, title: null, lead: null },
  blog: { tag: null, title: null, lead: null },
  contact: { tag: null, title: null, lead: null, phone: '032 82 312 80 / 037 07 396 07', email: 'nordinvestmada@gmail.com', address: 'Tanambao 1, en face de Madahoufi, Rue Comores<br>Antsiranana (Diego Suarez)', office: 'Nosy Be', mapTitle: null, mapProjectsTitle: null },
  numbers: { exp: null, tech: null, engineers: null, sites: null },
  visionMission: { visionTitle: null, visionText: null, missionTitle: null, missionText: null },
  newsletter: { title: null, desc: null, btn: null }
};

function mergeSectionsWithDefaults(dbSections) {
  const merged = {};
  for (const [key, defaults] of Object.entries(DEFAULT_SECTIONS_CONTENT)) {
    const dbEntry = dbSections?.[key] || {};
    const filtered = {};
    for (const [fk, fv] of Object.entries(dbEntry)) {
      if (fv !== '' && fv != null && fv !== 'null') {
        filtered[fk] = fv;
      }
    }
    merged[key] = { ...defaults, ...filtered };
  }
  return merged;
}

function fillSectionsFromLocale(sections, lang, fallbackLang) {
  const locales = {};
  for (const l of [lang, fallbackLang].filter(Boolean)) {
    const localePath = path.join(projectRoot, 'public', 'locales', `${l}.json`);
    try {
      locales[l] = JSON.parse(fs.readFileSync(localePath, 'utf8'));
    } catch { locales[l] = {}; }
  }

  const overrides = {
    'contact.phone': 'contact.phoneVal',
    'contact.email': 'contact.emailVal',
    'contact.address': 'contact.addressVal',
    'contact.office': 'contact.officeVal',
    'contact.mapTitle': 'map.title',
    'contact.mapProjectsTitle': 'map.projects',
    'visionMission.visionTitle': 'vision.title',
    'visionMission.visionText': 'vision.text',
    'visionMission.missionTitle': 'mission.title',
    'visionMission.missionText': 'mission.text'
  };

  function getNested(obj, key) {
    return key.split('.').reduce((o, k) => o?.[k], obj);
  }

  for (const [section, fields] of Object.entries(sections)) {
    for (const [field, val] of Object.entries(fields)) {
      if (val === null || val === '') {
        const localeKey = overrides[`${section}.${field}`] || `${section}.${field}`;
        // try target language first, then fallback to French
        const fallbacks = lang === fallbackLang ? [lang] : [lang, fallbackLang].filter(Boolean);
        for (const l of fallbacks) {
          const localeVal = getNested(locales[l], localeKey);
          if (localeVal !== null && localeVal !== undefined) {
            sections[section][field] = localeVal;
            break;
          }
        }
      }
    }
  }
  return sections;
}

router.get('/sections', requireAuth, async (req, res) => {
  try {
    const lang = req.query.lang || 'fr';
    const key = `sections_content_${lang}`;
    let dbSections = await getSetting(key);
    // backward compat: fr falls back to bare sections_content
    if (!dbSections && lang === 'fr') {
      dbSections = await getSetting('sections_content');
    }
    if (!dbSections || typeof dbSections !== 'object') {
      dbSections = {};
    }
    const merged = mergeSectionsWithDefaults(dbSections);
    fillSectionsFromLocale(merged, lang, 'fr');
    console.log(`[sections] lang=${lang} visionMission:`, JSON.stringify(merged.visionMission));
    res.json(merged);
  } catch (err) {
    console.error('Sections get error:', err);
    res.status(500).json({ error: 'Failed to load sections' });
  }
});

router.put('/sections', requireAuth, async (req, res) => {
  try {
    const { lang, ...sections } = req.body;
    if (typeof sections !== 'object' || sections === null) {
      return res.status(400).json({ error: 'Invalid sections data' });
    }
    const settingLang = lang || 'fr';
    const key = `sections_content_${settingLang}`;
    await setSetting(key, sanitizeSectionContent(sections));
    logActivity('sections_update', `Contenu des sections mis à jour (${settingLang})`, req.admin.username);
    broadcast('config');
    res.json({ success: true });
  } catch (err) {
    console.error('Sections update error:', err);
    res.status(500).json({ error: 'Failed to update sections' });
  }
});

export { router as adminRouter, mergeSectionsWithDefaults, fillSectionsFromLocale };
