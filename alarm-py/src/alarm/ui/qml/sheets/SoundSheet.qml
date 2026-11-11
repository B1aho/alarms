import QtQuick
import "../components"
import ".."

// A sheet that is just a sound picker with a Done button (`When Timer Ends`, `Default Sound`).
Sheet {
    id: sheet
    property QtObject vm: null
    property QtObject picker: null
    open: vm ? vm.soundOpen : false
    onDismissed: vm.closeSound()
    trailing: [ TextButton { text: Strings.DONE; bold: true; onClicked: sheet.vm.closeSound() } ]
    SoundPicker { vm: sheet.picker }
}
