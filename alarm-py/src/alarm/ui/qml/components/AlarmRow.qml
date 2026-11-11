import QtQuick
import ".."

// Alarm row (spec 3.2, 4.3): min 92, padding 16 / 10. Edit mode: red minus (turns −90°) and a
// full-height Delete; otherwise a switch. A click anywhere but the switch opens the editor.
Item {
    id: root
    required property string alarmId
    required property string time
    required property string period
    required property string subtitle
    required property bool active
    required property bool isOn
    required property bool snoozed
    required property string snoozeText
    required property string label
    required property string switchName
    property bool editMode: false
    property bool confirming: false
    signal edit()
    signal toggle(bool on)
    signal cancelSnooze()
    signal confirm()
    signal remove()
    width: parent ? parent.width : 0
    implicitHeight: Math.max(92, col.implicitHeight + 20)
    Accessible.role: Accessible.Button
    Accessible.name: label + " " + time + period

    Rectangle { anchors.fill: parent; color: hover.hovered ? Theme.cellHover(false) : "transparent" }
    Rectangle {
        visible: root.Positioner.index > 0
        x: root.editMode ? 56 : 16; width: parent.width - x; height: 0.5
        color: Theme.separator
    }
    HoverHandler { id: hover }
    MouseArea { anchors.fill: parent; onClicked: root.edit() }

    Item {
        id: minus
        visible: root.editMode
        x: 16; width: 22; height: 22
        anchors.verticalCenter: parent.verticalCenter
        rotation: root.confirming ? -90 : 0
        Behavior on rotation { NumberAnimation { duration: Theme.dur(200) } }
        Icon { name: "minusCircle"; size: 22; color: Theme.red }
        MouseArea { anchors.fill: parent; anchors.margins: -6; onClicked: root.confirm(); cursorShape: Qt.PointingHandCursor }
        Accessible.role: Accessible.Button
        Accessible.name: alarmsVm.deleteName(root.label)
    }
    Column {
        id: col
        x: root.editMode ? 16 + 22 + 12 : 16
        anchors.verticalCenter: parent.verticalCenter
        width: parent.width - x - 16 - 51 - 12
        Row {
            spacing: 4
            Txt {
                id: timeText
                text: root.time
                font.pixelSize: 54
                font.weight: Font.Light
                font.letterSpacing: -0.02 * 54
                css: 55
                color: root.active ? Theme.label : Theme.label2
                Behavior on color { ColorAnimation { duration: Theme.dur(150) } }
            }
            Txt {
                visible: root.period !== ""
                text: root.period
                font.pixelSize: 30
                font.weight: Font.Light
                anchors.baseline: timeText.baseline
                color: timeText.color
            }
        }
        Txt { width: parent.width; text: root.subtitle; font.pixelSize: 15; color: timeText.color }
        Row {
            visible: root.snoozed
            topPadding: 4
            spacing: 8
            Txt { text: root.snoozeText; font.pixelSize: 13; color: Theme.accent; anchors.verticalCenter: parent.verticalCenter }
            Rectangle {
                width: stopText.implicitWidth + 16; height: stopText.implicitHeight + 4
                radius: height / 2
                color: stopMa.containsMouse ? Theme.fill : Theme.fill2
                anchors.verticalCenter: parent.verticalCenter
                Txt { id: stopText; anchors.centerIn: parent; text: Strings.STOP; font.pixelSize: 12 }
                MouseArea { id: stopMa; anchors.fill: parent; hoverEnabled: true; cursorShape: Qt.PointingHandCursor; onClicked: root.cancelSnooze() }
                Accessible.role: Accessible.Button
                Accessible.name: Strings.STOP
            }
        }
    }
    Switch {
        visible: !root.editMode
        anchors.right: parent.right
        anchors.rightMargin: 16
        anchors.verticalCenter: parent.verticalCenter
        checked: root.isOn
        accessibleName: root.switchName
        onToggled: (on) => root.toggle(on)
    }
    Icon {
        visible: root.editMode && !root.confirming
        anchors.right: parent.right
        anchors.rightMargin: 16
        anchors.verticalCenter: parent.verticalCenter
        name: "chevronRight"; size: 14; color: Theme.label3
    }
    Rectangle {
        visible: root.editMode && root.confirming
        anchors.right: parent.right
        height: parent.height
        width: delText.implicitWidth + 48
        color: Theme.red
        opacity: visible ? 1 : 0
        Behavior on opacity { NumberAnimation { duration: Theme.dur(240) } }
        Txt { id: delText; anchors.centerIn: parent; text: Strings.DELETE; color: "white" }
        Rectangle { anchors.fill: parent; color: "white"; opacity: delMa.containsMouse ? 0.1 : 0 }
        MouseArea { id: delMa; anchors.fill: parent; hoverEnabled: true; cursorShape: Qt.PointingHandCursor; onClicked: root.remove() }
        Accessible.role: Accessible.Button
        Accessible.name: Strings.DELETE
    }
}
