import QtQuick
import QtQuick.Effects
import "../components"
import ".."

// "Timer done" alert (spec 3.10, 5.9): over everything; Stop (orange, focused) and Repeat.
Item {
    id: root
    property Item backdrop
    anchors.fill: parent
    visible: timerVm.alertVisible
    z: 70
    Accessible.role: Accessible.AlertMessage
    Accessible.name: timerVm.displayLabel
    onVisibleChanged: if (visible) { enter.restart(); focusTimer.restart() }
    Timer { id: focusTimer; interval: 10; onTriggered: stopBtn.forceActiveFocus() }

    MultiEffect { anchors.fill: parent; source: root.backdrop; visible: !!root.backdrop; blurEnabled: true; blurMax: 4; blur: 1 }
    Rectangle { anchors.fill: parent; color: "black"; opacity: 0.45 }
    MouseArea { anchors.fill: parent; hoverEnabled: true; onWheel: (w) => w.accepted = true }

    Rectangle {
        id: card
        objectName: "sheetCard"
        width: Math.min(320, root.width - 32)
        height: col.implicitHeight + 32
        anchors.centerIn: parent
        radius: 22
        color: Theme.bg(true)
        property real shift: 0
        transform: Translate { y: card.shift }
        ParallelAnimation {
            id: enter
            NumberAnimation { target: card; property: "opacity"; from: 0; to: 1; duration: Theme.dur(320); easing.type: Easing.BezierSpline; easing.bezierCurve: Theme.curve }
            NumberAnimation { target: card; property: "shift"; from: 28; to: 0; duration: Theme.dur(320); easing.type: Easing.BezierSpline; easing.bezierCurve: Theme.curve }
            NumberAnimation { target: card; property: "scale"; from: 0.98; to: 1; duration: Theme.dur(320); easing.type: Easing.BezierSpline; easing.bezierCurve: Theme.curve }
        }
        Column {
            id: col
            x: 16; y: 16
            width: parent.width - 32
            topPadding: 14
            Icon { anchors.horizontalCenter: parent.horizontalCenter; name: "timer"; size: 34; color: Theme.orange }
            Txt { anchors.horizontalCenter: parent.horizontalCenter; topPadding: 12; text: timerVm.displayLabel; font.pixelSize: 20; font.weight: Font.DemiBold }
            Txt { anchors.horizontalCenter: parent.horizontalCenter; topPadding: 8; bottomPadding: 20; text: timerVm.alertText; font.pixelSize: 15; color: Theme.label2 }
            FilledButton { id: stopBtn; width: parent.width; text: Strings.STOP; onClicked: timerVm.stopAlert() }
            Item { width: 1; height: 8 }
            FilledButton { width: parent.width; tone: "gray"; text: Strings.REPEAT; onClicked: timerVm.repeatAlert() }
        }
    }
}
