const { execFile } = require('child_process');

function runCommand(cmd, args = [], timeout = 8000) {
  return new Promise((resolve) => {
    execFile(cmd, args, { timeout }, (err, stdout, stderr) => {
      if (err) return resolve({ success: false, error: err.message, stderr: (stderr || '').trim() });
      resolve({ success: true, output: (stdout || '').trim() });
    });
  });
}

const toolDeclarations = [
  { name: 'set_alarm', description: 'Set an Android alarm at an exact hour and minute.', parameters: { type: 'OBJECT', properties: { hour: { type: 'INTEGER' }, minute: { type: 'INTEGER' }, label: { type: 'STRING' } }, required: ['hour', 'minute'] } },
  { name: 'set_timer', description: 'Set an Android countdown timer in seconds.', parameters: { type: 'OBJECT', properties: { seconds: { type: 'INTEGER' }, label: { type: 'STRING' } }, required: ['seconds'] } },
  { name: 'show_notification', description: 'Show a notification on the phone.', parameters: { type: 'OBJECT', properties: { title: { type: 'STRING' }, content: { type: 'STRING' } }, required: ['title', 'content'] } },
  { name: 'speak', description: 'Speak a short reply aloud with Android text to speech.', parameters: { type: 'OBJECT', properties: { text: { type: 'STRING' } }, required: ['text'] } },
  { name: 'show_toast', description: 'Show a short Android toast message.', parameters: { type: 'OBJECT', properties: { text: { type: 'STRING' } }, required: ['text'] } },
  { name: 'set_flashlight', description: 'Turn the phone flashlight on or off.', parameters: { type: 'OBJECT', properties: { state: { type: 'STRING', enum: ['on', 'off'] } }, required: ['state'] } },
  { name: 'get_battery_status', description: 'Read the phone battery percentage and charging status.', parameters: { type: 'OBJECT', properties: {} } },
  { name: 'vibrate', description: 'Vibrate the phone briefly.', parameters: { type: 'OBJECT', properties: { duration_ms: { type: 'INTEGER' } } } },
  { name: 'take_photo', description: 'Take a photo with the back camera and save it to shared Pictures.', parameters: { type: 'OBJECT', properties: {} } },
  { name: 'set_volume', description: 'Set media volume from 0 to 100 percent.', parameters: { type: 'OBJECT', properties: { level: { type: 'INTEGER' } }, required: ['level'] } },
  { name: 'set_brightness', description: 'Set screen brightness from 0 to 100 percent.', parameters: { type: 'OBJECT', properties: { level: { type: 'INTEGER' } }, required: ['level'] } },
  { name: 'get_clipboard', description: 'Read the current phone clipboard.', parameters: { type: 'OBJECT', properties: {} } },
  { name: 'set_clipboard', description: 'Replace the phone clipboard with text.', parameters: { type: 'OBJECT', properties: { text: { type: 'STRING' } }, required: ['text'] } },
  { name: 'open_url', description: 'Open a URL using the phone browser or registered app.', parameters: { type: 'OBJECT', properties: { url: { type: 'STRING' } }, required: ['url'] } },
  { name: 'set_wifi', description: 'Turn Wi-Fi on or off.', parameters: { type: 'OBJECT', properties: { state: { type: 'STRING', enum: ['on', 'off'] } }, required: ['state'] } },
  { name: 'set_bluetooth', description: 'Turn Bluetooth on or off.', parameters: { type: 'OBJECT', properties: { state: { type: 'STRING', enum: ['on', 'off'] } }, required: ['state'] } },
  { name: 'media_control', description: 'Control media playback: play, pause, next, previous.', parameters: { type: 'OBJECT', properties: { action: { type: 'STRING', enum: ['play', 'pause', 'next', 'previous'] } }, required: ['action'] } },
  { name: 'lock_screen', description: 'Lock the Android screen immediately.', parameters: { type: 'OBJECT', properties: {} } },
  { name: 'open_app', description: 'Open one of the supported common apps: YouTube, Chrome, WhatsApp, Instagram, Spotify, Gmail, Maps.', parameters: { type: 'OBJECT', properties: { app: { type: 'STRING' } }, required: ['app'] } },
];

