import QtQuick
import ".."

// Link button (spec 4.4.5): 17 accent; hover 70 %, pressed 50 %. Variants: red, label; bold.
Item {
    id: root
    property string text: ""
    property bool bold: false
    property string tone: "accent"
    property int fontSize: 17
    property string icon: ""
    property color color: tone === "red" ? Theme.red : tone === "label" ? Theme.label : Theme.accent
    signal clicked()
    implicitWidth: row.implicitWidth
    implicitHeight: 32
    activeFocusOnTab: true
    Accessible.role: Accessible.Button
    Accessible.name: text
    Accessible.onPressAction: root.clicked()
    Keys.onSpacePressed: root.clicked()
    Keys.onReturnPressed: root.clicked()
    opacity: !enabled ? 0.3 : ma.pressed ? 0.5 : ma.containsMouse ? 0.7 : 1
    Row {
        id: row
        anchors.verticalCenter: parent.verticalCenter
        spacing: 2
        Icon { visible: root.icon !== ""; name: root.icon || "chevronLeft"; size: 20; color: root.color; anchors.verticalCenter: parent.verticalCenter }
        Txt { text: root.text; color: root.color; font.pixelSize: root.fontSize; font.weight: root.bold ? Font.DemiBold : Font.Normal; anchors.verticalCenter: parent.verticalCenter }
    }
    MouseArea { id: ma; anchors.fill: parent; anchors.margins: -6; hoverEnabled: true; cursorShape: Qt.PointingHandCursor; onClicked: root.clicked() }
    FocusRing {}
}
