// Watch-along helper: maps a game's penalties to positions in a streamed
// replay, without saving any video.
//
// While a game plays in the browser, `watch` screenshots the screen about once
// a second, reads the scoreboard (period + game clock) with Apple's Vision
// OCR, notes where the player is in the video, and throws the image away. Each
// sample is one CSV row. `analyze` then lines those rows up with the game's
// penalties from HockeyTech.
//
// A penalty is recorded at the whistle, not the infraction. So for each one
// this reports where the clock froze at that time (the whistle) and where the
// clock last started running before it (the faceoff that began the play). The
// infraction is somewhere between the two; on a delayed penalty it can be well
// before the whistle.
//
// Build once (needs Xcode's command-line tools, nothing else):
//   swiftc -O tools/watchalong/watchalong.swift -o tools/watchalong/watchalong
//
// Use:
//   tools/watchalong/watchalong ocr <image>            what OCR sees in a screenshot
//   tools/watchalong/watchalong watch <session.csv>    sample until Ctrl-C
//   tools/watchalong/watchalong analyze <session.csv> <game#>
//
// <game#> is the AHL game number from Game Details ("Game# 123") for this
// season, or the HockeyTech id from a theahl.com game-center URL (7 digits).
//
// Playback speed and skipping ahead don't matter: every sample is keyed to the
// video's own position, not to wall time. The video position comes from the
// browser's <video> element when Safari or Chrome allows JavaScript from Apple
// Events (fast and exact). Otherwise it's read off the player's
// "39:10 / 3:19:41" readout, which only shows while the controls are visible.
//
// The terminal running `watch` needs Screen Recording permission (System
// Settings → Privacy & Security). macOS asks on first run.

import AppKit
import Foundation
import Vision

// MARK: - Small helpers

func fail(_ message: String) -> Never {
  FileHandle.standardError.write((message + "\n").data(using: .utf8)!)
  exit(1)
}

func regex(_ pattern: String) -> NSRegularExpression {
  try! NSRegularExpression(pattern: pattern, options: [.caseInsensitive])
}

func groups(_ re: NSRegularExpression, _ s: String) -> [String]? {
  let ns = s as NSString
  guard let m = re.firstMatch(in: s, range: NSRange(location: 0, length: ns.length)) else { return nil }
  return (0..<m.numberOfRanges).map { i in
    let r = m.range(at: i)
    return r.location == NSNotFound ? "" : ns.substring(with: r)
  }
}

/// "39:10" -> 2350, "3:19:41" -> 11981.
func parseHMS(_ s: String) -> Double? {
  let parts = s.split(separator: ":").map { Double($0) }
  guard !parts.isEmpty, parts.allSatisfy({ $0 != nil }) else { return nil }
  return parts.reduce(0) { $0 * 60 + $1! }
}

func formatHMS(_ t: Double) -> String {
  let s = Int(t.rounded())
  return s >= 3600
    ? String(format: "%d:%02d:%02d", s / 3600, s / 60 % 60, s % 60)
    : String(format: "%d:%02d", s / 60, s % 60)
}

func formatClock(_ t: Double) -> String {
  t < 60 && t != t.rounded() ? String(format: "%.1f", t) : formatHMS(t)
}

func periodName(_ p: Int) -> String {
  switch p {
  case 1: return "1st"
  case 2: return "2nd"
  case 3: return "3rd"
  case 4: return "OT"
  case 5: return "SO"
  default: return "P\(p)"
  }
}

// MARK: - OCR

struct TextLine {
  let text: String
  /// Normalized to the image, origin top-left.
  let box: CGRect
}

/// Scoreboard text on a 720p frame is small; Vision reads it better at twice the size.
func enlargedIfSmall(_ image: CGImage) -> CGImage {
  guard image.width < 1600,
        let ctx = CGContext(data: nil, width: image.width * 2, height: image.height * 2, bitsPerComponent: 8,
                            bytesPerRow: 0, space: CGColorSpaceCreateDeviceRGB(),
                            bitmapInfo: CGImageAlphaInfo.noneSkipLast.rawValue) else { return image }
  ctx.interpolationQuality = .high
  ctx.draw(image, in: CGRect(x: 0, y: 0, width: image.width * 2, height: image.height * 2))
  return ctx.makeImage() ?? image
}

func recognizeText(_ original: CGImage) -> [TextLine] {
  let image = enlargedIfSmall(original)
  let request = VNRecognizeTextRequest()
  request.recognitionLevel = .accurate
  // Clock and score digits aren't words; correction "fixes" them into words.
  request.usesLanguageCorrection = false
  try? VNImageRequestHandler(cgImage: image).perform([request])
  return (request.results ?? []).compactMap { obs in
    guard let text = obs.topCandidates(1).first?.string else { return nil }
    let b = obs.boundingBox
    return TextLine(text: text, box: CGRect(x: b.minX, y: 1 - b.maxY, width: b.width, height: b.height))
  }
}

func loadImage(_ path: String) -> CGImage? {
  NSImage(contentsOfFile: path)?.cgImage(forProposedRect: nil, context: nil, hints: nil)
}

// MARK: - Reading the scoreboard and the player

