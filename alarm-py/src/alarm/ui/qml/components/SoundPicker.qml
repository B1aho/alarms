import QtQuick
import ".."

// Sound chooser (spec 3.8): YOUR MUSIC (indigo notes, `Choose a File…`), BUILT-IN SOUNDS; orange check.
Column {
    id: root
    property QtObject vm: null
    width: parent ? parent.width : 0
    Section {
        header: Strings.YOUR_MUSIC
        footer: (root.vm ? root.vm.footer : "")
        Repeater {
            model: (root.vm ? root.vm.customs : [])
            delegate: ListRow {
                required property var modelData
                label: modelData.name
                icon: "music"
                iconColor: Theme.indigo
                checked: (root.vm ? root.vm.selected : "") === "custom:" + modelData.id
                clickable: true
                onClicked: root.vm.choose("custom", modelData.id)
            }
        }
        ListRow {
            label: (root.vm ? root.vm.busy : false) ? Strings.ADDING : Strings.CHOOSE_FILE
            tone: "accent"
            icon: "plus"
            clickable: !(root.vm ? root.vm.busy : false)
            onClicked: root.vm.chooseFile()
        }
    }
    Section {
        header: Strings.BUILT_IN_SOUNDS
        Repeater {
            model: (root.vm ? root.vm.builtins : [])
            delegate: ListRow {
                required property var modelData
                label: modelData.name
                checked: (root.vm ? root.vm.selected : "") === "builtin:" + modelData.id
                clickable: true
                onClicked: root.vm.choose("builtin", modelData.id)
            }
        }
    }
}
