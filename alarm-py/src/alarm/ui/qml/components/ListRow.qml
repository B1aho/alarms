import QtQuick
import ".."

// List row (spec 4.4.7): min height 44, padding 16 / 11, 0.5 px separator inset 16,
// value on the right in label-2, chevron 13 label-3, optional check, icon, accessory.
Item {
    id: root
    property string label: ""
    property string detail: ""
    property color detailColor: Theme.label2
    property bool chevron: false
    property bool checked: false
    property string tone: "label"  // label | accent | red
    property string icon: ""
    property color iconColor: Theme.accent
    property bool clickable: false
    property bool centered: false
    property real inset: 16
    property alias accessory: accessorySlot.data
    readonly property bool elevated: Theme.isElevated(root)
    signal clicked()
    width: parent ? parent.width : 0
    implicitHeight: Math.max(44, content.implicitHeight + 22)
    activeFocusOnTab: clickable
    Accessible.role: clickable ? Accessible.Button : Accessible.StaticText
    Accessible.name: label + (detail ? ", " + detail : "")
    Accessible.onPressAction: if (clickable) root.clicked()
    Keys.onSpacePressed: if (clickable) root.clicked()
    Keys.onReturnPressed: if (clickable) root.clicked()

    Rectangle {
        anchors.fill: parent
        color: root.clickable && (ma.containsMouse || ma.pressed) ? Theme.cellHover(root.elevated) : "transparent"
        Behavior on color { ColorAnimation { duration: Theme.dur(150) } }
    }
    Rectangle {
        visible: root.Positioner.index > 0
        x: root.inset; width: parent.width - root.inset; height: 0.5
        color: Theme.separator
    }
    MouseArea {
        id: ma
        anchors.fill: parent
        hoverEnabled: root.clickable
        enabled: root.clickable
        cursorShape: root.clickable ? Qt.PointingHandCursor : Qt.ArrowCursor
        onClicked: root.clicked()
    }
    Row {
        id: content
        x: 16
        width: parent.width - 32
        anchors.verticalCenter: parent.verticalCenter
        spacing: 0
        Icon {
            visible: root.icon !== ""
            name: root.icon || "plus"
            size: 19
            color: root.iconColor
            anchors.verticalCenter: parent.verticalCenter
        }
        Item { visible: root.icon !== ""; width: 12; height: 1 }
        Txt {
            id: labelText
            text: root.label
            css: 22
            verticalAlignment: Text.AlignVCenter
            horizontalAlignment: root.centered ? Text.AlignHCenter : Text.AlignLeft
            color: root.tone === "accent" ? Theme.accent : root.tone === "red" ? Theme.red : Theme.label
            width: content.width - (root.icon !== "" ? 31 : 0) - rightSide.width
            anchors.verticalCenter: parent.verticalCenter
        }
        Row {
            id: rightSide
            spacing: 0
            anchors.verticalCenter: parent.verticalCenter
            Txt {
                visible: root.detail !== ""
                text: root.detail
                color: root.detailColor
                leftPadding: 12
                anchors.verticalCenter: parent.verticalCenter
            }
            Row {
                id: accessorySlot
                visible: children.length > 0
                leftPadding: 12
                anchors.verticalCenter: parent.verticalCenter
            }
            Item { visible: root.checked; width: 12 + 17; height: 17; anchors.verticalCenter: parent.verticalCenter
                Icon { x: 12; name: "check"; size: 17; color: Theme.accent } }
            Item { visible: root.chevron; width: 8 + 13; height: 13; anchors.verticalCenter: parent.verticalCenter
                Icon { x: 8; name: "chevronRight"; size: 13; color: Theme.label3 } }
        }
    }
    FocusRing { radiusOverride: 0 }
}
