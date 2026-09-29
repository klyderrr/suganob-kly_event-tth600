// =====================================================
// kly — Event management server
// Express + MySQL (mysql2). Serves the static pages from
// ./public and exposes a REST API under /api.
//
// Setup:
//   npm init -y
//   npm install express mysql2
//   mysql -u root -p < kly.sql
//   node server.js
// =====================================================

const path = require('path');
const express = require('express');
const mysql = require('mysql2/promise');

const PORT = process.env.PORT || 3000;

const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 3306,
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'kly',
  waitForConnections: true,
  connectionLimit: 10,
  dateStrings: true, // return DATE columns as 'YYYY-MM-DD' strings
});

const app = express();
app.use(express.json());

// Serve the pages and stylesheet that sit next to server.js
// (so server.js and kly.sql are never exposed)
['events.html', 'venues.html', 'attendees.html', 'registrations.html', 'style.css']
  .forEach((file) => app.get('/' + file, (req, res) => res.sendFile(path.join(__dirname, file))));

// ---------- helpers ----------

// Forward async errors to the error handler
const wrap = (fn) => (req, res, next) => fn(req, res, next).catch(next);

// Return 400 if any required field is missing/blank
function requireFields(body, fields) {
  const missing = fields.filter(
    (f) => body[f] === undefined || body[f] === null || String(body[f]).trim() === ''
  );
  return missing.length ? `Missing required field(s): ${missing.join(', ')}` : null;
}

const like = (q) => `%${q}%`;

// ---------- VENUES ----------

app.get('/api/venues', wrap(async (req, res) => {
  const q = (req.query.q || '').trim();
  const [rows] = await pool.query(
    `SELECT id, name, city, capacity, contact_email
     FROM venues
     WHERE (? = '' OR name LIKE ? OR city LIKE ?)
     ORDER BY name`,
    [q, like(q), like(q)]
  );
  res.json(rows);
}));

app.get('/api/venues/:id', wrap(async (req, res) => {
  const [rows] = await pool.query(
    'SELECT id, name, city, capacity, contact_email FROM venues WHERE id = ?',
    [req.params.id]
  );
  if (!rows.length) return res.status(404).json({ error: 'Venue not found' });
  res.json(rows[0]);
}));

app.post('/api/venues', wrap(async (req, res) => {
  const err = requireFields(req.body, ['name', 'city', 'capacity']);
  if (err) return res.status(400).json({ error: err });

  const { name, city, capacity, contact_email = null } = req.body;
  const [result] = await pool.query(
    'INSERT INTO venues (name, city, capacity, contact_email) VALUES (?, ?, ?, ?)',
    [name.trim(), city.trim(), capacity, contact_email || null]
  );
  res.status(201).json({ id: result.insertId, name, city, capacity, contact_email });
}));

app.put('/api/venues/:id', wrap(async (req, res) => {
  const err = requireFields(req.body, ['name', 'city', 'capacity']);
  if (err) return res.status(400).json({ error: err });

  const { name, city, capacity, contact_email = null } = req.body;
  const [result] = await pool.query(
    'UPDATE venues SET name = ?, city = ?, capacity = ?, contact_email = ? WHERE id = ?',
    [name.trim(), city.trim(), capacity, contact_email || null, req.params.id]
  );
  if (!result.affectedRows) return res.status(404).json({ error: 'Venue not found' });
  res.json({ id: Number(req.params.id), name, city, capacity, contact_email });
}));

app.delete('/api/venues/:id', wrap(async (req, res) => {
  const [result] = await pool.query('DELETE FROM venues WHERE id = ?', [req.params.id]);
  if (!result.affectedRows) return res.status(404).json({ error: 'Venue not found' });
  res.status(204).end();
}));

// ---------- EVENTS ----------

const EVENT_SELECT = `
  SELECT e.id, e.title, e.category, e.status, e.event_date,
         e.venue_id, v.name AS venue_name
  FROM events e
  JOIN venues v ON v.id = e.venue_id`;

