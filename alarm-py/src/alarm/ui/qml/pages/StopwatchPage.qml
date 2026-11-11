import QtQuick
import "../components"
import ".."

// Stopwatch (spec 3.11, 5.8). Redrawn every frame; Space = start/stop, L = lap/reset.
Column {
    id: page
    width: parent ? parent.width : 0
    property bool active: false
    focus: active
    onActiveChanged: if (active) forceActiveFocus()

    FrameAnimation { running: page.active && stopwatchVm.running; onTriggered: stopwatchVm.frame() }

    Keys.onPressed: (e) => {
        if (e.key === Qt.Key_Space) { stopwatchVm.startStop(); e.accepted = true }
        else if (e.key === Qt.Key_L) { stopwatchVm.lapReset(); e.accepted = true }
    }

    PageHeader { title: Strings.STOPWATCH }
    Item {
        width: parent.width
        height: 220
        Txt {
            anchors.centerIn: parent
            text: stopwatchVm.display
            font.pixelSize: Math.max(64, Math.min(96, (Window.window ? Window.window.width : 1100) * 0.13))
            font.weight: Font.ExtraLight
            css: font.pixelSize
            font.letterSpacing: -0.02 * 96
            Accessible.role: Accessible.StaticText
            Accessible.name: text
        }
    }
    Item {
        width: parent.width
        height: 84 + 24
        RoundButton {
            x: 8
            tone: "gray"
            text: stopwatchVm.running ? Strings.LAP : Strings.RESET
            enabled: stopwatchVm.running || stopwatchVm.hasTime
            onClicked: stopwatchVm.lapReset()
        }
        RoundButton {
            x: parent.width - width - 8
            tone: stopwatchVm.running ? "red" : "green"
            text: stopwatchVm.running ? Strings.STOP : Strings.START
            onClicked: stopwatchVm.startStop()
        }
    }
    Rectangle { visible: stopwatchVm.showLaps; width: parent.width; height: 0.5; color: Theme.separator }
    Repeater {
        model: stopwatchVm.laps
        delegate: Item {
            required property string name
            required property string time
            required property string tone
            width: page.width
            height: 44
            readonly property color c: tone === "best" ? Theme.green : tone === "worst" ? Theme.red : Theme.label
            Txt { x: 4; anchors.verticalCenter: parent.verticalCenter; text: parent.name; color: parent.c }
            Txt { anchors.right: parent.right; anchors.rightMargin: 4; anchors.verticalCenter: parent.verticalCenter; text: parent.time; color: parent.c }
            Rectangle { anchors.bottom: parent.bottom; width: parent.width; height: 0.5; color: Theme.separator }
        }
    }
}
