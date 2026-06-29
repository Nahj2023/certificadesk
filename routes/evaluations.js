const router = require("express").Router();
const { getDb, logActivity } = require("../database/db");

router.get("/", (req, res) => {
  const db = getDb();
  const oid = req.user.org_id;
  const evaluations = db.prepare(
    `SELECT e.*, c.name as candidate_name, c.rut as candidate_rut, c.status as candidate_status,
     p.name as profile_name, ev.name as evaluator_name
     FROM evaluations e
     LEFT JOIN candidates c ON e.candidate_id=c.id
     LEFT JOIN profiles p ON e.profile_id=p.id
     LEFT JOIN evaluators ev ON e.evaluator_id=ev.id
     WHERE e.org_id=? ORDER BY e.scheduled_date DESC`
  ).all(oid);
  res.render("evaluations/list", { evaluations });
});

router.get("/nueva", (req, res) => {
  const db = getDb();
  const oid = req.user.org_id;
  const candidates = db.prepare("SELECT id, name, rut FROM candidates WHERE org_id=? AND status='elegible' ORDER BY name").all(oid);
  const evaluators = db.prepare("SELECT id, name FROM evaluators WHERE org_id=? AND active=1 ORDER BY name").all(oid);
  const profiles = db.prepare("SELECT id, code, name FROM profiles WHERE active=1 ORDER BY name").all();
  res.render("evaluations/form", { evaluation: null, candidates, evaluators, profiles, error: null });
});

router.post("/", (req, res) => {
  const db = getDb();
  const { candidate_id, profile_id, evaluator_id, scheduled_date, location, type } = req.body;
  try {
    const cand = db.prepare("SELECT status FROM candidates WHERE id=? AND org_id=?").get(candidate_id, req.user.org_id);
    if (!cand || cand.status !== 'elegible') return res.redirect("/evaluaciones/nueva");

    const r = db.prepare(
      "INSERT INTO evaluations (org_id, candidate_id, profile_id, evaluator_id, type, scheduled_date, location) VALUES (?,?,?,?,?,?,?)"
    ).run(req.user.org_id, candidate_id, profile_id||null, evaluator_id||null, type||"terreno", scheduled_date, location);
    db.prepare("UPDATE candidates SET status='evaluando' WHERE id=? AND org_id=?").run(candidate_id, req.user.org_id);
    res.flash("Evaluacion programada exitosamente");
    logActivity(req.user.org_id, req.user.id, "crear", "evaluacion", r.lastInsertRowid);
    res.redirect("/evaluaciones");
  } catch(e) {
    res.redirect("/evaluaciones/nueva");
  }
});

// Resultado con 4 instrumentos ponderados (Manual del Candidato D016)
router.post("/:id/resultado", (req, res) => {
  const db = getDb();
  const oid = req.user.org_id;
  const { score_conocimientos, score_jefe_directo, score_terreno, score_evidencias,
          tipo_jefe, tipo_terreno, plan_trabajo, observations, informe_brechas } = req.body;

  const sc = parseFloat(score_conocimientos) || 0;
  const sj = parseFloat(score_jefe_directo) || 0;
  const st = parseFloat(score_terreno) || 0;
  const se = parseFloat(score_evidencias) || 0;

  // Ponderacion: Conocimientos 20%, Jefe/Caso 10%, Terreno/Sim 60%, Evidencias 10%
  const ponderado = (sc * 0.20) + (sj * 0.10) + (st * 0.60) + (se * 0.10);
  const result = ponderado >= 3.0 ? 'competente' : 'aun_no_competente';

  db.prepare(`UPDATE evaluations SET
    result=?, score=?, score_conocimientos=?, score_jefe_directo=?, score_terreno=?, score_evidencias=?,
    score_ponderado=?, tipo_jefe=?, tipo_terreno=?, plan_trabajo=?, observations=?, informe_brechas=?,
    status='completada', completed_at=CURRENT_TIMESTAMP
    WHERE id=? AND org_id=?`
  ).run(result, ponderado, sc, sj, st, se, ponderado,
        tipo_jefe || 'jefe_directo', tipo_terreno || 'terreno',
        plan_trabajo, observations,
        result === 'aun_no_competente' ? (informe_brechas || null) : null,
        req.params.id, oid);

  const ev = db.prepare("SELECT candidate_id FROM evaluations WHERE id=?").get(req.params.id);
  if (ev) {
    db.prepare("UPDATE candidates SET status='pendiente_comite' WHERE id=?").run(ev.candidate_id);
  }
  logActivity(oid, req.user.id, "resultado", "evaluacion", req.params.id, `${result} (${ponderado.toFixed(2)})`);
  res.redirect("/evaluaciones");
});