app.get('/api/events', wrap(async (req, res) => {
  const q = (req.query.q || '').trim();
  const [rows] = await pool.query(
    `${EVENT_SELECT}
     WHERE (? = '' OR e.title LIKE ? OR v.name LIKE ? OR e.category LIKE ?)
     ORDER BY e.event_date`,
    [q, like(q), like(q), like(q)]
  );
  res.json(rows);
}));

app.get('/api/events/:id', wrap(async (req, res) => {
  const [rows] = await pool.query(`${EVENT_SELECT} WHERE e.id = ?`, [req.params.id]);
  if (!rows.length) return res.status(404).json({ error: 'Event not found' });
  res.json(rows[0]);
}));

app.post('/api/events', wrap(async (req, res) => {
  const err = requireFields(req.body, ['title', 'category', 'event_date', 'venue_id']);
  if (err) return res.status(400).json({ error: err });

  const { title, category, status = 'draft', event_date, venue_id } = req.body;
  const [result] = await pool.query(
    'INSERT INTO events (title, category, status, event_date, venue_id) VALUES (?, ?, ?, ?, ?)',
    [title.trim(), category, status, event_date, venue_id]
  );
  res.status(201).json({ id: result.insertId, title, category, status, event_date, venue_id });
}));

app.put('/api/events/:id', wrap(async (req, res) => {
  const err = requireFields(req.body, ['title', 'category', 'status', 'event_date', 'venue_id']);
  if (err) return res.status(400).json({ error: err });

  const { title, category, status, event_date, venue_id } = req.body;
  const [result] = await pool.query(
    `UPDATE events
     SET title = ?, category = ?, status = ?, event_date = ?, venue_id = ?
     WHERE id = ?`,
    [title.trim(), category, status, event_date, venue_id, req.params.id]
  );
  if (!result.affectedRows) return res.status(404).json({ error: 'Event not found' });
  res.json({ id: Number(req.params.id), title, category, status, event_date, venue_id });
}));

app.delete('/api/events/:id', wrap(async (req, res) => {
  const [result] = await pool.query('DELETE FROM events WHERE id = ?', [req.params.id]);
  if (!result.affectedRows) return res.status(404).json({ error: 'Event not found' });
  res.status(204).end();
}));

// ---------- ATTENDEES ----------

app.get('/api/attendees', wrap(async (req, res) => {
  const q = (req.query.q || '').trim();
  const [rows] = await pool.query(
    `SELECT id, full_name, email, organization
     FROM attendees
     WHERE (? = '' OR full_name LIKE ? OR email LIKE ? OR organization LIKE ?)
     ORDER BY full_name`,
    [q, like(q), like(q), like(q)]
  );
  res.json(rows);
}));

app.get('/api/attendees/:id', wrap(async (req, res) => {
  const [rows] = await pool.query(
    'SELECT id, full_name, email, organization FROM attendees WHERE id = ?',
    [req.params.id]
  );
  if (!rows.length) return res.status(404).json({ error: 'Attendee not found' });
  res.json(rows[0]);
}));

app.post('/api/attendees', wrap(async (req, res) => {
  const err = requireFields(req.body, ['full_name', 'email']);
  if (err) return res.status(400).json({ error: err });

  const { full_name, email, organization = null } = req.body;
  const [result] = await pool.query(
    'INSERT INTO attendees (full_name, email, organization) VALUES (?, ?, ?)',
    [full_name.trim(), email.trim(), organization || null]
  );
  res.status(201).json({ id: result.insertId, full_name, email, organization });
}));

