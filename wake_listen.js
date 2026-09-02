#!/usr/bin/env node
// wake_listen.js
// "Hey Travis" wake-word listener using fully local/offline transcription:
// termux-microphone-record -> ffmpeg (real WAV conversion) -> persistent Vosk HTTP server -> dispatch

const { execSync } = require('child_process');
const fs = require('fs');
const http = require('http');

const HOME = process.env.HOME;
const WAKE_RAW = `${HOME}/wake_raw.wav`;
const WAKE_FIXED = `${HOME}/wake_fixed.wav`;
const CMD_RAW = `${HOME}/cmd_raw.wav`;
const CMD_FIXED = `${HOME}/cmd_fixed.wav`;

function recordClip(rawPath, seconds) {
  try { execSync(`termux-microphone-record -q`); } catch (e) {}
  try { fs.unlinkSync(rawPath); } catch (e) {}
  try {
    execSync(`termux-microphone-record -f ${rawPath} -l ${seconds + 5}`);
  } catch (e) {
    console.error('record start error:', e.message);
  }
  return new Promise(resolve => {
    setTimeout(() => {
      try { execSync(`termux-microphone-record -q`); } catch (e) {}
      resolve();
    }, seconds * 1000 + 1200);
  });
}

function convertToWavOnce(rawPath, fixedPath) {
  try { fs.unlinkSync(fixedPath); } catch (e) {}
  try {
    execSync(`ffmpeg -y -i ${rawPath} -ar 16000 -ac 1 -f wav ${fixedPath} 2>/dev/null`);
    return fs.existsSync(fixedPath) && fs.statSync(fixedPath).size > 1000;
  } catch (e) {
    return false;
  }
}

function sleepSync(ms) {
  const end = Date.now() + ms;
  while (Date.now() < end) {}
}

function convertToWav(rawPath, fixedPath) {
  if (convertToWavOnce(rawPath, fixedPath)) return true;
  sleepSync(700);
  return convertToWavOnce(rawPath, fixedPath);
}

function hasSpeech(filePath, thresholdRms = 4000) {
  if (!fs.existsSync(filePath)) return false;
  const buf = fs.readFileSync(filePath);
  const dataMarker = buf.indexOf('data');
  if (dataMarker === -1 || dataMarker + 8 > buf.length) return false;

  const dataSize = buf.readUInt32LE(dataMarker + 4);
  const dataStart = dataMarker + 8;
  const dataEnd = Math.min(dataStart + dataSize, buf.length);

  let sumSquares = 0;
  let count = 0;
  for (let i = dataStart; i + 1 < dataEnd; i += 2) {
    const sample = buf.readInt16LE(i);
    sumSquares += sample * sample;
    count++;
  }
  if (count === 0) return false;

  const rms = Math.sqrt(sumSquares / count);
  return rms > thresholdRms;
}

function transcribeVosk(fixedPath) {
  return new Promise((resolve) => {
    const payload = JSON.stringify({ path: fixedPath });
    const req = http.request({
      hostname: '127.0.0.1',
      port: 5055,
      path: '/transcribe',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload)
      },
      timeout: 8000
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          resolve(parsed.text || '');
        } catch (e) {
          console.error('Vosk server parse error:', e.message);
          resolve('');
        }
      });
    });
    req.on('error', (e) => {
      console.error('Vosk server request error:', e.message);
      resolve('');
    });
    req.on('timeout', () => {
      req.destroy();
      console.error('Vosk server request timed out');
      resolve('');
    });
    req.write(payload);
    req.end();
  });
}

function toolAlarm(label) {
  const now = new Date();
  execSync(`am start -a android.intent.action.SET_ALARM --ei android.intent.extra.alarm.HOUR ${now.getHours()} --ei android.intent.extra.alarm.MINUTES ${now.getMinutes() + 1} --es android.intent.extra.alarm.MESSAGE "${(label || 'Alarm').replace(/"/g, '')}"`);
}
function toolNotification(text) {
  execSync(`termux-notification --title "Travis" --content "${(text || 'Notification').replace(/"/g, '')}"`);
}
function toolSpeak(text) {
  execSync(`termux-tts-speak "${(text || '').replace(/"/g, '\\"')}"`);
}
function toolToast(text) {
  execSync(`termux-toast "${(text || '').replace(/"/g, '\\"')}"`);
}
function toolFlashlight(state) {
  execSync(`termux-torch ${state === 'off' ? 'off' : 'on'}`);
}
function toolBattery() {
  const info = execSync(`termux-battery-status`).toString();
  const parsed = JSON.parse(info);
  toolSpeak(`Battery is at ${parsed.percentage} percent`);
}
function toolVibrate() {
  execSync(`termux-vibrate -d 500`);
}
function toolPhoto() {
  const outPath = `${HOME}/storage/dcim/travis_photo_${Date.now()}.jpg`;
  execSync(`termux-camera-photo -c 0 ${outPath}`);
  toolToast('Photo saved');
}
function toolOpenUrl(url) {
  execSync(`termux-open-url "${url}"`);
}

function dispatch(command) {
  const cmd = command.toLowerCase();
  if (cmd.includes('alarm')) {
    toolAlarm(command);
  } else if (cmd.includes('remind') || cmd.includes('notif')) {
    toolNotification(command);
  } else if (cmd.includes('flashlight') || cmd.includes('torch') || cmd.includes('light')) {
    toolFlashlight(cmd.includes('off') ? 'off' : 'on');
  } else if (cmd.includes('battery')) {
    toolBattery();
  } else if (cmd.includes('vibrate')) {
    toolVibrate();
  } else if (cmd.includes('photo') || cmd.includes('picture') || cmd.includes('camera')) {
    toolPhoto();
  } else if (cmd.includes('open') && /https?:\/\//.test(command)) {
    const match = command.match(/https?:\/\/\S+/);
    toolOpenUrl(match[0]);
  } else if (cmd.includes('toast')) {
    toolToast(command);
  } else {
    toolSpeak(command);
  }
}

async function listenLoop() {
  console.log('Listening for "Hey Travis" (Vosk server mode)...');
  while (true) {
    await recordClip(WAKE_RAW, 3);
    if (!convertToWav(WAKE_RAW, WAKE_FIXED)) {
      console.log('(conversion failed, skipping)');
      continue;
    }
    if (!hasSpeech(WAKE_FIXED)) {
      console.log('(silence, skipping Vosk call)');
      continue;
    }

    const heard = await transcribeVosk(WAKE_FIXED);
    if (heard) console.log('Heard:', heard);

    if (heard.toLowerCase().includes('travis')) {
      toolToast('Yes?');
      await recordClip(CMD_RAW, 4);
      if (!convertToWav(CMD_RAW, CMD_FIXED)) continue;
      if (!hasSpeech(CMD_FIXED)) {
        console.log('(no command heard, silence)');
        continue;
      }
      const command = await transcribeVosk(CMD_FIXED);
      console.log('Command:', command);
      if (command) dispatch(command);
    }
  }
}

listenLoop();
