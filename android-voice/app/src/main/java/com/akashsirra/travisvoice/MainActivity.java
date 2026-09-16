package com.akashsirra.travisvoice;

import android.Manifest;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.os.Bundle;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.TextView;
import android.view.Gravity;

import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;

public class MainActivity extends android.app.Activity {
    private static final int REQ_MIC = 100;

    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setPadding(48, 80, 48, 48);
        root.setGravity(Gravity.CENTER_HORIZONTAL);

        TextView title = new TextView(this);
        title.setText("TRAVIS VOICE");
        title.setTextSize(28);
        title.setGravity(Gravity.CENTER);
        root.addView(title, new LinearLayout.LayoutParams(-1, -2));

        TextView status = new TextView(this);
        status.setText("Native streaming voice layer");
        status.setTextSize(16);
        status.setGravity(Gravity.CENTER);
        root.addView(status, new LinearLayout.LayoutParams(-1, -2));

        Button start = new Button(this);
        start.setText("START TRAVIS");
        root.addView(start, new LinearLayout.LayoutParams(-1, -2));

        Button stop = new Button(this);
        stop.setText("STOP");
        root.addView(stop, new LinearLayout.LayoutParams(-1, -2));
        setContentView(root);

        start.setOnClickListener(v -> startTravis(status));
        stop.setOnClickListener(v -> {
            stopService(new Intent(this, VoiceService.class));
            status.setText("Stopped");
        });
    }

    private void startTravis(TextView status) {
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) {
            ActivityCompat.requestPermissions(this, new String[]{Manifest.permission.RECORD_AUDIO}, REQ_MIC);
            return;
        }
        Intent intent = new Intent(this, VoiceService.class);
        ContextCompat.startForegroundService(this, intent);
        status.setText("Listening… say Travis");
    }

    @Override public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] results) {
        super.onRequestPermissionsResult(requestCode, permissions, results);
        if (requestCode == REQ_MIC && results.length > 0 && results[0] == PackageManager.PERMISSION_GRANTED) {
            startTravis(new TextView(this));
        }
    }
}
