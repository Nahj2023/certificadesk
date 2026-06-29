const { logActivity } = require("../database/db");

const WRITE_ROLES = {
  candidatos: ["admin", "responsable"],
  evaluaciones: ["admin", "responsable", "evaluador"],
  evaluadores: ["admin", "responsable"],
  auditorias: ["admin", "responsable"],
  reclamos: ["admin", "responsable"],
  documentos: ["admin", "responsable"],
  satisfaccion: ["admin", "responsable"],
  conflictos: ["admin", "responsable", "evaluador"],
  registros: ["admin", "responsable"],
  evidencias: ["admin", "responsable", "evaluador"],
  franquicia: ["admin", "responsable"],
  reportes: ["admin", "responsable"],
};

function requireWriteRole(section) {
  const allowed = WRITE_ROLES[section] || ["admin"];
  return (req, res, next) => {
    if (req.method === "GET" || req.method === "HEAD") return next();
    if (allowed.includes(req.user.role)) return next();
    return res.status(403).render("error", {
      title: "Acceso denegado",
      message: "No tiene permisos para realizar esta acción",
    });
  };
}

function requireAdmin(req, res, next) {
  if (req.user.role !== "admin") {
    return res.status(403).render("error", {
      title: "Acceso denegado",
      message: "Esta sección requiere rol de administrador",
    });
  }
  next();
}

function logAccess(entityType) {
  return (req, res, next) => {
    res.on("finish", () => {
      if (res.statusCode === 200 && req.method === "GET") {
        const match = req.path.match(/^\/(\d+)$/);
        if (match) {
          logActivity(
            req.user.org_id,
            req.user.id,
            "view_detail",
            entityType,
            parseInt(match[1]),
            null,
            req.ip
          );
        }
      }
    });
    next();
  };
}

module.exports = { requireWriteRole, requireAdmin, logAccess, WRITE_ROLES };
