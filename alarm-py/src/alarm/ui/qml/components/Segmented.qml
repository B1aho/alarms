import QtQuick
import ".."

// Segmented control (spec 4.4.1): height 32, radius 9, fill-2 track, thumb slides 300 ms.
// options: [{ value, label, icon? }]. Also the toolbar navigation (with icons).
Item {
    id: root
    property var options: []
    property var value
    property string accessibleName: ""
    property bool iconsOnly: false
    property int fontSize: 13
    signal selected(var value)
    implicitHeight: 32
    implicitWidth: 220
    readonly property int index: Math.max(0, indexOf(value))
    function indexOf(v) { for (var i = 0; i < options.length; i++) if (options[i].value === v) return i; return -1 }
    Accessible.role: Accessible.Grouping
    Accessible.name: accessibleName

    Rectangle { anchors.fill: parent; radius: 9; color: Theme.fill2 }
    Rectangle {
        id: thumb
        y: 2
        height: parent.height - 4
        width: (root.width - 4) / Math.max(1, root.options.length)
        x: 2 + root.index * width
        radius: 7
        color: Theme.thumb
        Behavior on x { NumberAnimation { duration: Theme.dur(300); easing.type: Easing.BezierSpline; easing.bezierCurve: Theme.curve } }
        Rectangle { anchors.fill: parent; anchors.topMargin: 3; anchors.bottomMargin: -3; radius: 7; color: Qt.rgba(0, 0, 0, 0.06); z: -1 }
    }
    Row {
        anchors.fill: parent
        anchors.margins: 2
        Repeater {
            model: root.options
            delegate: Item {
                id: seg
                required property var modelData
                required property int index
                readonly property bool on: index === root.index
                width: (root.width - 4) / Math.max(1, root.options.length)
                height: parent.height
                activeFocusOnTab: true
                Accessible.role: Accessible.RadioButton
                Accessible.name: modelData.label
                Accessible.checked: on
                Accessible.onPressAction: root.selected(modelData.value)
                Keys.onSpacePressed: root.selected(modelData.value)
                Row {
                    anchors.centerIn: parent
                    spacing: 6
                    Icon {
                        visible: !!seg.modelData.icon
                        name: seg.modelData.icon || "alarm"
                        size: 15
                        color: seg.on || hover.hovered ? Theme.label : Theme.label2
                        anchors.verticalCenter: parent.verticalCenter
                    }
                    Txt {
                        visible: !root.iconsOnly
                        text: seg.modelData.label
                        font.pixelSize: root.fontSize
                        font.weight: seg.on ? Font.DemiBold : Font.Medium
                        color: seg.modelData.icon ? (seg.on || hover.hovered ? Theme.label : Theme.label2) : Theme.label
                        opacity: seg.on || seg.modelData.icon ? 1 : (hover.hovered ? 1 : 0.9)
                        anchors.verticalCenter: parent.verticalCenter
                    }
                }
                HoverHandler { id: hover }
                MouseArea { anchors.fill: parent; onClicked: root.selected(seg.modelData.value) }
                FocusRing { radiusOverride: 7 }
            }
        }
    }
}
