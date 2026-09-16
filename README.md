# Travis

A fast, local-first Android assistant for Termux.

## Design

Travis uses a two-speed architecture:

1. **Fast path:** common phone actions are parsed locally and executed immediately. No AI/network round trip.
2. **AI path:** natural-language requests go to Gemini function calling, which can invoke the same centralized phone tools.
3. **Voice path:** Vosk runs locally through the existing HTTP server on `127.0.0.1:5055`; voice commands are handed to the same Travis core.

This keeps simple actions fast while preserving natural-language flexibility.

## Setup

Install Node.js, Termux:API, FFmpeg, and the Vosk HTTP server used by `wake_listen.js`.

```bash
npm install
export GEMINI_API_KEY='your-key'
```

Run text mode:

```bash
npm start
```

Run the wake listener:

```bash
npm run voice
```

Optional voice tuning:

```bash
export TRAVIS_WAKE_SECONDS=2
export TRAVIS_COMMAND_SECONDS=4
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
