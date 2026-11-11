import QtQuick
import ".."

// Wheels over one shared selection band (fill-2, radius 8) through the middle row.
Item {
    id: root
    default property alias wheels: row.data
    property real bandInset: 8
    implicitHeight: 180
    width: parent ? parent.width : 0
    Rectangle {
        x: root.bandInset
        width: root.width - 2 * root.bandInset
        y: 72
        height: 36
        radius: 8
        color: Theme.fill2
    }
    Row {
        id: row
        anchors.horizontalCenter: parent.horizontalCenter
        height: 180
    }
}
