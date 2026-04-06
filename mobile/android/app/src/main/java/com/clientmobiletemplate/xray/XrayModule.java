package com.clientmobiletemplate.xray;

import android.os.Build;

import androidx.annotation.NonNull;
import androidx.annotation.Nullable;

import com.facebook.react.bridge.Arguments;
import com.facebook.react.bridge.Promise;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;
import com.facebook.react.bridge.WritableMap;

import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.FileWriter;
import java.io.IOException;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;

public class XrayModule extends ReactContextBaseJavaModule {
    private static final String MODULE_NAME = "XrayModule";

    private final Object lock = new Object();
    private final ReactApplicationContext reactContext;
    private final ExecutorService executor = Executors.newSingleThreadExecutor();

    private final File workDir;
    private final File configFile;
    private final File logFile;
    private final File binaryFile;

    @Nullable
    private Process xrayProcess;

    private long startedAtMs;
    private String lastError = "";

    public XrayModule(ReactApplicationContext reactContext) {
        super(reactContext);
        this.reactContext = reactContext;

        this.workDir = new File(reactContext.getFilesDir(), "xray-runtime");
        this.configFile = new File(workDir, "config.json");
        this.logFile = new File(workDir, "xray.log");
        this.binaryFile = new File(workDir, "xray");
    }

    @NonNull
    @Override
    public String getName() {
        return MODULE_NAME;
    }

    @Override
    public void invalidate() {
        super.invalidate();
        executor.execute(() -> {
            synchronized (lock) {
                stopProcessLocked("module_invalidated");
            }
        });
        executor.shutdown();
    }

    @ReactMethod
    public void start(String configJson, Promise promise) {
        executor.execute(() -> {
            try {
                String normalized = normalizeConfig(configJson);

                synchronized (lock) {
                    ensureRuntimeReadyLocked();
                    writeText(configFile, normalized);

                    if (isProcessRunningLocked()) {
                        appendLogLocked("start ignored: already running");
                        promise.resolve(buildStatusMapLocked());
                        return;
                    }

                    ProcessBuilder builder = new ProcessBuilder(
                        binaryFile.getAbsolutePath(),
                        "run",
                        "-c",
                        configFile.getAbsolutePath()
                    );
                    builder.directory(workDir);
                    builder.redirectErrorStream(true);

                    xrayProcess = builder.start();
                    startedAtMs = System.currentTimeMillis();
                    lastError = "";

                    appendLogLocked("core started");
                    pipeLogs(xrayProcess.getInputStream());

                    promise.resolve(buildStatusMapLocked());
                }
            } catch (Exception error) {
                synchronized (lock) {
                    lastError = error.getMessage() == null ? "start failed" : error.getMessage();
                    appendLogLocked("start failed: " + lastError);
                }
                promise.reject("XRAY_START_FAILED", error);
            }
        });
    }

    @ReactMethod
    public void restart(String configJson, Promise promise) {
        executor.execute(() -> {
            try {
                String normalized = normalizeConfig(configJson);

                synchronized (lock) {
                    stopProcessLocked("restart");
                    ensureRuntimeReadyLocked();
                    writeText(configFile, normalized);

                    ProcessBuilder builder = new ProcessBuilder(
                        binaryFile.getAbsolutePath(),
                        "run",
                        "-c",
                        configFile.getAbsolutePath()
                    );
                    builder.directory(workDir);
                    builder.redirectErrorStream(true);

                    xrayProcess = builder.start();
                    startedAtMs = System.currentTimeMillis();
                    lastError = "";

                    appendLogLocked("core restarted");
                    pipeLogs(xrayProcess.getInputStream());

                    promise.resolve(buildStatusMapLocked());
                }
            } catch (Exception error) {
                synchronized (lock) {
                    lastError = error.getMessage() == null ? "restart failed" : error.getMessage();
                    appendLogLocked("restart failed: " + lastError);
                }
                promise.reject("XRAY_RESTART_FAILED", error);
            }
        });
    }

    @ReactMethod
    public void stop(Promise promise) {
        executor.execute(() -> {
            synchronized (lock) {
                try {
                    stopProcessLocked("api_stop");
                    promise.resolve(buildStatusMapLocked());
                } catch (Exception error) {
                    lastError = error.getMessage() == null ? "stop failed" : error.getMessage();
                    appendLogLocked("stop failed: " + lastError);
                    promise.reject("XRAY_STOP_FAILED", error);
                }
            }
        });
    }

    @ReactMethod
    public void getStatus(Promise promise) {
        executor.execute(() -> {
            synchronized (lock) {
                promise.resolve(buildStatusMapLocked());
            }
        });
    }

    @ReactMethod
    public void loadConfig(Promise promise) {
        executor.execute(() -> {
            synchronized (lock) {
                try {
                    ensureRuntimeReadyLocked();
                    if (!configFile.exists()) {
                        promise.resolve("");
                        return;
                    }

                    promise.resolve(readText(configFile));
                } catch (Exception error) {
                    promise.reject("XRAY_LOAD_CONFIG_FAILED", error);
                }
            }
        });
    }

