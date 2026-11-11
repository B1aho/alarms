import QtQuick
import ".."

// Volume slider between a small (15) and a big (20) speaker (spec 4.4.4).
ListRow {
    id: root
    property real value: 0.9
    property string accessibleName: ""
    signal moved(real value)
    Row {
        parent: root
        x: 16
        width: root.width - 32
        anchors.verticalCenter: parent.verticalCenter
        spacing: 12
        Icon { name: "speaker"; size: 15; color: Theme.label2; anchors.verticalCenter: parent.verticalCenter }
        Slider {
            width: parent.width - 15 - 20 - 24
            value: root.value
            accessibleName: root.accessibleName
            anchors.verticalCenter: parent.verticalCenter
            onMoved: (v) => root.moved(v)
        }
        Icon { name: "speaker"; size: 20; color: Theme.label2; anchors.verticalCenter: parent.verticalCenter }
    }
}
