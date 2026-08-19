import Foundation
import CoreGraphics
import ImageIO
import Vision
import UniformTypeIdentifiers

// Usage: swift headcrop.swift <input> <output> [--size N]
// Crops a square head close-up from a portrait image using Vision:
// human face -> animal -> attention saliency -> top-center fallback.

let args = CommandLine.arguments
guard args.count >= 3 else {
    FileHandle.standardError.write("usage: headcrop <input> <output> [--size N]\n".data(using: .utf8)!)
    exit(2)
}
let inputURL = URL(fileURLWithPath: args[1])
let outputURL = URL(fileURLWithPath: args[2])
var outSize = 320
if let i = args.firstIndex(of: "--size"), i + 1 < args.count, let n = Int(args[i + 1]) { outSize = n }

guard let src = CGImageSourceCreateWithURL(inputURL as CFURL, nil),
      let image = CGImageSourceCreateImageAtIndex(src, 0, nil) else {
    FileHandle.standardError.write("cannot read \(inputURL.path)\n".data(using: .utf8)!)
    exit(1)
}

let W = CGFloat(image.width)
let H = CGFloat(image.height)

// Vision boxes are normalized, origin at bottom-left.
func denormalize(_ r: CGRect) -> CGRect {
    CGRect(x: r.minX * W, y: (1 - r.maxY) * H, width: r.width * W, height: r.height * H)
}

func detect<T: VNObservation>(_ request: VNImageBasedRequest, as type: T.Type) -> [T] {
    let handler = VNImageRequestHandler(cgImage: image, options: [:])
    do { try handler.perform([request]) } catch { return [] }
    return (request.results as? [T]) ?? []
}

var cropCenter: CGPoint
var cropSide: CGFloat
var method: String

let faces = detect(VNDetectFaceRectanglesRequest(), as: VNFaceObservation.self)
if let face = faces.max(by: { $0.boundingBox.width < $1.boundingBox.width }) {
    // Face box covers brows-to-chin; expand to take in hair, ears, a bit of shoulders.
    let f = denormalize(face.boundingBox)
    cropCenter = CGPoint(x: f.midX, y: f.midY - f.height * 0.12)
    cropSide = max(f.width, f.height) * 2.1
    method = "face"
} else {
    let animals = detect(VNRecognizeAnimalsRequest(), as: VNRecognizedObjectObservation.self)
    if let animal = animals.max(by: { $0.boundingBox.width * $0.boundingBox.height < $1.boundingBox.width * $1.boundingBox.height }) {
        // Whole-body box; the head is almost always in the upper part.
        let a = denormalize(animal.boundingBox)
        cropSide = min(max(a.width, a.height) * 0.75, min(W, H))
        cropCenter = CGPoint(x: a.midX, y: a.minY + cropSide * 0.42)
        method = "animal"
    } else {
        let saliency = detect(VNGenerateAttentionBasedSaliencyImageRequest(), as: VNSaliencyImageObservation.self)
        if let s = saliency.first, let box = s.salientObjects?.max(by: { $0.boundingBox.width * $0.boundingBox.height < $1.boundingBox.width * $1.boundingBox.height }) {
            let b = denormalize(box.boundingBox)
            cropSide = min(max(b.width, b.height) * 0.9, min(W, H))
            // Bias toward the upper part of the salient region, where a head usually is.
            cropCenter = CGPoint(x: b.midX, y: b.minY + cropSide * 0.45)
            method = "saliency"
        } else {
            cropSide = min(W, H) * 0.6
            cropCenter = CGPoint(x: W / 2, y: cropSide * 0.5 + H * 0.05)
            method = "fallback"
        }
    }
}

cropSide = min(cropSide, min(W, H))
var x = cropCenter.x - cropSide / 2
var y = cropCenter.y - cropSide / 2
x = max(0, min(x, W - cropSide))
y = max(0, min(y, H - cropSide))
let cropRect = CGRect(x: x, y: y, width: cropSide, height: cropSide).integral

guard let cropped = image.cropping(to: cropRect) else {
    FileHandle.standardError.write("crop failed\n".data(using: .utf8)!)
    exit(1)
}

// Resize to outSize x outSize.
let ctx = CGContext(data: nil, width: outSize, height: outSize, bitsPerComponent: 8, bytesPerRow: 0,
                    space: CGColorSpace(name: CGColorSpace.sRGB)!,
                    bitmapInfo: CGImageAlphaInfo.noneSkipLast.rawValue)!
ctx.interpolationQuality = .high
ctx.draw(cropped, in: CGRect(x: 0, y: 0, width: outSize, height: outSize))
guard let out = ctx.makeImage(),
      let dest = CGImageDestinationCreateWithURL(outputURL as CFURL, UTType.jpeg.identifier as CFString, 1, nil) else {
    FileHandle.standardError.write("encode failed\n".data(using: .utf8)!)
    exit(1)
}
CGImageDestinationAddImage(dest, out, [kCGImageDestinationLossyCompressionQuality: 0.85] as CFDictionary)
guard CGImageDestinationFinalize(dest) else {
    FileHandle.standardError.write("write failed\n".data(using: .utf8)!)
    exit(1)
}
print("\(method) \(Int(cropRect.width))px @\(Int(cropRect.minX)),\(Int(cropRect.minY)) -> \(outputURL.lastPathComponent)")
