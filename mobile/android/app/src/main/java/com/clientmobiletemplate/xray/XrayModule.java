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

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.FileWriter;
import java.io.IOException;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.net.InetSocketAddress;
import java.net.Socket;
import java.net.SocketTimeoutException;
import java.nio.charset.StandardCharsets;
import java.util.Locale;
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

    @Nullable
    private Integer processExitCode;

    private String lastProbeTarget = "";
    private long lastProbeAtMs;
    private long lastProbeLatencyMs;
    private boolean lastProbeOk;
    private String lastProbeError = "";

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

                    launchCoreProcessLocked("started");
                }

                sleepQuietly(350);

                synchronized (lock) {
                    if (!isProcessRunningLocked()) {
                        String reason = lastError == null || lastError.isEmpty()
                            ? "core exited right after start"
                            : lastError;
                        promise.reject("XRAY_START_FAILED", reason);
                        return;
                    }

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
                    launchCoreProcessLocked("restarted");
                }

                sleepQuietly(350);

                synchronized (lock) {
                    if (!isProcessRunningLocked()) {
                        String reason = lastError == null || lastError.isEmpty()
                            ? "core exited right after restart"
                            : lastError;
                        promise.reject("XRAY_RESTART_FAILED", reason);
                        return;
                    }

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

    @ReactMethod
    public void checkServerReachable(String host, double portValue, double timeoutValue, Promise promise) {
        executor.execute(() -> {
            String safeHost = host == null ? "" : host.trim();
            int port = (int) Math.round(portValue);
            int timeoutMs = (int) Math.round(timeoutValue);

            if (timeoutMs <= 0) {
                timeoutMs = 4500;
            }

            if (safeHost.isEmpty()) {
                promise.reject("XRAY_PROBE_FAILED", "Server host is empty.");
                return;
            }

            if (port <= 0 || port > 65535) {
                promise.reject("XRAY_PROBE_FAILED", "Server port is out of range.");
                return;
            }

            long start = System.currentTimeMillis();

            try (Socket socket = new Socket()) {
                socket.connect(new InetSocketAddress(safeHost, port), timeoutMs);
                long latency = Math.max(1, System.currentTimeMillis() - start);

                synchronized (lock) {
                    updateProbeLocked(true, safeHost, port, latency, "");
                    appendLogLocked("probe success: " + formatTarget(safeHost, port) + " " + latency + "ms");
                }

                WritableMap result = Arguments.createMap();
                result.putBoolean("reachable", true);
                result.putString("target", formatTarget(safeHost, port));
                result.putDouble("latencyMs", (double) latency);
                promise.resolve(result);
            } catch (Exception error) {
                String message = formatProbeError(error, timeoutMs);

                synchronized (lock) {
                    updateProbeLocked(false, safeHost, port, 0, message);
                    lastError = message;
                    appendLogLocked("probe failed: " + formatTarget(safeHost, port) + " " + message);
                }

                promise.reject("XRAY_PROBE_FAILED", message);
            }
        });
    }

    private void launchCoreProcessLocked(String actionText) throws IOException {
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
        processExitCode = null;
        lastError = "";

        appendLogLocked("core " + actionText);
        pipeLogs(xrayProcess.getInputStream());
        watchProcessExit(xrayProcess);
    }

    private String normalizeConfig(String raw) throws Exception {
        JSONObject object = new JSONObject(raw);
        JSONArray outbounds = object.optJSONArray("outbounds");

        if (outbounds == null || outbounds.length() == 0) {
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
            processExitCode = null;
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
        processExitCode = null;
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

        if (processExitCode == null) {
            map.putNull("processExitCode");
        } else {
            map.putInt("processExitCode", processExitCode);
        }

        map.putString("lastProbeTarget", lastProbeTarget == null ? "" : lastProbeTarget);
        map.putDouble("lastProbeAtMs", (double) lastProbeAtMs);
        map.putDouble("lastProbeLatencyMs", (double) lastProbeLatencyMs);
        map.putBoolean("lastProbeOk", lastProbeOk);
        map.putString("lastProbeError", lastProbeError == null ? "" : lastProbeError);

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

                    String normalized = line.toLowerCase(Locale.US);
                    if (normalized.contains("error") || normalized.contains("failed") || normalized.contains("panic")) {
                        synchronized (lock) {
                            lastError = line;
                        }
                    }
                }
            } catch (IOException ignored) {
            }
        }, "xray-log-pump");

        thread.setDaemon(true);
        thread.start();
    }

    private void watchProcessExit(Process process) {
        Thread watcher = new Thread(() -> {
            int exitCode;
            try {
                exitCode = process.waitFor();
            } catch (InterruptedException interrupted) {
                Thread.currentThread().interrupt();
                return;
            }

            synchronized (lock) {
                if (xrayProcess != process) {
                    return;
                }

                xrayProcess = null;
                startedAtMs = 0;
                processExitCode = exitCode;

                String tail = readLastLogLineLocked();
                if (tail == null || tail.isEmpty()) {
                    lastError = "Core exited with code " + exitCode;
                } else {
                    lastError = "Core exited with code " + exitCode + ": " + tail;
                }

                appendLogLocked("core exited with code " + exitCode);
            }
        }, "xray-exit-watcher");

        watcher.setDaemon(true);
        watcher.start();
    }

    private String readLastLogLineLocked() {
        if (!logFile.exists()) return "";

        String last = "";
        try (BufferedReader reader = new BufferedReader(
            new InputStreamReader(new FileInputStream(logFile), StandardCharsets.UTF_8)
        )) {
            String line;
            while ((line = reader.readLine()) != null) {
                String trimmed = line.trim();
                if (!trimmed.isEmpty()) {
                    last = trimmed;
                }
            }
        } catch (IOException ignored) {
        }

        return last;
    }

    private void updateProbeLocked(boolean ok, String host, int port, long latencyMs, String errorMessage) {
        lastProbeTarget = formatTarget(host, port);
        lastProbeAtMs = System.currentTimeMillis();
        lastProbeLatencyMs = latencyMs;
        lastProbeOk = ok;
        lastProbeError = errorMessage == null ? "" : errorMessage;
    }

    private String formatTarget(String host, int port) {
        return host + ":" + port;
    }

    private String formatProbeError(Exception error, int timeoutMs) {
        if (error instanceof SocketTimeoutException) {
            return "Server probe timeout after " + timeoutMs + "ms";
        }

        String message = error.getMessage();
        if (message == null || message.trim().isEmpty()) {
            return "Server probe failed";
        }

        return message;
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
        try (FileInputStream input = new FileInputStream(target)) {
            byte[] bytes = new byte[(int) target.length()];
            int offset = 0;

            while (offset < bytes.length) {
                int count = input.read(bytes, offset, bytes.length - offset);
                if (count == -1) break;
                offset += count;
            }

            return new String(bytes, 0, offset, StandardCharsets.UTF_8);
        }
    }

    private void sleepQuietly(long durationMs) {
        try {
            Thread.sleep(durationMs);
        } catch (InterruptedException interrupted) {
            Thread.currentThread().interrupt();
        }
    }
}
