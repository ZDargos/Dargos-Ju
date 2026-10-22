package com.dargos.ju;

import android.content.Intent;
import android.content.pm.PackageManager;
import android.os.Bundle;
import android.speech.tts.TextToSpeech;
import android.speech.tts.UtteranceProgressListener;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.UUID;

/**
 * Mandarin text-to-speech. Prefers Google's speech engine when it is installed, because many
 * phones (Samsung especially) default to an engine without a Chinese voice, which speaks
 * Chinese text as silence.
 */
@CapacitorPlugin(name = "ZhSpeech")
public class ZhSpeechPlugin extends Plugin implements TextToSpeech.OnInitListener {
    private static final String GOOGLE_ENGINE = "com.google.android.tts";

    private TextToSpeech tts;
    private String engine;
    private boolean ready = false;
    private final List<PluginCall> waiting = new ArrayList<>();
    private PluginCall speaking;
    private String speakingId;

    @Override
    public void load() {
        init();
    }

    private void init() {
        ready = false;
        engine = isInstalled(GOOGLE_ENGINE) ? GOOGLE_ENGINE : null;
        tts = engine != null ? new TextToSpeech(getContext(), this, engine) : new TextToSpeech(getContext(), this);
        tts.setOnUtteranceProgressListener(new UtteranceProgressListener() {
            @Override public void onStart(String id) {}
            @Override public void onDone(String id) { finish(id, null); }
            @Override public void onError(String id) { finish(id, "Speech failed"); }
            @Override public void onStop(String id, boolean interrupted) { finish(id, null); }
        });
    }

    private synchronized void finish(String id, String error) {
        if (speaking == null || !id.equals(speakingId)) return;
        if (error == null) speaking.resolve();
        else speaking.reject(error);
        speaking = null;
        speakingId = null;
    }

    private boolean isInstalled(String pkg) {
        try {
            getContext().getPackageManager().getPackageInfo(pkg, 0);
            return true;
        } catch (PackageManager.NameNotFoundException e) {
            return false;
        }
    }

    @Override
    public void onInit(int status) {
        ready = status == TextToSpeech.SUCCESS;
        for (PluginCall call : waiting) call.resolve(statusObject());
        waiting.clear();
    }

    private JSObject statusObject() {
        JSObject o = new JSObject();
        o.put("ready", ready);
        o.put("engine", engine != null ? engine : (tts != null ? tts.getDefaultEngine() : null));
        o.put("googleInstalled", engine != null);
        int availability = ready ? tts.isLanguageAvailable(Locale.SIMPLIFIED_CHINESE) : TextToSpeech.LANG_NOT_SUPPORTED;
        o.put("chinese", availability >= TextToSpeech.LANG_AVAILABLE);
        o.put("missingData", availability == TextToSpeech.LANG_MISSING_DATA);
        return o;
    }

    @PluginMethod
    public void status(PluginCall call) {
        if (ready) call.resolve(statusObject());
        else waiting.add(call);
    }

    @PluginMethod
    public void speak(PluginCall call) {
        String text = call.getString("text", "");
        float rate = call.getFloat("rate", 1.0f);
        if (!ready) {
            call.reject("Speech engine is still starting");
            return;
        }
        int lang = tts.setLanguage(Locale.SIMPLIFIED_CHINESE);
        if (lang == TextToSpeech.LANG_MISSING_DATA || lang == TextToSpeech.LANG_NOT_SUPPORTED) {
            call.reject("NO_CHINESE_VOICE");
            return;
        }
        tts.setSpeechRate(rate);
        synchronized (this) {
            if (speaking != null) speaking.resolve();
            speaking = call;
            speakingId = UUID.randomUUID().toString();
        }
        Bundle params = new Bundle();
        params.putFloat(TextToSpeech.Engine.KEY_PARAM_VOLUME, 1.0f);
        tts.speak(text, TextToSpeech.QUEUE_FLUSH, params, speakingId);
    }

    @PluginMethod
    public void stop(PluginCall call) {
        if (tts != null) tts.stop();
        call.resolve();
    }

    /** Opens the engine's screen for downloading voice data (e.g. the Chinese voice). */
    @PluginMethod
    public void installVoice(PluginCall call) {
        Intent intent = new Intent(TextToSpeech.Engine.ACTION_INSTALL_TTS_DATA);
        if (engine != null) intent.setPackage(engine);
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        try {
            getContext().startActivity(intent);
            call.resolve();
        } catch (Exception e) {
            openSettings(call);
        }
    }

    /** Opens Android's text-to-speech settings. */
    @PluginMethod
    public void openSettings(PluginCall call) {
        Intent intent = new Intent("com.android.settings.TTS_SETTINGS");
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        try {
            getContext().startActivity(intent);
            call.resolve();
        } catch (Exception e) {
            call.reject("Could not open settings");
        }
    }

    @Override
    protected void handleOnResume() {
        // Voice data may have been installed while the user was in settings.
        if (tts != null) tts.shutdown();
        init();
    }

    @Override
    protected void handleOnDestroy() {
        if (tts != null) tts.shutdown();
    }
}
