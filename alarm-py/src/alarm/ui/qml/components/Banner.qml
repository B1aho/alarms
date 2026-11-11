import QtQuick
import ".."

// Banner card (spec 4.4.8): radius 14, cell, padding 16 / 14, coloured 22 icon, bold 15 title, 13 text.
Rectangle {
    id: root
    property string icon: "bell"
    property color iconColor: Theme.accent
    property string title: ""
    property string text: ""
    property string action: ""
    signal actionClicked()
    width: parent ? parent.width : 0
    implicitHeight: Math.max(body.implicitHeight, 32) + 28
    radius: 14
    color: Theme.cell(false)
    opacity: 0
    Component.onCompleted: opacity = 1
    Behavior on opacity { NumberAnimation { duration: Theme.dur(240); easing.type: Easing.OutQuad } }
    Icon { x: 16; y: 16; name: root.icon; size: 22; color: root.iconColor }
    Column {
        id: body
        x: 16 + 22 + 12
        y: 14
        width: root.width - x - 16 - (btn.visible ? btn.width + 12 : 0)
        spacing: 2
        Txt { width: parent.width; text: root.title; font.pixelSize: 15; font.weight: Font.DemiBold }
        Txt { width: parent.width; text: root.text; font.pixelSize: 13; css: 18; color: Theme.label2; wrapMode: Text.WordWrap; elide: Text.ElideNone; visible: text !== "" }
    }
    FilledButton {
        id: btn
        visible: root.action !== ""
        text: root.action
        pill: true
        fontSize: 15
        height: 32
        anchors.right: parent.right
        anchors.rightMargin: 16
        anchors.verticalCenter: parent.verticalCenter
        onClicked: root.actionClicked()
    }
}
