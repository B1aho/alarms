import QtQuick
import ".."

// Keyboard focus ring (spec 4.6): 3 px blue 60 %, 2 px outside, radius 8. Only for keyboard focus.
Rectangle {
    property Item target: parent
    property real radiusOverride: 8
    anchors.fill: target
    anchors.margins: -5
    radius: radiusOverride + 5
    color: "transparent"
    border.width: 3
    border.color: Theme.tint(Theme.blue, 0.6)
    visible: !!target && target.activeFocus && Theme.keyboardNav
    z: 100
}
