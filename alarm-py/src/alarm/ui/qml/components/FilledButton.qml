import QtQuick
import ".."

// Filled button (spec 4.4.5): 50 high, radius 14, 17 semibold. Orange → black text; gray → fill;
// red / indigo → white. Hover brighter, press scale 0.98, disabled 40 %. `pill` = full radius.
Item {
    id: root
    property string text: ""
    property string tone: "accent"  // accent | gray | red | indigo | glass
    property bool pill: false
    property int fontSize: 17
    property color fillColor: tone === "accent" ? Theme.accent : tone === "gray" ? Theme.fill : tone === "red" ? Theme.red : tone === "indigo" ? Theme.indigo : Qt.rgba(1, 1, 1, 0.15)
    property color textColor: tone === "accent" ? "black" : tone === "gray" ? Theme.label : "white"
    signal clicked()
    implicitHeight: 50
    implicitWidth: label.implicitWidth + 48
    activeFocusOnTab: true
    Accessible.role: Accessible.Button
    Accessible.name: text
    Accessible.onPressAction: if (enabled) root.clicked()
    Keys.onSpacePressed: if (enabled) root.clicked()
    Keys.onReturnPressed: if (enabled) root.clicked()
    opacity: enabled ? 1 : 0.4
    scale: ma.pressed ? 0.98 : 1
    Behavior on scale { NumberAnimation { duration: Theme.dur(120) } }
    Rectangle {
        id: bgRect
        anchors.fill: parent
        radius: root.pill ? height / 2 : 14
        color: root.fillColor
    }
    Rectangle {
        anchors.fill: parent
        radius: bgRect.radius
        color: "white"
        opacity: ma.containsMouse && root.enabled ? 0.10 : 0
        Behavior on opacity { NumberAnimation { duration: Theme.dur(120) } }
    }
    Txt {
        id: label
        anchors.centerIn: parent
        text: root.text
        color: root.textColor
        font.pixelSize: root.fontSize
        font.weight: Font.DemiBold
    }
    MouseArea { id: ma; anchors.fill: parent; hoverEnabled: true; enabled: root.enabled; cursorShape: Qt.PointingHandCursor; onClicked: root.clicked() }
    FocusRing { target: root; radiusOverride: bgRect.radius; anchors.margins: -5 }
}
