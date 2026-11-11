import QtQuick
import QtQuick.Shapes

// Line icons in the SF Symbols style (spec 4.4.9): 24-unit grid, stroke 1.8, round caps.
Item {
    id: root
    property string name: "alarm"
    property color color: "black"
    property real size: 17
    width: size
    height: size

    function circle(cx, cy, r) {
        return "M" + (cx - r) + " " + cy + " a" + r + " " + r + " 0 1 0 " + (2 * r) + " 0 a" + r + " " + r + " 0 1 0 " + (-2 * r) + " 0"
    }
    readonly property var icons: ({
        alarm: { s: circle(12, 13, 7.5) + " M12 9v4.2l2.6 1.6M4.5 4.8 7 2.8M19.5 4.8 17 2.8M7 20.2l-1.4 1.6M17 20.2l1.4 1.6" },
        stopwatch: { s: circle(12, 13.5, 7.5) + " M12 13.5V9.5M10 2.5h4M12 2.5V6M18.4 6.6l1.3-1.3" },
        timer: { s: "M12 3a9 9 0 1 1-6.4 2.6 M12 3v3.5M12 12 8.2 8.2" },
        gear: { s: circle(12, 12, 3) + " M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z" },
        plus: { s: "M12 5v14M5 12h14", w: 2.2 },
        chevronRight: { s: "M9.5 6l6 6-6 6", w: 2.4 },
        chevronLeft: { s: "M14.5 5l-7 7 7 7", w: 2.6 },
        chevronDown: { s: "M6 9.5l6 6 6-6", w: 2.4 },
        check: { s: "M5 12.5l4.5 4.5L19 7.5", w: 2.6 },
        minusCircle: { f: circle(12, 12, 10), x: "M7 12h10" },
        bell: { f: "M12 2.5a6 6 0 0 0-6 6v3.6l-1.7 3.2a.8.8 0 0 0 .7 1.2h14a.8.8 0 0 0 .7-1.2L18 12.1V8.5a6 6 0 0 0-6-6Zm-2.6 16a2.7 2.7 0 0 0 5.2 0Z" },
        speaker: { f: "M4 9.5h3.5L12 5.5v13l-4.5-4H4Z", s: "M15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11" },
        music: { s: "M9 18V5.5l11-2V16 " + circle(6.5, 18, 2.5) + " " + circle(17.5, 16, 2.5) },
        play: { f: "M8 5.2v13.6a.8.8 0 0 0 1.2.7l10.6-6.8a.8.8 0 0 0 0-1.4L9.2 4.5a.8.8 0 0 0-1.2.7Z" },
        trash: { s: "M4 7h16M9.5 7V4.5h5V7M6.5 7l1 13h9l1-13M10 11v5.5M14 11v5.5" }
    })
    readonly property var icon: icons[name] || icons.alarm

    Shape {
        width: 24
        height: 24
        scale: root.size / 24
        transformOrigin: Item.TopLeft
        preferredRendererType: Shape.CurveRenderer
        ShapePath {
            strokeColor: root.icon.s ? root.color : "transparent"
            strokeWidth: root.icon.w || 1.8
            fillColor: "transparent"
            capStyle: ShapePath.RoundCap
            joinStyle: ShapePath.RoundJoin
            PathSvg { path: root.icon.s || "M0 0" }
        }
        ShapePath {
            strokeColor: "transparent"
            fillColor: root.icon.f ? root.color : "transparent"
            PathSvg { path: root.icon.f || "M0 0" }
        }
        ShapePath {
            strokeColor: root.icon.x ? "white" : "transparent"
            strokeWidth: 2.4
            fillColor: "transparent"
            capStyle: ShapePath.RoundCap
            PathSvg { path: root.icon.x || "M0 0" }
        }
    }
}
