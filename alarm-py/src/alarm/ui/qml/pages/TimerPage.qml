import QtQuick
import "../components"
import ".."

// Timer (spec 3.10, 5.9).
Column {
    id: page
    width: parent ? parent.width : 0
    readonly property bool runningOrPaused: timerVm.status === "running" || timerVm.status === "paused"
    readonly property var hours: { var a = []; for (var h = 0; h < 24; h++) a.push({ value: h, label: "" + h }); return a }
    readonly property var sixty: { var a = []; for (var m = 0; m < 60; m++) a.push({ value: m, label: "" + m }); return a }

    PageHeader { title: Strings.TIMER }
    Item {
        width: parent.width
        height: 260
        WheelGroup {
            visible: !page.runningOrPaused
            width: Math.min(420, parent.width)
            anchors.centerIn: parent
            WheelPicker { width: 56; items: page.hours; value: timerVm.hours; align: Text.AlignRight; accessibleName: Strings.A11Y_HOURS
                onPicked: (v) => timerVm.setDuration(v, timerVm.minutes, timerVm.seconds) }
            WheelUnit { text: Strings.HOURS_UNIT }
            WheelPicker { width: 56; items: page.sixty; value: timerVm.minutes; align: Text.AlignRight; accessibleName: Strings.A11Y_MINUTES
                onPicked: (v) => timerVm.setDuration(timerVm.hours, v, timerVm.seconds) }
            WheelUnit { text: Strings.MIN_UNIT }
            WheelPicker { width: 56; items: page.sixty; value: timerVm.seconds; align: Text.AlignRight; accessibleName: Strings.A11Y_SECONDS
                onPicked: (v) => timerVm.setDuration(timerVm.hours, timerVm.minutes, v) }
            WheelUnit { text: Strings.SEC_UNIT }
        }
        TimerRing {
            visible: page.runningOrPaused
            anchors.centerIn: parent
            progress: timerVm.progress
            label: timerVm.displayLabel
            countdown: timerVm.countdown
            endsText: timerVm.endsText
            paused: timerVm.status === "paused"
        }
    }
    Item { width: 1; height: 24 }
    Item {
        width: parent.width
        height: 84 + 40
        RoundButton { x: 8; tone: "gray"; text: Strings.CANCEL; enabled: page.runningOrPaused; onClicked: timerVm.cancel() }
        RoundButton {
            x: parent.width - width - 8
            tone: timerVm.status === "running" ? "orange" : "green"
            text: timerVm.status === "running" ? Strings.PAUSE : timerVm.status === "paused" ? Strings.RESUME : Strings.START
            onClicked: timerVm.status === "running" ? timerVm.pause() : timerVm.status === "paused" ? timerVm.resume() : timerVm.start()
        }
    }
    Section {
        InputRow { label: Strings.LABEL; text: timerVm.label; placeholder: Strings.TIMER_PLACEHOLDER; onEdited: (t) => timerVm.setLabel(t) }
        ListRow { label: Strings.WHEN_TIMER_ENDS; detail: timerVm.soundName; chevron: true; clickable: true; onClicked: timerVm.openSound() }
    }
    Section {
        visible: timerVm.recentCount > 0
        header: Strings.RECENTS
        Repeater {
            model: timerVm.recents
            delegate: Item {
                id: rec
                required property int duration
                required property string time
                required property string subtitle
                required property string label
                required property string startName
                width: page.width
                height: Math.max(44, info.implicitHeight + 20)
                HoverHandler { id: recHover }
                Rectangle { visible: rec.Positioner.index > 0; x: 16; width: parent.width - 16; height: 0.5; color: Theme.separator }
                Column {
                    id: info
                    x: 16
                    anchors.verticalCenter: parent.verticalCenter
                    Txt { text: rec.time; font.pixelSize: 34; font.weight: Font.Light; css: 42 }
                    Txt { text: rec.subtitle; font.pixelSize: 13; color: Theme.label2 }
                }
                TextButton {
                    anchors.right: play.left
                    anchors.rightMargin: 12
                    anchors.verticalCenter: parent.verticalCenter
                    text: Strings.REMOVE
                    fontSize: 13
                    color: removeHover.hovered ? Theme.red : Theme.label3
                    opacity: recHover.hovered || activeFocus ? 1 : 0
                    Behavior on opacity { NumberAnimation { duration: Theme.dur(150) } }
                    Accessible.name: Strings.A11Y_REMOVE_RECENT
                    HoverHandler { id: removeHover }
                    onClicked: timerVm.removeRecent(rec.duration)
                }
                Rectangle {
                    id: play
                    width: 40; height: 40; radius: 20
                    anchors.right: parent.right
                    anchors.rightMargin: 16
                    anchors.verticalCenter: parent.verticalCenter
                    color: Theme.tint(Theme.green, playMa.containsMouse ? 0.30 : 0.22)
                    Icon { anchors.centerIn: parent; anchors.horizontalCenterOffset: 1; name: "play"; size: 17; color: Theme.green }
                    MouseArea { id: playMa; anchors.fill: parent; hoverEnabled: true; cursorShape: Qt.PointingHandCursor; onClicked: timerVm.startRecent(rec.duration, rec.label) }
                    activeFocusOnTab: true
                    Accessible.role: Accessible.Button
                    Accessible.name: rec.startName
                    Keys.onSpacePressed: timerVm.startRecent(rec.duration, rec.label)
                    FocusRing { radiusOverride: 20 }
                }
            }
        }
    }
}
