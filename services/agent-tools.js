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
      description: "Buscar informacion de un candidato por ID o por nombre parcial. Incluye datos de elegibilidad, consentimiento y perfil",
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
      description: "Obtener formularios de evaluacion completados para una evaluacion especifica, con puntajes y estado",
      parameters: {
        type: "object",
        properties: {
          evaluation_id: { type: "integer", description: "ID de la evaluacion" }
        },
        required: ["evaluation_id"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "getEvaluationDetail",
      description: "Obtener detalle completo de una evaluacion: candidato, evaluador, puntajes por instrumento, score ponderado, estado, informe de brechas, decision comite",
      parameters: {
        type: "object",
        properties: {
          evaluation_id: { type: "integer", description: "ID de la evaluacion" }
        },
        required: ["evaluation_id"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "getEvidences",
      description: "Listar evidencias y documentos de respaldo de una evaluacion: tipo, criterio, verificacion, archivos subidos",
      parameters: {
        type: "object",
        properties: {
          evaluation_id: { type: "integer", description: "ID de la evaluacion" }
        },
        required: ["evaluation_id"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "runAuditChecklist",
      description: "Ejecutar checklist completo de pre-auditoria Codigo 02.1 contra datos reales del CEC. Revisa 30 criterios (11 elegibilidad + 15 instrumentos + 4 certificacion) y devuelve cumplimiento por etapa con detalle de fallas",
      parameters: { type: "object", properties: {} }
    }
  },
  {
    type: "function",
    function: {
      name: "generateGapReport",
      description: "Generar informe de brechas para una evaluacion: identifica items con puntaje menor a 3.0 en formularios, agrupa por instrumento, sugiere areas de mejora",
      parameters: {
        type: "object",
        properties: {
          evaluation_id: { type: "integer", description: "ID de la evaluacion" }
        },
        required: ["evaluation_id"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "getEvaluatorPerformance",
      description: "Obtener rendimiento de un evaluador: puntajes por dimension (plazos, calidad informes, adherencia), historial de revisiones, acciones requeridas",
      parameters: {
        type: "object",
        properties: {
          evaluator_id: { type: "integer", description: "ID del evaluador" }
        },
        required: ["evaluator_id"]
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
        return db.prepare("SELECT c.id, c.name, c.rut, c.status, c.email, c.phone, c.education_level, c.work_experience_years, c.consent_given, c.entrevista_inicial, p.name as perfil FROM candidates c LEFT JOIN profiles p ON c.profile_id=p.id WHERE c.org_id=? AND c.name LIKE ? LIMIT 10").all(orgId, "%" + a.name + "%");
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
      return db.prepare("SELECT fr.id, fr.score, fr.status, fr.completed_at, f.name as formulario, f.code, f.type, f.weight, fr.responses_json FROM evaluation_form_responses fr JOIN evaluation_forms f ON fr.form_id=f.id WHERE fr.evaluation_id=? AND fr.org_id=?").all(a.evaluation_id, orgId);
    },

    getEvaluationDetail: (a) => {
      const ev = db.prepare("SELECT e.*, c.name as candidato_nombre, c.rut as candidato_rut, c.status as candidato_status, c.email as candidato_email, c.consent_given, c.entrevista_inicial, c.cedula_identidad, c.carta_compromiso, ev.name as evaluador_nombre, ev.email as evaluador_email, ev.specialties as evaluador_especialidades, p.name as perfil_nombre FROM evaluations e JOIN candidates c ON e.candidate_id=c.id LEFT JOIN evaluators ev ON e.evaluator_id=ev.id LEFT JOIN profiles p ON e.profile_id=p.id WHERE e.id=? AND e.org_id=?").get(a.evaluation_id, orgId);
      if (!ev) return { error: "Evaluacion no encontrada" };

      const decision = db.prepare("SELECT * FROM certification_decisions WHERE evaluation_id=? AND org_id=?").get(a.evaluation_id, orgId);

      const evidencias = db.prepare("SELECT COUNT(*) as total, SUM(CASE WHEN verified=1 THEN 1 ELSE 0 END) as verificadas FROM evidence WHERE evaluation_id=? AND org_id=?").get(a.evaluation_id, orgId);

      const formularios = db.prepare("SELECT f.code, f.name, fr.score, fr.status FROM evaluation_form_responses fr JOIN evaluation_forms f ON fr.form_id=f.id WHERE fr.evaluation_id=? AND fr.org_id=?").all(a.evaluation_id, orgId);

      return {
        evaluacion: ev,
        puntajes: {
          conocimientos: ev.score_conocimientos,
          jefe_o_caso: ev.score_jefe_directo,
          terreno_o_simulacion: ev.score_terreno,
          evidencias: ev.score_evidencias,
          ponderado: ev.score_ponderado,
          resultado: ev.score_ponderado >= 3.0 ? "COMPETENTE" : ev.score_ponderado ? "AUN NO COMPETENTE" : "SIN EVALUAR"
        },
        decision_comite: decision || null,
        evidencias,
        formularios
      };
    },

    getEvidences: (a) => {
      return db.prepare("SELECT ev.id, ev.criterion, ev.type, ev.file_name, ev.verified, ev.uploaded_at, u.name as subido_por FROM evidence ev LEFT JOIN users u ON ev.uploaded_by=u.id WHERE ev.evaluation_id=? AND ev.org_id=? ORDER BY ev.uploaded_at DESC").all(a.evaluation_id, orgId);
    },

    runAuditChecklist: () => {
      const results = { elegibilidad: [], instrumentos: [], certificacion: [], resumen: {} };
      const candidates = db.prepare("SELECT * FROM candidates WHERE org_id=?").all(orgId);
      const totalCand = candidates.length || 1;

      const elegChecks = [
        { id: "E01", nombre: "Entrevista inicial registrada", test: () => candidates.filter(c => c.entrevista_inicial).length },
        { id: "E02", nombre: "Declaracion jurada firmada", test: () => candidates.filter(c => c.carta_compromiso).length },
        { id: "E03", nombre: "Ficha inscripcion completa", test: () => candidates.filter(c => c.name && c.rut).length },
        { id: "E04", nombre: "Chequeo condiciones tecnicas", test: () => candidates.filter(c => c.work_experience_years > 0 || c.education_level).length },
        { id: "E05", nombre: "Requisitos perfil verificados", test: () => candidates.filter(c => c.profile_id).length },
        { id: "E06", nombre: "Conflicto interes evaluado", test: () => {
          const n = db.prepare("SELECT COUNT(*) as c FROM conflicts_of_interest WHERE org_id=?").get(orgId).c;
          return n > 0 ? totalCand : 0;
        }},
        { id: "E07", nombre: "Consentimiento informado", test: () => candidates.filter(c => c.consent_given).length },
        { id: "E08", nombre: "Evaluador asignado sin conflicto", test: () => {
          const n = db.prepare("SELECT COUNT(*) as c FROM evaluations WHERE org_id=? AND evaluator_id IS NOT NULL").get(orgId).c;
          return n > 0 ? totalCand : 0;
        }},
        { id: "E09", nombre: "Datos candidato actualizados", test: () => candidates.filter(c => c.email || c.phone).length },
        { id: "E10", nombre: "Documentos respaldo archivados", test: () => {
          const n = db.prepare("SELECT COUNT(*) as c FROM documents WHERE org_id=?").get(orgId).c;
          return n > 0 ? totalCand : 0;
        }},
        { id: "E11", nombre: "Candidato notificado elegibilidad", test: () => candidates.filter(c => c.status !== "registrado").length }
      ];

      for (const chk of elegChecks) {
        const cumple = chk.test();
        const pct = Math.round(cumple / totalCand * 100);
        results.elegibilidad.push({ id: chk.id, criterio: chk.nombre, cumple, total: totalCand, porcentaje: pct, estado: pct >= 80 ? "OK" : pct >= 50 ? "PARCIAL" : "FALLA" });
      }

      const evals = db.prepare("SELECT * FROM evaluations WHERE org_id=?").all(orgId);
      const totalEvals = evals.length || 1;

      const instChecks = [
        { id: "I01", nombre: "Ficha registro actualizada", test: () => evals.filter(e => e.status !== "programada" || e.plan_trabajo).length },
        { id: "I02", nombre: "Eval jefe directo/caso aplicada", test: () => evals.filter(e => e.score_jefe_directo !== null).length },
        { id: "I03", nombre: "Prueba conocimientos aplicada", test: () => evals.filter(e => e.score_conocimientos !== null).length },
        { id: "I04", nombre: "PROT o Simulacion aplicada", test: () => evals.filter(e => e.score_terreno !== null).length },
        { id: "I05", nombre: "Analisis caso aplicado (si corresponde)", test: () => evals.filter(e => e.tipo_jefe !== "caso" || e.score_jefe_directo !== null).length },
        { id: "I06", nombre: "Evidencias recopiladas", test: () => evals.filter(e => db.prepare("SELECT COUNT(*) as c FROM evidence WHERE evaluation_id=? AND org_id=?").get(e.id, orgId).c > 0).length },
        { id: "I07", nombre: "Rubrica 1-4 utilizada", test: () => evals.filter(e => db.prepare("SELECT COUNT(*) as c FROM evaluation_form_responses WHERE evaluation_id=? AND org_id=?").get(e.id, orgId).c > 0).length },
        { id: "I08", nombre: "Ponderaciones aplicadas (20/10/60/10)", test: () => evals.filter(e => e.score_ponderado !== null).length },
        { id: "I09", nombre: "Puntaje ponderado calculado", test: () => evals.filter(e => e.score_ponderado !== null).length },
        { id: "I10", nombre: "Resultado determinado (umbral 3.0)", test: () => evals.filter(e => e.result !== null).length },
        { id: "I11", nombre: "Informe brechas (si ANC)", test: () => evals.filter(e => { if (!e.score_ponderado || e.score_ponderado >= 3.0) return true; return e.informe_brechas !== null; }).length },
        { id: "I12", nombre: "Plan trabajo evaluador documentado", test: () => evals.filter(e => e.plan_trabajo !== null).length },
        { id: "I13", nombre: "Observaciones registradas", test: () => evals.filter(e => e.observations !== null).length },
        { id: "I14", nombre: "Evaluador firmo instrumentos", test: () => evals.filter(e => e.evaluator_id !== null).length },
        { id: "I15", nombre: "Candidato informado resultado", test: () => evals.filter(e => e.status === "completada" || e.result !== null).length }
      ];

      for (const chk of instChecks) {
        const cumple = chk.test();
        const pct = Math.round(cumple / totalEvals * 100);
        results.instrumentos.push({ id: chk.id, criterio: chk.nombre, cumple, total: totalEvals, porcentaje: pct, estado: pct >= 80 ? "OK" : pct >= 50 ? "PARCIAL" : "FALLA" });
      }

      const completadas = evals.filter(e => e.status === "completada");
      const totalComp = completadas.length || 1;
      const decisions = db.prepare("SELECT * FROM certification_decisions WHERE org_id=?").all(orgId);

      const certChecks = [
        { id: "C01", nombre: "Carta resultados emitida", test: () => decisions.filter(d => d.decision !== "pendiente").length },
        { id: "C02", nombre: "Informe retroalimentacion (si ANC)", test: () => {
          const anc = evals.filter(e => e.score_ponderado && e.score_ponderado < 3.0);
          if (anc.length === 0) return totalComp;
          return anc.filter(e => e.informe_brechas).length;
        }},
        { id: "C03", nombre: "Acta comite firmada", test: () => decisions.filter(d => d.members && d.justification).length },
        { id: "C04", nombre: "Portafolio completo archivado", test: () => completadas.filter(e => db.prepare("SELECT COUNT(*) as c FROM evidence WHERE evaluation_id=? AND org_id=?").get(e.id, orgId).c >= 1).length }
      ];

      for (const chk of certChecks) {
        const cumple = chk.test();
        const pct = Math.round(cumple / totalComp * 100);
        results.certificacion.push({ id: chk.id, criterio: chk.nombre, cumple, total: totalComp, porcentaje: pct, estado: pct >= 80 ? "OK" : pct >= 50 ? "PARCIAL" : "FALLA" });
      }

      const allChecks = [...results.elegibilidad, ...results.instrumentos, ...results.certificacion];
      const ok = allChecks.filter(c => c.estado === "OK").length;
      const parcial = allChecks.filter(c => c.estado === "PARCIAL").length;
      const falla = allChecks.filter(c => c.estado === "FALLA").length;
      results.resumen = {
        total_criterios: allChecks.length,
        cumplidos: ok, parciales: parcial, fallidos: falla,
        porcentaje_cumplimiento: Math.round(ok / allChecks.length * 100),
        nivel: ok >= 25 ? "ALTO" : ok >= 18 ? "MEDIO" : "BAJO",
        recomendacion: falla > 5 ? "NO APTO para auditoria - corregir fallas criticas" : falla > 0 ? "REVISAR - hay criterios que no se cumplen" : "APTO para auditoria"
      };
      return results;
    },

    generateGapReport: (a) => {
      const ev = db.prepare("SELECT e.*, c.name as candidato, p.name as perfil FROM evaluations e JOIN candidates c ON e.candidate_id=c.id LEFT JOIN profiles p ON e.profile_id=p.id WHERE e.id=? AND e.org_id=?").get(a.evaluation_id, orgId);
      if (!ev) return { error: "Evaluacion no encontrada" };

      const responses = db.prepare("SELECT fr.responses_json, fr.score, fr.status, f.name as formulario, f.code, f.type, f.weight, f.items_json FROM evaluation_form_responses fr JOIN evaluation_forms f ON fr.form_id=f.id WHERE fr.evaluation_id=? AND fr.org_id=?").all(a.evaluation_id, orgId);

      const brechas = [];
      for (const resp of responses) {
        if (resp.type === "elegibilidad") continue;
        let items, answers;
        try { items = JSON.parse(resp.items_json); } catch { continue; }
        try { answers = JSON.parse(resp.responses_json); } catch { continue; }

        for (const item of items) {
          if (item.type !== "rubric") continue;
          const val = answers[item.id];
          if (val && parseInt(val) < 3) {
            brechas.push({
              instrumento: resp.formulario,
              instrumento_codigo: resp.code,
              ponderacion: resp.weight + "%",
              criterio: item.label,
              puntaje: parseInt(val),
              nivel: parseInt(val) === 1 ? "Ausencia" : "En Desarrollo",
              recomendacion: parseInt(val) === 1
                ? "Requiere formacion completa en esta competencia"
                : "Necesita practica supervisada para alcanzar autonomia"
            });
          }
        }
      }

      return {
        candidato: ev.candidato,
        perfil: ev.perfil,
        score_ponderado: ev.score_ponderado,
        resultado: ev.score_ponderado >= 3.0 ? "COMPETENTE" : "AUN NO COMPETENTE",
        total_brechas: brechas.length,
        brechas_por_instrumento: brechas,
        puntajes: {
          conocimientos: { score: ev.score_conocimientos, peso: "20%" },
          jefe_o_caso: { score: ev.score_jefe_directo, peso: "10%", tipo: ev.tipo_jefe },
          terreno_o_sim: { score: ev.score_terreno, peso: "60%", tipo: ev.tipo_terreno },
          evidencias: { score: ev.score_evidencias, peso: "10%" }
        },
        recomendacion_general: brechas.length === 0
          ? "Sin brechas detectadas en formularios"
          : "Se detectaron " + brechas.length + " brechas. Se recomienda plan de mejora enfocado en las areas con puntaje 1 (Ausencia)."
      };
    },

    getEvaluatorPerformance: (a) => {
      const evaluator = db.prepare("SELECT * FROM evaluators WHERE id=? AND org_id=?").get(a.evaluator_id, orgId);
      if (!evaluator) return { error: "Evaluador no encontrado" };

      const reviews = db.prepare("SELECT * FROM evaluator_reviews WHERE evaluator_id=? AND org_id=? ORDER BY created_at DESC LIMIT 5").all(a.evaluator_id, orgId);

      const evalCount = db.prepare("SELECT COUNT(*) as total, SUM(CASE WHEN status='completada' THEN 1 ELSE 0 END) as completadas FROM evaluations WHERE evaluator_id=? AND org_id=?").get(a.evaluator_id, orgId);

      return {
        evaluador: { nombre: evaluator.name, email: evaluator.email, especialidades: evaluator.specialties, activo: evaluator.active },
        performance_score: evaluator.performance_score,
        evaluaciones: evalCount,
        revisiones: reviews.map(r => ({
          periodo: r.period,
          plazos: r.score_deadlines,
          calidad_informes: r.score_report_quality,
          adherencia: r.score_procedure_compliance,
          promedio: r.overall_score,
          accion: r.action_required,
          observaciones: r.observations
        })),
        nivel: evaluator.performance_score >= 4.5 ? "Sobresaliente - Reconocimiento" :
          evaluator.performance_score >= 3.5 ? "Bueno - Cumple expectativas" :
          evaluator.performance_score >= 3.0 ? "Aceptable - Requiere supervision" :
          evaluator.performance_score >= 2.0 ? "Bajo - Capacitacion requerida" : "Critico - Considerar suspension"
      };
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

function buildPageContext(contextPath, contextData, orgId) {
  if (!contextPath) return "";
  const db = getDb();
  let ctx = "\n\n## Contexto Actual de Pagina\n";

  const evalMatch = contextPath.match(/\/evaluaciones\/(\d+)/);
  if (evalMatch) {
    const evalId = parseInt(evalMatch[1]);
    const ev = db.prepare("SELECT e.*, c.name as candidato, c.rut, c.status as cand_status, ev.name as evaluador, p.name as perfil FROM evaluations e JOIN candidates c ON e.candidate_id=c.id LEFT JOIN evaluators ev ON e.evaluator_id=ev.id LEFT JOIN profiles p ON e.profile_id=p.id WHERE e.id=? AND e.org_id=?").get(evalId, orgId);
    if (ev) {
      ctx += "El usuario esta viendo la **Evaluacion #" + ev.id + "**:\n";
      ctx += "- Candidato: " + ev.candidato + " (RUT: " + (ev.rut || "N/A") + ", Estado: " + ev.cand_status + ")\n";
      ctx += "- Perfil: " + (ev.perfil || "Sin asignar") + "\n";
      ctx += "- Evaluador: " + (ev.evaluador || "Sin asignar") + "\n";
      ctx += "- Estado evaluacion: " + ev.status + "\n";
      ctx += "- Fecha programada: " + (ev.scheduled_date || "N/A") + "\n";
      if (ev.score_ponderado) {
        ctx += "- Puntaje ponderado: " + ev.score_ponderado + " (" + (ev.score_ponderado >= 3.0 ? "COMPETENTE" : "AUN NO COMPETENTE") + ")\n";
        ctx += "  - Conocimientos: " + (ev.score_conocimientos || "N/A") + " (20%)\n";
        ctx += "  - Jefe/Caso: " + (ev.score_jefe_directo || "N/A") + " (10%)\n";
        ctx += "  - Terreno/Sim: " + (ev.score_terreno || "N/A") + " (60%)\n";
        ctx += "  - Evidencias: " + (ev.score_evidencias || "N/A") + " (10%)\n";
      }
      ctx += "\nCuando el usuario pregunte sobre \"esta evaluacion\" o \"este candidato\", refierete a estos datos. Usa evaluation_id=" + ev.id + " en las herramientas.\n";
    }
    return ctx;
  }

  const candMatch = contextPath.match(/\/candidatos\/(\d+)/);
  if (candMatch) {
    const candId = parseInt(candMatch[1]);
    const cand = db.prepare("SELECT c.*, p.name as perfil FROM candidates c LEFT JOIN profiles p ON c.profile_id=p.id WHERE c.id=? AND c.org_id=?").get(candId, orgId);
    if (cand) {
      ctx += "El usuario esta viendo al **Candidato #" + cand.id + "**: " + cand.name + "\n";
      ctx += "- RUT: " + (cand.rut || "N/A") + " | Email: " + (cand.email || "N/A") + " | Telefono: " + (cand.phone || "N/A") + "\n";
      ctx += "- Perfil: " + (cand.perfil || "Sin asignar") + "\n";
      ctx += "- Estado: " + cand.status + " | Educacion: " + (cand.education_level || "N/A") + " | Experiencia: " + cand.work_experience_years + " anos\n";
      ctx += "- Consentimiento: " + (cand.consent_given ? "SI" : "NO") + " | Cedula: " + (cand.cedula_identidad ? "SI" : "NO") + "\n";
      ctx += "- Entrevista inicial: " + (cand.entrevista_inicial || "No registrada") + "\n";
      const evals = db.prepare("SELECT id, status, score_ponderado, result FROM evaluations WHERE candidate_id=? AND org_id=?").all(candId, orgId);
      if (evals.length) {
        ctx += "- Evaluaciones: " + evals.map(function(e) { return "#" + e.id + " (" + e.status + ", score: " + (e.score_ponderado || "N/A") + ")"; }).join(", ") + "\n";
      }
      ctx += "\nCuando el usuario pregunte sobre \"este candidato\", refierete a " + cand.name + ".\n";
    }
    return ctx;
  }

  const auditMatch = contextPath.match(/\/auditorias\/(\d+)/);
  if (auditMatch) {
    const auditId = parseInt(auditMatch[1]);
    const audit = db.prepare("SELECT * FROM audits WHERE id=? AND org_id=?").get(auditId, orgId);
    if (audit) {
      ctx += "El usuario esta viendo la **Auditoria #" + audit.id + "** (" + audit.type + "):\n";
      ctx += "- Estado: " + audit.status + " | Fecha: " + (audit.scheduled_date || "N/A") + "\n";
      ctx += "- Hallazgos: " + audit.findings_count + " | No conformidades: " + audit.non_conformities + "\n";
      const findings = db.prepare("SELECT type, description, status FROM audit_findings WHERE audit_id=? LIMIT 10").all(auditId);
      if (findings.length) {
        ctx += "- Detalle hallazgos:\n";
        findings.forEach(function(f) { ctx += "  - [" + f.type + "] " + f.description + " (" + f.status + ")\n"; });
      }
    }
    return ctx;
  }

  return "";
}

module.exports = { TOOL_DEFINITIONS, executeTool, buildPageContext };
