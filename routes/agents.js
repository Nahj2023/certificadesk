const router = require("express").Router();
const { getDb, logActivity } = require("../database/db");
const { TOOL_DEFINITIONS, executeTool } = require("../services/agent-tools");
const Groq = require("groq-sdk");

let groq;
try {
  groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
} catch {
  groq = new (Groq.default || Groq)({ apiKey: process.env.GROQ_API_KEY });
}

// Hub — lista de agentes
router.get("/", (req, res) => {
  const db = getDb();
  const agents = db.prepare("SELECT * FROM ai_agents WHERE active=1 AND is_public=0 ORDER BY id").all();
  const conversations = db.prepare(
    "SELECT c.*, a.name as agent_name, a.avatar FROM ai_conversations c JOIN ai_agents a ON c.agent_id=a.id WHERE c.user_id=? AND c.org_id=? ORDER BY c.updated_at DESC LIMIT 10"
  ).all(req.user.id, req.user.org_id);
  res.render("agents/hub", { agents, conversations });
});

// Chat — nueva conversacion o existente
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

  res.render("agents/chat", { agent, conversation, messages, conversations });
});

// API — enviar mensaje
router.post("/api/chat", async (req, res) => {
  if (!groq || !process.env.GROQ_API_KEY) {
    return res.status(500).json({ error: "GROQ_API_KEY no configurada" });
  }

  const db = getDb();
  const { agent_id, conversation_id, content } = req.body;

  if (!content || !content.trim()) return res.status(400).json({ error: "Mensaje vacio" });

  const agent = db.prepare("SELECT * FROM ai_agents WHERE id=? AND active=1").get(agent_id);
  if (!agent) return res.status(404).json({ error: "Agente no encontrado" });

  // Create or get conversation
  let convId = conversation_id ? parseInt(conversation_id) : null;
  if (!convId) {
    const r = db.prepare(
      "INSERT INTO ai_conversations (org_id, user_id, agent_id, title, context_path) VALUES (?,?,?,?,?)"
    ).run(req.user.org_id, req.user.id, agent_id, content.substring(0, 80), req.body.context_path || null);
    convId = r.lastInsertRowid;
  }

  // Save user message
  db.prepare("INSERT INTO ai_messages (conversation_id, role, content) VALUES (?,?,?)").run(convId, "user", content.trim());

  // Load history (last 20 messages for context window)
  const history = db.prepare(
    "SELECT role, content FROM ai_messages WHERE conversation_id=? AND role IN ('user','assistant') ORDER BY created_at DESC LIMIT 20"
  ).all(convId).reverse();

  // Build Groq messages
  const groqMessages = [
    { role: "system", content: agent.system_prompt },
    ...history
  ];

  // Determine tools
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

    // Tool execution loop (max 3 iterations to prevent infinite loops)
    while (response.choices[0].message.tool_calls && iterations < 3) {
      iterations++;
      const assistantMsg = response.choices[0].message;
      groqMessages.push(assistantMsg);

      for (const tc of assistantMsg.tool_calls) {
        const args = JSON.parse(tc.function.arguments || "{}");
        const result = executeTool(tc.function.name, args, req.user.org_id);
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
        temperature: agent.temperature || 0.3,
        max_tokens: agent.max_tokens || 2048,
      });
    }

    const assistantContent = response.choices[0].message.content || "";
    const tokensUsed = response.usage?.total_tokens || 0;

    // Save assistant message
    db.prepare(
      "INSERT INTO ai_messages (conversation_id, role, content, tool_calls, tokens_used) VALUES (?,?,?,?,?)"
    ).run(convId, "assistant", assistantContent,
      toolResults.length > 0 ? JSON.stringify(toolResults) : null,
      tokensUsed);

    // Update conversation timestamp
    db.prepare("UPDATE ai_conversations SET updated_at=CURRENT_TIMESTAMP WHERE id=?").run(convId);

    logActivity(req.user.org_id, req.user.id, "chat_ia", "agente", agent.id, `${agent.code}: ${content.substring(0, 50)}`);

    res.json({
      conversation_id: convId,
      content: assistantContent,
      tool_results: toolResults,
      tokens_used: tokensUsed,
    });

  } catch (err) {
    console.error("[Agentes] Error Groq:", err.message);
    res.status(500).json({ error: "Error al procesar: " + err.message });
  }
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

module.exports = router;