import QtQuick
import ".."

// Row with an inline text field (spec 4.4.7): label left, input right-aligned, no border or focus ring.
Item {
    id: root
    property string label: ""
    property string text: ""
    property string placeholder: ""
    property int maximumLength: 60
    signal edited(string text)
    width: parent ? parent.width : 0
    implicitHeight: 44
    Rectangle {
        visible: root.Positioner.index > 0
        x: 16; width: parent.width - 16; height: 0.5
        color: Theme.separator
    }
    Txt { id: lbl; x: 16; text: root.label; anchors.verticalCenter: parent.verticalCenter; elide: Text.ElideNone }
    TextInput {
        id: input
        anchors.left: lbl.right
        anchors.leftMargin: 16
        anchors.right: parent.right
        anchors.rightMargin: 16
        anchors.verticalCenter: parent.verticalCenter
        horizontalAlignment: TextInput.AlignRight
        maximumLength: root.maximumLength
        font.family: Theme.family
        font.pixelSize: 17
        color: activeFocus ? Theme.label : Theme.label2
        selectionColor: Theme.selection
        selectedTextColor: Theme.label
        clip: true
        Accessible.role: Accessible.EditableText
        Accessible.name: root.label
        Binding on text { value: root.text; when: !input.activeFocus }
        onTextEdited: root.edited(text)
        Keys.onEscapePressed: (e) => { focus = false; e.accepted = false }
        Txt {
            anchors.right: parent.right
            anchors.verticalCenter: parent.verticalCenter
            text: root.placeholder
            color: Theme.label3
            visible: input.text === ""
        }
    }
}
