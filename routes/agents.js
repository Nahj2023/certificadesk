const router = require("express").Router();
const { getDb, logActivity } = require("../database/db");
const { TOOL_DEFINITIONS, executeTool, buildPageContext } = require("../services/agent-tools");
const Groq = require("groq-sdk");

let groq;
try {
  groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
} catch {
  groq = new (Groq.default || Groq)({ apiKey: process.env.GROQ_API_KEY });
}

// Hub
router.get("/", (req, res) => {
  const db = getDb();
  const agents = db.prepare("SELECT * FROM ai_agents WHERE active=1 AND is_public=0 ORDER BY id").all();
  const conversations = db.prepare(
    "SELECT c.*, a.name as agent_name, a.avatar FROM ai_conversations c JOIN ai_agents a ON c.agent_id=a.id WHERE c.user_id=? AND c.org_id=? ORDER BY c.updated_at DESC LIMIT 10"
  ).all(req.user.id, req.user.org_id);
  res.render("agents/hub", { agents, conversations });
});

// Metrics
router.get("/metricas", (req, res) => {
  const db = getDb();
  const orgId = req.user.org_id;

  const totalConvs = db.prepare("SELECT COUNT(*) as c FROM ai_conversations WHERE org_id=?").get(orgId).c;
  const totalMsgs = db.prepare("SELECT COUNT(*) as c FROM ai_messages m JOIN ai_conversations c ON m.conversation_id=c.id WHERE c.org_id=?").get(orgId).c;
  const totalTokens = db.prepare("SELECT COALESCE(SUM(m.tokens_used),0) as t FROM ai_messages m JOIN ai_conversations c ON m.conversation_id=c.id WHERE c.org_id=?").get(orgId).t;
  const totalFavs = db.prepare("SELECT COUNT(*) as c FROM ai_messages m JOIN ai_conversations c ON m.conversation_id=c.id WHERE c.org_id=? AND m.is_favorite=1").get(orgId).c;

  const byAgent = db.prepare(`SELECT a.name, a.avatar, a.code,
    COUNT(DISTINCT c.id) as conversaciones,
    COUNT(m.id) as mensajes,
    COALESCE(SUM(m.tokens_used),0) as tokens
    FROM ai_agents a
    LEFT JOIN ai_conversations c ON c.agent_id=a.id AND c.org_id=?
    LEFT JOIN ai_messages m ON m.conversation_id=c.id
    WHERE a.active=1
    GROUP BY a.id ORDER BY conversaciones DESC`).all(orgId);

  const daily = db.prepare(`SELECT date(c.created_at) as dia, COUNT(*) as convs
    FROM ai_conversations c WHERE c.org_id=? AND c.created_at >= date('now','-30 days')
    GROUP BY dia ORDER BY dia`).all(orgId);

  const topQuestions = db.prepare(`SELECT m.content, c.agent_id, a.name as agent_name, a.avatar
    FROM ai_messages m
    JOIN ai_conversations c ON m.conversation_id=c.id
    JOIN ai_agents a ON c.agent_id=a.id
    WHERE c.org_id=? AND m.role='user'
    ORDER BY m.created_at DESC LIMIT 20`).all(orgId);

  res.render("agents/metrics", {
    totalConvs, totalMsgs, totalTokens, totalFavs,
    byAgent, daily, topQuestions
  });
});

// Chat
router.get(["/:agentId/chat", "/:agentId/chat/:convId"], (req, res) => {
  const db = getDb();
  const agent = db.prepare("SELECT * FROM ai_agents WHERE id=? AND active=1").get(req.params.agentId);
  if (!agent) return res.redirect("/agentes");

  let conversation = null;
  let messages = [];

  if (req.params.convId) {
    conversation = db.prepare(
      "SELECT * FROM ai_conversations WHERE id=? AND agent_id=? AND org_id=?"
    ).get(req.params.convId, agent.id, req.user.org_id);
    if (conversation) {
      messages = db.prepare("SELECT * FROM ai_messages WHERE conversation_id=? ORDER BY created_at").all(conversation.id);
    }
  }

  const conversations = db.prepare(
    "SELECT id, title, created_at FROM ai_conversations WHERE agent_id=? AND org_id=? AND user_id=? ORDER BY updated_at DESC LIMIT 20"
  ).all(agent.id, req.user.org_id, req.user.id);

  res.render("agents/chat", {
    agent, conversation, messages, conversations,
    contextPath: req.query.context || null
  });
});

