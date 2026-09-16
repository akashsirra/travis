// Travis v2 — fast local-first Android assistant.
// Common phone actions stay local; Gemini is only the fallback for natural language.

const { GoogleGenAI } = require('@google/genai');
const readline = require('readline');
const { toolDeclarations, executeTool } = require('./tools');

const MODEL = process.env.TRAVIS_MODEL || 'gemini-3.8-flash';
const ai = process.env.GEMINI_API_KEY ? new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY }) : null;
const tools = [{ functionDeclarations: toolDeclarations }];

const SYSTEM_PROMPT = `You are Travis, a fast personal Android assistant. Execute safe phone actions directly. You may call multiple tools for multi-action requests. Keep replies extremely short. Never invent success. Prefer direct action over explanation.`;

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

function parseDuration(text) {
  const m = text.match(/(?:for\s+)?(\d+(?:\.\d+)?)\s*(second|seconds|sec|secs|minute|minutes|min|mins|hour|hours|hr|hrs)\b/i);
  if (!m) return null;
  const n = Number(m[1]);
  const unit = m[2].toLowerCase();
  const factor = unit.startsWith('hour') || unit.startsWith('hr') ? 3600 : unit.startsWith('min') ? 60 : 1;
  return Math.max(1, Math.round(n * factor));
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
  if (volume) return { name: 'set_volume', args: { level: Math.max(0, Math.min(100, Number(volume[1]))) } };
  const brightness = t.match(/\b(?:brightness|screen)\s*(?:to|at|=)?\s*(\d{1,3})\s*%?/);
  if (brightness) return { name: 'set_brightness', args: { level: Math.max(0, Math.min(100, Number(brightness[1]))) } };

  const open = text.match(/\bopen\s+(https?:\/\/\S+)/i);
  if (open) return { name: 'open_url', args: { url: open[1].replace(/[),.]+$/, '') } };

  const app = t.match(/\b(?:open|launch|start)\s+(youtube|chrome|whatsapp|instagram|spotify|gmail|maps)\b/);
  if (app) return { name: 'open_app', args: { app: app[1] } };

  if (/\b(?:wifi|wi-fi)\b/.test(t) && /\b(?:on|off|enable|disable)\b/.test(t)) {
    return { name: 'set_wifi', args: { state: /\b(?:off|disable)\b/.test(t) ? 'off' : 'on' } };
  }
  if (/\bbluetooth\b/.test(t) && /\b(?:on|off|enable|disable)\b/.test(t)) {
    return { name: 'set_bluetooth', args: { state: /\b(?:off|disable)\b/.test(t) ? 'off' : 'on' } };
  }
  if (/\b(?:pause|stop)\s+(?:music|song|media)\b/.test(t) || /^pause$/.test(t)) return { name: 'media_control', args: { action: 'pause' } };
  if (/\b(?:play|resume)\s+(?:music|song|media)\b/.test(t) || /^play$/.test(t)) return { name: 'media_control', args: { action: 'play' } };
  if (/\b(?:next|skip)\s+(?:song|track)\b/.test(t) || /^next$/.test(t)) return { name: 'media_control', args: { action: 'next' } };
  if (/\b(?:previous|prev|back)\s+(?:song|track)\b/.test(t) || /^previous$|^prev$/.test(t)) return { name: 'media_control', args: { action: 'previous' } };
  if (/\block\s+(?:the\s+)?(?:phone|screen)\b/.test(t)) return { name: 'lock_screen', args: {} };

  if (/\b(?:set|make)\s+(?:an?\s+)?alarm\b/.test(t)) {
    const clock = parseClock(t);
    if (clock) return { name: 'set_alarm', args: { ...clock, label: 'Travis alarm' } };
  }
  if (/\b(?:set|start)\s+(?:a\s+)?timer\b/.test(t)) {
    const seconds = parseDuration(t);
    if (seconds) return { name: 'set_timer', args: { seconds, label: 'Travis timer' } };
  }

  return null;
}

function actionAdlib(name) {
  const map = {
    set_flashlight: 'It’s lit.', set_volume: 'Yeah.', set_brightness: 'It’s lit.', set_wifi: 'Yeah.',
    set_bluetooth: 'Yeah.', media_control: 'What?', open_app: 'Let’s go.', open_url: 'Yeah.',
    take_photo: 'It’s lit.', vibrate: 'Yeah.', set_timer: 'Alright.', set_alarm: 'Alright.', lock_screen: 'Shh.'
  };
  return map[name] || 'Yeah.';
}

function formatToolReply(name, output) {
  if (!output) return actionAdlib(name);
  if (name === 'get_battery_status') {
    try {
      const x = JSON.parse(output);
      return `Battery ${x.percentage}%${x.status ? `, ${String(x.status).toLowerCase()}` : ''}.`;
    } catch {}
  }
  if (name === 'get_clipboard') return output || 'Clipboard is empty.';
  if (name === 'take_photo') return 'Photo taken. It’s lit.';
  return actionAdlib(name);
}

async function runLocalFirst(text) {
  const action = localAction(text);
  if (!action) return null;
  const result = await executeTool(action.name, action.args);
  return { handled: true, action, result, reply: result.success ? formatToolReply(action.name, result.output) : `I couldn't do that: ${result.error}` };
}

function toolResponsePart(call, result) {
  return { functionResponse: { name: call.name, response: { success: !!result.success, output: result.output || '', error: result.success ? '' : (result.error || 'Unknown tool error') } } };
}

async function runAI(text, history) {
  if (!ai) throw new Error('GEMINI_API_KEY is not set');
  history.push({ role: 'user', parts: [{ text }] });

  // Give Gemini the actual function results, then let it decide what to say/do next.
  for (let round = 0; round < 4; round++) {
    const response = await ai.models.generateContent({ model: MODEL, contents: history, config: { systemInstruction: SYSTEM_PROMPT, tools } });
    const content = response.candidates?.[0]?.content;
    const calls = response.functionCalls || (content?.parts || []).filter(p => p.functionCall).map(p => p.functionCall);
    if (!calls.length) {
      const reply = response.text || 'Yeah.';
      history.push({ role: 'model', parts: content?.parts || [{ text: reply }] });
      return reply;
    }

    history.push({ role: 'model', parts: content?.parts || calls.map(call => ({ functionCall: call })) });
    const results = await Promise.all(calls.map(async call => ({ call, result: await executeTool(call.name, call.args || {}) })));
    history.push({ role: 'user', parts: results.map(({ call, result }) => toolResponsePart(call, result)) });

    const failed = results.filter(x => !x.result.success);
    if (failed.length) {
      // The details are preserved in the functionResponse turn above and also surfaced here.
      return `I couldn't complete ${failed.map(x => `${x.call.name}: ${x.result.error || 'unknown error'}`).join('; ')}.`;
    }
  }
  return 'I completed the actions.';
}

async function handle(text, history = []) {
  const local = await runLocalFirst(text);
  if (local) return local.reply;
  return runAI(text, history);
}

async function main() {
  if (!ai) console.warn('GEMINI_API_KEY is not set. Local phone commands still work; AI fallback is disabled.');
  const history = [];
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const ask = q => new Promise(resolve => rl.question(q, resolve));
  console.log(`Travis v2 ready (${MODEL}). Type a message or "exit".\n`);
  while (true) {
    const input = (await ask('You: ')).trim();
    if (input.toLowerCase() === 'exit') break;
    if (!input) continue;
    try { console.log('Travis:', await handle(input, history)); }
    catch (error) { console.error('Travis error:', error.message); }
  }
  rl.close();
}

if (require.main === module) main();
module.exports = { parseClock, parseDuration, localAction, handle };
