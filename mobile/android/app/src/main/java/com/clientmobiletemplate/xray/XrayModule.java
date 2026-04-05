package com.clientmobiletemplate.xray;

import com.facebook.react.bridge.Arguments;
import com.facebook.react.bridge.Promise;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;
import com.facebook.react.bridge.WritableMap;

import java.io.BufferedReader;
import java.io.File;
import java.io.FileOutputStream;
import java.io.FileWriter;
import java.io.IOException;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.util.concurrent.TimeUnit;

public class XrayModule extends ReactContextBaseJavaModule {
    private final ReactApplicationContext reactContext;
    private Process xrayProcess;
    private File logFile;

    public XrayModule(ReactApplicationContext reactContext) {
        super(reactContext);
        this.reactContext = reactContext;
    }

    @Override
    public String getName() {
        return "XrayModule";
    }

    @ReactMethod
    public void start(String configJson, Promise promise) {
        try {
            if (xrayProcess != null && xrayProcess.isAlive()) {
                promise.resolve("already_running");
                return;
            }

            File workDir = new File(reactContext.getFilesDir(), "xray");
            if (!workDir.exists() && !workDir.mkdirs()) {
                throw new IOException("Failed to create xray working directory");
            }

            File binary = copyBinaryIfNeeded(workDir);
            File config = new File(workDir, "config.json");
            writeText(config, configJson);

            logFile = new File(workDir, "xray.log");

            ProcessBuilder processBuilder = new ProcessBuilder(
                binary.getAbsolutePath(),
                "run",
                "-c",
                config.getAbsolutePath()
            );
            processBuilder.directory(workDir);
            processBuilder.redirectErrorStream(true);

            xrayProcess = processBuilder.start();
            pipeLogs(xrayProcess.getInputStream(), logFile);

            promise.resolve("started");
        } catch (Exception error) {
            promise.reject("XRAY_START_FAILED", error);
        }
    }

    @ReactMethod
    public void stop(Promise promise) {
        try {
            if (xrayProcess != null) {
                xrayProcess.destroy();
                xrayProcess.waitFor(2, TimeUnit.SECONDS);
            }
            xrayProcess = null;
            promise.resolve("stopped");
        } catch (Exception error) {
            promise.reject("XRAY_STOP_FAILED", error);
        }
    }

    @ReactMethod
    public void getStatus(Promise promise) {
        WritableMap map = Arguments.createMap();
        boolean running = xrayProcess != null && xrayProcess.isAlive();
        map.putBoolean("running", running);
        map.putString("socks", "127.0.0.1:10808");
        map.putString("logPath", logFile == null ? "" : logFile.getAbsolutePath());
        promise.resolve(map);
    }

    private File copyBinaryIfNeeded(File workDir) throws IOException {
        File binary = new File(workDir, "xray");
        if (binary.exists()) {
            binary.setExecutable(true);
            return binary;
        }

        String abi = android.os.Build.SUPPORTED_ABIS.length > 0 ? android.os.Build.SUPPORTED_ABIS[0] : "arm64-v8a";
        String assetName;
        if (abi.contains("arm64")) {
            assetName = "xray-arm64-v8a";
        } else if (abi.contains("x86_64") || abi.contains("amd64")) {
            assetName = "xray-amd64";
        } else {
            // fallback to arm64 for most physical devices
            assetName = "xray-arm64-v8a";
        }

        try (InputStream input = reactContext.getAssets().open(assetName);
             FileOutputStream output = new FileOutputStream(binary)) {
            byte[] buffer = new byte[8192];
            int length;
            while ((length = input.read(buffer)) > 0) {
                output.write(buffer, 0, length);
            }
        }

        if (!binary.setExecutable(true)) {
            throw new IOException("Failed to set xray executable bit");
        }

        return binary;
    }

    private void writeText(File file, String text) throws IOException {
        try (FileWriter writer = new FileWriter(file, false)) {
            writer.write(text);
        }
    }

    private void pipeLogs(InputStream stream, File file) {
        Thread thread = new Thread(() -> {
            try (BufferedReader reader = new BufferedReader(new InputStreamReader(stream));
                 FileWriter writer = new FileWriter(file, true)) {
                String line;
                while ((line = reader.readLine()) != null) {
                    writer.write(line + "\n");
                    writer.flush();
                }
            } catch (IOException ignored) {
            }
        });
        thread.setDaemon(true);
        thread.start();
    }
}
