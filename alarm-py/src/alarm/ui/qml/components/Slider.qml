import QtQuick
import ".."

// Slider (spec 4.4.4): track 4 (blue filled, fill rest), white 28 knob with a soft shadow.
Item {
    id: root
    property real value: 0.5
    property real from: 0.05
    property real to: 1
    property real stepSize: 0.05
    property string accessibleName: ""
    signal moved(real value)
    implicitHeight: 28
    activeFocusOnTab: true
    Accessible.role: Accessible.Slider
    Accessible.name: accessibleName
    readonly property real frac: (value - from) / (to - from)
    function setFromX(x) {
        var f = Math.max(0, Math.min(1, (x - 14) / Math.max(1, width - 28)))
        var v = from + Math.round(f * (to - from) / stepSize) * stepSize
        root.moved(Math.round(v * 100) / 100)
    }
    Rectangle { x: 14; width: parent.width - 28; height: 4; radius: 2; anchors.verticalCenter: parent.verticalCenter; color: Theme.fill }
    Rectangle { x: 14; width: (parent.width - 28) * root.frac; height: 4; radius: 2; anchors.verticalCenter: parent.verticalCenter; color: Theme.blue }
    Rectangle {
        width: 28; height: 28; radius: 14
        x: (root.width - 28) * root.frac
        color: "white"
        Rectangle { z: -1; anchors.fill: parent; anchors.margins: -1; anchors.topMargin: 2; anchors.bottomMargin: -4; radius: 16; color: Qt.rgba(0, 0, 0, 0.12) }
    }
    MouseArea {
        anchors.fill: parent
        cursorShape: Qt.PointingHandCursor
        preventStealing: true
        onPressed: (e) => root.setFromX(e.x)
        onPositionChanged: (e) => { if (pressed) root.setFromX(e.x) }
    }
    Keys.onLeftPressed: root.moved(Math.max(from, Math.round((value - stepSize) * 100) / 100))
    Keys.onRightPressed: root.moved(Math.min(to, Math.round((value + stepSize) * 100) / 100))
    FocusRing {}
}
