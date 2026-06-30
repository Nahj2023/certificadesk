const router = require("express").Router();
const { getDb, logActivity } = require("../database/db");

router.post("/contacto", (req, res) => {
  try {
    const { nombre, empresa, email, telefono, mensaje } = req.body;
    if (!nombre || !email || !mensaje) return res.json({ ok: false, error: "Campos requeridos" });

    const db = getDb();
    db.prepare(`CREATE TABLE IF NOT EXISTS contact_messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nombre TEXT NOT NULL,
      empresa TEXT,
      email TEXT NOT NULL,
      telefono TEXT,
      mensaje TEXT NOT NULL,
      read INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now'))
    )`).run();

    db.prepare("INSERT INTO contact_messages (nombre, empresa, email, telefono, mensaje) VALUES (?,?,?,?,?)")
      .run(nombre, empresa || null, email, telefono || null, mensaje);

    res.json({ ok: true });
  } catch (e) {
    console.error("Contact form error:", e.message);
    res.json({ ok: false, error: "Error interno" });
  }
});

module.exports = router;
