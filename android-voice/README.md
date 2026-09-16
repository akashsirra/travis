# Travis Voice

This is the native Android voice front-end for Travis.

## Architecture

Android `SpeechRecognizer` runs in a microphone foreground service and consumes partial speech results. It detects `Travis`, accepts a command, and posts the recognized text to the local Travis bridge at `127.0.0.1:8787`.

The Node/Termux process remains the action engine, so local phone commands stay fast and Gemini remains the fallback for natural language.

## Build

This module is a standard Android Gradle project. Build it with an Android SDK/Gradle environment:

```bash
gradle :app:assembleDebug
```

Install the resulting debug APK on the phone and grant microphone permission.

## Run

Start the Travis bridge in Termux:

```bash
cd ~/travis
npm install
npm run voice-server
```

The bridge should report:

```text
Travis voice bridge ready at http://127.0.0.1:8787
```

Then open **Travis Voice**, press **START TRAVIS**, and say:

```text
Travis, brightness 50
```

or:

```text
Travis
```

then wait for `Yes?` and speak the command.

## Android requirements

The app requests `RECORD_AUDIO` and declares a microphone foreground service. Android requires the app to be visibly started before a microphone foreground service can be launched on modern Android versions.

The legacy Termux/Vosk listener remains available as `npm run voice`, but the native Android path is the preferred voice architecture.
