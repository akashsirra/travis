#!/usr/bin/env node
// Travis voice front-end: local Vosk transcription + the same action engine as text mode.

const { execFile } = require('child_process');
const fs = require('fs');
const http = require('http');
const { handle } = require('./index');

const HOME = process.env.HOME;
const WAKE_RAW = `${HOME}/wake_raw.wav`;
const WAKE_FIXED = `${HOME}/wake_fixed.wav`;
const CMD_RAW = `${HOME}/cmd_raw.wav`;
const CMD_FIXED = `${HOME}/cmd_fixed.wav`;
const WAKE_SECONDS = Number(process.env.TRAVIS_WAKE_SECONDS || 2);
const COMMAND_SECONDS = Number(process.env.TRAVIS_COMMAND_SECONDS || 4);

function command(cmd, args = []) {
  return new Promise(resolve => execFile(cmd, args, { timeout: 15000 }, (err, stdout, stderr) => {
    resolve({ success: !err, output: (stdout || '').trim(), error: err?.message, stderr: (stderr || '').trim() });
  }));
}

async function recordClip(path, seconds) {
  await command('termux-microphone-record', ['-q']);
  try { fs.unlinkSync(path); } catch {}
  const started = await command('termux-microphone-record', ['-f', path, '-l', String(Math.ceil(seconds + 1))]);
  if (!started.success) return false;
  await new Promise(r => setTimeout(r, seconds * 1000 + 500));
  await command('termux-microphone-record', ['-q']);
  return fs.existsSync(path) && fs.statSync(path).size > 1000;
}

async function convertToWav(rawPath, fixedPath) {
  try { fs.unlinkSync(fixedPath); } catch {}
  const r = await command('ffmpeg', ['-y', '-i', rawPath, '-ar', '16000', '-ac', '1', '-f', 'wav', fixedPath]);
  return r.success && fs.existsSync(fixedPath) && fs.statSync(fixedPath).size > 1000;
}

function hasSpeech(filePath, thresholdRms = 3500) {
  if (!fs.existsSync(filePath)) return false;
  const buf = fs.readFileSync(filePath);
  const marker = buf.indexOf('data');
  if (marker < 0 || marker + 8 > buf.length) return false;
  const size = Math.min(buf.readUInt32LE(marker + 4), buf.length - marker - 8);
  const start = marker + 8;
  let sum = 0;
  let count = 0;
  for (let i = start; i + 1 < start + size; i += 2) {
    const sample = buf.readInt16LE(i);
    sum += sample * sample;
    count++;
  }
  return count > 0 && Math.sqrt(sum / count) > thresholdRms;
}

function transcribeVosk(path) {
  return new Promise(resolve => {
    const payload = JSON.stringify({ path });
    const req = http.request({ hostname: '127.0.0.1', port: 5055, path: '/transcribe', method: 'POST', timeout: 5000, headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) } }, res => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(body).text || ''); } catch { resolve(''); }
      });
    });
    req.on('error', () => resolve(''));
    req.on('timeout', () => { req.destroy(); resolve(''); });
    req.end(payload);
  });
}

async function say(text) {
  if (text) await command('termux-tts-speak', [String(text)]);
}

async function listenLoop() {
  console.log(`Travis voice ready. Wake=${WAKE_SECONDS}s command=${COMMAND_SECONDS}s`);
  while (true) {
    const recorded = await recordClip(WAKE_RAW, WAKE_SECONDS);
    if (!recorded || !(await convertToWav(WAKE_RAW, WAKE_FIXED)) || !hasSpeech(WAKE_FIXED)) continue;

    const heard = await transcribeVosk(WAKE_FIXED);
    if (!heard.toLowerCase().includes('travis')) continue;

    await command('termux-toast', ['Yes?']);
    const commandRecorded = await recordClip(CMD_RAW, COMMAND_SECONDS);
    if (!commandRecorded || !(await convertToWav(CMD_RAW, CMD_FIXED)) || !hasSpeech(CMD_FIXED)) continue;

    const text = await transcribeVosk(CMD_FIXED);
    if (!text) continue;
    console.log('Command:', text);
    try {
      const reply = await handle(text, []);
      console.log('Travis:', reply);
      await say(reply);
    } catch (error) {
      console.error('Voice error:', error.message);
      await say('I could not do that.');
    }
  }
}

listenLoop().catch(async error => {
  console.error('Voice listener stopped:', error);
  await say('Voice listener stopped.');
  process.exitCode = 1;
});
