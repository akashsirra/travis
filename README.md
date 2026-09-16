# Travis

A fast, local-first Android assistant for Termux.

## Design

Travis uses a two-speed architecture:

1. **Fast path:** common phone actions are parsed locally and executed immediately. No AI/network round trip.
2. **AI path:** natural-language requests go to Gemini function calling, which can invoke the same centralized phone tools and receive the actual tool results back.
3. **Voice path:** the Android companion app uses Android's native `SpeechRecognizer` for speech-to-text, detects the `Travis` wake word, and sends recognized commands to the local Travis HTTP bridge at `127.0.0.1:8787/voice`.

The older Vosk/`127.0.0.1:5055` description is no longer used by the current Android voice path.

## Setup

Install Node.js and Termux:API.

```bash
npm install
export GEMINI_API_KEY='your-key'
```

Run text mode:

```bash
npm start
```

Run the local voice bridge:

```bash
npm run voice-server
```

Check the bridge:

```bash
curl http://127.0.0.1:8787/health
```

The Android voice companion can then connect to the bridge while the Travis Termux process is running.

Optional tuning:

```bash
export TRAVIS_MODEL='gemini-3.8-flash'
```

## Fast commands

Examples that execute without Gemini:

- `turn flashlight on`
- `battery`
- `take a photo`
- `vibrate`
- `volume 40`
- `brightness 70`
- `open https://youtube.com`
- `set an alarm at 7:30 pm`

Anything outside the local router can fall back to Gemini.

## Safety boundary

Travis intentionally does **not** expose arbitrary shell execution to the model. It can only call the explicitly registered phone tools. This keeps the assistant powerful without turning natural-language input into unrestricted command execution.

## Tests

```bash
npm run check
npm test
```
