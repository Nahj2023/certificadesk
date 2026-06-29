const FORM_TEMPLATES = [
  {
    code: "ELIG-01",
    name: "Entrevista Inicial — Elegibilidad",
    type: "elegibilidad",
    weight: 0,
    description: "Checklist de requisitos de elegibilidad del candidato segun D016 y Codigo 01.1",
    items: [
      { id: "identidad", label: "Identidad del candidato verificada (RUT/CI vigente)", type: "check", required: true },
      { id: "experiencia", label: "Experiencia laboral minima cumplida segun perfil", type: "check", required: true },
      { id: "educacion", label: "Nivel educacional minimo cumplido segun perfil", type: "check", required: true },
      { id: "condiciones_tecnicas", label: "Condiciones tecnicas verificadas (licencias, examenes, certificaciones)", type: "check", required: true },
      { id: "declaracion_jurada", label: "Declaracion jurada de veracidad firmada", type: "check", required: true },
      { id: "ficha_inscripcion", label: "Ficha de inscripcion completada y firmada", type: "check", required: true },
      { id: "consentimiento", label: "Consentimiento informado firmado", type: "check", required: true },
      { id: "conflicto_interes", label: "Conflicto de interes evaluado — sin conflicto detectado", type: "check", required: true },
      { id: "candidato_informado", label: "Candidato informado del proceso, plazos y resultados posibles", type: "check", required: true },
      { id: "documentacion", label: "Documentacion de respaldo archivada correctamente", type: "check", required: true },
      { id: "observaciones", label: "Observaciones de la entrevista", type: "text", required: false }
    ]
  },
  {
    code: "CONOC-01",
    name: "Prueba de Conocimientos",
    type: "conocimientos",
    weight: 20,
    description: "Evaluacion escrita de conocimientos tecnicos — Ponderacion 20%",
    items: [
      { id: "conocimientos_tecnicos", label: "Conocimientos tecnicos especificos del perfil ocupacional", type: "rubric", required: true },
      { id: "normativa", label: "Normativa y regulacion vigente aplicable al sector", type: "rubric", required: true },
      { id: "seguridad", label: "Seguridad, salud ocupacional y prevencion de riesgos", type: "rubric", required: true },
      { id: "herramientas", label: "Uso y mantenimiento de herramientas y equipos", type: "rubric", required: true },
      { id: "procedimientos", label: "Procedimientos operacionales estandar del sector", type: "rubric", required: true },
      { id: "observaciones", label: "Observaciones", type: "text", required: false }
    ]
  },
  {
    code: "JEF-01",
    name: "Evaluacion Jefe Directo",
    type: "jefatura",
    weight: 10,
    description: "Evaluacion del desempeno por jefe directo — Ponderacion 10% — Alternativa: Analisis de Caso",
    items: [
      { id: "desempeno", label: "Desempeno en funciones principales del perfil", type: "rubric", required: true },
      { id: "protocolos", label: "Cumplimiento de protocolos y procedimientos", type: "rubric", required: true },
      { id: "equipo", label: "Trabajo en equipo y comunicacion efectiva", type: "rubric", required: true },
      { id: "responsabilidad", label: "Responsabilidad, asistencia y puntualidad", type: "rubric", required: true },
      { id: "capacidad_tecnica", label: "Capacidad tecnica demostrada en el cargo", type: "rubric", required: true },
      { id: "observaciones", label: "Observaciones del jefe directo", type: "text", required: false }
    ]
  },
  {
    code: "PROT-01",
    name: "Observacion en Terreno (PROT)",
    type: "terreno",
    weight: 60,
    description: "Pauta de observacion en contexto real de trabajo — Ponderacion 60% — Alternativa: Simulacion",
    items: [
      { id: "preparacion", label: "Preparacion del area y puesto de trabajo", type: "rubric", required: true },
      { id: "ejecucion", label: "Ejecucion de actividades clave del perfil", type: "rubric", required: true },
      { id: "herramientas", label: "Uso correcto de herramientas, equipos y materiales", type: "rubric", required: true },
      { id: "seguridad", label: "Aplicacion de normas de seguridad y uso de EPP", type: "rubric", required: true },
      { id: "calidad", label: "Calidad del producto o servicio entregado", type: "rubric", required: true },
      { id: "tiempo", label: "Gestion del tiempo y recursos disponibles", type: "rubric", required: true },
      { id: "contingencias", label: "Resolucion de contingencias o situaciones imprevistas", type: "rubric", required: true },
      { id: "observaciones", label: "Observaciones de terreno", type: "text", required: false }
    ]
  },
  {
    code: "SIM-01",
    name: "Simulacion",
    type: "simulacion",
    weight: 60,
    description: "Evaluacion en ambiente simulado controlado — Ponderacion 60% — Alternativa a PROT",
    items: [
      { id: "comprension", label: "Comprension de la situacion simulada", type: "rubric", required: true },
      { id: "ejecucion", label: "Ejecucion de procedimientos segun perfil", type: "rubric", required: true },
      { id: "herramientas", label: "Uso de herramientas y recursos asignados", type: "rubric", required: true },
      { id: "seguridad", label: "Aplicacion de medidas de seguridad", type: "rubric", required: true },
      { id: "calidad", label: "Calidad del resultado obtenido", type: "rubric", required: true },
      { id: "adaptacion", label: "Adaptacion y resolucion de imprevistos", type: "rubric", required: true },
      { id: "observaciones", label: "Observaciones de la simulacion", type: "text", required: false }
    ]
  },
  {
    code: "CASO-01",
    name: "Analisis de Caso",
    type: "caso",
    weight: 10,
    description: "Evaluacion mediante analisis de caso tecnico — Ponderacion 10% — Alternativa a Evaluacion Jefe Directo",
    items: [
      { id: "comprension", label: "Comprension del caso o problema presentado", type: "rubric", required: true },
      { id: "variables", label: "Identificacion de variables y factores relevantes", type: "rubric", required: true },
      { id: "solucion", label: "Propuesta de solucion tecnicamente fundamentada", type: "rubric", required: true },
      { id: "aplicacion", label: "Aplicacion de conocimientos del perfil al caso", type: "rubric", required: true },
      { id: "observaciones", label: "Observaciones del analisis", type: "text", required: false }
    ]
  },
  {
    code: "EVID-01",
    name: "Evidencias Indirectas",
    type: "evidencias",
    weight: 10,
    description: "Verificacion y valoracion de evidencias documentales — Ponderacion 10%",
    items: [
      { id: "certificados", label: "Certificados de capacitacion relevantes", type: "check", required: false },
      { id: "cartas", label: "Cartas de recomendacion laboral", type: "check", required: false },
      { id: "contratos", label: "Contratos o finiquitos que acrediten experiencia", type: "check", required: false },
      { id: "diplomas", label: "Diplomas, titulos o certificaciones", type: "check", required: false },
      { id: "licencias", label: "Licencias o habilitaciones vigentes", type: "check", required: false },
      { id: "portafolio", label: "Portafolio de trabajos realizados", type: "check", required: false },
      { id: "fotos", label: "Fotografias o registros audiovisuales de trabajos", type: "check", required: false },
      { id: "otros", label: "Otros documentos que acrediten competencia", type: "check", required: false },
      { id: "pertinencia", label: "Pertinencia de las evidencias presentadas", type: "rubric", required: true },
      { id: "suficiencia", label: "Suficiencia para acreditar competencia", type: "rubric", required: true },
      { id: "autenticidad", label: "Autenticidad y vigencia de los documentos", type: "rubric", required: true },
      { id: "observaciones", label: "Observaciones sobre las evidencias", type: "text", required: false }
    ]
  }
];

module.exports = { FORM_TEMPLATES };