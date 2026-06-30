const router = require("express").Router();
const { getDb } = require("../database/db");

router.get("/", (req, res) => {
  res.render("landing");
});

router.post("/api/contact", (req, res) => {
  const { name, cec_name, email, phone, message } = req.body;
  if (!name || !email) return res.status(400).json({ error: "Nombre y email requeridos" });
  try {
    getDb().prepare(`
      INSERT INTO contact_requests (name, cec_name, email, phone, message)
      VALUES (?,?,?,?,?)
    `).run(name, cec_name || null, email, phone || null, message || null);
  } catch {}
  console.log(`[Contact] ${name} - ${email} - ${cec_name || 'N/A'}`);
  res.json({ ok: true });
});

module.exports = router;
