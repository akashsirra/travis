// Travis v2 — fast local-first Android assistant.
// Common phone actions never touch the network; Gemini is the fallback for natural language.

const { GoogleGenAI } = require('@google/genai');
const readline = require('readline');
const { toolDeclarations, executeTool } = require('./tools');

const MODEL = process.env.TRAVIS_MODEL || 'gemini-3.8-flash';
const ai = process.env.GEMINI_API_KEY ? new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY }) : null;

const SYSTEM_PROMPT = `You are Travis, a fast personal Android assistant. Execute the user's requested phone action when a safe tool exists. You may call multiple tools for a multi-action request. Do not explain how to do something when the user asked you to do it. Keep replies extremely short after an action. Never invent a successful action: if a tool fails, say it failed. Prefer direct action over conversation.`;

const tools = [{ functionDeclarations: toolDeclarations }];

function parseClock(text) {
  const m = text.match(/\b(?:at\s*)?(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\b/i);
  if (!m) return null;
  let hour = Number(m[1]);
  const minute = Number(m[2] || 0);
  const ap = m[3]?.toLowerCase();
  if (minute > 59) return null;
  if (ap === 'pm' && hour < 12) hour += 12;
  if (ap === 'am' && hour === 12) hour = 0;
  if (hour > 23) return null;
  return { hour, minute };
}

function localAction(text) {
  const t = text.trim().toLowerCase();
  if (!t) return null;

  if (/\b(?:turn|switch|enable|disable)?\s*(?:the\s*)?(?:flashlight|torch|flash)\b/.test(t)) {
    return { name: 'set_flashlight', args: { state: /\b(?:off|disable|turn off|switch off)\b/.test(t) ? 'off' : 'on' } };
  }
  if (/\b(?:battery|charge|charging)\b/.test(t)) return { name: 'get_battery_status', args: {} };
  if (/\b(?:take|capture)\b.*\b(?:photo|picture|pic)\b|\b(?:photo|picture)\s+(?:of|from)\b/.test(t)) return { name: 'take_photo', args: {} };
  if (/\bvibrate\b|\bbuzz\b/.test(t)) return { name: 'vibrate', args: { duration_ms: 500 } };

  const volume = t.match(/\b(?:volume|sound)\s*(?:to|at|=)?\s*(\d{1,3})\s*%?/);
  if (volume) return { name: 'set_volume', args: { level: Number(volume[1]) } };
  const brightness = t.match(/\b(?:brightness|screen)\s*(?:to|at|=)?\s*(\d{1,3})\s*%?/);
  if (brightness) return { name: 'set_brightness', args: { level: Number(brightness[1]) } };

  const open = text.match(/\bopen\s+(https?:\/\/\S+)/i);
  if (open) return { name: 'open_url', args: { url: open[1].replace(/[),.]+$/, '') } };

  if (/\b(?:set|make)\s+(?:an?\s+)?alarm\b/.test(t)) {
    const clock = parseClock(t);
    if (clock) return { name: 'set_alarm', args: { ...clock, label: 'Travis alarm' } };
  }

  return null;
}

async function runLocalFirst(text) {
  const action = localAction(text);
  if (!action) return null;
  const result = await executeTool(action.name, action.args);
  return { handled: true, action, result };
}

async function runAI(text, history) {
  if (!ai) throw new Error('GEMINI_API_KEY is not set');
  history.push({ role: 'user', parts: [{ text }] });
  const response = await ai.models.generateContent({
    model: MODEL,
    contents: history,
    config: { systemInstruction: SYSTEM_PROMPT, tools },
  });
  const content = response.candidates?.[0]?.content;
  const calls = response.functionCalls || (content?.parts || []).filter(p => p.functionCall).map(p => p.functionCall);

  if (calls.length) {
    const results = await Promise.all(calls.map(async call => ({ call, result: await executeTool(call.name, call.args || {}) })));
    history.push({ role: 'model', parts: content?.parts || [] });
    const failed = results.filter(x => !x.result.success);
    return failed.length
      ? `I couldn't complete ${failed.map(x => x.call.name).join(', ')}.`
      : 'Done.';
  }

  const reply = response.text || 'Done.';
  history.push({ role: 'model', parts: content?.parts || [{ text: reply }] });
  return reply;
}

async function handle(text, history = []) {
  const local = await runLocalFirst(text);
  if (local) return local.result.success ? 'Done.' : `I couldn't do that: ${local.result.error}`;
  return runAI(text, history);
}

async function main() {
  if (!ai) {
    console.warn('GEMINI_API_KEY is not set. Local phone commands still work; AI fallback is disabled.');
  }
  const history = [];
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const ask = q => new Promise(resolve => rl.question(q, resolve));

  console.log(`Travis v2 ready (${MODEL}). Type a message or "exit".\n`);
  while (true) {
    const input = (await ask('You: ')).trim();
    if (input.toLowerCase() === 'exit') break;
    if (!input) continue;
    try {
      const reply = await handle(input, history);
      console.log('Travis:', reply);
    } catch (error) {
      console.error('Travis error:', error.message);
    }
  }
  rl.close();
}

if (require.main === module) main();

module.exports = { parseClock, localAction, handle };
