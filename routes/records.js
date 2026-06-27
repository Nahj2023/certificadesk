const router = require("express").Router();
const { getDb, logActivity } = require("../database/db");

router.get("/", (req, res) => {
  const records = getDb().prepare(`
    SELECT r.*, u.display_name as responsible_name
    FROM records_control r
    LEFT JOIN users u ON r.responsible_id=u.id
    WHERE r.org_id=? ORDER BY r.updated_at DESC
  `).all(req.user.org_id);
  const stats = getDb().prepare(`
    SELECT
      COUNT(*) as total,
      SUM(CASE WHEN status='vigente' THEN 1 ELSE 0 END) as vigentes,
      SUM(CASE WHEN status='por_revisar' THEN 1 ELSE 0 END) as por_revisar,
      SUM(CASE WHEN retention_date IS NOT NULL AND retention_date < date('now') THEN 1 ELSE 0 END) as vencidos
    FROM records_control WHERE org_id=?
  `).get(req.user.org_id);
  res.render("records/list", { records, stats });
});

router.get("/nuevo", (req, res) => {
  const staff = getDb().prepare("SELECT id, display_name FROM users WHERE org_id=? AND active=1").all(req.user.org_id);
  res.render("records/form", { record: null, staff, error: null });
});

router.post("/", (req, res) => {
  const { code, name, category, procedure_ref, format, location, responsible_id, retention_years, retention_date, access_level, notes } = req.body;
  const retDate = retention_date || (retention_years ? new Date(Date.now() + retention_years * 365.25 * 86400000).toISOString().substring(0, 10) : null);
  const r = getDb().prepare(`
    INSERT INTO records_control (org_id, code, name, category, procedure_ref, format, location, responsible_id, retention_years, retention_date, access_level, notes)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
  `).run(req.user.org_id, code, name, category, procedure_ref, format || 'digital', location, responsible_id || null, retention_years || null, retDate, access_level || 'interno', notes);
  logActivity(req.user.org_id, req.user.id, "crear", "registro", r.lastInsertRowid, name);
  res.redirect("/registros");
});

router.get("/:id/editar", (req, res) => {
  const record = getDb().prepare("SELECT * FROM records_control WHERE id=? AND org_id=?").get(req.params.id, req.user.org_id);
  if (!record) return res.redirect("/registros");
  const staff = getDb().prepare("SELECT id, display_name FROM users WHERE org_id=? AND active=1").all(req.user.org_id);
  res.render("records/form", { record, staff, error: null });
});

router.post("/:id", (req, res) => {
  const { code, name, category, procedure_ref, format, location, responsible_id, retention_years, retention_date, access_level, status, notes } = req.body;
  getDb().prepare(`
    UPDATE records_control SET code=?, name=?, category=?, procedure_ref=?, format=?, location=?, responsible_id=?,
    retention_years=?, retention_date=?, access_level=?, status=?, notes=?, updated_at=CURRENT_TIMESTAMP
    WHERE id=? AND org_id=?
  `).run(code, name, category, procedure_ref, format, location, responsible_id || null,
    retention_years || null, retention_date || null, access_level, status, notes, req.params.id, req.user.org_id);
  logActivity(req.user.org_id, req.user.id, "actualizar", "registro", req.params.id);
  res.redirect("/registros");
});

router.post("/:id/eliminar", (req, res) => {
  const record = getDb().prepare("SELECT name FROM records_control WHERE id=? AND org_id=?").get(req.params.id, req.user.org_id);
  getDb().prepare("UPDATE records_control SET status='eliminado', updated_at=CURRENT_TIMESTAMP WHERE id=? AND org_id=?")
    .run(req.params.id, req.user.org_id);
  logActivity(req.user.org_id, req.user.id, "eliminar", "registro", req.params.id, record?.name);
  res.redirect("/registros");
});

module.exports = router;
