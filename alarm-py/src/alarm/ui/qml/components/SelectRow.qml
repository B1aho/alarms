import QtQuick
import QtQuick.Controls
import ".."

// Row with a drop-down on the right (`1 min ⌄`), like a native <select>.
ListRow {
    id: root
    property var options: []   // [{ value, label }]
    property var value
    signal chosen(var value)
    readonly property string current: { for (var i = 0; i < options.length; i++) if (options[i].value === value) return options[i].label; return "" }
    clickable: true
    onClicked: menu.popup(root, root.width - 160, root.height)
    accessory: [
        Row {
            spacing: 2
            Txt { text: root.current; color: Theme.label2; anchors.verticalCenter: parent.verticalCenter }
            Icon { name: "chevronDown"; size: 13; color: Theme.label2; anchors.verticalCenter: parent.verticalCenter }
        }
    ]
    Menu {
        id: menu
        Repeater {
            model: root.options
            delegate: MenuItem {
                required property var modelData
                text: modelData.label
                checkable: true
                checked: modelData.value === root.value
                onTriggered: root.chosen(modelData.value)
            }
        }
    }
}
