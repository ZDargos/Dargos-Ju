package com.dargos.ju;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(ZhSpeechPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
