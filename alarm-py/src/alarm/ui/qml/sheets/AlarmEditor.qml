import QtQuick
import QtQuick.Controls
import "../components"
import ".."

// Alarm editor sheet (spec 3.3, 5.5, 5.6). Sub-pages push in from the right (StackView).
Sheet {
    id: sheet
    open: editorVm.open
    title: editorVm.title
    onDismissed: editorVm.cancel()
    onOpenChanged: if (open) stack.pop(null, StackView.Immediate)

    leading: [
        TextButton { visible: editorVm.page === "main"; text: Strings.CANCEL; onClicked: editorVm.cancel() },
        TextButton { visible: editorVm.page !== "main"; text: Strings.BACK; icon: "chevronLeft"; onClicked: editorVm.back() }
    ]
    trailing: [
        TextButton { visible: editorVm.page === "main"; text: Strings.SAVE; bold: true; onClicked: editorVm.save() }
    ]

    Connections {
        target: editorVm
        function onChanged() {
            var want = editorVm.page
            if (want === "main" && stack.depth > 1) stack.pop(null, StackView.Immediate)
            else if (want !== "main" && (stack.depth === 1 || stack.currentItem.pageName !== want)) {
                stack.push(pages[want])
                sheet.flick.contentY = 0
            }
        }
    }
    readonly property var pages: ({ repeat: repeatPage, sound: soundPage, ramp: rampPage, task: taskPage })

    StackView {
        id: stack
        width: parent.width
        height: currentItem ? currentItem.implicitHeight : 0
        implicitHeight: height
        initialItem: mainPage
        pushEnter: Transition {
            ParallelAnimation {
                NumberAnimation { property: "x"; from: 32; to: 0; duration: Theme.dur(300); easing.type: Easing.BezierSpline; easing.bezierCurve: Theme.curve }
                NumberAnimation { property: "opacity"; from: 0; to: 1; duration: Theme.dur(300); easing.type: Easing.BezierSpline; easing.bezierCurve: Theme.curve }
            }
        }
        pushExit: Transition { NumberAnimation { property: "opacity"; to: 0; duration: 0 } }
        popEnter: Transition { NumberAnimation { property: "opacity"; from: 1; to: 1; duration: 0 } }
        popExit: Transition { NumberAnimation { property: "opacity"; to: 0; duration: 0 } }
    }

    Component {
        id: mainPage
        Column {
            property string pageName: "main"
            width: stack.width
            TimeWheels {
                hour: editorVm.hour
                minute: editorVm.minute
                twelveHour: editorVm.twelveHour
                onChanged: (h, m) => editorVm.setTime(h, m)
            }
            Item { width: 1; height: 24 }
            Section {
                ListRow { label: Strings.REPEAT; detail: editorVm.repeatSummary; chevron: true; clickable: true; onClicked: editorVm.push("repeat") }
                InputRow { label: Strings.LABEL; text: editorVm.label; placeholder: Strings.ALARM_PLACEHOLDER; onEdited: (t) => editorVm.setLabel(t) }
                ListRow { label: Strings.SOUND; detail: editorVm.soundName; chevron: true; clickable: true; onClicked: editorVm.push("sound") }
                ListRow {
                    label: Strings.SNOOZE
                    accessory: [ Switch { checked: editorVm.snooze; accessibleName: Strings.SNOOZE; onToggled: (on) => editorVm.setSnooze(on) } ]
                }
            }
            Section {
                header: Strings.VOLUME_SECTION
                footer: Strings.VOLUME_FOOTER
                VolumeRow { value: editorVm.volume; accessibleName: "Alarm volume"; onMoved: (v) => editorVm.setVolume(v) }
                ListRow { label: Strings.GRADUAL_VOLUME; detail: editorVm.rampText; chevron: true; clickable: true; onClicked: editorVm.push("ramp") }
                ListRow { label: editorVm.previewing ? Strings.STOP_PREVIEW : Strings.PREVIEW_WAKE_UP; tone: "accent"; clickable: true; onClicked: editorVm.togglePreview() }
            }
            Section {
                header: Strings.TURN_OFF_SECTION
                footer: Strings.TURN_OFF_FOOTER
                ListRow { label: Strings.TURN_OFF_WITH; detail: editorVm.taskSummary; chevron: true; clickable: true; onClicked: editorVm.push("task") }
            }
            Section {
                visible: !editorVm.isNew
                ListRow { label: Strings.DELETE_ALARM; tone: "red"; centered: true; clickable: true; onClicked: editorVm.deleteAlarm() }
            }
        }
    }
    Component {
        id: repeatPage
        Column {
            property string pageName: "repeat"
            width: stack.width
            Section {
                Repeater {
                    model: editorVm.repeatOptions
                    delegate: ListRow {
                        required property var modelData
                        label: modelData.label
                        checked: editorVm.days.indexOf(modelData.day) >= 0
                        clickable: true
                        onClicked: editorVm.toggleDay(modelData.day)
                    }
                }
            }
        }
    }
    Component {
        id: soundPage
        Column {
            property string pageName: "sound"
            width: stack.width
            SoundPicker { vm: editorVm.picker }
        }
    }
    Component {
        id: rampPage
        Column {
            property string pageName: "ramp"
            width: stack.width
            Section {
                footer: Strings.RAMP_FOOTER
                Repeater {
                    model: editorVm.rampOptions
                    delegate: ListRow {
                        required property var modelData
                        label: modelData.label
                        checked: editorVm.rampSeconds === modelData.value
                        clickable: true
                        onClicked: editorVm.setRamp(modelData.value)
                    }
                }
            }
        }
    }
    Component {
        id: taskPage
        Column {
            property string pageName: "task"
            width: stack.width
            Section {
                Item {
                    width: parent.width; height: 56
                    Segmented {
                        x: 12; width: parent.width - 24; anchors.verticalCenter: parent.verticalCenter
                        accessibleName: "Task type"
                        options: [{ value: "none", label: Strings.NONE }, { value: "math", label: Strings.MATH }, { value: "retype", label: Strings.RETYPE_CODE }]
                        value: editorVm.taskType
                        onSelected: (v) => editorVm.setTaskType(v)
                    }
                }
            }
            Section {
                visible: editorVm.taskType !== "none"
                header: Strings.DIFFICULTY_SECTION
                Item {
                    width: parent.width; height: 56
                    Segmented {
                        x: 12; width: parent.width - 24; anchors.verticalCenter: parent.verticalCenter
                        accessibleName: "Difficulty"
                        options: [{ value: "easy", label: Strings.EASY }, { value: "medium", label: Strings.MEDIUM }, { value: "hard", label: Strings.HARD }]
                        value: editorVm.difficulty
                        onSelected: (v) => editorVm.setDifficulty(v)
                    }
                }
                ListRow {
                    label: editorVm.countText
                    inset: 1000
                    accessory: [ Stepper { value: editorVm.count; from: 1; to: 5; accessibleName: "Number of tasks"; onChanged: (v) => editorVm.setCount(v) } ]
                }
            }
            Section {
                visible: editorVm.taskType !== "none" && editorVm.example !== ""
                header: Strings.EXAMPLE_SECTION
                Item {
                    width: parent.width; height: 82
                    Txt {
                        anchors.centerIn: parent
                        text: editorVm.example
                        font.pixelSize: 28
                        font.weight: Font.Medium
                        font.letterSpacing: 0.025 * 28
                    }
                }
            }
        }
    }
}
