import QtQuick
import ".."

// Large-title header (spec 4.3): 44 px action row, 34/41 bold title, 15 subtitle, 20 below.
Column {
    id: root
    property string title: ""
    property string subtitle: ""
    property alias leading: lead.data
    property alias trailing: trail.data
    width: parent ? parent.width : 0
    bottomPadding: 20
    Item {
        width: parent.width
        height: 44
        Row { id: lead; anchors.verticalCenter: parent.verticalCenter; spacing: 16 }
        Row { id: trail; anchors.right: parent.right; anchors.verticalCenter: parent.verticalCenter; spacing: 16 }
    }
    Txt {
        width: parent.width
        text: root.title
        font.pixelSize: 34
        font.weight: Font.Bold
        font.letterSpacing: 0.34
        css: 41
        Accessible.role: Accessible.Heading
    }
    Txt {
        visible: root.subtitle !== ""
        width: parent.width
        topPadding: 2
        text: root.subtitle
        font.pixelSize: 15
        color: Theme.label2
    }
}
