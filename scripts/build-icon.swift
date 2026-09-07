import AppKit
import Foundation
let destination = CommandLine.arguments[1]
try FileManager.default.createDirectory(atPath: destination, withIntermediateDirectories: true)
let bitmap = NSBitmapImageRep(bitmapDataPlanes: nil, pixelsWide: 1024, pixelsHigh: 1024, bitsPerSample: 8, samplesPerPixel: 4, hasAlpha: true, isPlanar: false, colorSpaceName: .deviceRGB, bytesPerRow: 0, bitsPerPixel: 0)!
NSGraphicsContext.saveGraphicsState()
NSGraphicsContext.current = NSGraphicsContext(bitmapImageRep: bitmap)
let tile = NSBezierPath(roundedRect: NSRect(x: 72, y: 72, width: 880, height: 880), xRadius: 194, yRadius: 194)
NSGraphicsContext.saveGraphicsState()
let shadow = NSShadow(); shadow.shadowColor = NSColor.black.withAlphaComponent(0.28); shadow.shadowBlurRadius = 24; shadow.shadowOffset = NSSize(width: 0, height: -12); shadow.set()
NSColor(calibratedWhite: 0.09, alpha: 1).setFill(); tile.fill()
NSGraphicsContext.restoreGraphicsState()
NSGradient(starting: NSColor(calibratedRed: 0.17, green: 0.20, blue: 0.22, alpha: 1), ending: NSColor(calibratedRed: 0.055, green: 0.07, blue: 0.08, alpha: 1))!.draw(in: tile, angle: -90)
NSColor.white.withAlphaComponent(0.12).setStroke(); tile.lineWidth = 3; tile.stroke()
// Two interlocking cable strokes extend the dashboard's existing amber mark.
let mark = NSBezierPath()
mark.move(to: NSPoint(x: 245, y: 638)); mark.line(to: NSPoint(x: 486, y: 492)); mark.line(to: NSPoint(x: 486, y: 652)); mark.line(to: NSPoint(x: 779, y: 476)); mark.line(to: NSPoint(x: 779, y: 361)); mark.line(to: NSPoint(x: 599, y: 469)); mark.line(to: NSPoint(x: 599, y: 309)); mark.line(to: NSPoint(x: 245, y: 523)); mark.close()
NSGradient(starting: NSColor(calibratedRed: 1, green: 0.80, blue: 0.53, alpha: 1), ending: NSColor(calibratedRed: 0.91, green: 0.48, blue: 0.22, alpha: 1))!.draw(in: mark, angle: -90)
NSGraphicsContext.restoreGraphicsState()
try bitmap.representation(using: .png, properties: [:])!.write(to: URL(fileURLWithPath: destination + "/icon.png"))
