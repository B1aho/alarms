import QtQuick
import QtQuick.Effects
import QtQuick.Shapes
import "../components"
import ".."

// Ringing screen (spec 3.5, 5.7): always dark, over everything; breathing orange glow; task card.
Rectangle {
    id: root
    property Item backdrop
    anchors.fill: parent
    visible: ringingVm.active
    color: "transparent"
    z: 80
    Accessible.role: Accessible.AlertMessage
    Accessible.name: "Alarm: " + ringingVm.label

    onVisibleChanged: if (visible) { fadeIn.restart(); focusTimer.restart() }
    NumberAnimation { id: fadeIn; target: root; property: "opacity"; from: 0; to: 1; duration: Theme.dur(240); easing.type: Easing.OutQuad }
    Timer { id: focusTimer; interval: 10; onTriggered: (ringingVm.snooze ? snoozeBtn : stopBtn).forceActiveFocus() }

    MultiEffect { anchors.fill: parent; source: root.backdrop; visible: !!root.backdrop; blurEnabled: true; blurMax: 48; blur: 1 }
    Rectangle { anchors.fill: parent; color: Qt.rgba(0, 0, 0, 0.85) }
    MouseArea { anchors.fill: parent; hoverEnabled: true; onWheel: (w) => w.accepted = true }

    Item {
        id: glow
        width: 520; height: 520
        x: (root.width - width) / 2
        y: root.height / 2 - 0.62 * height
        opacity: 0.55
        Shape {
            anchors.fill: parent
            ShapePath {
                strokeColor: "transparent"
                fillGradient: RadialGradient {
                    centerX: 260; centerY: 260; centerRadius: 260; focalX: 260; focalY: 260
                    GradientStop { position: 0; color: Qt.rgba(1, 159 / 255, 10 / 255, 0.35) }
                    GradientStop { position: 0.65; color: Qt.rgba(1, 159 / 255, 10 / 255, 0) }
                }
                PathAngleArc { centerX: 260; centerY: 260; radiusX: 260; radiusY: 260; startAngle: 0; sweepAngle: 360 }
            }
        }
        SequentialAnimation on scale {
            running: root.visible && !Theme.reducedMotion
            loops: Animation.Infinite
            NumberAnimation { from: 1; to: 1.08; duration: 1200; easing.type: Easing.InOutQuad }
            NumberAnimation { from: 1.08; to: 1; duration: 1200; easing.type: Easing.InOutQuad }
        }
        SequentialAnimation on opacity {
            running: root.visible && !Theme.reducedMotion
            loops: Animation.Infinite
            NumberAnimation { from: 0.55; to: 0.9; duration: 1200; easing.type: Easing.InOutQuad }
            NumberAnimation { from: 0.9; to: 0.55; duration: 1200; easing.type: Easing.InOutQuad }
        }
    }

    Column {
        id: col
        width: Math.min(420, root.width - 48)
        anchors.centerIn: parent
        Row {
            anchors.horizontalCenter: parent.horizontalCenter
            spacing: 8
            bottomPadding: 8
            Icon { name: "alarm"; size: 20; color: "#FF9F0A"; anchors.verticalCenter: parent.verticalCenter }
            Txt { text: ringingVm.label; color: Qt.rgba(1, 1, 1, 0.7); anchors.verticalCenter: parent.verticalCenter }
        }
        Row {
            anchors.horizontalCenter: parent.horizontalCenter
            spacing: 8
            Txt { id: bigTime; text: ringingVm.time; color: "white"; font.pixelSize: 108; css: 108; font.weight: Font.ExtraLight; font.letterSpacing: -0.03 * 108 }
            Txt { visible: ringingVm.period !== ""; text: ringingVm.period; color: "white"; font.pixelSize: 40; font.weight: Font.Light; anchors.baseline: bigTime.baseline }
        }
        Txt { anchors.horizontalCenter: parent.horizontalCenter; topPadding: 8; text: ringingVm.date; font.pixelSize: 20; color: Qt.rgba(1, 1, 1, 0.7) }

        Column {
            visible: ringingVm.stage === "buttons"
            width: parent.width
            topPadding: 56
            spacing: 12
            FilledButton {
                id: snoozeBtn
                visible: ringingVm.snooze
                width: parent.width; height: 60; pill: true; fontSize: 19
                fillColor: "#FF9F0A"
                text: ringingVm.snoozeText
                onClicked: ringingVm.snoozeNow()
            }
            FilledButton {
                id: stopBtn
                width: parent.width; height: 60; pill: true; fontSize: 19
                tone: "glass"
                text: Strings.STOP
                onClicked: ringingVm.stop()
            }
        }

        Item { visible: ringingVm.stage === "task"; width: 1; height: 48 }
        Rectangle {
            id: card
            visible: ringingVm.stage === "task"
            width: parent.width
            height: cardCol.implicitHeight + 48
            radius: 22
            color: Qt.rgba(1, 1, 1, 0.10)
            property real shift: 0
            transform: Translate { y: card.shift }
            onVisibleChanged: if (visible) { cardIn.restart(); answer.text = ""; answer.forceActiveFocus() }
            ParallelAnimation {
                id: cardIn
                NumberAnimation { target: card; property: "opacity"; from: 0; to: 1; duration: Theme.dur(320); easing.type: Easing.BezierSpline; easing.bezierCurve: Theme.curve }
                NumberAnimation { target: card; property: "shift"; from: 28; to: 0; duration: Theme.dur(320); easing.type: Easing.BezierSpline; easing.bezierCurve: Theme.curve }
                NumberAnimation { target: card; property: "scale"; from: 0.98; to: 1; duration: Theme.dur(320); easing.type: Easing.BezierSpline; easing.bezierCurve: Theme.curve }
            }
            Column {
                id: cardCol
                x: 24; y: 24
                width: parent.width - 48
                Item {
                    width: parent.width; height: 22
                    Txt { text: ringingVm.heading; font.pixelSize: 15; color: Qt.rgba(1, 1, 1, 0.7); anchors.verticalCenter: parent.verticalCenter }
                    Row {
                        anchors.right: parent.right
                        anchors.verticalCenter: parent.verticalCenter
                        spacing: 6
                        Accessible.role: Accessible.StaticText
                        Accessible.name: ringingVm.solved + " of " + ringingVm.total + " solved"
                        Repeater {
                            model: ringingVm.total
                            delegate: Rectangle { required property int index; width: 8; height: 8; radius: 4; color: index < ringingVm.solved ? "#30D158" : Qt.rgba(1, 1, 1, 0.25) }
                        }
                    }
                }
                Item { width: 1; height: 16 }
                Txt {
                    id: prompt
                    anchors.horizontalCenter: parent.horizontalCenter
                    text: ringingVm.prompt
                    color: "white"
                    font.pixelSize: 34
                    font.weight: Font.Medium
                    font.letterSpacing: 0.025 * 34
                    property real dx: 0
                    transform: Translate { x: prompt.dx }
                    property int wrong: ringingVm.wrong
                    onWrongChanged: if (wrong > 0) { shake.restart(); answer.text = "" }
                    SequentialAnimation {
                        id: shake
                        // 450 ms, ±2…±8 px (spec 4.5)
                        NumberAnimation { target: prompt; property: "dx"; to: -2; duration: Theme.dur(45) }
                        NumberAnimation { target: prompt; property: "dx"; to: 4; duration: Theme.dur(45) }
                        NumberAnimation { target: prompt; property: "dx"; to: -8; duration: Theme.dur(45) }
                        NumberAnimation { target: prompt; property: "dx"; to: 8; duration: Theme.dur(45) }
                        NumberAnimation { target: prompt; property: "dx"; to: -8; duration: Theme.dur(45) }
                        NumberAnimation { target: prompt; property: "dx"; to: 8; duration: Theme.dur(45) }
                        NumberAnimation { target: prompt; property: "dx"; to: -8; duration: Theme.dur(45) }
                        NumberAnimation { target: prompt; property: "dx"; to: 4; duration: Theme.dur(45) }
                        NumberAnimation { target: prompt; property: "dx"; to: -2; duration: Theme.dur(45) }
                        NumberAnimation { target: prompt; property: "dx"; to: 0; duration: Theme.dur(45) }
                    }
                }
                Item { width: 1; height: 20 }
                Rectangle {
                    width: parent.width; height: 56; radius: 14
                    color: Qt.rgba(0, 0, 0, 0.35)
                    border.width: answer.activeFocus ? 2 : 0
                    border.color: "#FF9F0A"
                    TextInput {
                        id: answer
                        anchors.fill: parent
                        anchors.leftMargin: 16; anchors.rightMargin: 16
                        horizontalAlignment: TextInput.AlignHCenter
                        verticalAlignment: TextInput.AlignVCenter
                        color: "white"
                        font.family: Theme.family
                        font.pixelSize: 26
                        font.features: Theme.tnum
                        font.letterSpacing: 0.05 * 26
                        font.capitalization: Font.AllUppercase
                        inputMethodHints: ringingVm.kind === "math" ? Qt.ImhFormattedNumbersOnly : (Qt.ImhNoPredictiveText | Qt.ImhNoAutoUppercase)
                        selectionColor: Theme.selection
                        Accessible.role: Accessible.EditableText
                        Accessible.name: Strings.ANSWER
                        onAccepted: if (text.trim() !== "") ringingVm.submit(text)
                        Txt {
                            anchors.centerIn: parent
                            visible: answer.text === ""
                            text: ringingVm.placeholder
                            color: Qt.rgba(1, 1, 1, 0.3)
                            font.pixelSize: 26
                            font.letterSpacing: 0.05 * 26
                        }
                    }
                }
                Item { width: 1; height: 16 }
                FilledButton {
                    width: parent.width
                    fillColor: "#FF9F0A"
                    text: Strings.DONE
                    enabled: answer.text.trim() !== ""
                    onClicked: ringingVm.submit(answer.text)
                }
                Item { width: 1; height: 12 }
                TextButton {
                    anchors.horizontalCenter: parent.horizontalCenter
                    text: Strings.BACK
                    fontSize: 15
                    color: Qt.rgba(1, 1, 1, 0.6)
                    onClicked: ringingVm.back()
                }
            }
        }
    }
    Connections {
        target: ringingVm
        function onChanged() { if (ringingVm.stage === "task" && card.visible && !answer.activeFocus) answer.forceActiveFocus() }
    }
}
