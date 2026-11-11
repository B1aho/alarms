import QtQuick
import ".."

// Inset grouped section (spec 4.3): header 13 caps, block radius 10, footer 13/18, 32 below.
Column {
    id: root
    property string header: ""
    property string footer: ""
    property color footerColor: Theme.label2
    readonly property bool elevated: Theme.isElevated(root)
    default property alias rows: block.data
    width: parent ? parent.width : 0
    spacing: 0
    bottomPadding: 32

    Txt {
        visible: root.header !== ""
        text: root.header.toUpperCase()
        font.pixelSize: 13
        color: Theme.label2
        leftPadding: 16
        bottomPadding: 6
        width: parent.width
    }
    Rectangle {
        width: parent.width
        height: block.implicitHeight
        radius: 10
        color: Theme.cell(root.elevated)
        clip: true
        Column { id: block; width: parent.width }
    }
    Txt {
        visible: root.footer !== ""
        text: root.footer
        font.pixelSize: 13
        css: 18
        color: root.footerColor
        wrapMode: Text.WordWrap
        elide: Text.ElideNone
        leftPadding: 16
        rightPadding: 16
        topPadding: 6
        width: parent.width
    }
}
