// Laid-out size probe.
//
// Companion to the hit-test probe. SwiftUI does not give each `Button` its own `UIView`, so
// `hitTest` cannot isolate controls inside the screen body; only something hosted in an
// identifiable UIKit view, such as a toolbar item, can be measured that way.
//
// This reports what SwiftUI actually laid out, via a `GeometryReader` in a `.background`, which
// does not affect layout. It answers "how big is this control" but not "where does a touch land",
// so the two probes together are what the measurements table rests on.
//
// The instrumentation lives here rather than in the reviewed files, so `before/` and `after/`
// remain exactly what was reviewed and shipped. Applying it requires adding `.reportSize("name")`
// at the call site, which is why this probe is run from `run.sh` against a patched copy.

import SwiftUI

struct SizeReport: ViewModifier {
    let name: String
    func body(content: Content) -> some View {
        content.background(
            GeometryReader { geometry in
                Color.clear.onAppear {
                    let size = geometry.size
                    let verdict = (size.width >= 44 && size.height >= 44) ? "meets 44 x 44" : "under 44 x 44"
                    let line = String(format: "%@: laid out %.1f x %.1f pt -> %@\n",
                                      name, size.width, size.height, verdict)
                    let url = URL(fileURLWithPath: NSTemporaryDirectory()).appendingPathComponent("sizes.txt")
                    if let fh = try? FileHandle(forWritingTo: url) {
                        fh.seekToEndOfFile(); fh.write(line.data(using: .utf8)!); try? fh.close()
                    } else {
                        try? line.write(to: url, atomically: true, encoding: .utf8)
                    }
                }
            }
        )
    }
}

extension View {
    func reportSize(_ name: String) -> some View { modifier(SizeReport(name: name)) }
}
