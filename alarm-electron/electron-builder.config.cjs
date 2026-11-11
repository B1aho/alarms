/**
 * Installers (TZ §9): macOS .dmg, Windows NSIS .exe, Linux .AppImage and .deb.
 * Signing: macOS signs with a Developer ID found in the keychain (or CSC_LINK) and notarizes when
 * APPLE_ID / APPLE_APP_SPECIFIC_PASSWORD / APPLE_TEAM_ID are set; Windows signs when CSC_LINK /
 * WIN_CSC_LINK is set. Without credentials the build is produced unsigned.
 * @type {import('electron-builder').Configuration}
 */
module.exports = {
  appId: 'com.example.alarm',
  productName: 'Alarm',
  copyright: 'Alarm',
  directories: { output: 'dist', buildResources: 'assets' },
  files: ['package.json', 'src/**/*', 'assets/icon.png', 'assets/tray*.png', 'assets/trayTemplate*.png'],
  asar: true,
  mac: {
    target: [{ target: 'dmg', arch: ['arm64', 'x64'] }],
    icon: 'assets/icon.png',
    category: 'public.app-category.utilities',
    hardenedRuntime: true,
    // LSUIElement is not set: the Dock icon is hidden programmatically while the window is closed.
    extendInfo: { NSUserNotificationAlertStyle: 'alert' },
    notarize: Boolean(process.env.APPLE_TEAM_ID && process.env.APPLE_ID),
  },
  dmg: { title: 'Alarm' },
  win: { target: [{ target: 'nsis', arch: ['x64', 'arm64'] }], icon: 'assets/icon.png' },
  nsis: { oneClick: false, perMachine: false, allowToChangeInstallationDirectory: true, shortcutName: 'Alarm' },
  linux: {
    target: [
      { target: 'AppImage', arch: ['x64', 'arm64'] },
      { target: 'deb', arch: ['x64', 'arm64'] },
    ],
    icon: 'assets/icon.png',
    category: 'Utility',
    synopsis: 'Desktop alarm clock',
    maintainer: 'Alarm <alarm@example.com>',
  },
  deb: { packageName: 'alarm-clock' },
}
