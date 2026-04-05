# Android Native Bridge Notes

## 1) Add Xray binary to assets

Place the executable here:

`app/src/main/assets/xray`

The module copies it to internal storage on first run and applies executable permission.

## 2) Register the package

In `MainApplication.java`, add:

```java
import com.client.xray.XrayPackage;
```

and inside `getPackages()`:

```java
packages.add(new XrayPackage());
```

## 3) Behavior

- Start: `xray run -c <internal-config-path>`
- Stop: destroys process
- Logs: app internal file `files/xray/xray.log`
