"""Every UI, tray and notification text (spec 6, TZ 3). QML reads them through `Strings`."""

from typing import Final, Literal

Platform = Literal["macos", "windows", "linux"]

APP_NAME: Final = "Alarm"

# --- navigation & headers
ALARMS: Final = "Alarms"
STOPWATCH: Final = "Stopwatch"
TIMER: Final = "Timer"
SETTINGS: Final = "Settings"

# --- alarms page
EDIT: Final = "Edit"
DONE: Final = "Done"
NO_ALARMS_ON: Final = "No alarms on"
ALARMS_SECTION: Final = "ALARMS"
NO_ALARMS: Final = "No Alarms"
NO_ALARMS_HINT: Final = "Add an alarm to wake up on time."
ADD_ALARM: Final = "Add Alarm"
STOP: Final = "Stop"
DELETE: Final = "Delete"
ALLOW_NOTIFICATIONS: Final = "Allow Notifications"
ALLOW_NOTIFICATIONS_HINT: Final = "So alarms reach you even when the app is minimised or behind other windows."
TURN_ON: Final = "Turn On"
NOTIFICATIONS_BLOCKED: Final = "Notifications are blocked"
BLOCKED_FIRST: Final = "Alarms still ring while the app is open, but you will not see them when the window is hidden."
BLOCKED_SECOND: Final[dict[Platform, str]] = {
    "macos": "Allow notifications in System Settings → Notifications.",
    "windows": "Allow notifications in Settings → System → Notifications.",
    "linux": "Allow notifications in your desktop settings.",
}

# --- editor
EDIT_ALARM: Final = "Edit Alarm"
CANCEL: Final = "Cancel"
SAVE: Final = "Save"
BACK: Final = "Back"
REPEAT: Final = "Repeat"
LABEL: Final = "Label"
ALARM_PLACEHOLDER: Final = "Alarm"
SOUND: Final = "Sound"
SNOOZE: Final = "Snooze"
GRADUAL_VOLUME: Final = "Gradual Volume"
PREVIEW_WAKE_UP: Final = "Preview Wake-up"
STOP_PREVIEW: Final = "Stop Preview"
TURN_OFF_WITH: Final = "Turn Off With"
DELETE_ALARM: Final = "Delete Alarm"
VOLUME_SECTION: Final = "VOLUME"
TURN_OFF_SECTION: Final = "TURN OFF"
DIFFICULTY_SECTION: Final = "DIFFICULTY"
EXAMPLE_SECTION: Final = "EXAMPLE"
NONE: Final = "None"
MATH: Final = "Math"
RETYPE_CODE: Final = "Retype Code"
EASY: Final = "Easy"
MEDIUM: Final = "Medium"
HARD: Final = "Hard"
VOLUME_FOOTER: Final = "Starts almost silent and rises smoothly to the set volume."
RAMP_FOOTER: Final = "How long it takes to reach full volume."
TURN_OFF_FOOTER: Final = "The alarm keeps ringing until the task is solved. Snooze never needs a task."

# --- sounds
YOUR_MUSIC: Final = "YOUR MUSIC"
CHOOSE_FILE: Final = "Choose a File…"
ADDING: Final = "Adding…"
BUILT_IN_SOUNDS: Final = "BUILT-IN SOUNDS"
MISSING_FILE: Final = "Missing file"
SOUNDS_FOOTER: Final = "Music files stay on this computer. MP3, M4A, WAV, OGG and FLAC are supported."
ERR_NOT_AUDIO: Final = "That file is not an audio file."
ERR_TOO_LARGE: Final = "That file is larger than 80 MB."
ERR_CANNOT_PLAY: Final = "This audio format cannot be played on this computer."

# --- ringing
SOLVE_TO_TURN_OFF: Final = "Solve to turn off"
TYPE_CODE_TO_TURN_OFF: Final = "Type the code to turn off"
ANSWER: Final = "Answer"
CODE: Final = "Code"

# --- timer
START: Final = "Start"
PAUSE: Final = "Pause"
RESUME: Final = "Resume"
TIMER_PLACEHOLDER: Final = "Timer"
WHEN_TIMER_ENDS: Final = "When Timer Ends"
RECENTS: Final = "RECENTS"
REMOVE: Final = "Remove"
HOURS_UNIT: Final = "hours"
MIN_UNIT: Final = "min"
SEC_UNIT: Final = "sec"

