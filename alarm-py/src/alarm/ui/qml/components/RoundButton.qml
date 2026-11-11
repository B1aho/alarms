import QtQuick
import ".."

// iOS Clock round button (spec 4.4.5): Ø84, inner 2 px ring in the page colour inset 3;
// 20 % tint background with full-colour text; hover brighter, press 0.95, disabled 40 %.
Item {
    id: root
    property string text: ""
    property string tone: "gray"  // green | red | orange | gray
    readonly property color base: tone === "green" ? Theme.green : tone === "red" ? Theme.red : tone === "orange" ? Theme.orange : Theme.label
    signal clicked()
    width: 84
    height: 84
    activeFocusOnTab: true
    Accessible.role: Accessible.Button
    Accessible.name: text
    Accessible.onPressAction: if (enabled) root.clicked()
    Keys.onSpacePressed: if (enabled) root.clicked()
    opacity: enabled ? 1 : 0.4
    scale: ma.pressed && enabled ? 0.95 : 1
    Behavior on scale { NumberAnimation { duration: Theme.dur(120) } }
    Rectangle {
        anchors.fill: parent
        radius: 42
        color: root.tone === "gray" ? Theme.fill : Theme.tint(root.base, 0.2)
    }
    Rectangle {
        anchors.fill: parent; radius: 42; color: "white"
        opacity: ma.containsMouse && root.enabled ? 0.08 : 0
    }
    Rectangle {
        anchors.fill: parent
        anchors.margins: 3
        radius: width / 2
        color: "transparent"
        border.width: 2
        border.color: Theme.bg(false)
    }
    Txt { anchors.centerIn: parent; text: root.text; color: root.base }
    MouseArea { id: ma; anchors.fill: parent; hoverEnabled: true; enabled: root.enabled; cursorShape: Qt.PointingHandCursor; onClicked: root.clicked() }
    FocusRing { radiusOverride: 42 }
}