struct Scoreboard {
  let period: Int
  /// Seconds left in the period, as the scoreboard shows it.
  let clock: Double
  let clockText: String
  let box: CGRect
}

let clockRe = regex(#"^(\d{1,2}):([0-5]\d)$"#)
let tenthsRe = regex(#"^([0-5]?\d)\.(\d)$"#)
// OCR reads the "1" in "1st" as I, l or |.
let periodRe = regex(#"^([1Il|]st|2nd|3rd|[1-9]?OT[1-9]?|SO)$"#)
let positionRe = regex(#"(\d{1,2}(?::\d{2}){1,2})\s*/\s*(\d{1,2}(?::\d{2}){1,2})"#)
let powerPlayRe = regex(#"power\s*play|\bPP\b|penalty|delayed"#)

func periodNumber(_ token: String) -> Int? {
  let t = token.uppercased()
  if t == "SO" { return 5 }
  if t.contains("OT") { return 4 }
  if t.hasSuffix("ST") { return 1 }
  if t.hasPrefix("2") { return 2 }
  if t.hasPrefix("3") { return 3 }
  return nil
}

func distance(_ a: CGRect, _ b: CGRect) -> CGFloat {
  hypot(a.midX - b.midX, a.midY - b.midY)
}

/// The game clock is the biggest m:ss on screen with a period label beside it.
/// Power-play and penalty timers sit next to their own label and are smaller.
///
/// Once the scoreboard has been found, `near` is where its clock was and
/// `lastPeriod` its period: only a clock in that spot counts (other text on
/// screen, like a penalty graphic, can look like a clock), and a frame where
/// OCR missed the period label keeps the last one.
func readScoreboard(_ lines: [TextLine], near: CGRect?, lastPeriod: Int? = nil) -> Scoreboard? {
  var tokens: [(text: String, box: CGRect)] = []
  // On a low-quality frame OCR can split the clock in two ("18" and ":34").
  for a in lines {
    for b in lines where b.box.minX > a.box.minX {
      let sameRow = abs(a.box.midY - b.box.midY) < max(a.box.height, b.box.height) * 0.6
      let joined = a.text + b.text
      if sameRow, b.box.minX - a.box.maxX < 0.02, groups(clockRe, joined) != nil {
        tokens.append((joined, a.box.union(b.box)))
      }
    }
  }
  for line in lines {
    let parts = line.text.split(separator: " ").map(String.init)
    if parts.count == 1 {
      tokens.append((line.text, line.box))
    } else {
      // A merged line ("15:57 1st"): give each word a slice of the box.
      let w = line.box.width / CGFloat(parts.count)
      for (i, p) in parts.enumerated() {
        tokens.append((p, CGRect(x: line.box.minX + CGFloat(i) * w, y: line.box.minY, width: w, height: line.box.height)))
      }
    }
  }
  let labels = lines.filter { groups(powerPlayRe, $0.text) != nil }.map(\.box)
  let periods = tokens.compactMap { t -> (Int, CGRect)? in
    guard groups(periodRe, t.text) != nil, let p = periodNumber(t.text) else { return nil }
    return (p, t.box)
  }
  guard !periods.isEmpty || (near != nil && lastPeriod != nil) else { return nil }

  var best: (Scoreboard, CGFloat)?
  for t in tokens {
    var clock: Double?
    if let g = groups(clockRe, t.text), let m = Double(g[1]), let s = Double(g[2]), m <= 20 {
      clock = m * 60 + s
    } else if let g = groups(tenthsRe, t.text), let s = Double(g[1]), let d = Double(g[2]) {
      clock = s + d / 10
    }
    guard let clock else { continue }
    // Skip timers labelled as a power play / penalty on the same row.
    let labelled = labels.contains { l in
      abs(l.midY - t.box.midY) < max(l.height, t.box.height) && t.box.minX > l.minX && t.box.minX - l.maxX < 0.08
    }
    if labelled { continue }
    if let near, distance(near, t.box) > 0.05 { continue }
    var period: Int
    if let found = periods.min(by: { distance($0.1, t.box) < distance($1.1, t.box) }), distance(found.1, t.box) < 0.12 {
      period = found.0
    } else if near != nil, let lastPeriod {
      period = lastPeriod
    } else {
      continue
    }
    var score = t.box.height
    if let near { score -= distance(near, t.box) * 0.5 }
    let board = Scoreboard(period: period, clock: clock, clockText: t.text, box: t.box)
    if best == nil || score > best!.1 { best = (board, score) }
  }
  return best?.0
}

func readPosition(_ lines: [TextLine]) -> Double? {
  for line in lines {
    if let g = groups(positionRe, line.text), let pos = parseHMS(g[1]) { return pos }
  }
  return nil
}

// MARK: - Video position from the browser

/// The largest <video> on the page: position, playback rate.
let videoJS = """
(() => { const v = [...document.querySelectorAll('video')].sort((a, b) => b.clientWidth * b.clientHeight - a.clientWidth * a.clientHeight)[0]; return v ? v.currentTime + ',' + v.playbackRate : ''; })()
"""

enum Browser: String {
  case safari = "Safari"
  case chrome = "Google Chrome"

  var bundleId: String { self == .safari ? "com.apple.Safari" : "com.google.Chrome" }

  var script: String {
    let js = videoJS.replacingOccurrences(of: "\\", with: "\\\\").replacingOccurrences(of: "\"", with: "\\\"")
    switch self {
    case .safari: return "tell application \"Safari\" to do JavaScript \"\(js)\" in front document"
    case .chrome: return "tell application \"Google Chrome\" to execute active tab of front window javascript \"\(js)\""
    }
  }
}

func runOsascript(_ source: String) -> String? {
  let p = Process()
  p.executableURL = URL(fileURLWithPath: "/usr/bin/osascript")
  p.arguments = ["-e", source]
  let out = Pipe()
  p.standardOutput = out
  p.standardError = Pipe()
  do { try p.run() } catch { return nil }
  // Read before waiting: a reply bigger than the pipe's buffer (a video frame)
  // would otherwise block osascript, and waiting on it would hang forever.
  let data = out.fileHandleForReading.readDataToEndOfFile()
  p.waitUntilExit()
  guard p.terminationStatus == 0 else { return nil }
  return String(data: data, encoding: .utf8)?
    .trimmingCharacters(in: .whitespacesAndNewlines)
}

/// Only asks browsers that are already running, so nothing gets launched.
func browserVideo(_ browser: Browser) -> (pos: Double, rate: Double)? {
  guard NSWorkspace.shared.runningApplications.contains(where: { $0.bundleIdentifier == browser.bundleId }),
        let out = runOsascript(browser.script) else { return nil }
  let parts = out.split(separator: ",").compactMap { Double($0) }
  return parts.count == 2 ? (parts[0], parts[1]) : nil
}

// MARK: - Screen capture

func captureScreen(display: Int, to path: String) -> Bool {
  let p = Process()
  p.executableURL = URL(fileURLWithPath: "/usr/sbin/screencapture")
  p.arguments = ["-x", "-D", String(display), "-t", "png", path]
  do { try p.run() } catch { return false }
  p.waitUntilExit()
  return p.terminationStatus == 0 && FileManager.default.fileExists(atPath: path)
}

// MARK: - Commands

func ocrCommand(_ path: String) {
  guard let image = loadImage((path as NSString).expandingTildeInPath) else { fail("Couldn't open \(path)") }
  let started = Date()
  let lines = recognizeText(image)
  let ms = Int(Date().timeIntervalSince(started) * 1000)
  print("\(image.width)x\(image.height) image, \(lines.count) text lines, OCR \(ms) ms")
  if lines.isEmpty { print("No text found. If the screenshot looks black, the stream is DRM-protected.") }
  for l in lines.sorted(by: { $0.box.minY < $1.box.minY }) {
    print(String(format: "  %-28@ at x %.2f y %.2f h %.3f", l.text as NSString, l.box.minX, l.box.minY, l.box.height))
  }
  if let board = readScoreboard(lines, near: nil) {
    print("Scoreboard: \(periodName(board.period)) \(formatClock(board.clock))")
  } else {
    print("Scoreboard: not found")
  }
  print("Video position: \(readPosition(lines).map(formatHMS) ?? "not visible")")
}

let csvHeader = "wall_time,video_pos,pos_source,rate,period,clock,clock_text"

/// After this many frames in a row without the scoreboard where it was (a
/// replay, an intermission, a moved window), look for it anywhere again.
let relocateAfter = 10

func watchCommand(_ out: String, interval: Double, display: Int, missesDir: String?) {
  let path = (out as NSString).expandingTildeInPath
  let exists = FileManager.default.fileExists(atPath: path)
  if !exists { FileManager.default.createFile(atPath: path, contents: (csvHeader + "\n").data(using: .utf8)) }
  guard let file = FileHandle(forWritingAtPath: path) else { fail("Can't write \(path)") }
  file.seekToEndOfFile()
  let shot = NSTemporaryDirectory() + "watchalong-\(getpid()).png"

  let browser = [Browser.safari, .chrome].first { browserVideo($0) != nil }
  if let browser {
    print("Video position: from \(browser.rawValue)'s player.")
  } else {
    print("""
      Video position: read off the player's controls, so only while they're visible.
        For an exact position every second, allow JavaScript from Apple Events:
        Safari: Settings → Advanced → Show features for web developers, then Develop → Allow JavaScript from Apple Events
        Chrome: View → Developer → Allow JavaScript from Apple Events
        (If the video plays inside an embedded frame, this may still not work.)
      """)
  }
  print("\(exists ? "Appending to" : "Writing") \(path). Ctrl-C to stop.\n")

  if let missesDir {
    try? FileManager.default.createDirectory(atPath: missesDir, withIntermediateDirectories: true)
    print("Saving up to 20 frames without a readable scoreboard to \(missesDir)\n")
  }
  var near: CGRect?
  var lastPeriod: Int?
  var missed = 0
  var saved = 0
  var samples = 0
  while true {
    let started = Date()
    defer {
      let wait = interval - Date().timeIntervalSince(started)
      if wait > 0 { Thread.sleep(forTimeInterval: wait) }
    }
    guard captureScreen(display: display, to: shot), let image = loadImage(shot) else {
      print("Screen capture failed. Give this terminal Screen Recording permission, then restart it.")
      Thread.sleep(forTimeInterval: 5)
      continue
    }
    let lines = recognizeText(image)

    let board = readScoreboard(lines, near: near, lastPeriod: lastPeriod)
    if let board {
      near = board.box
      lastPeriod = board.period
      missed = 0
    } else {
      missed += 1
      if missed >= relocateAfter { near = nil }
      if let missesDir, saved < 20 {
        saved += 1
        try? FileManager.default.copyItem(atPath: shot, toPath: "\(missesDir)/miss-\(samples + 1).png")
      }
    }
    try? FileManager.default.removeItem(atPath: shot)
    var pos: Double?
    var source = ""
    var rate = ""
    if let browser, let v = browserVideo(browser) {
      pos = v.pos
      source = "js"
      rate = String(format: "%.2f", v.rate)
    } else if let p = readPosition(lines) {
      pos = p
      source = "ocr"
    }
    let row = [
      String(format: "%.2f", started.timeIntervalSince1970),
      pos.map { String(format: "%.2f", $0) } ?? "",
      source,
      rate,
      board.map { String($0.period) } ?? "",
      board.map { String(format: "%.1f", $0.clock) } ?? "",
      board?.clockText ?? "",
    ].joined(separator: ",")
    file.write((row + "\n").data(using: .utf8)!)
    samples += 1

    let posText = pos.map(formatHMS) ?? "  —  "
    let boardText = board.map { "\(periodName($0.period)) \(formatClock($0.clock))" } ?? "no scoreboard"
    print("\(samples)\tvideo \(posText)\t\(boardText)")
  }
}

// MARK: - Analysis

struct Sample {
  let wall: Double
  var pos: Double?
  let period: Int?
  let clock: Double?
}

func loadSamples(_ path: String) -> [Sample] {
  guard let text = try? String(contentsOfFile: (path as NSString).expandingTildeInPath, encoding: .utf8) else {
    fail("Can't read \(path)")
  }
  return text.split(separator: "\n").dropFirst().compactMap { line in
    let f = line.split(separator: ",", omittingEmptySubsequences: false).map(String.init)
    guard f.count >= 6, let wall = Double(f[0]) else { return nil }
    return Sample(wall: wall, pos: Double(f[1]), period: Int(f[4]), clock: Double(f[5]))
  }
}

/// Fills a missing video position from the samples either side when playback
/// was steady in between: the video moved as far as the wall clock (at 1x or
/// 2x), so there was no skip or pause. Any steady-looking speed is trusted
/// across a short gap; a long one has to match 1x or 2x closely.
func fillPositions(_ samples: inout [Sample]) {
  var lastKnown: Int?
  for i in samples.indices {
    guard samples[i].pos != nil else { continue }
    if let a = lastKnown, i - a > 1, let pa = samples[a].pos, let pb = samples[i].pos {
      let wall = samples[i].wall - samples[a].wall
      let speed = (pb - pa) / wall
      let steady = (wall <= 30 && speed >= 0.9 && speed <= 2.2)
        || (wall <= 600 && (abs(speed - 1) < 0.03 || abs(speed - 2) < 0.06))
      if steady {
        for j in (a + 1)..<i {
          samples[j].pos = pa + (samples[j].wall - samples[a].wall) * speed
        }
      }
    }
    lastKnown = i
  }
}

struct Point {
  let pos: Double
  let period: Int
  let clock: Double
}

/// Drops OCR misreads: within a period the clock never runs up as the video
/// goes on, so a reading out of line with both neighbours is noise.
func cleanPoints(_ points: [Point]) -> [Point] {
  guard points.count > 2 else { return points }
  var kept: [Point] = []
  for i in points.indices {
    let p = points[i]
    if i > 0, i < points.count - 1 {
      let a = points[i - 1], b = points[i + 1]
      // A lone frame in another period between two that agree.
      if a.period == b.period, p.period != a.period { continue }
      if a.period == p.period, b.period == p.period, a.period == b.period {
        // A jump out of line with a running clock, or any change in a frozen one.
        if abs(a.clock - b.clock) < 15, abs(p.clock - a.clock) > 15, abs(p.clock - b.clock) > 15 { continue }
        if abs(a.clock - b.clock) < 0.5, abs(p.clock - a.clock) > 1 { continue }
      }
    }
    kept.append(p)
  }
  return kept
}

/// A stretch where the clock didn't move while the video did: a stoppage.
struct Stoppage {
  let period: Int
  let clock: Double
  /// First and last samples showing the frozen clock.
  let start: Double
  let end: Double
}

/// Looked for one period at a time, so a stray reading from elsewhere on the
/// screen (another "period") doesn't split a stoppage in two.
func findStoppages(_ all: [Point]) -> [Stoppage] {
  Set(all.map(\.period)).sorted().flatMap { period in
    findStoppagesInPeriod(cleanPoints(all.filter { $0.period == period }))
  }
}

func findStoppagesInPeriod(_ points: [Point]) -> [Stoppage] {
  var result: [Stoppage] = []
  var i = 0
  while i < points.count {
    var j = i
    while j + 1 < points.count, points[j + 1].period == points[i].period,
          abs(points[j + 1].clock - points[i].clock) < 0.5 {
      j += 1
    }
    if j > i, points[j].pos - points[i].pos >= 3 {
      result.append(Stoppage(period: points[i].period, clock: points[i].clock, start: points[i].pos, end: points[j].pos))
    }
    i = j + 1
  }
  return result
}

struct Penalty {
  let period: Int
  /// Seconds left on the clock when it was called.
  let clock: Double
  let team: String
  let player: String
  let offence: String
  let minutes: String
}

func fetchPenalties(_ game: Int) -> [Penalty] {
  let id = game < 100_000 ? 1_029_070 + game : game
  let url = URL(string: "https://lscluster.hockeytech.com/feed/index.php?feed=gc&tab=gamesummary&key=ccb91f29d6744675&client_code=ahl&fmt=json&lang_code=en&game_id=\(id)")!
  guard let data = try? Data(contentsOf: url),
        let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
        let gs = (json["GC"] as? [String: Any])?["Gamesummary"] as? [String: Any] else {
    fail("Couldn't load the game summary for HockeyTech game \(id).")
  }
  func str(_ v: Any?) -> String { v.map { "\($0)" } ?? "" }
  var lengths: [Int: Double] = [:]
  if let periods = gs["periods"] as? [String: Any] {
    for case let p as [String: Any] in periods.values {
      if let n = Int(str(p["id"])) { lengths[n] = Double(str(p["length"])) ?? 1200 }
    }
  } else if let periods = gs["periods"] as? [[String: Any]] {
    for p in periods {
      if let n = Int(str(p["id"])) { lengths[n] = Double(str(p["length"])) ?? 1200 }
    }
  }
  let home = gs["home"] as? [String: Any], visitor = gs["visitor"] as? [String: Any]
  print("\(str(visitor?["code"])) @ \(str(home?["code"])), HockeyTech game \(id)")
  return (gs["penalties"] as? [[String: Any]] ?? []).compactMap { p in
    guard let period = Int(str(p["period_id"])), let elapsed = Double(str(p["s"])) else { return nil }
    let teamId = str(p["team_id"])
    let team = teamId == str(home?["id"]) ? str(home?["code"]) : str(visitor?["code"])
    var player = "Bench"
    // A bench minor comes with an empty player record.
    if let info = p["player_penalized_info"] as? [String: Any], !str(info["last_name"]).isEmpty {
      player = "#\(str(info["jersey_number"])) \(str(info["first_name"])) \(str(info["last_name"]))"
    }
    return Penalty(period: period, clock: (lengths[period] ?? 1200) - elapsed, team: team, player: player,
                   offence: str(p["lang_penalty_description"]), minutes: str(p["minutes"]))
  }
}

let penaltiesCSVHeader = "period,clock,team,player,infraction,minutes,whistle_video_pos,play_start_video_pos,clip_start,clip_end,status"

func penaltyLabel(_ pen: Penalty) -> String {
  "\(periodName(pen.period)) \(formatClock(pen.clock))  \(pen.team) \(pen.player), \(pen.offence) (\(pen.minutes))"
}

/// Prints one penalty's result and returns its CSV row.
func reportPenalty(_ pen: Penalty, whistle: Double?, playStart: Double?, status: String) -> String {
  print(penaltyLabel(pen))
  var fields = [periodName(pen.period), formatClock(pen.clock), pen.team, pen.player, pen.offence, pen.minutes]
  if let whistle {
    let clipStart = max(playStart ?? (whistle - maxLookback), whistle - maxLookback)
    let clipEnd = whistle + afterWhistle
    print("    whistle at \(formatHMS(whistle)) in the video   [\(status)]")
    if let playStart {
      print("    play started at \(formatHMS(playStart)) (\(Int((whistle - playStart).rounded())) s of play before the whistle)")
    }
    print("    suggested clip \(formatHMS(clipStart))–\(formatHMS(clipEnd))")
    fields += [formatHMS(whistle), playStart.map(formatHMS) ?? "", formatHMS(clipStart), formatHMS(clipEnd), status]
  } else {
    print("    \(status)")
    fields += ["", "", "", "", status]
  }
  return fields.map { $0.replacingOccurrences(of: ",", with: " ") }.joined(separator: ",")
}

func writeCSV(_ rows: [String], to path: String) {
  try? (([penaltiesCSVHeader] + rows).joined(separator: "\n") + "\n").write(toFile: path, atomically: true, encoding: .utf8)
  print("\nWrote \(path)")
}

/// How far the broadcast's scoreboard graphic trails the play. Measured on a
/// FloHockey replay (game 58): the clock froze on screen 3 s after the whistle.
/// Search results are moved back by this much.
let scoreboardLag = 3.0

/// How far before the whistle a clip starts if the play ran longer than that.
let maxLookback = 45.0
/// How long a clip runs past the whistle, to show the referee's call.
let afterWhistle = 10.0

func analyzeCommand(_ path: String, game: Int?) {
  var samples = loadSamples(path)
  fillPositions(&samples)
  let points = cleanPoints(
    samples
      .compactMap { s -> Point? in
        guard let pos = s.pos, let period = s.period, let clock = s.clock else { return nil }
        return Point(pos: pos, period: period, clock: clock)
      }
      .sorted { $0.pos < $1.pos })
  let stoppages = findStoppages(points)
  let penalties = game.map(fetchPenalties) ?? []

  print("\(samples.count) samples, \(points.count) usable (scoreboard + video position), \(stoppages.count) stoppages found")
  for p in 1...5 {
    let inPeriod = points.filter { $0.period == p }
    guard let first = inPeriod.first, let last = inPeriod.last else { continue }
    print("  \(periodName(p)): clock \(formatClock(first.clock))–\(formatClock(last.clock)) seen, video \(formatHMS(first.pos))–\(formatHMS(last.pos))")
  }
  print("")

  guard game != nil else {
    print("Stoppages (no game number given, so no penalties to match):")
    for s in stoppages {
      print("  \(periodName(s.period)) \(formatClock(s.clock))  video \(formatHMS(s.start))–\(formatHMS(s.end))")
    }
    return
  }

  var rows: [String] = []
  for pen in penalties.sorted(by: { ($0.period, -$0.clock) < ($1.period, -$1.clock) }) {
    var whistle: Double?
    var playStart: Double?
    var status = ""
    if let stop = stoppages.first(where: { $0.period == pen.period && abs($0.clock - pen.clock) <= 1.5 }) {
      whistle = stop.start
      // The play began when the clock last started running: the end of the
      // stoppage before this one, or the start of the period.
      let earlier = stoppages.filter { $0.period == pen.period && $0.end < stop.start }
      playStart = earlier.last?.end ?? points.first(where: { $0.period == pen.period })?.pos
      status = "found"
    } else if let a = points.last(where: { $0.period == pen.period && $0.clock > pen.clock }),
              let b = points.first(where: { $0.period == pen.period && $0.clock <= pen.clock && $0.pos > a.pos }),
              b.pos - a.pos < 30 {
      // Watched across that time but no freeze seen: estimate where it passed.
      whistle = a.pos + (b.pos - a.pos) * (a.clock - pen.clock) / max(a.clock - b.clock, 0.001)
      status = "estimated (no stoppage seen)"
    } else {
      status = "not in this session"
    }

    rows.append(reportPenalty(pen, whistle: whistle, playStart: playStart, status: status))
  }
  if penalties.isEmpty { print("No penalties in this game.") }

  writeCSV(rows, to: ((path as NSString).expandingTildeInPath as NSString).deletingPathExtension + "-penalties.csv")
}

// MARK: - Search: jump through the replay in Safari instead of watching it

func safariJS(_ js: String) -> String? {
  let escaped = js.replacingOccurrences(of: "\\", with: "\\\\").replacingOccurrences(of: "\"", with: "\\\"")
  return runOsascript("tell application \"Safari\" to do JavaScript \"\(escaped)\" in front document")
}

/// "<video time>|<JPEG data URL>" of the frame showing now, or "" while it's
/// still seeking. The time is read with the frame: the video keeps playing, so
/// it's a little past where it was sent.
let grabFrameJS = """
(() => { const v = document.querySelector('video'); if (!v || v.seeking || v.readyState < 2) return ''; const c = document.createElement('canvas'); c.width = v.videoWidth; c.height = v.videoHeight; c.getContext('2d').drawImage(v, 0, 0); return v.currentTime + '|' + c.toDataURL('image/jpeg', 0.9); })()
"""

struct GameState {
  let period: Int
  let clock: Double
  /// Seconds of game played: the one thing that only goes up as the video goes on.
  var gameTime: Double { Double(period - 1) * 1200 + (1200 - clock) }
}

/// The replay open in Safari's front tab. Works with Safari behind other
/// windows: frames come from the <video> element, not the screen.
final class Replay {
  let duration: Double
  /// Every successful read, so later searches start from tighter bounds.
  var known: [(t: Double, state: GameState)] = []
  var jumps = 0
  private var near: CGRect?

  init?() {
    guard let d = safariJS("String(document.querySelector('video') ? document.querySelector('video').duration : '')").flatMap(Double.init),
          d > 0 else { return nil }
    duration = d
    // Playing, not paused: paused, this player never loads the spot it was
    // moved to, so every frame would come back blank. Muted while it jumps.
    wasMuted = safariJS("String(document.querySelector('video').muted)") == "true"
    _ = safariJS("(() => { const v = document.querySelector('video'); v.muted = true; v.play(); return ''; })()")
  }

  private let wasMuted: Bool

  /// Leaves the video paused, with its sound as it was.
  func finish() {
    _ = safariJS("(() => { const v = document.querySelector('video'); v.pause(); v.muted = \(wasMuted); return ''; })()")
  }

  private func frame(at t: Double) -> (image: CGImage, t: Double)? {
    _ = safariJS("document.querySelector('video').currentTime = \(t)")
    // A long jump takes a few seconds to buffer.
    for _ in 0..<100 {
      Thread.sleep(forTimeInterval: 0.15)
      guard let reply = safariJS(grabFrameJS), let bar = reply.firstIndex(of: "|"),
            let actual = Double(reply[..<bar]), let comma = reply.firstIndex(of: ",") else { continue }
      guard let data = Data(base64Encoded: String(reply[reply.index(after: comma)...])),
            let source = CGImageSourceCreateWithData(data as CFData, nil),
            let image = CGImageSourceCreateImageAtIndex(source, 0, nil) else { return nil }
      return (image, actual)
    }
    return nil
  }

  /// The scoreboard at video time t, or nil if it isn't showing (a replay, a
  /// break, a graphic). A clock at 0:00 doesn't count: the pregame shows
  /// "1st 0:00", which would look like the end of the period.
  func state(at requested: Double) -> (t: Double, state: GameState)? {
    jumps += 1
    guard let (image, t) = frame(at: requested) else {
      let t = requested
      if verbose { print("      jump \(formatHMS(t)): no frame") }
      return nil
    }
    let lines = recognizeText(image)
    guard let board = readScoreboard(lines, near: near) ?? readScoreboard(lines, near: nil), board.clock > 0 else {
      if verbose { print("      jump \(formatHMS(t)): no scoreboard (\(lines.count) text lines)") }
      return nil
    }
    near = board.box
    let state = GameState(period: board.period, clock: board.clock)
    if verbose { print("      jump \(formatHMS(t)): \(periodName(board.period)) \(formatClock(board.clock))") }
    known.append((t, state))
    return (t, state)
  }

  /// t if the scoreboard shows there, else the nearest spot that does, inside (lo, hi).
  func readable(around t: Double, lo: Double, hi: Double, tries: Int = 8) -> (t: Double, state: GameState)? {
    for offset in [0.0, 6, 13, -7, 21, -15, 34, -30].prefix(tries) {
      let x = t + offset
      guard x > lo, x < hi else { continue }
      if let hit = state(at: x) { return hit }
    }
    return nil
  }

  /// A readable spot inside (lo, hi) for a binary search: the middle if it
  /// can be read, else further out. A long unreadable stretch (the pregame
  /// show, an intermission) is passed by trying toward hi first, then lo.
  /// If all of the range's inside is unreadable, the game is at its very edges
  /// (the last seconds before an intermission), so step out from each end.
  func readableBetween(_ lo: Double, _ hi: Double) -> (t: Double, state: GameState)? {
    for spot in [0.5, 0.75, 0.9, 0.25, 0.97, 0.1] {
      let x = lo + (hi - lo) * spot
      if let hit = readable(around: x, lo: lo, hi: hi, tries: 3) { return hit }
      // Small range: the nearby tries above already covered most of it.
      if hi - lo < 60 { break }
    }
    for step in [3.0, 8, 15, 30, 60, 120] {
      for x in [lo + step, hi - step] where x > lo && x < hi {
        if let hit = state(at: x) { return hit }
      }
    }
    return nil
  }
}

/// The first video time where the game clock reaches `target` (game time):
/// the whistle, for a penalty. A binary search, since game time only goes up
/// as the video goes on.
func findWhistle(_ replay: Replay, target: Double) -> (t: Double, state: GameState)? {
  var lo = replay.known.filter { $0.state.gameTime < target - 0.5 }.map(\.t).max() ?? 0
  var hiPoint = replay.known.filter { $0.state.gameTime >= target - 0.5 }.min { $0.t < $1.t }
  if let h = hiPoint, h.t <= lo {
    // Earlier reads disagree (a misread); search the whole video.
    lo = 0
    hiPoint = nil
  }
  var hi = hiPoint?.t ?? replay.duration
  while hi - lo > 1.5 {
    // The frame's real time can land just outside the range (the video plays
    // on while it loads); then the range can't shrink any further.
    guard let (x, s) = replay.readableBetween(lo, hi), x > lo, x < hi else { break }
    if s.gameTime >= target - 0.5 {
      hi = x
      hiPoint = (x, s)
    } else {
      lo = x
    }
  }
  // Only a hit if the clock there really is (about) the penalty time.
  guard let h = hiPoint, abs(h.state.gameTime - target) <= 2 else { return nil }
  return h
}

/// Where the clock actually stopped for the penalty: the first frame of a
/// freeze within a few seconds of the penalty time. The screen and the
/// official time can disagree: on game 58's 0:07 penalty the clock froze on
/// screen at 0:09 and was corrected to 0:07 afterwards, so the first frame
/// showing 0:07 came after the whistle. Scans 2 s steps from shortly before
/// `found` (the first frame at the penalty time).
func findFreeze(_ replay: Replay, found: (t: Double, state: GameState), target: Double) -> (t: Double, state: GameState)? {
  var prev = replay.state(at: found.t - 10)
  var t = prev?.t ?? found.t - 10
  for _ in 0..<12 {
    let next = replay.state(at: t + 2)
    if let p = prev, let n = next, p.state.period == n.state.period,
       abs(p.state.clock - n.state.clock) < 0.5, n.t - p.t >= 1.5, abs(p.state.gameTime - target) <= 3 {
      return p
    }
    prev = next
    t = next?.t ?? t + 2
    if t > found.t + 10 { break }
  }
  return nil
}

/// When the clock last started running before the whistle: the faceoff that
/// began the play. From there to the whistle the clock ran as fast as the
/// video, which is what the search tests.
func findPlayStart(_ replay: Replay, whistle: (t: Double, state: GameState)) -> (t: Double, limited: Bool) {
  let window = 120.0
  // The clock shows whole seconds and a frame's time is off by a fraction, so
  // allow a little slack; a real stoppage is longer than this.
  func running(_ t: Double, _ s: GameState) -> Bool {
    s.period == whistle.state.period && abs((whistle.state.gameTime - s.gameTime) - (whistle.t - t)) <= 2.5
  }
  var lo = max(0, whistle.t - window)
  if let (x, s) = replay.readable(around: lo, lo: lo - 40, hi: whistle.t), running(x, s) {
    return (x, true)
  }
  var hi = whistle.t
  while hi - lo > 1.5 {
    guard let (x, s) = replay.readableBetween(lo, hi), x > lo, x < hi else { break }
    if running(x, s) { hi = x } else { lo = x }
  }
  return (hi, false)
}

func searchCommand(game: Int, out: String?) {
  guard let replay = Replay() else {
    fail("""
      No video found in Safari's front tab. Open the game's replay there, and turn on
      Develop → Allow JavaScript from Apple Events.
      """)
  }
  var penalties = fetchPenalties(game).sorted { ($0.period, -$0.clock) < ($1.period, -$1.clock) }
  // --only "1st 14:45": just the penalties called at that time.
  if let i = args.firstIndex(of: "--only"), i + 1 < args.count {
    penalties = penalties.filter { "\(periodName($0.period)) \(formatClock($0.clock))" == args[i + 1] }
  }
  print("Replay is \(formatHMS(replay.duration)) long. Searching for \(penalties.count) penalties; Safari can stay in the background.\n")
  let started = Date()
  var rows: [String] = []
  for pen in penalties {
    let target = GameState(period: pen.period, clock: pen.clock).gameTime
    let before = replay.jumps
    if let found = findWhistle(replay, target: target) {
      // A freeze before `found` means the clock was corrected after the
      // whistle; one after it is just the scan missing the freeze's first
      // frames, and `found` is already where the clock stopped.
      var whistle = found
      if let freeze = findFreeze(replay, found: found, target: target), freeze.t < found.t { whistle = freeze }
      let start = findPlayStart(replay, whistle: whistle)
      let status = start.limited ? "found (play ran over 2 min)" : "found"
      rows.append(reportPenalty(pen, whistle: whistle.t - scoreboardLag, playStart: start.t - scoreboardLag, status: status))
    } else {
      rows.append(reportPenalty(pen, whistle: nil, playStart: nil, status: "not found in the replay"))
    }
    print("    (\(replay.jumps - before) jumps)")
  }
  if penalties.isEmpty { print("No penalties in this game.") }
  replay.finish()
  print(String(format: "\nDone: %d jumps in %.1f min.", replay.jumps, Date().timeIntervalSince(started) / 60))
  writeCSV(rows, to: out.map { ($0 as NSString).expandingTildeInPath } ?? "tools/watchalong/sessions/game\(game)-penalties.csv")
}

// MARK: - Main

let args = Array(CommandLine.arguments.dropFirst())
func option(_ name: String, _ fallback: Double) -> Double {
  guard let i = args.firstIndex(of: name), i + 1 < args.count, let v = Double(args[i + 1]) else { return fallback }
  return v
}

/// --verbose: print every jump the search makes.
let verbose = args.contains("--verbose")

// Print each line as it happens, even into a file or pipe.
setvbuf(stdout, nil, _IOLBF, 0)

switch args.first {
case "ocr" where args.count >= 2:
  ocrCommand(args[1])
case "watch" where args.count >= 2:
  let missesDir = args.firstIndex(of: "--save-misses").flatMap { i in
    i + 1 < args.count ? (args[i + 1] as NSString).expandingTildeInPath : nil
  }
  watchCommand(args[1], interval: option("--interval", 1), display: Int(option("--display", 1)), missesDir: missesDir)
case "search" where args.count >= 2:
  guard let game = Int(args[1]) else { fail("Game number must be a number.") }
  searchCommand(game: game, out: args.count >= 3 && !args[2].hasPrefix("--") ? args[2] : nil)
case "analyze" where args.count >= 2:
  if args.count >= 3, Int(args[2]) == nil { fail("Game number must be a number.") }
  analyzeCommand(args[1], game: args.count >= 3 ? Int(args[2]) : nil)
default:
  print("""
    usage:
      watchalong ocr <image>                     what OCR sees in a screenshot
      watchalong watch <session.csv> [--interval 1] [--display 1] [--save-misses <dir>]
      watchalong search <game#> [out.csv]        jump through the replay open in Safari (no watching)
      watchalong analyze <session.csv> [game#]   game# from Game Details, or a HockeyTech id;
                                                 without it, just lists the stoppages found
    """)
}