app.put('/api/attendees/:id', wrap(async (req, res) => {
  const err = requireFields(req.body, ['full_name', 'email']);
  if (err) return res.status(400).json({ error: err });

  const { full_name, email, organization = null } = req.body;
  const [result] = await pool.query(
    'UPDATE attendees SET full_name = ?, email = ?, organization = ? WHERE id = ?',
    [full_name.trim(), email.trim(), organization || null, req.params.id]
  );
  if (!result.affectedRows) return res.status(404).json({ error: 'Attendee not found' });
  res.json({ id: Number(req.params.id), full_name, email, organization });
}));

app.delete('/api/attendees/:id', wrap(async (req, res) => {
  const [result] = await pool.query('DELETE FROM attendees WHERE id = ?', [req.params.id]);
  if (!result.affectedRows) return res.status(404).json({ error: 'Attendee not found' });
  res.status(204).end();
}));

// ---------- REGISTRATIONS ----------

const REG_SELECT = `
  SELECT r.id, r.event_id, e.title AS event_title,
         r.attendee_id, a.full_name AS attendee_name,
         r.ticket_type, r.status, r.registered_on
  FROM registrations r
  JOIN events e    ON e.id = r.event_id
  JOIN attendees a ON a.id = r.attendee_id`;

app.get('/api/registrations', wrap(async (req, res) => {
  const q = (req.query.q || '').trim();
  const [rows] = await pool.query(
    `${REG_SELECT}
     WHERE (? = '' OR e.title LIKE ? OR a.full_name LIKE ? OR r.ticket_type LIKE ?)
     ORDER BY e.event_date, r.registered_on`,
    [q, like(q), like(q), like(q)]
  );
  res.json(rows);
}));

app.get('/api/registrations/:id', wrap(async (req, res) => {
  const [rows] = await pool.query(`${REG_SELECT} WHERE r.id = ?`, [req.params.id]);
  if (!rows.length) return res.status(404).json({ error: 'Registration not found' });
  res.json(rows[0]);
}));

app.post('/api/registrations', wrap(async (req, res) => {
  const err = requireFields(req.body, ['event_id', 'attendee_id']);
  if (err) return res.status(400).json({ error: err });

  const {
    event_id,
    attendee_id,
    ticket_type = 'General',
    status = 'pending',
    registered_on = new Date().toISOString().slice(0, 10),
  } = req.body;

  const [result] = await pool.query(
    `INSERT INTO registrations (event_id, attendee_id, ticket_type, status, registered_on)
     VALUES (?, ?, ?, ?, ?)`,
    [event_id, attendee_id, ticket_type, status, registered_on]
  );
  res.status(201).json({ id: result.insertId, event_id, attendee_id, ticket_type, status, registered_on });
}));

app.put('/api/registrations/:id', wrap(async (req, res) => {
  const err = requireFields(req.body, ['event_id', 'attendee_id', 'ticket_type', 'status']);
  if (err) return res.status(400).json({ error: err });

  const { event_id, attendee_id, ticket_type, status, registered_on } = req.body;
  const [result] = await pool.query(
    `UPDATE registrations
     SET event_id = ?, attendee_id = ?, ticket_type = ?, status = ?,
         registered_on = COALESCE(?, registered_on)
     WHERE id = ?`,
    [event_id, attendee_id, ticket_type, status, registered_on || null, req.params.id]
  );
  if (!result.affectedRows) return res.status(404).json({ error: 'Registration not found' });
  res.json({ id: Number(req.params.id), event_id, attendee_id, ticket_type, status, registered_on });
}));

app.delete('/api/registrations/:id', wrap(async (req, res) => {
  const [result] = await pool.query('DELETE FROM registrations WHERE id = ?', [req.params.id]);
  if (!result.affectedRows) return res.status(404).json({ error: 'Registration not found' });
  res.status(204).end();
}));

