// Percentage of pixels that differ between two captures.
//
// Written against CoreGraphics rather than ImageMagick so the harness has no install step: any
// macOS with Xcode can run it. `swift pixel-diff.swift a.png b.png` prints one number.
//
// The metric is a count of pixels differing in ANY channel by more than `tolerance` (default 0).
// That makes it a sensitive detector of "did anything change at all", which is the question the
// maxFontSizeMultiplier experiment turns on. It is NOT a perceptual measure: 58% does not mean
// "58% worse", it means 58% of pixels are not byte-identical. Read it next to the captures.
import Foundation
import CoreGraphics
import ImageIO

func load(_ path: String) -> (CGImage, [UInt8], Int, Int)? {
    guard let src = CGImageSourceCreateWithURL(URL(fileURLWithPath: path) as CFURL, nil),
          let img = CGImageSourceCreateImageAtIndex(src, 0, nil) else { return nil }
    let w = img.width, h = img.height
    var buf = [UInt8](repeating: 0, count: w * h * 4)
    guard let ctx = CGContext(data: &buf, width: w, height: h, bitsPerComponent: 8,
                              bytesPerRow: w * 4, space: CGColorSpaceCreateDeviceRGB(),
                              bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue) else { return nil }
    ctx.draw(img, in: CGRect(x: 0, y: 0, width: w, height: h))
    return (img, buf, w, h)
}

let args = CommandLine.arguments
guard args.count >= 3 else {
    FileHandle.standardError.write("usage: swift pixel-diff.swift A.png B.png [tolerance]\n".data(using: .utf8)!)
    exit(2)
}
let tolerance = args.count > 3 ? Int(args[3]) ?? 0 : 0

guard let (_, a, aw, ah) = load(args[1]), let (_, b, bw, bh) = load(args[2]) else {
    FileHandle.standardError.write("error: could not read one of the images\n".data(using: .utf8)!)
    exit(1)
}
// Differing dimensions make the number meaningless rather than large, so refuse instead.
guard aw == bw, ah == bh else {
    FileHandle.standardError.write("error: size mismatch \(aw)x\(ah) vs \(bw)x\(bh)\n".data(using: .utf8)!)
    exit(1)
}

var differing = 0
let total = aw * ah
for i in stride(from: 0, to: total * 4, by: 4) {
    if abs(Int(a[i]) - Int(b[i])) > tolerance ||
       abs(Int(a[i+1]) - Int(b[i+1])) > tolerance ||
       abs(Int(a[i+2]) - Int(b[i+2])) > tolerance {
        differing += 1
    }
}
print(String(format: "%.2f", Double(differing) / Double(total) * 100))
