import QtQuick
import QtQuick.Controls
import QtQuick.Effects
import "components"
import "pages"
import "sheets"

// The window (spec 3.1, 4.3, 5): toolbar with segmented navigation and a clock, one page column,
// sheets, the timer alert and the ringing screen on top.
ApplicationWindow {
    id: win
    title: appVm.title
    width: 1100
    height: 820
    minimumWidth: 400
    minimumHeight: 560
    color: Theme.bg(false)
    readonly property bool wide: width >= 640
    onClosing: appVm.windowClosing()

    Binding { target: Theme; property: "pref"; value: appVm.theme }
    Binding { target: Theme; property: "reducedMotion"; value: appVm.reducedMotion }
    Binding { target: Theme; property: "keyboardNav"; value: appVm.keyboardNav }

    Shortcut { sequence: "Ctrl+1"; onActivated: appVm.setPage(0) }
    Shortcut { sequence: "Ctrl+2"; onActivated: appVm.setPage(1) }
    Shortcut { sequence: "Ctrl+3"; onActivated: appVm.setPage(2) }
    Shortcut { sequence: "Ctrl+4"; onActivated: appVm.setPage(3) }

    Item {
        id: scene
        anchors.fill: parent

        Flickable {
            id: scroller
            property int lastPage: -1
            anchors.fill: parent
            contentHeight: 52 + 8 + pages.height + 96
            boundsBehavior: Flickable.StopAtBounds
            ScrollBar.vertical: ScrollBar { policy: ScrollBar.AsNeeded }
            Item {
                id: pages
                y: 52 + 8
                width: Math.min(680, win.width) - 2 * (win.wide ? 24 : 16)
                x: (win.width - width) / 2
                height: [alarmsPage, stopwatchPage, timerPage, settingsPage][appVm.page].implicitHeight
                AlarmsPage { id: alarmsPage; visible: appVm.page === 0 }
                StopwatchPage { id: stopwatchPage; visible: appVm.page === 1; active: appVm.page === 1 }
                TimerPage { id: timerPage; visible: appVm.page === 2 }
                SettingsPage { id: settingsPage; visible: appVm.page === 3 }
            }
            onContentHeightChanged: if (contentY > Math.max(0, contentHeight - height)) contentY = Math.max(0, contentHeight - height)
        }
        Connections { target: appVm; function onChanged() { if (scroller.lastPage !== appVm.page) { scroller.lastPage = appVm.page; scroller.contentY = 0 } } }
        Component.onCompleted: scroller.lastPage = appVm.page

        // Toolbar: material with blur and saturation over the content beneath (spec 4.3).
        Item {
            id: toolbar
            width: parent.width
            height: 52
            ShaderEffectSource { id: under; sourceItem: scroller; sourceRect: Qt.rect(0, 0, toolbar.width, 52); visible: false; live: true }
            MultiEffect { anchors.fill: parent; source: under; blurEnabled: true; blurMax: 40; blur: 1; saturation: 0.5 }
            Rectangle { anchors.fill: parent; color: Theme.material(false) }
            Rectangle { anchors.bottom: parent.bottom; width: parent.width; height: 0.5; color: Theme.separator }
            Item {
                width: Math.min(1100, parent.width)
                height: parent.height
                anchors.horizontalCenter: parent.horizontalCenter
                Row {
                    visible: win.wide
                    x: 16
                    anchors.verticalCenter: parent.verticalCenter
                    spacing: 8
                    Rectangle {
                        width: 28; height: 28; radius: 8
                        gradient: Gradient { GradientStop { position: 0; color: "#FFB340" } GradientStop { position: 1; color: "#FF8A00" } }
                        Icon { anchors.centerIn: parent; name: "alarm"; size: 16; color: "black" }
                    }
                    Txt { text: Strings.APP_NAME; font.pixelSize: 15; font.weight: Font.DemiBold; anchors.verticalCenter: parent.verticalCenter }
                }
                TextMetrics { id: navMetrics; font.family: Theme.family; font.pixelSize: 13; font.weight: Font.DemiBold; text: Strings.STOPWATCH }
                Segmented {
                    id: nav
                    anchors.centerIn: parent
                    width: win.wide ? 4 * (navMetrics.advanceWidth + 15 + 6 + 26) + 4 : 4 * 48 + 4
                    iconsOnly: !win.wide
                    accessibleName: "Sections"
                    value: appVm.page
                    options: [
                        { value: 0, label: Strings.ALARMS, icon: "alarm" },
                        { value: 1, label: Strings.STOPWATCH, icon: "stopwatch" },
                        { value: 2, label: Strings.TIMER, icon: "timer" },
                        { value: 3, label: Strings.SETTINGS, icon: "gear" }
                    ]
                    onSelected: (v) => appVm.setPage(v)
                }
                Row {
                    visible: win.wide
                    anchors.right: parent.right
                    anchors.rightMargin: 16
                    anchors.verticalCenter: parent.verticalCenter
                    spacing: 4
                    Accessible.role: Accessible.StaticText
                    Accessible.name: "Current time"
                    Txt { id: clockText; text: appVm.clock; font.pixelSize: 15; color: Theme.label2 }
                    Txt { visible: appVm.clockPeriod !== ""; text: appVm.clockPeriod; font.pixelSize: 12; color: Theme.label2; anchors.baseline: clockText.baseline }
                }
            }
        }
    }

    AlarmEditor { backdrop: scene }
    SoundSheet { title: Strings.WHEN_TIMER_ENDS; vm: timerVm; picker: timerVm.picker; backdrop: scene }
    SoundSheet { title: Strings.DEFAULT_SOUND; vm: settingsVm; picker: settingsVm.picker; backdrop: scene }
    TimerAlert { backdrop: scene }
    Ringing { backdrop: scene }
}
