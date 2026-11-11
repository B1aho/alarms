import QtQuick
import "../components"
import ".."

// Alarms (spec 3.2, 5.1–5.4).
Column {
    id: page
    width: parent ? parent.width : 0

    PageHeader {
        title: Strings.ALARMS
        subtitle: alarmsVm.subtitle
        leading: [
            TextButton {
                visible: alarmsVm.count > 0
                text: alarmsVm.editMode ? Strings.DONE : Strings.EDIT
                bold: alarmsVm.editMode
                onClicked: alarmsVm.toggleEditMode()
            }
        ]
        trailing: [
            Item {
                visible: alarmsVm.count > 0
                width: 36; height: 36
                Rectangle { anchors.fill: parent; radius: 18; color: Theme.fill2; visible: plusMa.containsMouse }
                Icon { anchors.centerIn: parent; name: "plus"; size: 24; color: Theme.accent; opacity: plusMa.pressed ? 0.6 : 1 }
                MouseArea { id: plusMa; anchors.fill: parent; hoverEnabled: true; cursorShape: Qt.PointingHandCursor; onClicked: editorVm.openNew() }
                Accessible.role: Accessible.Button
                Accessible.name: Strings.A11Y_ADD_ALARM
                activeFocusOnTab: true
                Keys.onSpacePressed: editorVm.openNew()
                FocusRing { radiusOverride: 18 }
            }
        ]
    }

    Banner {
        visible: alarmsVm.banner === "ask"
        icon: "bell"
        iconColor: Theme.accent
        title: Strings.ALLOW_NOTIFICATIONS
        text: Strings.ALLOW_NOTIFICATIONS_HINT
        action: Strings.TURN_ON
        onActionClicked: alarmsVm.requestPermission()
    }
    Banner {
        visible: alarmsVm.banner === "blocked"
        icon: "bell"
        iconColor: Theme.red
        title: Strings.NOTIFICATIONS_BLOCKED
        text: appVm.blockedText
    }
    Item { width: 1; height: alarmsVm.banner !== "" ? 16 : 0 }

    Column {
        visible: alarmsVm.count === 0
        width: parent.width
        topPadding: 64
        bottomPadding: 64
        Icon { anchors.horizontalCenter: parent.horizontalCenter; name: "alarm"; size: 54; color: Theme.label3 }
        Item { width: 1; height: 16 }
        Txt { anchors.horizontalCenter: parent.horizontalCenter; text: Strings.NO_ALARMS; font.pixelSize: 22; font.weight: Font.DemiBold }
        Txt { anchors.horizontalCenter: parent.horizontalCenter; topPadding: 4; bottomPadding: 24; text: Strings.NO_ALARMS_HINT; font.pixelSize: 15; color: Theme.label2 }
        FilledButton { anchors.horizontalCenter: parent.horizontalCenter; text: Strings.ADD_ALARM; onClicked: editorVm.openNew() }
    }

    Section {
        visible: alarmsVm.count > 0
        header: Strings.ALARMS_SECTION
        Repeater {
            model: alarmsVm.model
            delegate: AlarmRow {
                editMode: alarmsVm.editMode
                confirming: alarmsVm.confirming === alarmId
                onEdit: editorVm.openExisting(alarmId)
                onToggle: (on) => alarmsVm.toggle(alarmId, on)
                onCancelSnooze: alarmsVm.cancelSnooze(alarmId)
                onConfirm: alarmsVm.toggleConfirm(alarmId)
                onRemove: alarmsVm.remove(alarmId)
            }
        }
    }
}
