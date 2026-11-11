import QtQuick
import QtQuick.Effects
import ".."

// Modal sheet (spec 4.3, 4.5): dims the window (black 45 %, blur 2), centred card up to 480 wide,
// radius 14, big shadow; 56 px material header; sheet-in 320 ms. Esc or a backdrop click closes.
Item {
    id: root
    property bool open: false
    property string title: ""
    property Item backdrop
    property alias leading: leadSlot.data
    property alias trailing: trailSlot.data
    default property alias content: bodyCol.data
    property alias flick: flickable
    signal dismissed()
    anchors.fill: parent
    visible: open || fade.running
    z: 50
    Accessible.role: Accessible.Dialog
    Accessible.name: title

    onOpenChanged: if (open) { enter.restart(); card.forceActiveFocus(); flickable.contentY = 0 }

    MultiEffect {
        anchors.fill: parent
        source: root.backdrop
        visible: !!root.backdrop
        blurEnabled: true
        blurMax: 4
        blur: 1
        opacity: dim.opacity / 0.45
    }
    Rectangle {
        id: dim
        anchors.fill: parent
        color: "black"
        opacity: root.open ? 0.45 : 0
        Behavior on opacity { NumberAnimation { id: fade; duration: Theme.dur(240); easing.type: Easing.OutQuad } }
        MouseArea { anchors.fill: parent; onClicked: root.dismissed(); hoverEnabled: true; onWheel: (w) => w.accepted = true }
    }
    Item {
        id: holder
        width: Math.min(480, root.width - (root.width >= 640 ? 64 : 32))
        height: Math.min(header.height + bodyCol.implicitHeight + 40, 860, root.height * 0.92)
        anchors.centerIn: parent
        visible: root.open
        property real shift: 0
        transform: Translate { y: holder.shift }
        layer.enabled: true
        layer.effect: MultiEffect {
            shadowEnabled: true
            shadowColor: Qt.rgba(0, 0, 0, 0.45)
            shadowVerticalOffset: 24
            shadowBlur: 1
            blurMax: 80
        }
        ParallelAnimation {
            id: enter
            NumberAnimation { target: holder; property: "opacity"; from: 0; to: 1; duration: Theme.dur(320); easing.type: Easing.BezierSpline; easing.bezierCurve: Theme.curve }
            NumberAnimation { target: holder; property: "shift"; from: 28; to: 0; duration: Theme.dur(320); easing.type: Easing.BezierSpline; easing.bezierCurve: Theme.curve }
            NumberAnimation { target: holder; property: "scale"; from: 0.98; to: 1; duration: Theme.dur(320); easing.type: Easing.BezierSpline; easing.bezierCurve: Theme.curve }
        }
        Rectangle {
            id: card
            objectName: "sheetCard"
            anchors.fill: parent
            radius: 14
            color: Theme.bg(true)
            clip: true
            focus: true
            Keys.onEscapePressed: root.dismissed()
            Flickable {
                id: flickable
                anchors.fill: parent
                anchors.topMargin: header.height
                contentHeight: bodyCol.implicitHeight + 40
                boundsBehavior: Flickable.StopAtBounds
                clip: true
                Column {
                    id: bodyCol
                    x: 16
                    y: 24
                    width: flickable.width - 32
                }
            }
            Rectangle {
                id: header
                width: parent.width
                height: 56
                color: Theme.material(true)
                Rectangle { anchors.bottom: parent.bottom; width: parent.width; height: 0.5; color: Theme.separator }
                Row { id: leadSlot; x: 16; anchors.verticalCenter: parent.verticalCenter }
                Txt { anchors.centerIn: parent; text: root.title; font.weight: Font.DemiBold; elide: Text.ElideNone }
                Row { id: trailSlot; anchors.right: parent.right; anchors.rightMargin: 16; anchors.verticalCenter: parent.verticalCenter }
            }
        }
    }
    Shortcut { sequence: "Esc"; enabled: root.open; onActivated: root.dismissed() }
}
