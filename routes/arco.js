const router = require("express").Router();
const { getDb } = require("../database/db");

router.get("/", (req, res) => {
  res.render("arco/request", { error: null, success: false });
});

router.post("/", (req, res) => {
  const { requester_name, requester_rut, requester_email, type, description } = req.body;
  if (!requester_name || !requester_email || !type) {
    return res.render("arco/request", {
      error: "Complete los campos obligatorios",
      success: false,
    });
  }

  const validTypes = ["acceso", "rectificacion", "cancelacion", "oposicion"];
  if (!validTypes.includes(type)) {
    return res.render("arco/request", {
      error: "Tipo de solicitud no válido",
      success: false,
    });
  }

  try {
    const result = getDb()
      .prepare(
        `INSERT INTO arco_requests (type, requester_name, requester_rut, requester_email, description)
         VALUES (?,?,?,?,?)`
      )
      .run(type, requester_name, requester_rut || null, requester_email, description || null);

    console.log(`[ARCO] Solicitud #${result.lastInsertRowid} - ${type} - ${requester_email}`);
    res.render("arco/request", { error: null, success: true, refId: result.lastInsertRowid });
  } catch (e) {
    res.render("arco/request", { error: "Error al procesar la solicitud", success: false });
  }
});

module.exports = router;