const APP_PACKAGES = {
  youtube: 'com.google.android.youtube',
  chrome: 'com.android.chrome',
  whatsapp: 'com.whatsapp',
  instagram: 'com.instagram.android',
  spotify: 'com.spotify.music',
  gmail: 'com.google.android.gm',
  maps: 'com.google.android.apps.maps',
};

async function executeTool(name, args = {}) {
  try {
    switch (name) {
      case 'set_alarm': {
        const a = ['start', '-a', 'android.intent.action.SET_ALARM', '--ei', 'android.intent.extra.alarm.HOUR', String(args.hour), '--ei', 'android.intent.extra.alarm.MINUTES', String(args.minute), '--ez', 'android.intent.extra.alarm.SKIP_UI', 'true'];
        if (args.label) a.push('-e', 'android.intent.extra.alarm.MESSAGE', String(args.label));
        return runCommand('am', a);
      }
      case 'set_timer':
        return runCommand('am', ['start', '-a', 'android.intent.action.SET_TIMER', '--ei', 'android.intent.extra.alarm.LENGTH', String(Math.max(1, Number(args.seconds))), '--ez', 'android.intent.extra.alarm.SKIP_UI', 'true']);
      case 'show_notification': return runCommand('termux-notification', ['--title', String(args.title), '--content', String(args.content)]);
      case 'speak': return runCommand('termux-tts-speak', [String(args.text)]);
      case 'show_toast': return runCommand('termux-toast', [String(args.text)]);
      case 'set_flashlight': return runCommand('termux-torch', [args.state === 'off' ? 'off' : 'on']);
      case 'get_battery_status': {
        const r = await runCommand('termux-battery-status');
        if (!r.success) return r;
        try {
          const info = JSON.parse(r.output);
          return { success: true, output: JSON.stringify({ percentage: info.percentage, status: info.status, plugged: info.plugged }) };
        } catch { return { success: true, output: r.output }; }
      }
      case 'vibrate': return runCommand('termux-vibrate', ['-d', String(Math.max(1, Math.min(5000, args.duration_ms || 500)))]);
      case 'take_photo': {
        const path = `${process.env.HOME}/storage/shared/Pictures/travis_${Date.now()}.jpg`;
        const r = await runCommand('termux-camera-photo', ['-c', '0', path], 15000);
        if (r.success) await runCommand('termux-media-scan', [path]);
        return r.success ? { ...r, output: path } : r;
      }
      case 'set_volume': {
        const pct = Math.max(0, Math.min(100, Number(args.level)));
        const s = await runCommand('termux-volume');
        if (!s.success) return s;
        const music = JSON.parse(s.output).find(x => x.stream === 'music');
        if (!music) return { success: false, error: 'Music volume stream not found' };
        return runCommand('termux-volume', ['music', String(Math.round(pct / 100 * music.max_volume))]);
      }
      case 'set_brightness': {
        const pct = Math.max(0, Math.min(100, Number(args.level)));
        return runCommand('termux-brightness', [String(Math.round(pct * 255 / 100))]);
      }
      case 'get_clipboard': return runCommand('termux-clipboard-get');
      case 'set_clipboard': return runCommand('termux-clipboard-set', [String(args.text)]);
      case 'open_url': return runCommand('termux-open-url', [String(args.url)]);
      case 'set_wifi': return runCommand('termux-wifi-enable', [args.state === 'off' ? 'false' : 'true']);
      case 'set_bluetooth': return runCommand('termux-bluetooth-enable', [args.state === 'off' ? 'false' : 'true']);
      case 'media_control': {
        const keys = { play: '126', pause: '127', next: '87', previous: '88' };
        return runCommand('input', ['keyevent', keys[args.action] || '126']);
      }
      case 'lock_screen': return runCommand('input', ['keyevent', '26']);
      case 'open_app': {
        const key = String(args.app || '').toLowerCase().trim();
        const pkg = APP_PACKAGES[key];
        if (!pkg) return { success: false, error: `Unsupported app: ${key}` };
        return runCommand('monkey', ['-p', pkg, '1']);
      }
      default: return { success: false, error: `Unknown tool: ${name}` };
    }
  } catch (error) {
    return { success: false, error: error.message };
  }
}

module.exports = { runCommand, toolDeclarations, executeTool };
