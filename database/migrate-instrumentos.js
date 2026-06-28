// CertificaDesk — Migration: Instrumentos de Evaluacion + Elegibilidad Mejorada
// Based on Manual del Candidato (D016 / CERTIFICAT MA-02-MC)
const Database = require('better-sqlite3');
const db = new Database('/home/jvh/certificadesk/certificadesk.db');
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

console.log('[Migration] Instrumentos + Elegibilidad...');

function addCol(table, col, type) {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all().map(c => c.name);
  if (!cols.includes(col)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${col} ${type}`);
    console.log(`  + ${table}.${col}`);
  }
}

// Evaluations — 4 instrumentos D016 con ponderaciones
addCol('evaluations', 'score_conocimientos', 'REAL');       // 20% — Prueba escrita
addCol('evaluations', 'score_jefe_directo', 'REAL');        // 10% — Eval jefe / Analisis caso
addCol('evaluations', 'score_terreno', 'REAL');             // 60% — Observacion terreno / Simulacion
addCol('evaluations', 'score_evidencias', 'REAL');          // 10% — Evidencias indirectas
addCol('evaluations', 'score_ponderado', 'REAL');           // Promedio ponderado final
addCol('evaluations', 'tipo_jefe', "TEXT DEFAULT 'jefe_directo'");  // jefe_directo | analisis_caso
addCol('evaluations', 'tipo_terreno', "TEXT DEFAULT 'terreno'");    // terreno | simulacion
addCol('evaluations', 'plan_trabajo', 'TEXT');               // Plan de trabajo del evaluador
addCol('evaluations', 'informe_brechas', 'TEXT');            // Brechas detectadas (solo si ANC)

// Candidates — Elegibilidad mejorada (Manual del Candidato etapa 2)
addCol('candidates', 'charla_informativa', 'DATE');          // Fecha charla informativa
addCol('candidates', 'entrevista_inicial', 'DATE');          // Fecha entrevista
addCol('candidates', 'entrevista_notas', 'TEXT');            // Notas de entrevista
addCol('candidates', 'carta_compromiso', 'INTEGER DEFAULT 0');
addCol('candidates', 'autorizacion_chilevalora', 'INTEGER DEFAULT 0'); // Publicacion datos
addCol('candidates', 'autorizacion_jefe', 'INTEGER DEFAULT 0');        // Resultado a jefe
addCol('candidates', 'informe_elegibilidad', 'TEXT');        // Observaciones informe
addCol('candidates', 'cedula_identidad', 'INTEGER DEFAULT 0');
addCol('candidates', 'cv_entregado', 'INTEGER DEFAULT 0');

console.log('[Migration] Complete!');
db.close();
