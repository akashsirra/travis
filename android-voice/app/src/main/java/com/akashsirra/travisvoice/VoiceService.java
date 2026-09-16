package com.akashsirra.travisvoice;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.Service;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.speech.RecognitionListener;
import android.speech.RecognizerIntent;
import android.speech.SpeechRecognizer;
import android.speech.tts.TextToSpeech;
import android.util.Log;

import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Locale;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

public class VoiceService extends Service implements RecognitionListener {
    private static final String TAG = "TravisVoice";
    private static final String CHANNEL = "travis_voice";
    private static final String ENDPOINT = "http://127.0.0.1:8787/voice";

    private SpeechRecognizer recognizer;
    private TextToSpeech tts;
    private Intent recognizerIntent;
    private final Handler main = new Handler(Looper.getMainLooper());
    private final ExecutorService network = Executors.newSingleThreadExecutor();
    private boolean commandMode = false;
    private boolean wakeDispatched = false;
    private boolean stopping = false;

    @Override public void onCreate() {
        super.onCreate();
        createChannel();
        Notification n = new Notification.Builder(this, CHANNEL)
                .setContentTitle("Travis is listening")
                .setContentText("Say Travis followed by a command")
                .setSmallIcon(android.R.drawable.ic_btn_speak_now)
                .setOngoing(true)
                .build();
        if (Build.VERSION.SDK_INT >= 29) startForeground(7, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE);
        else startForeground(7, n);

        tts = new TextToSpeech(this, status -> { if (status == TextToSpeech.SUCCESS) tts.setLanguage(Locale.US); });
        recognizerIntent = new Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH);
        recognizerIntent.putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM);
        recognizerIntent.putExtra(RecognizerIntent.EXTRA_LANGUAGE, Locale.getDefault());
        recognizerIntent.putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, true);
        recognizerIntent.putExtra(RecognizerIntent.EXTRA_PREFER_OFFLINE, true);

        if (!SpeechRecognizer.isRecognitionAvailable(this)) {
            speak("Speech recognition is not available");
            stopSelf();
            return;
        }
        recognizer = SpeechRecognizer.createSpeechRecognizer(this);
        recognizer.setRecognitionListener(this);
        listen(100);
    }

    private void listen(long delayMs) {
        if (stopping || recognizer == null) return;
        main.postDelayed(() -> {
            if (stopping || recognizer == null) return;
            try {
                recognizer.cancel();
                wakeDispatched = false;
                recognizer.startListening(recognizerIntent);
            } catch (Exception e) {
                Log.e(TAG, "startListening", e);
                listen(500);
            }
        }, delayMs);
    }

    private void inspectWake(String raw) {
        String text = raw == null ? "" : raw.trim();
        if (text.isEmpty() || commandMode || wakeDispatched) return;
        String lower = text.toLowerCase(Locale.ROOT);
        int pos = lower.indexOf("travis");
        if (pos < 0) return;

        wakeDispatched = true;
        String remainder = text.substring(pos + "travis".length()).trim();
        if (remainder.isEmpty()) {
            commandMode = true;
            speak("Yes?");
            listen(80);
        } else {
            sendToTravis(remainder);
        }
    }

    private void handleFinal(String raw) {
        String text = raw == null ? "" : raw.trim();
        if (text.isEmpty()) { listen(80); return; }
        if (!commandMode) {
            inspectWake(text);
            if (!wakeDispatched) listen(80);
            return;
        }
        commandMode = false;
        wakeDispatched = false;
        sendToTravis(text);
    }

    private void sendToTravis(String text) {
        commandMode = false;
        wakeDispatched = true;
        network.execute(() -> {
            HttpURLConnection c = null;
            try {
                c = (HttpURLConnection) new URL(ENDPOINT).openConnection();
                c.setRequestMethod("POST");
                c.setConnectTimeout(500);
                c.setReadTimeout(10000);
                c.setDoOutput(true);
                c.setRequestProperty("Content-Type", "application/json; charset=utf-8");
                String body = "{\"text\":\"" + jsonEscape(text) + "\"}";
                try (OutputStream out = c.getOutputStream()) { out.write(body.getBytes(StandardCharsets.UTF_8)); }
                int code = c.getResponseCode();
                if (code >= 200 && code < 300) speak("Done");
                else speak("Travis bridge is not ready");
            } catch (Exception e) {
                Log.e(TAG, "bridge", e);
                speak("Start the Travis voice bridge");
            } finally {
                if (c != null) c.disconnect();
                listen(120);
            }
        });
    }

    private static String jsonEscape(String s) { return s.replace("\\", "\\\\").replace("\"", "\\\"").replace("\n", "\\n").replace("\r", "\\r"); }
    private void speak(String text) { if (tts != null) tts.speak(text, TextToSpeech.QUEUE_FLUSH, null, "travis"); }

    private void createChannel() {
        if (Build.VERSION.SDK_INT >= 26) {
            NotificationManager nm = getSystemService(NotificationManager.class);
            nm.createNotificationChannel(new NotificationChannel(CHANNEL, "Travis Voice", NotificationManager.IMPORTANCE_LOW));
        }
    }

    @Override public void onDestroy() {
        stopping = true;
        if (recognizer != null) { recognizer.cancel(); recognizer.destroy(); recognizer = null; }
        if (tts != null) { tts.stop(); tts.shutdown(); tts = null; }
        network.shutdownNow();
        super.onDestroy();
    }

    @Override public IBinder onBind(Intent intent) { return null; }
    @Override public void onReadyForSpeech(Bundle params) {}
    @Override public void onBeginningOfSpeech() {}
    @Override public void onRmsChanged(float rmsdB) {}
    @Override public void onBufferReceived(byte[] buffer) {}
    @Override public void onEndOfSpeech() { if (commandMode) main.postDelayed(() -> listen(80), 80); }
    @Override public void onError(int error) { listen(180); }
    @Override public void onResults(Bundle results) { ArrayList<String> r = results.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION); handleFinal(r != null && !r.isEmpty() ? r.get(0) : ""); }
    @Override public void onPartialResults(Bundle results) { ArrayList<String> r = results.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION); if (r != null && !r.isEmpty()) inspectWake(r.get(0)); }
    @Override public void onEvent(int eventType, Bundle params) {}
}
