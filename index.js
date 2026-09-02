// Travis — a personal phone assistant powered by the Gemini API,
// with the ability to control your Android phone via Termux:API.

const { GoogleGenAI, Type } = require("@google/genai");
const { execFile } = require("child_process");
const readline = require("readline");

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

const SYSTEM_PROMPT = `You are Travis, a friendly and helpful personal assistant living on the user's Android phone.
You can chat normally, and you can also perform real actions on the phone using the tools provided
(setting alarms, showing notifications, speaking replies out loud, showing toast messages, controlling the flashlight, checking battery status, vibrating the phone, taking photos, adjusting volume, and opening links).
Only use a tool when the user's request actually calls for that action. Keep spoken/toast text short and natural.`;

const tools = [
  {
    functionDeclarations: [
      {
        name: "set_alarm",
        description: "Set an alarm on the phone for a specific time.",
        parameters: {
          type: Type.OBJECT,
          properties: {
            hour: { type: Type.INTEGER, description: "Hour in 24-hour format (0-23)" },
            minute: { type: Type.INTEGER, description: "Minute (0-59)" },
            label: { type: Type.STRING, description: "Short label for the alarm" },
          },
          required: ["hour", "minute"],
        },
      },
      {
        name: "show_notification",
        description: "Show a notification on the phone's notification shade.",
        parameters: {
          type: Type.OBJECT,
          properties: {
            title: { type: Type.STRING },
            content: { type: Type.STRING },
          },
          required: ["title", "content"],
        },
      },
      {
        name: "speak",
        description: "Speak a short message out loud using text-to-speech.",
        parameters: {
          type: Type.OBJECT,
          properties: {
            text: { type: Type.STRING },
          },
          required: ["text"],
        },
      },
      {
        name: "show_toast",
        description: "Show a brief on-screen popup message (a toast).",
        parameters: {
          type: Type.OBJECT,
          properties: {
            text: { type: Type.STRING },
          },
          required: ["text"],
        },
      },
      {
        name: "set_flashlight",
        description: "Turn the phone flashlight on or off.",
        parameters: {
          type: Type.OBJECT,
          properties: {
            state: { type: Type.STRING, description: "Either on or off" },
          },
          required: ["state"],
        },
      },
      {
        name: "get_battery_status",
        description: "Check and announce the phone battery percentage and charging status.",
        parameters: { type: Type.OBJECT, properties: {} },
      },
      {
        name: "vibrate",
        description: "Vibrate the phone.",
        parameters: {
          type: Type.OBJECT,
          properties: {
            duration_ms: { type: Type.INTEGER, description: "Duration in milliseconds, default 500" },
          },
        },
      },
      {
        name: "take_photo",
        description: "Take a photo using the phone back camera and save it.",
        parameters: { type: Type.OBJECT, properties: {} },
      },
      {
        name: "set_volume",
        description: "Set the phone media volume.",
        parameters: {
          type: Type.OBJECT,
          properties: {
          level: { type: Type.INTEGER, description: "Volume percent from 0 to 100" },
          },
          required: ["level"],
        },
      },
      {
        name: "open_url",
        description: "Open a website or app link in the browser.",
        parameters: {
          type: Type.OBJECT,
          properties: {
            url: { type: Type.STRING, description: "The URL to open, e.g. https://youtube.com" },
          },
          required: ["url"],
        },
      },
    ],
  },
];

function runCommand(cmd, args) {
  return new Promise((resolve) => {
    execFile(cmd, args, (err, stdout, stderr) => {
      if (err) {
        console.error(`Error running ${cmd}:`, err.message);
        resolve({ success: false, error: err.message });
      } else {
        resolve({ success: true, output: stdout.trim() });
      }
    });
  });
}

async function executeTool(name, args) {
  switch (name) {
    case "set_alarm": {
      const cmdArgs = [
        "start", "-a", "android.intent.action.SET_ALARM",
        "--ei", "android.intent.extra.alarm.HOUR", String(args.hour),
        "--ei", "android.intent.extra.alarm.MINUTES", String(args.minute),
        "--ez", "android.intent.extra.alarm.SKIP_UI", "true",
      ];
      if (args.label) cmdArgs.push("-e", "android.intent.extra.alarm.MESSAGE", args.label);
      return runCommand("am", cmdArgs);
    }
    case "show_notification": {
      return runCommand("termux-notification", [
        "--title", args.title,
        "--content", args.content,
      ]);
    }
    case "speak": {
      return runCommand("termux-tts-speak", [args.text]);
    }
    case "show_toast": {
      return runCommand("termux-toast", [args.text]);
    }
    case "set_flashlight": {
      return runCommand("termux-torch", [args.state === "on" ? "on" : "off"]);
    }
    case "get_battery_status": {
      const result = await runCommand("termux-battery-status", []);
      if (result.success) {
        const info = JSON.parse(result.output);
        const msg = `Battery is at ${info.percentage} percent, ${info.status}.`;
        await runCommand("termux-toast", [msg]);
        return { success: true, output: msg };
      }
      return result;
    }
    case "vibrate": {
      const duration = args.duration_ms ? String(args.duration_ms) : "500";
      return runCommand("termux-vibrate", ["-d", duration]);
    }
    case "take_photo": {
      const dir = process.env.HOME + "/storage/shared/Pictures";
        const path = `${dir}/travis_photo_${Date.now()}.jpg`;
      const result = await runCommand("termux-camera-photo", ["-c", "0", path]);
      if (result.success) {
          await runCommand("termux-media-scan", [path]);
        await runCommand("termux-toast", ["Photo saved: " + path]);
      }
      return result;
    }
    case "set_volume": {
        const pct = Math.max(0, Math.min(100, args.level));
        const status = await runCommand("termux-volume", []);
        const streams = JSON.parse(status.output);
        const music = streams.find(s => s.stream === "music");
        const target = Math.round((pct / 100) * music.max_volume);
        return runCommand("termux-volume", ["music", String(target)]);
    }
    case "open_url": {
      return runCommand("termux-open-url", [args.url]);
    }
    default:
      return { success: false, error: `Unknown tool: ${name}` };
  }
}

const history = [];
const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

function ask(question) {
  return new Promise((resolve) => rl.question(question, resolve));
}

async function main() {
  if (!process.env.GEMINI_API_KEY) {
    console.error("GEMINI_API_KEY is not set. Run 'source ~/.bashrc' or check your .bashrc.");
    process.exit(1)
}

  console.log("Travis is ready. Type a message (or 'exit' to quit).\n");

  while (true) {
    const userInput = await ask("You: ");
    if (userInput.trim().toLowerCase() === "exit") break;

    history.push({ role: "user", parts: [{ text: userInput }] });

    const response = await ai.models.generateContent({
      model: "gemini-3.6-flash",
      contents: history,
      config: {
        systemInstruction: SYSTEM_PROMPT,
        tools,
      },
    });

    const candidate = response.candidates[0];
    const parts = candidate.content.parts;

    let spokenReply = "";

    for (const part of parts) {
      if (part.functionCall) {
        const { name, args } = part.functionCall;
        console.log(`[Travis is using tool: ${name}]`);
        const result = await executeTool(name, args);
        if (!result.success) {
          console.log(`[Tool error: ${result.error}]`);
        }
      } else if (part.text) {
        spokenReply += part.text;
      }
    }

    if (spokenReply) {
      console.log("Travis:", spokenReply);
    }

    history.push({ role: "model", parts });
  }

  rl.close();
  console.log("Goodbye!");
}

main();
