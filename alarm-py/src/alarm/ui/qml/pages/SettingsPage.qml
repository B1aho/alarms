import QtQuick
import "../components"
import ".."

// Settings (spec 3.12 with TZ 3.3–3.6). Every change applies and saves at once.
Column {
    id: page
    width: parent ? parent.width : 0

    PageHeader { title: Strings.SETTINGS }

    Section {
        header: Strings.APPEARANCE
        ListRow {
            label: Strings.THEME
            accessory: [ Segmented { width: 220; accessibleName: Strings.THEME; value: settingsVm.theme
                options: [{ value: "system", label: Strings.AUTO }, { value: "light", label: Strings.LIGHT }, { value: "dark", label: Strings.DARK }]
                onSelected: (v) => settingsVm.setTheme(v) } ]
        }
        ListRow {
            label: Strings.TIME_FORMAT
            accessory: [ Segmented { width: 220; accessibleName: Strings.TIME_FORMAT; value: settingsVm.hourCycle
                options: [{ value: "auto", label: Strings.AUTO }, { value: "12h", label: Strings.TWELVE_HOUR }, { value: "24h", label: Strings.TWENTY_FOUR_HOUR }]
                onSelected: (v) => settingsVm.setHourCycle(v) } ]
        }
    }

    Section {
        header: Strings.NEW_ALARM_DEFAULTS
        footer: Strings.DEFAULTS_FOOTER
        ListRow { label: Strings.SOUND; detail: settingsVm.soundName; chevron: true; clickable: true; onClicked: settingsVm.openSound() }
        VolumeRow { value: settingsVm.volume; accessibleName: "Default volume"; onMoved: (v) => settingsVm.setVolume(v) }
        SelectRow { label: Strings.GRADUAL_VOLUME; options: settingsVm.rampOptions; value: settingsVm.rampSeconds; onChosen: (v) => settingsVm.setRamp(v) }
        ListRow {
            label: Strings.TURN_OFF_WITH
            accessory: [ Segmented { width: 240; accessibleName: "Default dismissal task"; value: settingsVm.taskType
                options: [{ value: "none", label: Strings.NONE }, { value: "math", label: Strings.MATH }, { value: "retype", label: Strings.CODE }]
                onSelected: (v) => settingsVm.setTaskType(v) } ]
        }
        ListRow {
            visible: settingsVm.taskType !== "none"
            height: visible ? implicitHeight : 0
            label: Strings.DIFFICULTY
            accessory: [ Segmented { width: 240; accessibleName: "Default difficulty"; value: settingsVm.difficulty
                options: [{ value: "easy", label: Strings.EASY }, { value: "medium", label: Strings.MEDIUM }, { value: "hard", label: Strings.HARD }]
                onSelected: (v) => settingsVm.setDifficulty(v) } ]
        }
        ListRow {
            visible: settingsVm.taskType !== "none"
            height: visible ? implicitHeight : 0
            label: settingsVm.countText
            accessory: [ Stepper { value: settingsVm.count; from: 1; to: 5; accessibleName: "Default task count"; onChanged: (v) => settingsVm.setCount(v) } ]
        }
    }

    Section {
        header: Strings.SNOOZE_SECTION
        ListRow {
            label: settingsVm.snoozeText
            accessory: [ Stepper { value: settingsVm.snoozeMinutes; from: 1; to: 30; accessibleName: "Snooze minutes"; onChanged: (v) => settingsVm.setSnooze(v) } ]
        }
    }

    Section {
        header: Strings.RELIABILITY
        footer: Strings.RELIABILITY_FOOTER
        ListRow {
            label: Strings.NOTIFICATIONS
            detail: settingsVm.permission === "granted" ? Strings.ON : settingsVm.permission === "denied" ? Strings.BLOCKED : ""
            detailColor: settingsVm.permission === "granted" ? Theme.green : Theme.orange
            accessory: [ FilledButton { visible: settingsVm.permission === "unknown"; text: Strings.TURN_ON; pill: true; fontSize: 15; height: 32; onClicked: settingsVm.requestPermission() } ]
        }
        ListRow {
            label: Strings.OPEN_AT_LOGIN
            accessory: [ Switch { checked: settingsVm.openAtLogin; accessibleName: Strings.OPEN_AT_LOGIN; onToggled: (on) => settingsVm.setOpenAtLogin(on) } ]
        }
        ListRow {
            label: Strings.KEEP_COMPUTER_AWAKE
            accessory: [ Switch { checked: settingsVm.keepAwake; accessibleName: "Keep computer awake while alarms are on"; onToggled: (on) => settingsVm.setKeepAwake(on) } ]
        }
        SelectRow { label: Strings.RING_LATE_ALARMS_FOR; options: settingsVm.graceOptions; value: settingsVm.grace; onChosen: (v) => settingsVm.setGrace(v) }
    }

    Section {
        header: Strings.YOUR_MUSIC
        footer: settingsVm.musicFooter
        Repeater {
            model: settingsVm.music
            delegate: ListRow {
                required property var modelData
                label: modelData.name
                detail: modelData.size
                icon: "music"
                iconColor: Theme.indigo
                accessory: [
                    Item {
                        width: 18; height: 18
                        Icon { anchors.centerIn: parent; name: "trash"; size: 18; color: trashMa.containsMouse ? Theme.red : Theme.label3 }
                        MouseArea { id: trashMa; anchors.fill: parent; hoverEnabled: true; cursorShape: Qt.PointingHandCursor; onClicked: settingsVm.removeMusic(modelData.id) }
                        Accessible.role: Accessible.Button
                        Accessible.name: modelData.deleteName
                    }
                ]
            }
        }
        ListRow { label: settingsVm.musicBusy ? Strings.ADDING : Strings.ADD_MUSIC_FILE; tone: "accent"; icon: "plus"; clickable: !settingsVm.musicBusy; onClicked: settingsVm.addMusic() }
    }

    Section {
        header: Strings.ABOUT
        ListRow { label: Strings.VERSION; detail: settingsVm.version }
        ListRow { label: Strings.STORAGE; detail: Strings.THIS_COMPUTER_ONLY }
    }
}
