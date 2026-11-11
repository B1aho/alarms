import QtQuick
import ".."

// Hour : minute wheels (24 h) or hour : minute + AM/PM (12 h) for the alarm editor (spec 3.3).
WheelGroup {
    id: root
    property int hour: 0
    property int minute: 0
    property bool twelveHour: false
    signal changed(int hour, int minute)

    readonly property var hours24: { var a = []; for (var h = 0; h < 24; h++) a.push({ value: h, label: (h < 10 ? "0" : "") + h }); return a }
    readonly property var hours12: { var a = []; for (var h = 1; h <= 12; h++) a.push({ value: h, label: "" + h }); return a }
    readonly property var minutes: { var a = []; for (var m = 0; m < 60; m++) a.push({ value: m, label: (m < 10 ? "0" : "") + m }); return a }
    readonly property var periods: [{ value: "AM", label: "AM" }, { value: "PM", label: "PM" }]
    readonly property int h12: hour % 12 === 0 ? 12 : hour % 12
    readonly property string period: hour < 12 ? "AM" : "PM"
    function to24(h, p) { return (h % 12) + (p === "PM" ? 12 : 0) }

    WheelPicker {
        width: root.twelveHour ? 64 : 72
        items: root.twelveHour ? root.hours12 : root.hours24
        value: root.twelveHour ? root.h12 : root.hour
        align: Text.AlignRight
        accessibleName: Strings.A11Y_HOUR
        onPicked: (v) => root.changed(root.twelveHour ? root.to24(v, root.period) : v, root.minute)
    }
    Txt { text: ":"; font.pixelSize: 23; height: 180; verticalAlignment: Text.AlignVCenter }
    WheelPicker {
        width: root.twelveHour ? 64 : 72
        items: root.minutes
        value: root.minute
        align: Text.AlignLeft
        accessibleName: Strings.A11Y_MINUTE
        onPicked: (v) => root.changed(root.hour, v)
    }
    WheelPicker {
        visible: root.twelveHour
        width: 64
        items: root.periods
        value: root.period
        accessibleName: Strings.A11Y_AM_PM
        onPicked: (v) => root.changed(root.to24(root.h12, v), root.minute)
    }
}
