const { getDb } = require("../database/db");

const TOOL_DEFINITIONS = [
  {
    type: "function",
    function: {
      name: "getStats",
      description: "Obtener estadisticas generales del CEC: candidatos, evaluaciones, evaluadores, documentos, reclamos",
      parameters: { type: "object", properties: {} }
    }
  },
  {
    type: "function",
    function: {
      name: "countEvaluations",
      description: "Contar evaluaciones filtradas por estado (programada, completada, todas)",
      parameters: {
        type: "object",
        properties: {
          status: { type: "string", description: "Estado: programada, completada, o todas" }
        }
      }
    }
  },
  {
    type: "function",
    function: {
      name: "getCandidateInfo",
      description: "Buscar informacion de un candidato por ID o por nombre parcial",
      parameters: {
        type: "object",
        properties: {
          id: { type: "integer", description: "ID del candidato" },
          name: { type: "string", description: "Nombre del candidato (busqueda parcial)" }
        }
      }
    }
  },
  {
    type: "function",
    function: {
      name: "getAuditCompliance",
      description: "Verificar estado de compliance para auditoria: consentimientos, documentos, evaluaciones, reclamos",
      parameters: { type: "object", properties: {} }
    }
  },
  {
    type: "function",
    function: {
      name: "listPendingActions",
      description: "Listar acciones pendientes: evaluaciones sin completar, documentos por vencer, reclamos abiertos, comites pendientes",
      parameters: { type: "object", properties: {} }
    }
  },
  {
    type: "function",
    function: {
      name: "getFormResponses",
      description: "Obtener formularios de evaluacion completados para una evaluacion especifica",
      parameters: {
        type: "object",
        properties: {
          evaluation_id: { type: "integer", description: "ID de la evaluacion" }
        },
        required: ["evaluation_id"]
      }
    }
  }
];

function executeTool(toolName, args, orgId) {
  const db = getDb();

  const handlers = {
    getStats: () => ({
      candidatos_total: db.prepare("SELECT COUNT(*) as c FROM candidates WHERE org_id=?").get(orgId).c,
      candidatos_elegibles: db.prepare("SELECT COUNT(*) as c FROM candidates WHERE org_id=? AND status='elegible'").get(orgId).c,
      candidatos_certificados: db.prepare("SELECT COUNT(*) as c FROM candidates WHERE org_id=? AND status='certificado'").get(orgId).c,
      evaluaciones_total: db.prepare("SELECT COUNT(*) as c FROM evaluations WHERE org_id=?").get(orgId).c,
      evaluaciones_programadas: db.prepare("SELECT COUNT(*) as c FROM evaluations WHERE org_id=? AND status='programada'").get(orgId).c,
      evaluaciones_completadas: db.prepare("SELECT COUNT(*) as c FROM evaluations WHERE org_id=? AND status='completada'").get(orgId).c,
      evaluadores_activos: db.prepare("SELECT COUNT(*) as c FROM evaluators WHERE org_id=? AND active=1").get(orgId).c,
      documentos_vigentes: db.prepare("SELECT COUNT(*) as c FROM documents WHERE org_id=? AND status='vigente'").get(orgId).c,
      reclamos_abiertos: db.prepare("SELECT COUNT(*) as c FROM complaints WHERE org_id=? AND status='abierto'").get(orgId).c,
    }),

    countEvaluations: (a) => {
      if (!a.status || a.status === "todas")
        return db.prepare("SELECT status, COUNT(*) as count FROM evaluations WHERE org_id=? GROUP BY status").all(orgId);
      return { status: a.status, count: db.prepare("SELECT COUNT(*) as c FROM evaluations WHERE org_id=? AND status=?").get(orgId, a.status).c };
    },

    getCandidateInfo: (a) => {
      if (a.id)
        return db.prepare("SELECT c.*, p.name as perfil FROM candidates c LEFT JOIN profiles p ON c.profile_id=p.id WHERE c.id=? AND c.org_id=?").get(a.id, orgId);
      if (a.name)
        return db.prepare("SELECT c.id, c.name, c.rut, c.status, c.email, p.name as perfil FROM candidates c LEFT JOIN profiles p ON c.profile_id=p.id WHERE c.org_id=? AND c.name LIKE ? LIMIT 10").all(orgId, `%${a.name}%`);
      return null;
    },

    getAuditCompliance: () => {
      const total = db.prepare("SELECT COUNT(*) as c FROM candidates WHERE org_id=?").get(orgId).c;
      const consent = db.prepare("SELECT COUNT(*) as c FROM candidates WHERE org_id=? AND consent_given=1").get(orgId).c;
      return {
        consentimiento: { total, con_consentimiento: consent, porcentaje: total > 0 ? Math.round(consent / total * 100) : 0 },
        evaluaciones_programadas: db.prepare("SELECT COUNT(*) as c FROM evaluations WHERE org_id=? AND status='programada'").get(orgId).c,
        evaluaciones_completadas: db.prepare("SELECT COUNT(*) as c FROM evaluations WHERE org_id=? AND status='completada'").get(orgId).c,
        documentos_por_vencer: db.prepare("SELECT COUNT(*) as c FROM documents WHERE org_id=? AND expiry_date IS NOT NULL AND expiry_date <= date('now', '+30 days') AND status='vigente'").get(orgId).c,
        reclamos_abiertos: db.prepare("SELECT COUNT(*) as c FROM complaints WHERE org_id=? AND status='abierto'").get(orgId).c,
        conflictos_pendientes: db.prepare("SELECT COUNT(*) as c FROM conflicts_of_interest WHERE org_id=? AND status='declarado'").get(orgId).c,
      };
    },

    listPendingActions: () => ({
      evaluaciones_programadas: db.prepare("SELECT e.id, c.name as candidato, e.scheduled_date FROM evaluations e JOIN candidates c ON e.candidate_id=c.id WHERE e.org_id=? AND e.status='programada' ORDER BY e.scheduled_date LIMIT 10").all(orgId),
      documentos_por_vencer: db.prepare("SELECT name, expiry_date FROM documents WHERE org_id=? AND expiry_date IS NOT NULL AND expiry_date <= date('now', '+30 days') AND status='vigente'").all(orgId),
      reclamos_abiertos: db.prepare("SELECT id, subject, created_at FROM complaints WHERE org_id=? AND status='abierto' ORDER BY created_at DESC LIMIT 5").all(orgId),
      pendientes_comite: db.prepare("SELECT e.id, c.name as candidato FROM evaluations e JOIN candidates c ON e.candidate_id=c.id WHERE e.org_id=? AND e.status='completada' AND c.status='pendiente_comite'").all(orgId),
    }),

    getFormResponses: (a) => {
      return db.prepare("SELECT fr.score, fr.status, f.name as formulario, f.type, f.weight FROM evaluation_form_responses fr JOIN evaluation_forms f ON fr.form_id=f.id WHERE fr.evaluation_id=? AND fr.org_id=?").all(a.evaluation_id, orgId);
    }
  };

  const handler = handlers[toolName];
  if (!handler) return { error: "Tool no encontrada: " + toolName };
  try {
    return handler(args || {});
  } catch (e) {
    return { error: e.message };
  }
}

module.exports = { TOOL_DEFINITIONS, executeTool };