// Comite de Decision — D016 Proc 1.3
router.get("/:id/comite", (req, res) => {
  const db = getDb();
  const oid = req.user.org_id;
  const evaluation = db.prepare(
    `SELECT e.*, c.name as candidate_name, c.rut as candidate_rut, p.name as profile_name, ev.name as evaluator_name
     FROM evaluations e
     LEFT JOIN candidates c ON e.candidate_id=c.id
     LEFT JOIN profiles p ON e.profile_id=p.id
     LEFT JOIN evaluators ev ON e.evaluator_id=ev.id
     WHERE e.id=? AND e.org_id=?`
  ).get(req.params.id, oid);
  if (!evaluation || evaluation.status !== 'completada') return res.redirect("/evaluaciones");

  const existingDecision = db.prepare("SELECT * FROM certification_decisions WHERE evaluation_id=?").get(req.params.id);
  res.render("evaluations/committee", { evaluation, decision: existingDecision });
});

router.post("/:id/comite", (req, res) => {
  const db = getDb();
  const oid = req.user.org_id;
  const evaluation = db.prepare("SELECT * FROM evaluations WHERE id=? AND org_id=?").get(req.params.id, oid);
  if (!evaluation || evaluation.status !== 'completada') return res.redirect("/evaluaciones");

  const { committee_date, members, evaluator_recommendation, audit_status, portfolio_reviewed, decision, justification } = req.body;

  db.prepare(`INSERT INTO certification_decisions
    (org_id, evaluation_id, candidate_id, committee_date, members, evaluator_recommendation, audit_status, portfolio_reviewed, decision, justification, decided_by)
    VALUES (?,?,?,?,?,?,?,?,?,?,?)`
  ).run(oid, req.params.id, evaluation.candidate_id, committee_date, members, evaluator_recommendation, audit_status||'sin_auditoria', portfolio_reviewed?1:0, decision, justification, req.user.id);

  const newStatus = decision === 'certificar' ? 'certificado' : 'no_certificado';
  db.prepare("UPDATE candidates SET status=?, updated_at=CURRENT_TIMESTAMP WHERE id=?").run(newStatus, evaluation.candidate_id);

  logActivity(oid, req.user.id, "comite_decision", "evaluacion", req.params.id, `Decision: ${decision}`);
  res.redirect("/evaluaciones");
});

// Detalle de evaluacion — vista con instrumentos
router.get("/:id", (req, res) => {
  const db = getDb();
  const oid = req.user.org_id;
  const evaluation = db.prepare(
    `SELECT e.*, c.name as candidate_name, c.rut as candidate_rut, c.status as candidate_status,
     p.name as profile_name, p.code as profile_code, ev.name as evaluator_name
     FROM evaluations e
     LEFT JOIN candidates c ON e.candidate_id=c.id
     LEFT JOIN profiles p ON e.profile_id=p.id
     LEFT JOIN evaluators ev ON e.evaluator_id=ev.id
     WHERE e.id=? AND e.org_id=?`
  ).get(req.params.id, oid);
  if (!evaluation) return res.redirect("/evaluaciones");
  const forms = db.prepare("SELECT * FROM evaluation_forms WHERE active=1 AND is_template=1 ORDER BY weight DESC, code").all();
  const formResponses = db.prepare("SELECT * FROM evaluation_form_responses WHERE evaluation_id=? AND org_id=?").all(req.params.id, oid);
  res.render("evaluations/detail", { evaluation, forms, formResponses });
});