    @ReactMethod
    public void saveConfig(String configJson, Promise promise) {
        executor.execute(() -> {
            try {
                String normalized = normalizeConfig(configJson);

                synchronized (lock) {
                    ensureRuntimeReadyLocked();
                    writeText(configFile, normalized);
                    appendLogLocked("config saved");
                    promise.resolve(true);
                }
            } catch (Exception error) {
                synchronized (lock) {
                    lastError = error.getMessage() == null ? "save config failed" : error.getMessage();
                    appendLogLocked("save config failed: " + lastError);
                }
                promise.reject("XRAY_SAVE_CONFIG_FAILED", error);
            }
        });
    }

    private String normalizeConfig(String raw) throws Exception {
        JSONObject object = new JSONObject(raw);
        if (!object.has("outbounds")) {
            throw new IllegalArgumentException("Config must include outbounds");
        }
        return object.toString(2);
    }

    private void ensureRuntimeReadyLocked() throws IOException {
        if (!workDir.exists() && !workDir.mkdirs()) {
            throw new IOException("Cannot create runtime directory: " + workDir.getAbsolutePath());
        }
        ensureBinaryReadyLocked();
    }

    private void ensureBinaryReadyLocked() throws IOException {
        if (!binaryFile.exists() || binaryFile.length() == 0) {
            String assetName = resolveBinaryAssetName();
            copyAssetToFile(assetName, binaryFile);
        }

        if (!binaryFile.setExecutable(true)) {
            throw new IOException("Cannot set executable bit for xray binary");
        }
    }

    private String resolveBinaryAssetName() throws IOException {
        String[] abis = Build.SUPPORTED_ABIS;
        for (String abi : abis) {
            String candidate = null;
            if (abi.contains("arm64")) {
                candidate = "xray-arm64-v8a";
            } else if (abi.contains("x86_64") || abi.contains("amd64")) {
                candidate = "xray-amd64";
            } else if (abi.contains("armeabi")) {
                candidate = "xray-armv7a";
            } else if (abi.contains("x86")) {
                candidate = "xray-386";
            }

            if (candidate != null && assetExists(candidate)) {
                return candidate;
            }
        }

        if (assetExists("xray-arm64-v8a")) return "xray-arm64-v8a";
        if (assetExists("xray-amd64")) return "xray-amd64";

        throw new IOException("No compatible xray binary in assets");
    }

    private boolean assetExists(String name) {
        try (InputStream ignored = reactContext.getAssets().open(name)) {
            return true;
        } catch (IOException error) {
            return false;
        }
    }

    private void copyAssetToFile(String assetName, File destination) throws IOException {
        try (InputStream input = reactContext.getAssets().open(assetName);
             FileOutputStream output = new FileOutputStream(destination, false)) {
            byte[] buffer = new byte[8192];
            int count;
            while ((count = input.read(buffer)) != -1) {
                output.write(buffer, 0, count);
            }
        }
    }

    private void stopProcessLocked(String reason) {
        if (xrayProcess == null) {
            appendLogLocked("stop ignored: already stopped (" + reason + ")");
            startedAtMs = 0;
            return;
        }

        appendLogLocked("stopping core: " + reason);

        Process process = xrayProcess;
        process.destroy();

        try {
            if (!process.waitFor(1500, TimeUnit.MILLISECONDS)) {
                process.destroyForcibly();
                process.waitFor(1500, TimeUnit.MILLISECONDS);
            }
        } catch (InterruptedException interrupted) {
            Thread.currentThread().interrupt();
        }

        xrayProcess = null;
        startedAtMs = 0;
    }

    private boolean isProcessRunningLocked() {
        if (xrayProcess == null) return false;

        if (!xrayProcess.isAlive()) {
            xrayProcess = null;
            startedAtMs = 0;
            return false;
        }

        return true;
    }

    private WritableMap buildStatusMapLocked() {
        boolean running = isProcessRunningLocked();

        WritableMap map = Arguments.createMap();
        map.putBoolean("running", running);
        map.putString("socks", "127.0.0.1:10808");
        map.putString("logPath", logFile.getAbsolutePath());
        map.putString("configPath", configFile.getAbsolutePath());
        map.putDouble("startedAtMs", (double) startedAtMs);
        map.putString("lastError", lastError == null ? "" : lastError);
        return map;
    }

    private void pipeLogs(InputStream stream) {
        Thread thread = new Thread(() -> {
            try (BufferedReader reader = new BufferedReader(new InputStreamReader(stream, StandardCharsets.UTF_8));
                 FileWriter writer = new FileWriter(logFile, true)) {
                String line;
                while ((line = reader.readLine()) != null) {
                    writer.write(System.currentTimeMillis() + " " + line + "\n");
                    writer.flush();
                }
            } catch (IOException ignored) {
            }
        }, "xray-log-pump");

        thread.setDaemon(true);
        thread.start();
    }

    private void appendLogLocked(String text) {
        try {
            ensureRuntimeReadyLocked();
            try (FileWriter writer = new FileWriter(logFile, true)) {
                writer.write(System.currentTimeMillis() + " " + text + "\n");
            }
        } catch (IOException ignored) {
        }
    }

    private void writeText(File target, String text) throws IOException {
        try (FileWriter writer = new FileWriter(target, false)) {
            writer.write(text);
        }
    }

    private String readText(File target) throws IOException {
        FileInputStream input = new FileInputStream(target);
        byte[] bytes = new byte[(int) target.length()];
        int offset = 0;

        while (offset < bytes.length) {
            int count = input.read(bytes, offset, bytes.length - offset);
            if (count == -1) break;
            offset += count;
        }

        input.close();
        return new String(bytes, 0, offset, StandardCharsets.UTF_8);
    }
}
