package com.akashsirra.travisvoice;

import android.Manifest;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.os.Bundle;
import android.provider.Settings;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.TextView;
import android.view.Gravity;

public class MainActivity extends android.app.Activity {
    private static final int REQ_MIC = 100;
    private TextView status;
    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        LinearLayout root=new LinearLayout(this); root.setOrientation(LinearLayout.VERTICAL); root.setPadding(48,80,48,48); root.setGravity(Gravity.CENTER_HORIZONTAL);
        TextView title=new TextView(this); title.setText("TRAVIS VOICE v1.2"); title.setTextSize(28); title.setGravity(Gravity.CENTER); root.addView(title,new LinearLayout.LayoutParams(-1,-2));
        status=new TextView(this); status.setText("Distinct deep male voice • Google TTS"); status.setTextSize(16); status.setGravity(Gravity.CENTER); root.addView(status,new LinearLayout.LayoutParams(-1,-2));
        Button start=new Button(this); start.setText("START TRAVIS"); root.addView(start,new LinearLayout.LayoutParams(-1,-2));
        Button test=new Button(this); test.setText("TEST TRAVIS VOICE"); root.addView(test,new LinearLayout.LayoutParams(-1,-2));
        Button ttsSettings=new Button(this); ttsSettings.setText("VOICE / TTS SETTINGS"); root.addView(ttsSettings,new LinearLayout.LayoutParams(-1,-2));
        Button stop=new Button(this); stop.setText("STOP"); root.addView(stop,new LinearLayout.LayoutParams(-1,-2)); setContentView(root);
        start.setOnClickListener(v->startTravis()); test.setOnClickListener(v->testVoice());
        ttsSettings.setOnClickListener(v->{try{startActivity(new Intent("com.android.settings.TTS_SETTINGS"));}catch(Exception e){startActivity(new Intent(Settings.ACTION_SETTINGS));}});
        stop.setOnClickListener(v->{stopService(new Intent(this,VoiceService.class));status.setText("Stopped");});
    }
    private void testVoice(){android.speech.tts.TextToSpeech t=new android.speech.tts.TextToSpeech(this,result->{if(result==android.speech.tts.TextToSpeech.SUCCESS){t.setLanguage(java.util.Locale.US);t.setPitch(0.48f);t.setSpeechRate(0.78f);android.speech.tts.Voice selected=null;java.util.Set<android.speech.tts.Voice> voices=t.getVoices();String[] preferred={"en-us-x-sfg#male_1-local","en-us-x-sfg#male_2-local","en-us-x-tpc#male_1-local","en-us-x-tpc#male_2-local"};if(voices!=null){for(String wanted:preferred){for(android.speech.tts.Voice v:voices){if(v!=null&&wanted.equalsIgnoreCase(v.getName())){selected=v;break;}}if(selected!=null)break;}}if(selected!=null){t.setVoice(selected);t.setPitch(0.48f);t.setSpeechRate(0.78f);status.setText("Travis voice: "+selected.getName());}else status.setText("No explicit Google male voice installed");t.speak("Yeah. Travis is online.",android.speech.tts.TextToSpeech.QUEUE_FLUSH,null,"test");}else status.setText("TTS initialization failed");},"com.google.android.tts");}
    private void startTravis(){if(checkSelfPermission(Manifest.permission.RECORD_AUDIO)!=PackageManager.PERMISSION_GRANTED){requestPermissions(new String[]{Manifest.permission.RECORD_AUDIO},REQ_MIC);return;}startForegroundService(new Intent(this,VoiceService.class));status.setText("Listening… say Travis");}
    @Override public void onRequestPermissionsResult(int requestCode,String[] permissions,int[] results){super.onRequestPermissionsResult(requestCode,permissions,results);if(requestCode==REQ_MIC&&results.length>0&&results[0]==PackageManager.PERMISSION_GRANTED)startTravis();}
}