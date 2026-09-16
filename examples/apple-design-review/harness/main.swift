import SwiftUI

/// Minimal host so the screen under review can be compiled and launched on its own.
/// Nothing here is part of the example: the reviewed code is the ShareSheetView file.
struct ShareReviewApp: App {
    var body: some Scene {
        WindowGroup { ShareSheetView() }
    }
}

ShareReviewApp.main()