// ---------- front-end script ----------
// The browser code lives here so server.js is the only JS file.
// Node never runs it: it is converted to text and sent to the
// browser when a page asks for /app.js.
function clientMain() {
  const $ = (s, r = document) => r.querySelector(s);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
  const fmtDate = (d) => new Date(d + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  const opts = (rows, label) => rows.map((r) => ({ value: r.id, label: label(r) }));
  const list = (arr) => arr.map((v) => ({ value: v, label: cap(v.replace('_', ' ')) }));
  const actions = (id) =>
    `<button class="btn-edit-text" data-act="edit" data-id="${id}">Edit</button>` +
    `<button class="btn-danger-text" data-act="del" data-id="${id}">Delete</button>`;

  async function api(path, method = 'GET', body) {
    const res = await fetch('/api/' + path, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (res.status === 204) return null;
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Request failed');
    return data;
  }

  // ---------- modal form ----------
  function openForm({ title, fields, values, onSubmit }) {
    const ov = document.createElement('div');
    ov.className = 'overlay open';
    ov.innerHTML =
      `<form class="modal"><h2>${esc(title)}</h2>` +
      fields.map((f) => {
        const v = values[f.name] ?? f.default ?? '';
        const req = f.required ? 'required' : '';
        const input = f.options
          ? `<select name="${f.name}" ${req}>${f.options.map((o) =>
              `<option value="${esc(o.value)}" ${String(o.value) === String(v) ? 'selected' : ''}>${esc(o.label)}</option>`).join('')}</select>`
          : `<input name="${f.name}" type="${f.type || 'text'}" value="${esc(v)}" ${req} ${f.type === 'number' ? 'min="1"' : ''}>`;
        return `<div class="field"><label>${esc(f.label)}</label>${input}</div>`;
      }).join('') +
      `<p class="form-error" hidden></p>
       <div class="modal-actions">
         <button type="button" class="btn btn-ghost" data-close>Cancel</button>
         <button class="btn btn-primary">Save</button>
       </div></form>`;
    document.body.appendChild(ov);

    const close = () => { ov.remove(); document.removeEventListener('keydown', onKey); };
    const onKey = (e) => e.key === 'Escape' && close();
    document.addEventListener('keydown', onKey);
    ov.addEventListener('click', (e) => { if (e.target === ov || e.target.closest('[data-close]')) close(); });
    ov.querySelector('form').addEventListener('submit', async (e) => {
      e.preventDefault();
      try {
        await onSubmit(Object.fromEntries(new FormData(e.target)));
        close();
      } catch (err) {
        const p = $('.form-error', ov);
        p.textContent = err.message;
        p.hidden = false;
      }
    });
    const first = ov.querySelector('input,select');
    if (first) first.focus();
  }

  // ---------- per-page config ----------
  const STATUS = { draft: ['Draft', 'tag-draft'], open: ['Open', 'tag-open'], sold_out: ['Sold Out', 'tag-full'] };

  const pages = {
    events: {
      resource: 'events',
      noun: 'event',
      confirmDel: (e) => `Delete "${e.title}"? Its registrations will be removed too.`,
      async fields() {
        const venues = await api('venues');
        if (!venues.length) throw new Error('Add a venue first.');
        return [
          { name: 'title', label: 'Title', required: true },
          { name: 'category', label: 'Category', options: [...['Conference', 'Concert', 'Workshop', 'Meetup']].map((c) => ({ value: c, label: c })) },
          { name: 'status', label: 'Status', options: list(['draft', 'open', 'sold_out']) },
          { name: 'event_date', label: 'Date', type: 'date', required: true },
          { name: 'venue_id', label: 'Venue', options: opts(venues, (v) => v.name), required: true },
        ];
      },
      render: (rows) => rows.map((e) => {
        const [label, cls] = STATUS[e.status];
        return `<article class="event-card">
          <div class="event-card-top"><span class="tag ${cls}">${label}</span><span class="event-card-category">${esc(e.category)}</span></div>
          <h3 class="event-card-title">${esc(e.title)}</h3>
          <div class="event-card-meta"><span>${fmtDate(e.event_date)}</span><span>&middot;</span><span>${esc(e.venue_name)}</span></div>
          <div class="event-card-divider"></div>
          <div class="event-card-actions">${actions(e.id)}</div>
        </article>`;
      }).join(''),
    },

    venues: {
      resource: 'venues',
      noun: 'venue',
      sel: null,
      confirmDel: (v) => `Delete "${v.name}"? This fails if it still has events.`,
      fields: async () => [
        { name: 'name', label: 'Name', required: true },
        { name: 'city', label: 'City', required: true },
        { name: 'capacity', label: 'Capacity', type: 'number', required: true },
        { name: 'contact_email', label: 'Contact email', type: 'email' },
      ],
      render(rows) {
        const s = rows.find((r) => r.id === this.sel) || rows[0];
        this.sel = s.id;
        return `<div class="venue-split">
          <div class="venue-list">${rows.map((v) => `
            <div class="venue-list-item ${v.id === s.id ? 'active' : ''}" data-act="pick" data-id="${v.id}">
              <h4>${esc(v.name)}</h4><p>${esc(v.city)} &middot; ${v.capacity} cap.</p>
            </div>`).join('')}</div>
          <div class="venue-detail">
            <p class="venue-detail-eyebrow">Selected venue</p>
            <h2>${esc(s.name)}</h2>
            <div class="venue-stats">
              <div class="venue-stat"><div class="label">City</div><div class="value">${esc(s.city)}</div></div>
              <div class="venue-stat"><div class="label">Capacity</div><div class="value">${s.capacity}</div></div>
              <div class="venue-stat"><div class="label">Contact</div><div class="value" style="font-size:15px;">${esc(s.contact_email || '—')}</div></div>
            </div>
            <div class="venue-detail-actions">
              <button class="btn btn-primary" data-act="edit" data-id="${s.id}">Edit venue</button>
              <button class="btn btn-ghost" data-act="del" data-id="${s.id}">Delete venue</button>
            </div>
          </div>
        </div>`;
      },
    },

    attendees: {
      resource: 'attendees',
      noun: 'attendee',
      confirmDel: (a) => `Delete ${a.full_name}? Their registrations will be removed too.`,
      fields: async () => [
        { name: 'full_name', label: 'Full name', required: true },
        { name: 'email', label: 'Email', type: 'email', required: true },
        { name: 'organization', label: 'Organization' },
      ],
      render(rows) {
        const groups = {};
        rows.forEach((a) => (groups[a.full_name[0].toUpperCase()] ||= []).push(a));
        return Object.keys(groups).sort().map((k) => `
          <div class="directory-group">
            <p class="directory-heading">${esc(k)}</p>
            ${groups[k].map((a) => `
              <div class="directory-row">
                <div class="avatar-circle">${esc(a.full_name.split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase())}</div>
                <div class="directory-info">
                  <div class="name">${esc(a.full_name)}</div>
                  <div class="meta">${esc(a.email)}${a.organization ? ' &middot; ' + esc(a.organization) : ''}</div>
                </div>
                <div class="directory-actions">${actions(a.id)}</div>
              </div>`).join('')}
          </div>`).join('');
      },
    },

    registrations: {
      resource: 'registrations',
      noun: 'registration',
      confirmDel: (r) => `Delete ${r.attendee_name}'s registration for ${r.event_title}?`,
      async fields() {
        const [events, attendees] = await Promise.all([api('events'), api('attendees')]);
        if (!events.length || !attendees.length) throw new Error('You need at least one event and one attendee first.');
        return [
          { name: 'event_id', label: 'Event', options: opts(events, (e) => e.title), required: true },
          { name: 'attendee_id', label: 'Attendee', options: opts(attendees, (a) => a.full_name), required: true },
          { name: 'ticket_type', label: 'Ticket type', options: ['General', 'VIP', 'Speaker'].map((t) => ({ value: t, label: t })) },
          { name: 'status', label: 'Status', options: list(['pending', 'confirmed', 'cancelled']) },
          { name: 'registered_on', label: 'Registered on', type: 'date', default: new Date().toISOString().slice(0, 10), required: true },
        ];
      },
      render(rows) {
        const groups = new Map();
        rows.forEach((r) => { if (!groups.has(r.event_id)) groups.set(r.event_id, []); groups.get(r.event_id).push(r); });
        return [...groups.values()].map((g) => `
          <div class="timeline-group">
            <div class="timeline-group-header">
              <h3>${esc(g[0].event_title)}</h3>
              <span class="count">${g.length} registration${g.length === 1 ? '' : 's'}</span>
            </div>
            ${g.map((r) => `
              <div class="timeline-item">
                <div><span class="who">${esc(r.attendee_name)}</span><span class="ticket-type">${esc(r.ticket_type)}</span></div>
                <div class="right">
                  <span>${esc(r.registered_on)}</span>
                  <span class="tag tag-${r.status}">${cap(r.status)}</span>
                  ${actions(r.id)}
                </div>
              </div>`).join('')}
          </div>`).join('');
      },
    },
  };

  // ---------- controller ----------
  const page = pages[document.body.dataset.page];
  if (!page) return;

  let rows = [];
  const box = $('#list');
  const search = $('#search');

  const show = () => {
    box.innerHTML = rows.length ? page.render(rows) : `<p class="empty">No ${page.noun}s found.</p>`;
  };

  const load = async () => {
    try {
      rows = await api(`${page.resource}?q=${encodeURIComponent(search.value.trim())}`);
      show();
    } catch (err) {
      box.innerHTML = `<p class="empty">Could not load data: ${esc(err.message)}</p>`;
    }
  };

  const openEditor = async (row) => {
    try {
      const fields = await page.fields();
      openForm({
        title: `${row ? 'Edit' : 'New'} ${page.noun}`,
        fields,
        values: row || {},
        onSubmit: async (v) => {
          await api(row ? `${page.resource}/${row.id}` : page.resource, row ? 'PUT' : 'POST', v);
          load();
        },
      });
    } catch (err) {
      alert(err.message);
    }
  };

  let timer;
  search.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(load, 250); });
  $('#new-btn').addEventListener('click', () => openEditor(null));

  box.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-act]');
    if (!b) return;
    const row = rows.find((r) => String(r.id) === b.dataset.id);
    if (!row) return;
    if (b.dataset.act === 'pick') { page.sel = row.id; show(); }
    else if (b.dataset.act === 'edit') openEditor(row);
    else if (b.dataset.act === 'del' && confirm(page.confirmDel(row))) {
      try { await api(`${page.resource}/${row.id}`, 'DELETE'); load(); }
      catch (err) { alert(err.message); }
    }
  });

  load();
}

app.get('/app.js', (req, res) => res.type('js').send(`(${clientMain})();`));

// ---------- pages ----------

app.get('/', (req, res) => res.redirect('/events.html'));

// ---------- errors ----------

app.use('/api', (req, res) => res.status(404).json({ error: 'Not found' }));

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  switch (err.code) {
    case 'ER_DUP_ENTRY':
      return res.status(409).json({ error: 'That record already exists (duplicate value).' });
    case 'ER_ROW_IS_REFERENCED_2':
      return res.status(409).json({ error: 'Cannot delete: other records still depend on this one.' });
    case 'ER_NO_REFERENCED_ROW_2':
      return res.status(400).json({ error: 'Referenced venue, event or attendee does not exist.' });
    case 'ER_TRUNCATED_WRONG_VALUE':
    case 'WARN_DATA_TRUNCATED':
    case 'ER_CHECK_CONSTRAINT_VIOLATED':
      return res.status(400).json({ error: 'Invalid value for one of the fields.' });
    default:
      console.error(err);
      return res.status(500).json({ error: 'Internal server error' });
  }
});

app.listen(PORT, () => {
  console.log(`kly running at http://localhost:${PORT}`);
});
