import AppKit
import ApplicationServices

// Read-only. Does not prompt for permissions, activate a window, type, or click.
func attr(_ el: AXUIElement, _ key: String) -> CFTypeRef? {
    var value: CFTypeRef?
    guard AXUIElementCopyAttributeValue(el, key as CFString, &value) == .success else { return nil }
    return value
}
func text(_ el: AXUIElement, _ key: String) -> String? {
    if let value = attr(el, key) as? String { return value }
    if let value = attr(el, key), CFGetTypeID(value) == CFURLGetTypeID() { return (value as! URL).absoluteString }
    return nil
}
func flag(_ el: AXUIElement, _ key: String) -> Bool { (attr(el, key) as? Bool) == true }
func rect(_ el: AXUIElement) -> [String: Double]? {
    guard let pv = attr(el, kAXPositionAttribute), let sv = attr(el, kAXSizeAttribute),
          CFGetTypeID(pv) == AXValueGetTypeID(), CFGetTypeID(sv) == AXValueGetTypeID() else { return nil }
    var p = CGPoint.zero; var s = CGSize.zero
    guard AXValueGetValue(pv as! AXValue, .cgPoint, &p), AXValueGetValue(sv as! AXValue, .cgSize, &s) else { return nil }
    return ["x": p.x, "y": p.y, "width": s.width, "height": s.height]
}
func inspect(_ root: AXUIElement) -> ([String], [[String: Any]]) {
    var routes: [String] = []; var links: [[String: Any]] = []
    var stack: [(AXUIElement, Int, Bool)] = [(root, 0, false)]; var count = 0
    let deadline = Date().addingTimeInterval(1.1)
    while let (el, depth, selectedParent) = stack.popLast(), count < 1800, Date() < deadline {
        count += 1
        let role = text(el, kAXRoleAttribute) ?? ""
        if ["AXTextArea", "AXTextField", "AXStaticText"].contains(role) { continue }
        let selected = flag(el, kAXSelectedAttribute) || ["page", "true"].contains(text(el, "AXARIACurrent") ?? "")
        let url = text(el, kAXURLAttribute)
        if role == "AXWebArea", let url { routes.append(url) }
        if role == "AXLink", selected || selectedParent, let url, let bounds = rect(el) {
            links.append(["url": url, "bounds": bounds])
        }
        guard depth < 20, let children = attr(el, kAXChildrenAttribute) as? [AXUIElement] else { continue }
        let passSelection = selected && ["AXRow", "AXTab", "AXGroup"].contains(role)
        for child in children.reversed() { stack.append((child, depth + 1, passSelection)) }
    }
    return (routes, links)
}
var result: [String: Any] = ["observedAt": Date().timeIntervalSince1970 * 1000, "accessibility": AXIsProcessTrusted(), "windows": []]
if AXIsProcessTrusted() {
    let visible = CGWindowListCopyWindowInfo([.optionOnScreenOnly, .excludeDesktopElements], kCGNullWindowID) as? [[String: Any]] ?? []
    var windows: [[String: Any]] = []
    for app in NSRunningApplication.runningApplications(withBundleIdentifier: "com.openai.codex") {
        let ax = AXUIElementCreateApplication(app.processIdentifier)
        AXUIElementSetMessagingTimeout(ax, 0.12)
        guard let axWindows = attr(ax, kAXWindowsAttribute) as? [AXUIElement] else { continue }
        for win in axWindows.prefix(8) {
            guard let bounds = rect(win), !flag(win, kAXMinimizedAttribute), !app.isHidden else { continue }
            let candidates = visible.filter { v in
                guard (v[kCGWindowOwnerPID as String] as? Int) == Int(app.processIdentifier),
                      let b = v[kCGWindowBounds as String] as? [String: Double] else { return false }
                return abs((b["X"] ?? .infinity) - bounds["x"]!) < 2 && abs((b["Y"] ?? .infinity) - bounds["y"]!) < 2 && abs((b["Width"] ?? 0) - bounds["width"]!) < 2 && abs((b["Height"] ?? 0) - bounds["height"]!) < 2
            }
            guard candidates.count == 1, let id = candidates[0][kCGWindowNumber as String] as? Int else { continue }
            let (routes, links) = inspect(win)
            windows.append(["id": id, "pid": app.processIdentifier, "bundleId": "com.openai.codex", "bounds": bounds, "visible": true, "minimized": false, "routes": routes, "selectedLinks": links])
        }
    }
    result["windows"] = windows
}
if let data = try? JSONSerialization.data(withJSONObject: result, options: [.sortedKeys]), let output = String(data: data, encoding: .utf8) { print(output) }
