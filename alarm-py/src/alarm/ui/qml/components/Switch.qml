import QtQuick
import ".."

// iOS switch (spec 4.4.2): 51 × 31, knob 27, moves 20, 200 ms.
Item {
    id: root
    property bool checked: false
    property string accessibleName: ""
    signal toggled(bool on)
    implicitWidth: 51
    implicitHeight: 31
    activeFocusOnTab: true
    Accessible.role: Accessible.CheckBox
    Accessible.name: accessibleName
    Accessible.checkable: true
    Accessible.checked: checked
    Accessible.onPressAction: root.toggled(!root.checked)

    Rectangle {
        anchors.fill: parent
        radius: height / 2
        color: root.checked ? Theme.green : Theme.switchOff
        Behavior on color { ColorAnimation { duration: Theme.dur(200) } }
    }
    Rectangle {
        width: 27; height: 27; radius: 13.5
        y: 2
        x: root.checked ? 22 : 2
        color: "white"
        border.width: 0.5
        border.color: Qt.rgba(0, 0, 0, 0.04)
        Behavior on x { NumberAnimation { duration: Theme.dur(200); easing.type: Easing.BezierSpline; easing.bezierCurve: Theme.curve } }
    }
    MouseArea {
        anchors.fill: parent
        cursorShape: Qt.PointingHandCursor
        onClicked: root.toggled(!root.checked)
    }
    Keys.onSpacePressed: root.toggled(!root.checked)
    FocusRing { radiusOverride: 15.5 }
}
