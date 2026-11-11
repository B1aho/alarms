import QtQuick
import QtQuick.Shapes
import ".."

// Countdown ring (spec 3.10): Ø280, stroke 8, orange arc over a grey track, shrinking clockwise,
// linear 250 ms per step.
Item {
    id: root
    property real progress: 1
    property string label: ""
    property string countdown: ""
    property string endsText: ""
    property bool paused: false
    width: 280
    height: 280
    property real shown: progress
    Behavior on shown { NumberAnimation { duration: Theme.dur(250); easing.type: Easing.Linear } }

    Shape {
        anchors.fill: parent
        preferredRendererType: Shape.CurveRenderer
        ShapePath {
            strokeColor: Theme.fill2
            strokeWidth: 8
            fillColor: "transparent"
            PathAngleArc { centerX: 140; centerY: 140; radiusX: 120; radiusY: 120; startAngle: 0; sweepAngle: 360 }
        }
        ShapePath {
            strokeColor: root.shown > 0.0005 ? Theme.orange : "transparent"
            strokeWidth: 8
            fillColor: "transparent"
            capStyle: ShapePath.RoundCap
            // The arc ends at 12 o'clock and loses length from its start: it shrinks clockwise.
            PathAngleArc { centerX: 140; centerY: 140; radiusX: 120; radiusY: 120; startAngle: -90 + 360 * (1 - root.shown); sweepAngle: 360 * root.shown }
        }
    }
    Column {
        anchors.centerIn: parent
        Txt { anchors.horizontalCenter: parent.horizontalCenter; width: Math.min(implicitWidth, 200); text: root.label; font.pixelSize: 15; color: Theme.label2; bottomPadding: 4 }
        Txt { anchors.horizontalCenter: parent.horizontalCenter; text: root.countdown; font.pixelSize: 58; font.weight: Font.Light; css: 58 }
        Row {
            anchors.horizontalCenter: parent.horizontalCenter
            topPadding: 12
            spacing: 4
            Icon { name: "bell"; size: 13; color: root.paused ? Theme.label3 : Theme.label2; anchors.verticalCenter: parent.verticalCenter }
            Txt { text: root.endsText; font.pixelSize: 15; color: root.paused ? Theme.label3 : Theme.label2 }
        }
    }
}
