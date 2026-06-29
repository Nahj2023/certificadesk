const { getDb } = require("../database/db");
const nodemailer = require("nodemailer");

const THRESHOLDS = {
  failedLoginsPerIp: 10,
  failedLoginsWindow: 60,
  bulkDataAccess: 50,
  bulkDataWindow: 10,
};

function checkBreaches() {
  const db = getDb();
  const alerts = [];

  // 1. Brute force: many failed logins from same IP in last hour
  const bruteForce = db
    .prepare(
      `SELECT ip, COUNT(*) as cnt FROM activity_log
       WHERE action = 'login_failed'
       AND created_at > datetime('now', '-${THRESHOLDS.failedLoginsWindow} minutes')
       GROUP BY ip HAVING cnt >= ?`
    )
    .all(THRESHOLDS.failedLoginsPerIp);

  for (const row of bruteForce) {
    alerts.push({
      type: "brute_force",
      severity: "alta",
      message: `${row.cnt} intentos de login fallidos desde IP ${row.ip} en la última hora`,
      ip: row.ip,
    });
  }

  // 2. Bulk data access: many record views in short time (data exfiltration)
  const bulkAccess = db
    .prepare(
      `SELECT user_id, COUNT(*) as cnt, GROUP_CONCAT(DISTINCT entity_type) as types
       FROM data_treatment_log
       WHERE action = 'read'
       AND created_at > datetime('now', '-${THRESHOLDS.bulkDataWindow} minutes')
       GROUP BY user_id HAVING cnt >= ?`
    )
    .all(THRESHOLDS.bulkDataAccess);

  for (const row of bulkAccess) {
    const user = db.prepare("SELECT display_name, username FROM users WHERE id=?").get(row.user_id);
    alerts.push({
      type: "bulk_access",
      severity: "alta",
      message: `${user?.display_name || 'Usuario ' + row.user_id} accedió a ${row.cnt} registros en ${THRESHOLDS.bulkDataWindow} min (${row.types})`,
      userId: row.user_id,
    });
  }

  // 3. Multiple locked accounts (coordinated attack)
  const locked = db
    .prepare(
      `SELECT COUNT(*) as cnt FROM users
       WHERE locked_until IS NOT NULL
       AND locked_until > datetime('now')`
    )
    .get();

  if (locked.cnt >= 3) {
    alerts.push({
      type: "mass_lockout",
      severity: "critica",
      message: `${locked.cnt} cuentas bloqueadas simultáneamente — posible ataque coordinado`,
    });
  }

  // 4. Admin actions outside business hours (Chile: 8-20)
  const offHoursAdmin = db
    .prepare(
      `SELECT a.*, u.display_name FROM activity_log a
       JOIN users u ON a.user_id = u.id
       WHERE u.role = 'admin'
       AND a.action IN ('create_user', 'reset_password', 'admin_reset_2fa', 'respond_arco', 'run_retention')
       AND a.created_at > datetime('now', '-24 hours')
       AND (CAST(strftime('%H', a.created_at) AS INTEGER) < 8
            OR CAST(strftime('%H', a.created_at) AS INTEGER) >= 20)`
    )
    .all();

  if (offHoursAdmin.length > 0) {
    alerts.push({
      type: "off_hours_admin",
      severity: "media",
      message: `${offHoursAdmin.length} acciones administrativas fuera de horario en las últimas 24h`,
    });
  }

  return alerts;
}

async function sendBreachAlert(alerts, dpoEmail) {
  if (!alerts.length || !dpoEmail) return;

  const transport = nodemailer.createTransport({
    host: "localhost",
    port: 25,
    secure: false,
    tls: { rejectUnauthorized: false },
  });

  const html = `
    <div style="font-family:Inter,sans-serif;max-width:600px;margin:0 auto">
      <div style="background:#E85D3A;color:#fff;padding:20px;border-radius:12px 12px 0 0">
        <h2 style="margin:0">CertificaDesk — Alerta de Seguridad</h2>
      </div>
      <div style="background:#fff;padding:24px;border:1px solid #DFE6E9;border-top:none;border-radius:0 0 12px 12px">
        <p>Se han detectado las siguientes anomalías:</p>
        ${alerts
          .map(
            (a) => `
          <div style="background:${a.severity === 'critica' ? '#FDEDEC' : a.severity === 'alta' ? '#FEF9E7' : '#EBF5FB'};
            padding:12px;border-radius:8px;margin-bottom:8px;border-left:4px solid ${a.severity === 'critica' ? '#E74C3C' : a.severity === 'alta' ? '#F39C12' : '#3498DB'}">
            <strong style="text-transform:uppercase;font-size:0.75rem;color:${a.severity === 'critica' ? '#E74C3C' : a.severity === 'alta' ? '#F39C12' : '#3498DB'}">${a.severity} — ${a.type}</strong>
            <p style="margin:4px 0 0;font-size:0.9rem">${a.message}</p>
          </div>`
          )
          .join("")}
        <p style="font-size:0.82rem;color:#636E72;margin-top:16px">
          Revise el log de acceso en <a href="https://certificadesk.jvh-labs.cl/admin/logs">Admin → Log de acceso</a>
        </p>
        <p style="font-size:0.75rem;color:#B2BEC3">
          Generado: ${new Date().toLocaleString("es-CL")} — CertificaDesk Ley 21.719
        </p>
      </div>
    </div>`;

  try {
    await transport.sendMail({
      from: '"CertificaDesk Seguridad" <seguridad@certificadesk.jvh-labs.cl>',
      to: dpoEmail,
      subject: `[ALERTA] ${alerts.length} anomalía${alerts.length > 1 ? "s" : ""} detectada${alerts.length > 1 ? "s" : ""}`,
      html,
    });
    console.log(`[Breach] Alerta enviada a ${dpoEmail}: ${alerts.length} anomalías`);
  } catch (err) {
    console.error(`[Breach] Error enviando alerta: ${err.message}`);
  }
}

function runBreachCheck() {
  const alerts = checkBreaches();
  if (alerts.length > 0) {
    const dpoEmail = process.env.DPO_EMAIL;
    if (dpoEmail) {
      sendBreachAlert(alerts, dpoEmail);
    }
    const db = getDb();
    for (const a of alerts) {
      db.prepare(
        "INSERT INTO activity_log (org_id, user_id, action, entity_type, details, ip) VALUES (1, NULL, 'breach_alert', 'system', ?, NULL)"
      ).run(`[${a.severity}] ${a.type}: ${a.message}`);
    }
    console.log(`[Breach] ${alerts.length} alerta(s) registrada(s)`);
  }
  return alerts;
}

module.exports = { checkBreaches, sendBreachAlert, runBreachCheck };
