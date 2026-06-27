const router = require("express").Router();
const { getDb, logActivity } = require("../database/db");

router.get("/", (req, res) => {
  const evaluators = getDb().prepare(
    "SELECT * FROM evaluators WHERE org_id=? ORDER BY name"
  ).all(req.user.org_id);
  res.render("evaluators/list", { evaluators });
});

router.get("/nuevo", (req, res) => {
  res.render("evaluators/form", { evaluator: null, error: null });
});

router.post("/", (req, res) => {
  const { rut, name, email, phone, specialties, contract_type, djs_expiry } = req.body;
  try {
    const r = getDb().prepare(
      "INSERT INTO evaluators (org_id, rut, name, email, phone, specialties, contract_type, djs_expiry) VALUES (?,?,?,?,?,?,?,?)"
    ).run(req.user.org_id, rut, name, email, phone, specialties, contract_type, djs_expiry||null);
    logActivity(req.user.org_id, req.user.id, "crear", "evaluador", r.lastInsertRowid, name);
    res.redirect("/evaluadores");
  } catch(e) {
    res.render("evaluators/form", { evaluator: req.body, error: e.message });
  }
});

router.get("/:id/editar", (req, res) => {
  const evaluator = getDb().prepare("SELECT * FROM evaluators WHERE id=? AND org_id=?").get(req.params.id, req.user.org_id);
  if (!evaluator) return res.redirect("/evaluadores");
  res.render("evaluators/form", { evaluator, error: null });
});

router.post("/:id", (req, res) => {
  const { rut, name, email, phone, specialties, contract_type, djs_expiry } = req.body;
  const active = req.body.active ? 1 : 0;
  getDb().prepare(
    "UPDATE evaluators SET rut=?, name=?, email=?, phone=?, specialties=?, contract_type=?, djs_expiry=?, active=? WHERE id=? AND org_id=?"
  ).run(rut, name, email, phone, specialties, contract_type, djs_expiry||null, active, req.params.id, req.user.org_id);
  logActivity(req.user.org_id, req.user.id, "editar", "evaluador", req.params.id, name);
  res.redirect("/evaluadores");
});

module.exports = router;
