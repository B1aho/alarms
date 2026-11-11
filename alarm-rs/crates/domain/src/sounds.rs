//! Rules for user music files (3.8).

use crate::model::{BuiltinSound, CustomSound, SoundRef};
use crate::strings;

pub const MAX_BYTES: u64 = 80 * 1024 * 1024;
pub const AUDIO_EXTENSIONS: [&str; 9] = ["mp3", "m4a", "aac", "wav", "ogg", "oga", "opus", "flac", "webm"];

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum ImportError {
    NotAudio,
    TooLarge,
    CannotPlay,
}

impl ImportError {
    pub fn message(self) -> &'static str {
        match self {
            ImportError::NotAudio => strings::IMPORT_NOT_AUDIO,
            ImportError::TooLarge => strings::IMPORT_TOO_LARGE,
            ImportError::CannotPlay => strings::IMPORT_CANNOT_PLAY,
        }
    }
}

/// Lower-cased extension of a file name, if any.
pub fn extension(file_name: &str) -> Option<String> {
    let (stem, ext) = file_name.rsplit_once('.')?;
    if stem.is_empty() {
        None
    } else {
        Some(ext.to_ascii_lowercase())
    }
}

/// Name shown in the list: the file name without its extension.
pub fn display_name(file_name: &str) -> String {
    match file_name.rsplit_once('.') {
        Some((stem, _)) if !stem.is_empty() => stem.to_string(),
        _ => file_name.to_string(),
    }
}

/// Checks done before the trial decode.
pub fn validate(file_name: &str, size: u64) -> Result<String, ImportError> {
    let ext = extension(file_name)
        .filter(|e| AUDIO_EXTENSIONS.contains(&e.as_str()))
        .ok_or(ImportError::NotAudio)?;
    if size > MAX_BYTES {
        return Err(ImportError::TooLarge);
    }
    Ok(ext)
}

/// Sorted by name (3.8).
pub fn sort(sounds: &mut [CustomSound]) {
    sounds.sort_by(|a, b| {
        a.name
            .to_lowercase()
            .cmp(&b.name.to_lowercase())
            .then(a.added_at.cmp(&b.added_at))
    });
}

/// What actually plays for a reference: a missing user file falls back to `Sunrise`.
#[derive(Clone, Debug, PartialEq, Eq)]
pub enum Resolved {
    Builtin(BuiltinSound),
    Custom(CustomSound),
}

pub fn resolve(sound: &SoundRef, library: &[CustomSound]) -> Resolved {
    match sound {
        SoundRef::Builtin(b) => Resolved::Builtin(*b),
        SoundRef::Custom(id) => match library.iter().find(|s| &s.id == id) {
            Some(s) => Resolved::Custom(s.clone()),
            None => Resolved::Builtin(BuiltinSound::Sunrise),
        },
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn validation() {
        assert_eq!(validate("song.MP3", 10), Ok("mp3".into()));
        assert_eq!(validate("song.webm", 10), Ok("webm".into()));
        assert_eq!(validate("notes.txt", 10), Err(ImportError::NotAudio));
        assert_eq!(validate("noext", 10), Err(ImportError::NotAudio));
        assert_eq!(validate("big.flac", MAX_BYTES + 1), Err(ImportError::TooLarge));
        assert_eq!(display_name("My Song.v2.ogg"), "My Song.v2");
    }

    #[test]
    fn missing_falls_back_to_sunrise() {
        assert_eq!(
            resolve(&SoundRef::Custom("x".into()), &[]),
            Resolved::Builtin(BuiltinSound::Sunrise)
        );
    }
}
