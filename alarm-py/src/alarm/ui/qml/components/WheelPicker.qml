import QtQuick
import ".."

// Picker wheel (spec 4.4.6), a port of alarm/src/shared/ui/WheelPicker.tsx: 36 px rows, 5 visible,
// 1:1 drag with pointer grab, wheel/trackpad, click, keys; eased settle (160–520 ms, ease-out-cubic);
// flick from the last 80 ms only, same direction, ≤ 6 rows. The value commits when the glide ends.
Item {
    id: root
    property var items: []          // [{ value, label }]
    property var value
    property string accessibleName: ""
    property int align: Text.AlignHCenter
    property color fadeColor: Theme.bg(Theme.isElevated(root))
    signal picked(var value)

    readonly property int rowH: 36
    readonly property int pad: 2 * rowH
    readonly property int settleMs: 90
    readonly property int velocityWindowMs: 80
    readonly property int maxFlickRows: 6

    implicitWidth: 64
    implicitHeight: 5 * rowH
    clip: true
    activeFocusOnTab: true
    Accessible.role: Accessible.List
    Accessible.name: accessibleName
    Accessible.description: items[index] ? items[index].label : ""

    property real pos: index * rowH
    property bool busy: false
    property int glideTarget: index
    readonly property int index: Math.max(0, indexOf(value))
    readonly property int center: clampIndex(Math.round(pos / rowH))
    readonly property real maxPos: Math.max(0, (items.length - 1) * rowH)

    function indexOf(v) { for (var i = 0; i < items.length; i++) if (items[i].value === v) return i; return -1 }
    function clampIndex(i) { return Math.min(items.length - 1, Math.max(0, i)) }
    function clampPos(p) { return Math.min(maxPos, Math.max(0, p)) }

    onIndexChanged: if (!busy) { glide.stop(); pos = index * rowH }
    onItemsChanged: if (!busy) { glide.stop(); pos = index * rowH }

    function commit(i) {
        busy = false
        var it = items[i]
        if (it !== undefined && it.value !== value) root.picked(it.value)
    }
    function animateTo(i) {
        var target = clampIndex(i)
        glideTarget = target
        glide.stop()
        settle.stop()
        busy = true
        var distance = target * rowH - pos
        if (Math.abs(distance) < 0.5 || Theme.reducedMotion) { pos = target * rowH; commit(target); return }
        glide.from = pos
        glide.to = target * rowH
        glide.duration = Math.min(520, 160 + Math.sqrt(Math.abs(distance)) * 22)
        glide.start()
    }
    NumberAnimation {
        id: glide
        target: root
        property: "pos"
        easing.type: Easing.OutCubic
        onFinished: root.commit(root.glideTarget)
    }
    Timer { id: settle; interval: root.settleMs; onTriggered: root.animateTo(Math.round(root.pos / root.rowH)) }

    // rows
    Repeater {
        model: root.items
        delegate: Text {
            required property var modelData
            required property int index
            y: root.pad + index * root.rowH - root.pos
            visible: y > -root.rowH && y < root.height
            width: root.width
            height: root.rowH
            leftPadding: 8
            rightPadding: 8
            text: modelData.label
            horizontalAlignment: root.align
            verticalAlignment: Text.AlignVCenter
            font.family: Theme.family
            font.pixelSize: 23
            font.features: Theme.tnum
            color: index === root.center ? Theme.label : Theme.label2
            Behavior on color { ColorAnimation { duration: Theme.dur(150) } }
        }
    }
    // fade top and bottom: fully visible from 32 % to 68 % of the height
    Rectangle {
        width: parent.width; height: parent.height * 0.32
        gradient: Gradient {
            GradientStop { position: 0; color: root.fadeColor }
            GradientStop { position: 1; color: Qt.rgba(root.fadeColor.r, root.fadeColor.g, root.fadeColor.b, 0) }
        }
    }
    Rectangle {
        y: parent.height * 0.68
        width: parent.width; height: parent.height * 0.32
        gradient: Gradient {
            GradientStop { position: 0; color: Qt.rgba(root.fadeColor.r, root.fadeColor.g, root.fadeColor.b, 0) }
            GradientStop { position: 1; color: root.fadeColor }
        }
    }

    // input
    DragHandler {
        id: drag
        target: null
        xAxis.enabled: false
        dragThreshold: 4
        grabPermissions: PointerHandler.CanTakeOverFromAnything
        property real startPos: 0
        property var samples: []
        onActiveChanged: {
            if (active) {
                glide.stop()
                settle.stop()
                root.busy = true
                startPos = root.pos + translation.y  // grab the wheel exactly where it is
                samples = [{ y: translation.y, t: Date.now() }]
                root.forceActiveFocus()
            } else {
                var now = Date.now()
                var recent = samples.filter(function (s) { return now - s.t <= root.velocityWindowMs })
                var rows = 0
                if (recent.length >= 2) {
                    var first = recent[0], last = recent[recent.length - 1]
                    var v = (last.y - first.y) / Math.max(16, last.t - first.t)  // px/ms, + = down
                    if (Math.abs(v) > 0.3) rows = Math.max(-root.maxFlickRows, Math.min(root.maxFlickRows, -v * 110 / root.rowH))
                }
                root.animateTo(Math.round(root.pos / root.rowH + rows))
            }
        }
        onTranslationChanged: {
            if (!active) return
            root.pos = root.clampPos(startPos - translation.y)
            var now = Date.now()
            var s = samples.concat([{ y: translation.y, t: now }])
            while (s.length > 2 && now - s[0].t > root.velocityWindowMs) s.shift()
            samples = s
        }
    }
    WheelHandler {
        target: null
        onWheel: (ev) => {
            glide.stop()  // new wheel input takes over a running glide
            root.busy = true
            var dy = ev.pixelDelta.y !== 0 ? ev.pixelDelta.y : ev.angleDelta.y / 120 * 2 * root.rowH
            root.pos = root.clampPos(root.pos - dy)
            settle.restart()
        }
    }
    TapHandler {
        onTapped: (ev) => root.animateTo(Math.floor((ev.position.y - root.pad + root.pos) / root.rowH))
    }
    HoverHandler { cursorShape: drag.active ? Qt.ClosedHandCursor : Qt.OpenHandCursor }

    Keys.onPressed: (e) => {
        // Repeated presses during a glide continue from where the wheel is heading.
        var base = glide.running ? glideTarget : busy ? center : index
        if (e.key === Qt.Key_Down) animateTo(base + 1)
        else if (e.key === Qt.Key_Up) animateTo(base - 1)
        else if (e.key === Qt.Key_PageDown) animateTo(base + 5)
        else if (e.key === Qt.Key_PageUp) animateTo(base - 5)
        else if (e.key === Qt.Key_Home) animateTo(0)
        else if (e.key === Qt.Key_End) animateTo(items.length - 1)
        else return
        e.accepted = true
    }
    FocusRing {}
}