// ======= FORMULARIOS DE EVALUACION (ChileValora D016) =======

router.get("/:id/formularios/:formId", (req, res) => {
  const db = getDb();
  const oid = req.user.org_id;
  const evaluation = db.prepare(
    `SELECT e.*, c.name as candidate_name, c.rut as candidate_rut,
     p.name as profile_name, ev.name as evaluator_name
     FROM evaluations e
     LEFT JOIN candidates c ON e.candidate_id=c.id
     LEFT JOIN profiles p ON e.profile_id=p.id
     LEFT JOIN evaluators ev ON e.evaluator_id=ev.id
     WHERE e.id=? AND e.org_id=?`
  ).get(req.params.id, oid);
  if (!evaluation) return res.redirect("/evaluaciones");

  const form = db.prepare("SELECT * FROM evaluation_forms WHERE id=? AND active=1").get(req.params.formId);
  if (!form) return res.redirect("/evaluaciones/" + req.params.id);

  const response = db.prepare(
    "SELECT * FROM evaluation_form_responses WHERE evaluation_id=? AND form_id=? AND org_id=?"
  ).get(req.params.id, req.params.formId, oid);

  res.render("evaluations/form-fill", { evaluation, form, response });
});

router.post("/:id/formularios/:formId", (req, res) => {
  const db = getDb();
  const oid = req.user.org_id;
  const evalId = req.params.id;
  const formId = req.params.formId;

  const evaluation = db.prepare("SELECT id FROM evaluations WHERE id=? AND org_id=?").get(evalId, oid);
  if (!evaluation) return res.redirect("/evaluaciones");

  const form = db.prepare("SELECT * FROM evaluation_forms WHERE id=? AND active=1").get(formId);
  if (!form) return res.redirect("/evaluaciones/" + evalId);

  const items = JSON.parse(form.items_json);
  const responses = {};
  for (const item of items) {
    if (item.type === "check") {
      responses[item.id] = req.body[item.id] ? true : false;
    } else if (item.type === "rubric") {
      responses[item.id] = parseInt(req.body[item.id]) || null;
    } else if (item.type === "text") {
      responses[item.id] = req.body[item.id] || "";
    }
  }

  // Calculate score from rubric items
  const rubricItems = items.filter(i => i.type === "rubric");
  let score = null;
  if (rubricItems.length > 0) {
    const rubricValues = rubricItems.map(i => responses[i.id]).filter(v => v !== null);
    if (rubricValues.length === rubricItems.length) {
      score = rubricValues.reduce((a, b) => a + b, 0) / rubricValues.length;
    }
  }

  const status = req.body.action === "complete" ? "completado" : "borrador";
  const existing = db.prepare("SELECT id FROM evaluation_form_responses WHERE evaluation_id=? AND form_id=? AND org_id=?").get(evalId, formId, oid);

  if (existing) {
    db.prepare(`UPDATE evaluation_form_responses SET responses_json=?, score=?, status=?, filled_by=?,
      completed_at=CASE WHEN ?=completado THEN CURRENT_TIMESTAMP ELSE completed_at END
      WHERE id=?`).run(JSON.stringify(responses), score, status, req.user.id, status, existing.id);
  } else {
    db.prepare(`INSERT INTO evaluation_form_responses (org_id, evaluation_id, form_id, responses_json, score, status, filled_by, completed_at)
      VALUES (?,?,?,?,?,?,?,CASE WHEN ?=completado THEN CURRENT_TIMESTAMP ELSE NULL END)`
    ).run(oid, evalId, formId, JSON.stringify(responses), score, status, req.user.id, status);
  }

  logActivity(oid, req.user.id, status === "completado" ? "completar_formulario" : "guardar_formulario", "evaluacion", evalId, form.name);
  res.flash(status === "completado" ? "Formulario completado" : "Borrador guardado");
  res.redirect("/evaluaciones/" + evalId);
});

module.exports = router;
