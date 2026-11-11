pragma Singleton
import QtQuick

// Colour, type and motion tokens (spec 4.1, 4.2, 4.5). `elevated` = inside a sheet (one level up).
QtObject {
    id: t
    property string pref: "system"
    property bool reducedMotion: false
    property bool keyboardNav: false  // last input was the keyboard: show focus rings
    readonly property bool dark: pref === "dark" || (pref === "system" && Qt.styleHints.colorScheme === Qt.ColorScheme.Dark)

    function bg(e) { return dark ? (e ? "#1C1C1E" : "#000000") : "#F2F2F7" }
    function cell(e) { return dark ? (e ? "#2C2C2E" : "#1C1C1E") : "#FFFFFF" }
    function cellHover(e) { return dark ? (e ? "#3A3A3C" : "#2C2C2E") : "#E5E5EA" }
    function material(e) { return dark ? (e ? Qt.rgba(28/255, 28/255, 30/255, .85) : Qt.rgba(22/255, 22/255, 23/255, .72)) : (e ? Qt.rgba(242/255, 242/255, 247/255, .85) : Qt.rgba(246/255, 246/255, 246/255, .78)) }
    readonly property color fill: dark ? Qt.rgba(120/255, 120/255, 128/255, .36) : Qt.rgba(120/255, 120/255, 128/255, .20)
    readonly property color fill2: dark ? Qt.rgba(118/255, 118/255, 128/255, .24) : Qt.rgba(118/255, 118/255, 128/255, .12)
    readonly property color thumb: dark ? "#636366" : "#FFFFFF"
    readonly property color separator: dark ? Qt.rgba(84/255, 84/255, 88/255, .65) : Qt.rgba(60/255, 60/255, 67/255, .29)
    readonly property color label: dark ? "#FFFFFF" : "#000000"
    readonly property color label2: dark ? Qt.rgba(235/255, 235/255, 245/255, .60) : Qt.rgba(60/255, 60/255, 67/255, .60)
    readonly property color label3: dark ? Qt.rgba(235/255, 235/255, 245/255, .30) : Qt.rgba(60/255, 60/255, 67/255, .30)
    readonly property color orange: dark ? "#FF9F0A" : "#FF9500"
    readonly property color accent: orange
    readonly property color green: dark ? "#30D158" : "#34C759"
    readonly property color red: dark ? "#FF453A" : "#FF3B30"
    readonly property color blue: dark ? "#0A84FF" : "#007AFF"
    readonly property color indigo: dark ? "#5E5CE6" : "#5856D6"
    readonly property color switchOff: dark ? "#39393D" : "#E9E9EA"
    readonly property color selection: Qt.rgba(1, 0.62, 0.04, .35)

    function tint(c, a) { return Qt.rgba(c.r, c.g, c.b, a) }

    // Type: the system font (SF Pro on macOS); tabular figures everywhere.
    readonly property string family: Qt.application.font.family
    readonly property var tnum: ({ "tnum": 1 })

    // Motion
    readonly property var curve: [0.32, 0.72, 0, 1, 1, 1]
    function dur(ms) { return reducedMotion ? 0 : ms }

    function isElevated(item) {
        for (var p = item; p; p = p.parent)
            if (p.objectName === "sheetCard") return true
        return false
    }
}
