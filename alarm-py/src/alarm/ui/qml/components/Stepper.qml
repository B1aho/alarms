import QtQuick
import ".."

// Stepper (spec 4.4.3): 32 high, radius 8, two 47-wide halves, disabled end at 30 %.
Item {
    id: root
    property int value: 1
    property int from: 1
    property int to: 5
    property string accessibleName: ""
    signal changed(int value)
    implicitWidth: 95
    implicitHeight: 32
    Accessible.role: Accessible.SpinBox
    Accessible.name: accessibleName
    Rectangle { anchors.fill: parent; radius: 8; color: Theme.fill2; clip: true
        Row {
            anchors.fill: parent
            Repeater {
                model: [{ sign: "−", d: -1, name: "Decrease" }, { sign: "+", d: 1, name: "Increase" }]
                delegate: Rectangle {
                    required property var modelData
                    required property int index
                    readonly property bool enabledHalf: modelData.d < 0 ? root.value > root.from : root.value < root.to
                    width: 47; height: 32
                    color: ma.containsMouse && enabledHalf ? Theme.fill : "transparent"
                    radius: 8
                    opacity: enabledHalf ? 1 : 0.3
                    activeFocusOnTab: true
                    Accessible.role: Accessible.Button
                    Accessible.name: modelData.name
                    Txt { anchors.centerIn: parent; text: modelData.sign; font.pixelSize: 20 }
                    MouseArea { id: ma; anchors.fill: parent; hoverEnabled: true
                        onClicked: if (parent.enabledHalf) root.changed(root.value + parent.modelData.d) }
                    Keys.onSpacePressed: if (enabledHalf) root.changed(root.value + modelData.d)
                    FocusRing {}
                }
            }
        }
        Rectangle { x: 47; width: 1; y: 6; height: 20; color: Theme.separator }
    }
}
