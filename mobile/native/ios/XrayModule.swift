import Foundation
import React
import Darwin

@objc(XrayModule)
class XrayModule: NSObject {
  private var childPid: pid_t = 0
  private var running = false

  @objc(start:resolver:rejecter:)
  func start(
    _ configJson: String,
    resolver resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
    do {
      if running {
        resolve("already_running")
        return
      }

      let workDir = try ensureWorkDir()
      let binary = try ensureBinary(workDir: workDir)
      let configPath = workDir.appendingPathComponent("config.json")
      try configJson.write(to: configPath, atomically: true, encoding: .utf8)

      var pid = pid_t()
      var argv: [UnsafeMutablePointer<CChar>?] = [
        strdup(binary.path),
        strdup("run"),
        strdup("-c"),
        strdup(configPath.path),
        nil
      ]

      defer {
        for ptr in argv {
          if let ptr = ptr {
            free(ptr)
          }
        }
      }

      let result = posix_spawn(&pid, binary.path, nil, nil, &argv, environ)
      guard result == 0 else {
        throw NSError(
          domain: "XrayModule",
          code: Int(result),
          userInfo: [NSLocalizedDescriptionKey: "posix_spawn failed with code \(result)"]
        )
      }

      childPid = pid
      running = true
      resolve("started")
    } catch {
      reject("XRAY_START_FAILED", error.localizedDescription, error)
    }
  }

  @objc(stop:rejecter:)
  func stop(
    _ resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
    if running {
      _ = kill(childPid, SIGTERM)
    }

    childPid = 0
    running = false
    resolve("stopped")
  }

  @objc(getStatus:rejecter:)
  func getStatus(
    _ resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
    resolve([
      "running": running,
      "socks": "127.0.0.1:10808"
    ])
  }

  private func ensureWorkDir() throws -> URL {
    let base = try FileManager.default.url(
      for: .applicationSupportDirectory,
      in: .userDomainMask,
      appropriateFor: nil,
      create: true
    )

    let workDir = base.appendingPathComponent("xray", isDirectory: true)
    try FileManager.default.createDirectory(at: workDir, withIntermediateDirectories: true)
    return workDir
  }

  private func ensureBinary(workDir: URL) throws -> URL {
    guard let bundledPath = Bundle.main.path(forResource: "xray", ofType: nil) else {
      throw NSError(domain: "XrayModule", code: 11, userInfo: [
        NSLocalizedDescriptionKey: "xray binary was not found in iOS bundle"
      ])
    }

    let target = workDir.appendingPathComponent("xray")

    if !FileManager.default.fileExists(atPath: target.path) {
      try FileManager.default.copyItem(atPath: bundledPath, toPath: target.path)
    }

    if chmod(target.path, 0o755) != 0 {
      throw NSError(domain: "XrayModule", code: 12, userInfo: [
        NSLocalizedDescriptionKey: "Failed to set executable bit on xray binary"
      ])
    }

    return target
  }

  @objc
  static func requiresMainQueueSetup() -> Bool {
    false
  }
}
