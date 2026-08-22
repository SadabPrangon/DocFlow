const host = () => String(process.env.OLLAMA_HOST || 'http://127.0.0.1:11434').replace(/\/$/, '');
const model = () => String(process.env.OLLAMA_MODEL || 'llama3.2:3b').trim();
const enabled = () => String(process.env.AI_ASSISTANT || 'true').toLowerCase() !== 'false';
const timeoutMs = () => Number(process.env.OLLAMA_TIMEOUT_MS) || 90000;

const listModels = async () => {
  const response = await fetch(`${host()}/api/tags`, { signal: AbortSignal.timeout(4000) });
  if (!response.ok) throw new Error(`Ollama replied with HTTP ${response.status}.`);
  const data = await response.json();
  return (data.models || []).map((item) => item.name);
};

// Cheap reachability probe so a request never hangs waiting on a model that is not there.
const isAvailable = async () => {
  if (!enabled()) return false;
  try {
    const names = await listModels();
    return names.some((name) => name === model() || name.split(':')[0] === model().split(':')[0]);
  } catch { return false; }
};

// format: 'json' makes Ollama constrain output to valid JSON, which removes the
// usual prose-around-the-payload parsing problem.
const chatJson = async (system, prompt) => {
  const response = await fetch(`${host()}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: model(),
      stream: false,
      format: 'json',
      keep_alive: process.env.OLLAMA_KEEP_ALIVE || "30m",
      options: { temperature: 0.1, num_predict: 320 },
      messages: [{ role: 'system', content: system }, { role: 'user', content: prompt }],
    }),
    signal: AbortSignal.timeout(timeoutMs()),
  });
  if (!response.ok) throw new Error(`Ollama replied with HTTP ${response.status}.`);
  const data = await response.json();
  const content = data.message?.content;
  if (!content) throw new Error('Ollama returned an empty message.');
  return JSON.parse(content);
};

// First load on CPU costs tens of seconds. Warming at boot keeps that off the
// first patient request; keep_alive then holds the model resident.
const warm = async () => {
  if (!enabled()) return false;
  try {
    await fetch(`${host()}/api/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: model(), prompt: "hi", stream: false, keep_alive: process.env.OLLAMA_KEEP_ALIVE || "30m", options: { num_predict: 1 } }),
      signal: AbortSignal.timeout(timeoutMs()),
    });
    return true;
  } catch { return false; }
};

module.exports = { host, model, enabled, isAvailable, listModels, chatJson, warm };
