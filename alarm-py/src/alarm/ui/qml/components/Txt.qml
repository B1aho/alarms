import QtQuick
import ".."

// Text with the app's defaults: system font, 17 px, tabular figures, −0.01em tracking.
Text {
    color: Theme.label
    font.family: Theme.family
    font.pixelSize: 17
    font.features: Theme.tnum
    font.letterSpacing: -0.17  // −0.01em at 17 px
    // `css` = the CSS line-height of the reference (default 1.5)
    property real css: Math.round(font.pixelSize * 1.5)
    lineHeightMode: Text.FixedHeight
    lineHeight: css
    renderType: Text.QtRendering
    elide: Text.ElideRight
}