// API — enviar mensaje
router.post("/api/chat", async (req, res) => {
  if (!groq || !process.env.GROQ_API_KEY) {
    return res.status(500).json({ error: "GROQ_API_KEY no configurada" });
  }

  const db = getDb();
  const { agent_id, conversation_id, content, context_path, context_data } = req.body;

  if (!content || !content.trim()) return res.status(400).json({ error: "Mensaje vacio" });

  const agent = db.prepare("SELECT * FROM ai_agents WHERE id=? AND active=1").get(agent_id);
  if (!agent) return res.status(404).json({ error: "Agente no encontrado" });

  // For public agents, use org_id=1 and user_id from session or 0
  const orgId = req.user ? req.user.org_id : 1;
  const userId = req.user ? req.user.id : 0;

  let convId = conversation_id ? parseInt(conversation_id) : null;
  if (!convId) {
    const r = db.prepare(
      "INSERT INTO ai_conversations (org_id, user_id, agent_id, title, context_path, context_data) VALUES (?,?,?,?,?,?)"
    ).run(orgId, userId, agent_id, content.substring(0, 80), context_path || null, context_data ? JSON.stringify(context_data) : null);
    convId = r.lastInsertRowid;
  }

  db.prepare("INSERT INTO ai_messages (conversation_id, role, content) VALUES (?,?,?)").run(convId, "user", content.trim());

  const history = db.prepare(
    "SELECT role, content FROM ai_messages WHERE conversation_id=? AND role IN ('user','assistant') ORDER BY created_at DESC LIMIT 20"
  ).all(convId).reverse();

  let systemPrompt = agent.system_prompt;
  const convCtxPath = context_path || db.prepare("SELECT context_path FROM ai_conversations WHERE id=?").get(convId)?.context_path;
  if (convCtxPath && req.user) {
    systemPrompt += buildPageContext(convCtxPath, context_data, orgId);
  }

  const groqMessages = [
    { role: "system", content: systemPrompt },
    ...history
  ];

  const enabledTools = agent.tools_enabled ? JSON.parse(agent.tools_enabled) : [];
  const tools = enabledTools.length > 0
    ? TOOL_DEFINITIONS.filter(t => enabledTools.includes(t.function.name))
    : undefined;

  try {
    let response = await groq.chat.completions.create({
      model: agent.model || "llama-3.3-70b-versatile",
      messages: groqMessages,
      tools: tools && tools.length > 0 ? tools : undefined,
      temperature: agent.temperature || 0.3,
      max_tokens: agent.max_tokens || 2048,
    });

    let toolResults = [];
    let iterations = 0;

    while (response.choices[0].message.tool_calls && iterations < 3) {
      iterations++;
      const assistantMsg = response.choices[0].message;
      groqMessages.push(assistantMsg);

      for (const tc of assistantMsg.tool_calls) {
        const args = JSON.parse(tc.function.arguments || "{}");
        const result = executeTool(tc.function.name, args, orgId);
        toolResults.push({ name: tc.function.name, args, result });
        groqMessages.push({
          role: "tool",
          tool_call_id: tc.id,
          content: JSON.stringify(result)
        });
      }

      response = await groq.chat.completions.create({
        model: agent.model || "llama-3.3-70b-versatile",
        messages: groqMessages,
        tools: tools && tools.length > 0 ? tools : undefined,
        temperature: agent.temperature || 0.3,
        max_tokens: agent.max_tokens || 2048,
      });
    }

    const assistantContent = response.choices[0].message.content || "";
    const tokensUsed = response.usage?.total_tokens || 0;

    const savedMsg = db.prepare(
      "INSERT INTO ai_messages (conversation_id, role, content, tool_calls, tokens_used) VALUES (?,?,?,?,?)"
    ).run(convId, "assistant", assistantContent,
      toolResults.length > 0 ? JSON.stringify(toolResults) : null,
      tokensUsed);

    db.prepare("UPDATE ai_conversations SET updated_at=CURRENT_TIMESTAMP WHERE id=?").run(convId);

    if (req.user) {
      logActivity(orgId, userId, "chat_ia", "agente", agent.id, agent.code + ": " + content.substring(0, 50));
    }

    res.json({
      conversation_id: convId,
      msg_id: Number(savedMsg.lastInsertRowid),
      content: assistantContent,
      tool_results: toolResults,
      tokens_used: tokensUsed,
    });

  } catch (err) {
    console.error("[Agentes] Error Groq:", err.message);
    res.status(500).json({ error: "Error al procesar: " + err.message });
  }
});

