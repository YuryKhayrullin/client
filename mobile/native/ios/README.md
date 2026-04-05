# iOS Native Bridge Notes

## Add files to Xcode

Add these files to your iOS target:

- `XrayModule.swift`
- `XrayModuleBridge.m`

## Add Xray binary

1. Add `xray` binary to iOS project.
2. Ensure target membership is enabled.
3. Ensure it is included in **Copy Bundle Resources**.

## Important limitation

This is a minimal personal-use bridge example. iOS process-execution behavior is restricted by platform policy, and production-grade iOS proxy/VPN apps typically require Network Extension.