# --- stopwatch
LAP: Final = "Lap"
RESET: Final = "Reset"

# --- settings
APPEARANCE: Final = "APPEARANCE"
THEME: Final = "Theme"
AUTO: Final = "Auto"
LIGHT: Final = "Light"
DARK: Final = "Dark"
TIME_FORMAT: Final = "Time Format"
TWELVE_HOUR: Final = "12-hour"
TWENTY_FOUR_HOUR: Final = "24-hour"
NEW_ALARM_DEFAULTS: Final = "NEW ALARM DEFAULTS"
DIFFICULTY: Final = "Difficulty"
DEFAULTS_FOOTER: Final = "Applied to alarms you create from now on. Each alarm can still be changed individually."
DEFAULT_SOUND: Final = "Default Sound"
SNOOZE_SECTION: Final = "SNOOZE"
RELIABILITY: Final = "RELIABILITY"
NOTIFICATIONS: Final = "Notifications"
ON: Final = "On"
BLOCKED: Final = "Blocked"
OPEN_AT_LOGIN: Final = "Open at Login"
KEEP_COMPUTER_AWAKE: Final = "Keep Computer Awake"
RING_LATE_ALARMS_FOR: Final = "Ring Late Alarms For"
RELIABILITY_FOOTER: Final = "Alarm keeps running in the menu bar / tray and rings even when its window is closed."
ADD_MUSIC_FILE: Final = "Add Music File…"
MUSIC_FOOTER: Final = (
    "Imported files are copied into the app’s local storage, so alarms keep working if the original is moved."
)
ABOUT: Final = "ABOUT"
VERSION: Final = "Version"
STORAGE: Final = "Storage"
THIS_COMPUTER_ONLY: Final = "This computer only"

# --- tray
OPEN_ALARM: Final = "Open Alarm"
QUIT: Final = "Quit"

# --- accessibility
A11Y_ADD_ALARM: Final = "Add alarm"
A11Y_HOUR: Final = "Hour"
A11Y_MINUTE: Final = "Minute"
A11Y_AM_PM: Final = "AM or PM"
A11Y_HOURS: Final = "Hours"
A11Y_MINUTES: Final = "Minutes"
A11Y_SECONDS: Final = "Seconds"
A11Y_REMOVE_RECENT: Final = "Remove from recents"


def blocked_text(platform: Platform) -> str:
    return f"{BLOCKED_FIRST} {BLOCKED_SECOND[platform]}"


def next_alarm_in(relative: str) -> str:
    return f"Next alarm in {relative}"


def snoozed_until(time: str) -> str:
    return f"Snoozed until {time}"


def every_day_name(day_long: str) -> str:
    return f"Every {day_long}"


def snooze_button(minutes: int) -> str:
    """Ringing screen: `Snooze · 9 min`."""
    return f"Snooze · {minutes} min"


def snooze_action(minutes: int) -> str:
    """Notification button and tray item: `Snooze 9 min`."""
    return f"Snooze {minutes} min"


def snooze_length(minutes: int) -> str:
    return f"Snooze Length · {minutes} min"


def timer_is_up(countdown: str) -> str:
    return f"{countdown} is up"


def lap_n(n: int) -> str:
    return f"Lap {n}"


def delete_named(label: str) -> str:
    return f"Delete {label}"


def start_timer_named(words: str) -> str:
    return f"Start {words} timer"


def window_title_ringing(label: str) -> str:
    return f"⏰ {label}"


# --- notifications (spec 6)
def notify_alarm(label: str, time: str) -> tuple[str, str]:
    return f"⏰ {label}", f"{time}\nOpen the app to turn it off."


def notify_missed(label: str, time: str) -> tuple[str, str]:
    return f"Missed alarm: {label}", f"It was set for {time}, while the computer was asleep or the app was closed."


def notify_timer(label: str, countdown: str) -> tuple[str, str]:
    return f"⏱ {label}", f"{countdown} timer is done."


def notify_timer_late(label: str, countdown: str) -> tuple[str, str]:
    return f"{label} ended", f"Your {countdown} timer finished while the computer was asleep."
