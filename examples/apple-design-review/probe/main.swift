// Programmatic hit-test probe.
//
// The example's headline measurement is that the toolbar button's *touchable* region differs from
// both its declared frame and its rendered container. A claim like that has to be reproducible, so
// this is the actual instrument rather than a description of one.
//
// Method: ask UIKit, via `UIWindow.hitTest(_:with:)`, which view would receive a touch at each
// point on a 0.5 pt grid, and record the bounding box of the points that reach the control. A point
// counts when the hit view, or one of its ancestors, is the control's own view class.
//
// What this establishes: which view UIKit routes a synthetic point to. What it does not establish:
// that a finger on glass behaves identically. Real taps were not tested. Treat the numbers as
// programmatic hit-testing, not as a substitute for device testing.
//
// Build and run against either variant:
//   ./probe/run.sh before
//   ./probe/run.sh after

import SwiftUI
import UIKit

struct HitProbeApp: App {
    var body: some Scene {
        WindowGroup {
            ShareSheetView()
                // The toolbar and its glass container settle a beat after first layout; probing
                // sooner measures an interface that is still arriving.
                .onAppear { DispatchQueue.main.asyncAfter(deadline: .now() + 3.0) { probe() } }
        }
    }

    /// Results go to a file in the app container, because `print` from a simulator app does not
    /// reliably reach the host terminal.
    func out(_ s: String) {
        let url = URL(fileURLWithPath: NSTemporaryDirectory()).appendingPathComponent("hitprobe.txt")
        let line = s + "\n"
        if let fh = try? FileHandle(forWritingTo: url) {
            fh.seekToEndOfFile(); fh.write(line.data(using: .utf8)!); try? fh.close()
        } else {
            try? line.write(to: url, atomically: true, encoding: .utf8)
        }
    }

    func probe() {
        guard let scene = UIApplication.shared.connectedScenes.first as? UIWindowScene,
              let window = scene.windows.first else { out("no window"); return }
        try? FileManager.default.removeItem(atPath: NSTemporaryDirectory() + "hitprobe.txt")

        out("=== programmatic hit-test probe ===")
        out("device:     \(UIDevice.current.name), iOS \(UIDevice.current.systemVersion)")
        out("window:     \(window.bounds.width) x \(window.bounds.height) pt")
        out("appearance: \(window.traitCollection.userInterfaceStyle == .dark ? "dark" : "light")")
        out("text size:  \(window.traitCollection.preferredContentSizeCategory.rawValue)")
        out("grid step:  0.5 pt")
        out("")

        /// True when a touch at `point` reaches a view whose class name contains `marker`,
        /// directly or through its ancestors.
        func reaches(_ point: CGPoint, _ marker: String) -> Bool {
            var view = window.hitTest(point, with: nil)
            var depth = 0
            while let current = view, depth < 10 {
                if String(describing: type(of: current)).contains(marker) { return true }
                view = current.superview
                depth += 1
            }
            return false
        }

        /// Scan `area` and report the bounding box of points that reach `marker`.
        func measure(_ name: String, marker: String, in area: CGRect) {
            var minX = Double.infinity, maxX = -Double.infinity
            var minY = Double.infinity, maxY = -Double.infinity
            var hits = 0, samples = 0
            var x = area.minX
            while x <= area.maxX {
                var y = area.minY
                while y <= area.maxY {
                    samples += 1
                    if reaches(CGPoint(x: x, y: y), marker) {
                        minX = min(minX, x); maxX = max(maxX, x)
                        minY = min(minY, y); maxY = max(maxY, y)
                        hits += 1
                    }
                    y += 0.5
                }
                x += 0.5
            }
            out("control: \(name)")
            out("  marker: \(marker)")
            out(String(format: "  scanned: x %.1f...%.1f, y %.1f...%.1f (%d samples)",
                       area.minX, area.maxX, area.minY, area.maxY, samples))
            if hits == 0 { out("  result: no sampled point reached it"); out(""); return }
            let w = maxX - minX + 0.5, h = maxY - minY + 0.5
            out(String(format: "  reached at: x %.1f...%.1f, y %.1f...%.1f (%d samples)",
                       minX, maxX, minY, maxY, hits))
            out(String(format: "  touchable region: %.1f x %.1f pt -> %@",
                       w, h, (w >= 44 && h >= 44) ? "meets 44 x 44" : "under 44 x 44"))
            out("")
        }

        // The toolbar item sits top-right. The scan area is deliberately wider than the visible
        // glass container, so a region larger than expected would also be captured.
        measure("toolbar item", marker: "BarItemView",
                in: CGRect(x: 320, y: 45, width: 82, height: 75))

        out("Note: SwiftUI does not give each Button its own UIView, so only controls hosted in an")
        out("identifiable UIKit view (such as a toolbar item) can be measured this way. Sizes for")
        out("in-body controls are reported by the GeometryReader probe instead; see measurements.md.")
        out("=== end ===")
    }
}

HitProbeApp.main()
