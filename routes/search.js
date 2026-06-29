const router = require("express").Router();
const { getDb } = require("../database/db");
const { decryptAll } = require("../services/crypto");

router.get("/", (req, res) => {
  const q = (req.query.q || "").trim();
  if (!q) return res.render("search", { q: "", results: [], searchQuery: q });

  const db = getDb();
  const oid = req.user.org_id;
  const ql = q.toLowerCase();
  const like = `%${q}%`;
  const results = [];

  const rawCandidates = db
    .prepare(
      `SELECT id, name, rut, email, status FROM candidates
       WHERE org_id=? AND anonymized=0`
    )
    .all(oid);
  const candidates = decryptAll(rawCandidates, ["rut", "email"]);
  candidates
    .filter(
      (c) =>
        (c.name && c.name.toLowerCase().includes(ql)) ||
        (c.rut && c.rut.toLowerCase().includes(ql)) ||
        (c.email && c.email.toLowerCase().includes(ql))
    )
    .slice(0, 10)
    .forEach((c) =>
      results.push({
        type: "Candidato",
        icon: "bi-people",
        color: "coral",
        title: c.name,
        subtitle: c.rut || "",
        badge: c.status,
        url: `/candidatos/${c.id}`,
      })
    );

  const rawEvaluators = db
    .prepare(
      `SELECT id, name, rut, email, specialties FROM evaluators WHERE org_id=?`
    )
    .all(oid);
  const evaluators = decryptAll(rawEvaluators, ["rut", "email"]);
  evaluators
    .filter(
      (e) =>
        (e.name && e.name.toLowerCase().includes(ql)) ||
        (e.rut && e.rut.toLowerCase().includes(ql)) ||
        (e.specialties && e.specialties.toLowerCase().includes(ql))
    )
    .slice(0, 10)
    .forEach((e) =>
      results.push({
        type: "Evaluador",
        icon: "bi-person-badge",
        color: "blue",
        title: e.name,
        subtitle: e.specialties || e.rut || "",
        badge: "",
        url: `/evaluadores/${e.id}`,
      })
    );

  const evaluations = db
    .prepare(
      `SELECT e.id, c.name as candidate_name, p.name as profile_name, e.status, e.result
       FROM evaluations e LEFT JOIN candidates c ON e.candidate_id=c.id LEFT JOIN profiles p ON e.profile_id=p.id
       WHERE e.org_id=? AND (c.name LIKE ? OR p.name LIKE ?) LIMIT 10`
    )
    .all(oid, like, like);
  evaluations.forEach((e) =>
    results.push({
      type: "Evaluacion",
      icon: "bi-clipboard-check",
      color: "purple",
      title: e.candidate_name || "Evaluacion #" + e.id,
      subtitle: e.profile_name || "",
      badge: e.result || e.status,
      url: `/evaluaciones/${e.id}`,
    })
  );

  const documents = db
    .prepare(
      `SELECT id, name, category FROM documents
       WHERE org_id=? AND (name LIKE ? OR category LIKE ?) LIMIT 10`
    )
    .all(oid, like, like);
  documents.forEach((d) =>
    results.push({
      type: "Documento",
      icon: "bi-folder2-open",
      color: "orange",
      title: d.name,
      subtitle: d.category || "",
      badge: "",
      url: `/documentos`,
    })
  );

  const complaints = db
    .prepare(
      `SELECT id, subject, type, status FROM complaints
       WHERE org_id=? AND (subject LIKE ? OR from_name LIKE ? OR description LIKE ?) LIMIT 10`
    )
    .all(oid, like, like, like);
  complaints.forEach((c) =>
    results.push({
      type: "Reclamo",
      icon: "bi-chat-square-text",
      color: "red",
      title: c.subject,
      subtitle: c.type || "",
      badge: c.status,
      url: `/reclamos`,
    })
  );

  res.render("search", { q, results, searchQuery: q });
});

module.exports = router;
