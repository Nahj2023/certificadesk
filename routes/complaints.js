const router = require("express").Router();
const { getDb, logActivity } = require("../database/db");

router.get("/", (req, res) => {
  const complaints = getDb().prepare(
    "SELECT c.*, u.display_name as assigned_name FROM complaints c LEFT JOIN users u ON c.assigned_to=u.id WHERE c.org_id=? ORDER BY c.created_at DESC"
  ).all(req.user.org_id);
  res.render("complaints/list", { complaints });
});

router.get("/nuevo", (req, res) => {
  const staff = getDb().prepare("SELECT id, display_name FROM users WHERE org_id=? AND active=1").all(req.user.org_id);
  res.render("complaints/form", { complaint: null, staff, error: null });
});

router.post("/", (req, res) => {
  const { type, from_name, from_email, from_phone, subject, description, priority, assigned_to } = req.body;
  const r = getDb().prepare(
    "INSERT INTO complaints (org_id, type, from_name, from_email, from_phone, subject, description, priority, assigned_to) VALUES (?,?,?,?,?,?,?,?,?)"
  ).run(req.user.org_id, type||"reclamo", from_name, from_email, from_phone, subject, description, priority||"media", assigned_to||null);
  logActivity(req.user.org_id, req.user.id, "crear", "reclamo", r.lastInsertRowid, subject);
  res.redirect("/reclamos");
});

router.post("/:id/resolver", (req, res) => {
  const { resolution } = req.body;
  getDb().prepare("UPDATE complaints SET status='resuelto', resolution=?, resolved_at=CURRENT_TIMESTAMP WHERE id=? AND org_id=?")
    .run(resolution, req.params.id, req.user.org_id);
  logActivity(req.user.org_id, req.user.id, "resolver", "reclamo", req.params.id);
  res.redirect("/reclamos");
});

module.exports = router;
