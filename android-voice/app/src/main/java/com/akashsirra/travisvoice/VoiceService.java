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
import android.speech.tts.UtteranceProgressListener;
import android.speech.tts.Voice;
import android.util.Log;
import org.json.JSONObject;
import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Locale;
import java.util.Set;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

public class VoiceService extends Service implements RecognitionListener {
    private static final String TAG="TravisVoice";
    private static final String CHANNEL="travis_voice";
    private static final String ENDPOINT="http://127.0.0.1:8787/voice";
    private static final float PITCH=0.48f;
    private static final float RATE=0.78f;
    private SpeechRecognizer recognizer;
    private TextToSpeech tts;
    private Intent recognizerIntent;
    private final Handler main=new Handler(Looper.getMainLooper());
    private final ExecutorService network=Executors.newSingleThreadExecutor();
    private boolean commandMode=false,wakeDetected=false,stopping=false,listening=false;

    @Override public void onCreate(){
        super.onCreate(); createChannel();
        Notification n=new Notification.Builder(this,CHANNEL).setContentTitle("Travis is listening").setContentText("Say Travis followed by a command").setSmallIcon(android.R.drawable.ic_btn_speak_now).setOngoing(true).build();
        if(Build.VERSION.SDK_INT>=29) startForeground(7,n,ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE); else startForeground(7,n);
        tts=new TextToSpeech(this,status->{if(status==TextToSpeech.SUCCESS)configureVoice();else Log.e(TAG,"TTS init failed: "+status);},"com.google.android.tts");
        tts.setOnUtteranceProgressListener(new UtteranceProgressListener(){public void onStart(String id){}public void onDone(String id){}public void onError(String id){Log.e(TAG,"TTS utterance error: "+id);}});
        recognizerIntent=new Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH);
        recognizerIntent.putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL,RecognizerIntent.LANGUAGE_MODEL_FREE_FORM);
        recognizerIntent.putExtra(RecognizerIntent.EXTRA_LANGUAGE,Locale.getDefault());
        recognizerIntent.putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS,true);
        recognizerIntent.putExtra(RecognizerIntent.EXTRA_PREFER_OFFLINE,true);
        if(!SpeechRecognizer.isRecognitionAvailable(this)){speak("Speech recognition is not available");stopSelf();return;}
        recognizer=SpeechRecognizer.createSpeechRecognizer(this);recognizer.setRecognitionListener(this);listen(300);
    }

    private void configureVoice(){
        if(tts==null)return;
        try{
            tts.setLanguage(Locale.US);tts.setPitch(PITCH);tts.setSpeechRate(RATE);
            Voice selected=null;Set<Voice> voices=tts.getVoices();
            if(voices!=null){
                String[] preferred={"en-us-x-sfg#male_1-local","en-us-x-sfg#male_2-local","en-us-x-tpc#male_1-local","en-us-x-tpc#male_2-local"};
                for(String wanted:preferred){for(Voice v:voices){if(v!=null&&wanted.equalsIgnoreCase(v.getName())){selected=v;break;}}if(selected!=null)break;}
                if(selected==null)for(Voice v:voices){if(v==null||v.getLocale()==null)continue;Locale l=v.getLocale();String n=v.getName()==null?"":v.getName().toLowerCase(Locale.ROOT);String f=v.getFeatures()==null?"":v.getFeatures().toString().toLowerCase(Locale.ROOT);if("en".equalsIgnoreCase(l.getLanguage())&&"US".equalsIgnoreCase(l.getCountry())&&(n.contains("male")||f.contains("male"))){selected=v;break;}}
            }
            if(selected!=null){tts.setVoice(selected);tts.setPitch(PITCH);tts.setSpeechRate(RATE);Log.i(TAG,"SELECTED MALE VOICE: "+selected.getName());}
            else Log.e(TAG,"NO EXPLICIT GOOGLE MALE VOICE FOUND");
        }catch(Exception e){Log.e(TAG,"voice setup",e);}
    }

    // Never cancel/start the recognizer from a partial result. Android requires a new
    // session only after onResults/onError from the previous session.
    private void listen(long delay){
        if(stopping||recognizer==null)return;
        main.postDelayed(()->{
            if(stopping||recognizer==null)return;
            try{wakeDetected=false;recognizer.startListening(recognizerIntent);listening=true;}
            catch(Exception e){Log.e(TAG,"startListening",e);listening=false;listen(1000);}
        },Math.max(0,delay));
    }

    private void inspectWake(String raw){
        String text=raw==null?"":raw.trim();
        if(text.isEmpty()||commandMode||wakeDetected)return;
        String lower=text.toLowerCase(Locale.ROOT);
        if(lower.contains("travis"))wakeDetected=true;
    }

    private void handleFinal(String raw){
        String text=raw==null?"":raw.trim();
        if(text.isEmpty()){listen(300);return;}
        if(!commandMode){
            String lower=text.toLowerCase(Locale.ROOT);
            int p=lower.indexOf("travis");
            if(p<0){listen(300);return;}
            String rem=text.substring(p+7).trim();
            if(rem.isEmpty()){
                commandMode=true;
                speak("Yeah?");
                listen(900);
            }else{
                sendToTravis(rem);
            }
            return;
        }
        commandMode=false;
        sendToTravis(text);
    }

    private void sendToTravis(String text){
        commandMode=false;wakeDetected=true;
        network.execute(()->{
            Exception last=null;
            for(int attempt=1;attempt<=3&&!stopping;attempt++){
                HttpURLConnection c=null;
                try{
                    c=(HttpURLConnection)new URL(ENDPOINT).openConnection();c.setRequestMethod("POST");c.setConnectTimeout(1200);c.setReadTimeout(5000);c.setDoOutput(true);c.setRequestProperty("Content-Type","application/json; charset=utf-8");
                    String body="{\"text\":\""+jsonEscape(text)+"\"}";try(OutputStream out=c.getOutputStream()){out.write(body.getBytes(StandardCharsets.UTF_8));}
                    int code=c.getResponseCode();
                    if(code>=200&&code<300){String response=readBody(c);String reply="Yeah.";try{JSONObject j=new JSONObject(response);reply=j.optString("reply",reply);}catch(Exception ignored){}speak(reply);last=null;break;}
                    last=new Exception("HTTP "+code);
                }catch(Exception e){last=e;Log.e(TAG,"bridge attempt "+attempt,e);}
                finally{if(c!=null)c.disconnect();}
                if(attempt<3)try{Thread.sleep(attempt*350L);}catch(InterruptedException e){Thread.currentThread().interrupt();break;}
            }
            if(last!=null&&!stopping)speak("Travis bridge is not reachable");
            listen(500);
        });
    }

    private static String readBody(HttpURLConnection c)throws Exception{try(BufferedReader r=new BufferedReader(new InputStreamReader(c.getInputStream(),StandardCharsets.UTF_8))){StringBuilder b=new StringBuilder();String line;while((line=r.readLine())!=null)b.append(line);return b.toString();}}
    private static String jsonEscape(String s){return s.replace("\\","\\\\").replace("\"","\\\"").replace("\n","\\n").replace("\r","\\r");}
    private void speak(String text){if(tts!=null&&text!=null&&!text.isEmpty()){try{tts.setPitch(PITCH);tts.setSpeechRate(RATE);tts.speak(text,TextToSpeech.QUEUE_FLUSH,null,"travis");}catch(Exception e){Log.e(TAG,"speak",e);}}}
    private void createChannel(){if(Build.VERSION.SDK_INT>=26){NotificationManager nm=getSystemService(NotificationManager.class);nm.createNotificationChannel(new NotificationChannel(CHANNEL,"Travis Voice",NotificationManager.IMPORTANCE_LOW));}}
    @Override public void onDestroy(){stopping=true;main.removeCallbacksAndMessages(null);if(recognizer!=null){try{recognizer.cancel();recognizer.destroy();}catch(Exception ignored){}recognizer=null;}if(tts!=null){try{tts.stop();tts.shutdown();}catch(Exception ignored){}tts=null;}network.shutdownNow();super.onDestroy();}
    @Override public IBinder onBind(Intent intent){return null;}
    @Override public void onReadyForSpeech(Bundle p){listening=true;}
    @Override public void onBeginningOfSpeech(){listening=true;}
    @Override public void onRmsChanged(float r){}
    @Override public void onBufferReceived(byte[] b){}
    @Override public void onEndOfSpeech(){listening=false;}
    @Override public void onError(int e){listening=false;Log.w(TAG,"recognition error="+e);listen(600);}
    @Override public void onResults(Bundle b){listening=false;ArrayList<String> r=b.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION);handleFinal(r!=null&&!r.isEmpty()?r.get(0):"");}
    @Override public void onPartialResults(Bundle b){ArrayList<String> r=b.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION);if(r!=null&&!r.isEmpty())inspectWake(r.get(0));}
    @Override public void onEvent(int e,Bundle p){}
}
