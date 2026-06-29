const router = require("express").Router();
const { getDb, logActivity } = require("../database/db");

router.get("/", (req, res) => {
  const conflicts = getDb().prepare(`
    SELECT c.*, e.name as evaluator_name, ca.name as candidate_name
    FROM conflicts_of_interest c
    LEFT JOIN evaluators e ON c.evaluator_id=e.id
    LEFT JOIN candidates ca ON c.candidate_id=ca.id
    WHERE c.org_id=? ORDER BY c.created_at DESC
  `).all(req.user.org_id);
  res.render("conflicts/list", { conflicts });
});

router.get("/nuevo", (req, res) => {
  const evaluators = getDb().prepare("SELECT id, name FROM evaluators WHERE org_id=? AND active=1").all(req.user.org_id);
  const candidates = getDb().prepare("SELECT id, name FROM candidates WHERE org_id=?").all(req.user.org_id);
  res.render("conflicts/form", { conflict: null, evaluators, candidates, error: null });
});

router.post("/", (req, res) => {
  const { evaluator_id, candidate_id, type, description, declaration_date } = req.body;
  const r = getDb().prepare(
    "INSERT INTO conflicts_of_interest (org_id, evaluator_id, candidate_id, type, description, declaration_date) VALUES (?,?,?,?,?,?)"
  ).run(req.user.org_id, evaluator_id, candidate_id || null, type, description, declaration_date || null);
  logActivity(req.user.org_id, req.user.id, "declarar", "conflicto", r.lastInsertRowid, type);
  res.flash("Registro guardado"); res.redirect("/conflictos");
});

router.get("/:id/editar", (req, res) => {
  const conflict = getDb().prepare("SELECT * FROM conflicts_of_interest WHERE id=? AND org_id=?").get(req.params.id, req.user.org_id);
  if (!conflict) return res.flash("Registro guardado"); res.redirect("/conflictos");
  const evaluators = getDb().prepare("SELECT id, name FROM evaluators WHERE org_id=? AND active=1").all(req.user.org_id);
  const candidates = getDb().prepare("SELECT id, name FROM candidates WHERE org_id=?").all(req.user.org_id);
  res.render("conflicts/form", { conflict, evaluators, candidates, error: null });
});

router.post("/:id", (req, res) => {
  const { evaluator_id, candidate_id, type, description, declaration_date, action_taken, status } = req.body;
  getDb().prepare(`
    UPDATE conflicts_of_interest SET evaluator_id=?, candidate_id=?, type=?, description=?, declaration_date=?, action_taken=?, status=?
    WHERE id=? AND org_id=?
  `).run(evaluator_id, candidate_id || null, type, description, declaration_date || null, action_taken, status, req.params.id, req.user.org_id);
  logActivity(req.user.org_id, req.user.id, "actualizar", "conflicto", req.params.id);
  res.flash("Registro guardado"); res.redirect("/conflictos");
});

router.post("/:id/resolver", (req, res) => {
  const { action_taken } = req.body;
  getDb().prepare("UPDATE conflicts_of_interest SET status='resuelto', action_taken=? WHERE id=? AND org_id=?")
    .run(action_taken, req.params.id, req.user.org_id);
  logActivity(req.user.org_id, req.user.id, "resolver", "conflicto", req.params.id);
  res.flash("Registro guardado"); res.redirect("/conflictos");
});

module.exports = router;
