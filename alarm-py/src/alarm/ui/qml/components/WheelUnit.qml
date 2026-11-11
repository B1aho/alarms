import QtQuick
import ".."

// Fixed unit label next to a wheel (`hours`, `min`, `sec`): 17 semibold.
Txt {
    width: 40 + 8
    height: 180
    leftPadding: -4
    verticalAlignment: Text.AlignVCenter
    font.weight: Font.DemiBold
    elide: Text.ElideNone
}