// API — toggle favorite
router.post("/api/messages/:msgId/favorite", (req, res) => {
  const db = getDb();
  const msg = db.prepare(`SELECT m.id, m.is_favorite FROM ai_messages m
    JOIN ai_conversations c ON m.conversation_id=c.id
    WHERE m.id=? AND c.org_id=?`).get(req.params.msgId, req.user.org_id);
  if (!msg) return res.status(404).json({ error: "Mensaje no encontrado" });
  const newVal = msg.is_favorite ? 0 : 1;
  db.prepare("UPDATE ai_messages SET is_favorite=? WHERE id=?").run(newVal, msg.id);
  res.json({ ok: true, is_favorite: newVal });
});

function escapeHtmlExport(text) {
  if (!text) return "";
  var s = String(text);
  s = s.replace(/&/g, "&amp;");
  s = s.replace(/</g, "&lt;");
  s = s.replace(/>/g, "&gt;");
  s = s.replace(/"/g, "&quot;");
  s = s.replace(/\n/g, "<br>");
  return s;
}

// API — export conversation
router.get("/api/conversations/:convId/export", (req, res) => {
  const db = getDb();
  const conv = db.prepare(`SELECT c.*, a.name as agent_name, a.avatar
    FROM ai_conversations c JOIN ai_agents a ON c.agent_id=a.id
    WHERE c.id=? AND c.org_id=?`).get(req.params.convId, req.user.org_id);
  if (!conv) return res.status(404).json({ error: "No encontrada" });

  const messages = db.prepare("SELECT * FROM ai_messages WHERE conversation_id=? ORDER BY created_at").all(conv.id);

  let html = '<!DOCTYPE html><html><head><meta charset="utf-8">';
  html += '<title>Conversacion - ' + conv.agent_name + '</title>';
  html += '<style>body{font-family:Inter,sans-serif;max-width:800px;margin:40px auto;padding:0 20px;color:#333}';
  html += 'h1{color:#E85D3A;font-size:1.4rem}.meta{color:#888;font-size:0.85rem;margin-bottom:30px}';
  html += '.msg{margin:16px 0;padding:12px 16px;border-radius:12px}.user{background:#FEF0EC;border-left:3px solid #E85D3A}';
  html += '.assistant{background:#F5F5F5;border-left:3px solid #6C757D}.role{font-weight:600;font-size:0.8rem;margin-bottom:4px}';
  html += '.fav{border-left-color:#FFD700!important}.time{font-size:0.75rem;color:#AAA;margin-top:6px}</style></head><body>';
  html += '<h1>' + conv.avatar + ' ' + conv.agent_name + '</h1>';
  html += '<div class="meta">Conversacion: ' + (conv.title || 'Sin titulo') + '<br>';
  html += 'Fecha: ' + (conv.created_at || '').substring(0, 16).replace('T', ' ') + '</div>';

  for (const m of messages) {
    const cls = m.role + (m.is_favorite ? ' fav' : '');
    html += '<div class="msg ' + cls + '">';
    html += '<div class="role">' + (m.role === 'user' ? 'Tu' : conv.agent_name) + '</div>';
    html += '<div>' + escapeHtmlExport(m.content) + '</div>';
    if (m.created_at) html += '<div class="time">' + m.created_at.substring(0, 16).replace('T', ' ') + '</div>';
    html += '</div>';
  }

  html += '</body></html>';
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="conversacion-' + conv.id + '.html"');
  res.send(html);
});

// API — listar conversaciones
router.get("/api/conversations/:agentId", (req, res) => {
  const db = getDb();
  const conversations = db.prepare(
    "SELECT id, title, created_at, updated_at FROM ai_conversations WHERE agent_id=? AND org_id=? AND user_id=? ORDER BY updated_at DESC LIMIT 30"
  ).all(req.params.agentId, req.user.org_id, req.user.id);
  res.json(conversations);
});

// API — eliminar conversacion
router.delete("/api/conversations/:convId", (req, res) => {
  const db = getDb();
  const conv = db.prepare("SELECT id FROM ai_conversations WHERE id=? AND org_id=? AND user_id=?")
    .get(req.params.convId, req.user.org_id, req.user.id);
  if (!conv) return res.status(404).json({ error: "No encontrada" });

  db.prepare("DELETE FROM ai_messages WHERE conversation_id=?").run(conv.id);
  db.prepare("DELETE FROM ai_conversations WHERE id=?").run(conv.id);
  res.json({ ok: true });
});


// API - widget agents list
router.get('/api/widget-agents', (req, res) => {
  const db = getDb();
  const agents = db.prepare('SELECT id, code, name, avatar, description FROM ai_agents WHERE active=1 AND is_public=0 ORDER BY id').all();
  res.json(agents);
});

module.exports = router;
