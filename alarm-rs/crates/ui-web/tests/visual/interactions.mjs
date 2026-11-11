// Interaction checks on the widget page (?gallery=1): the wheel picker (4.4.6) and the controls.
// Returns a list of { name, ok, detail }.
export async function checkWidgets(browser, base) {
  const page = await browser.newPage({ viewport: { width: 1100, height: 820 } })
  const results = []
  const check = (name, ok, detail = '') => results.push({ name, ok, detail })
  await page.goto(`${base}?gallery=1`)
  await page.waitForSelector('.wheel')
  const value = () => page.textContent('[data-testid="wheel-value"]')
  const hour = page.locator('.wheel').first()
  const settle = () => page.waitForTimeout(700)

  check('initial value', (await value()) === '07:30', await value())
  await hour.focus()
  await page.keyboard.press('ArrowDown')
  await settle()
  check('ArrowDown +1', (await value()) === '08:30', await value())
  await page.keyboard.press('PageDown')
  await settle()
  check('PageDown +5', (await value()) === '13:30', await value())
  await page.keyboard.press('Home')
  await settle()
  check('Home', (await value()) === '00:30', await value())
  await page.keyboard.press('End')
  await settle()
  check('End', (await value()) === '23:30', await value())
  // Rapid presses during the glide continue from its target.
  await page.keyboard.press('Home')
  await page.keyboard.press('ArrowDown')
  await page.keyboard.press('ArrowDown')
  await settle()
  check('keys during glide', (await value()) === '02:30', await value())

  // Click on a row: the row two below the band.
  const box = await hour.boundingBox()
  await page.mouse.click(box.x + box.width / 2, box.y + 36 * 4 + 18)
  await settle()
  check('click row', (await value()) === '04:30', await value())

  // Slow drag up by 2 rows (no flick): +2.
  const cx = box.x + box.width / 2
  const cy = box.y + 90
  await page.mouse.move(cx, cy)
  await page.mouse.down()
  for (let i = 1; i <= 24; i++) {
    await page.mouse.move(cx, cy - i * 3)
    await page.waitForTimeout(16)
  }
  await page.waitForTimeout(150) // pause before release: no flick
  await page.mouse.up()
  await settle()
  check('drag 1:1, no flick after a pause', (await value()) === '06:30', await value())

  // Fast flick up: carries further in the same direction, at most 6 rows.
  await page.mouse.move(cx, cy)
  await page.mouse.down()
  for (let i = 1; i <= 6; i++) {
    await page.mouse.move(cx, cy - i * 12)
    await page.waitForTimeout(8)
  }
  await page.mouse.up()
  await page.waitForTimeout(900)
  const after = Number((await value()).slice(0, 2))
  check('flick goes on in the same direction (≤ 6 extra rows)', after > 8 && after <= 8 + 6, await value())

  // Mouse wheel: settles on a row after the scroll stops.
  await page.mouse.move(cx, cy)
  await page.mouse.wheel(0, 72)
  await page.waitForTimeout(900)
  const wheel = Number((await value()).slice(0, 2))
  check('mouse wheel + settle', wheel === after + 2, `${after} → ${wheel}`)

  // Switch, segmented, stepper.
  const sw = page.locator('[role="switch"]').first()
  const before = await sw.getAttribute('aria-checked')
  await sw.click()
  check('switch toggles', (await sw.getAttribute('aria-checked')) !== before)
  await page.locator('[role="radio"]', { hasText: 'Dark' }).click()
  check('segmented selects', (await page.locator('[role="radio"]', { hasText: 'Dark' }).getAttribute('aria-checked')) === 'true')
  await page.locator('[aria-label="Increase"]').first().click()
  await page.locator('[aria-label="Increase"]').first().click()
  await page.locator('[aria-label="Increase"]').first().click()
  check('stepper stops at max', await page.locator('[aria-label="Increase"]').first().isDisabled())
  await page.locator('text=Open sheet').click()
  check('sheet opens', await page.locator('[role="dialog"]').isVisible())
  await page.keyboard.press('Escape')
  check('Esc closes the sheet', (await page.locator('[role="dialog"]').count()) === 0)
  await page.screenshot({ path: new URL('./out/gallery.png', import.meta.url).pathname, fullPage: true })

  // App flows on the fake daemon: shortcuts, editor, stopwatch keys.
  await page.goto(`${base}?fixture=list`)
  await page.waitForSelector('.app-root')
  const mod = process.platform === 'darwin' ? 'Meta' : 'Control'
  await page.keyboard.press(`${mod}+2`)
  check('⌘/Ctrl+2 opens Stopwatch', (await page.textContent('h1')) === 'Stopwatch')
  await page.keyboard.press('Space')
  await page.waitForTimeout(200)
  check('Space starts the stopwatch', await page.locator('button', { hasText: 'Lap' }).isVisible())
  await page.keyboard.press('l')
  await page.keyboard.press('Space')
  await page.waitForTimeout(100)
  check('L laps, Space stops', (await page.locator('.lap').count()) === 2)
  await page.keyboard.press('l')
  await page.waitForTimeout(100)
  check('L resets when stopped', (await page.locator('.lap').count()) === 0)
  await page.keyboard.press(`${mod}+1`)
  await page.locator('[aria-label="Add alarm"]').click()
  check('+ opens Add Alarm', (await page.textContent('.sheet-title')) === 'Add Alarm')
  await page.locator('.row', { hasText: 'Repeat' }).click()
  await page.locator('.row', { hasText: 'Every Monday' }).click()
  await page.locator('.row', { hasText: 'Every Friday' }).click()
  await page.locator('text=Back').click()
  check('Repeat summary updates the draft', (await page.locator('.row', { hasText: 'Repeat' }).textContent()).includes('Mon Fri'))
  await page.keyboard.press('Escape')
  check('Esc cancels the editor', (await page.locator('[role="dialog"]').count()) === 0)
  await page.keyboard.press(`${mod}+4`)
  check('⌘/Ctrl+4 opens Settings', (await page.textContent('h1')) === 'Settings')
  const order = await page.$$eval('.section', (ss) => {
    const r = ss.find((s) => s.querySelector('.section-header')?.textContent === 'RELIABILITY')
    return [...r.querySelectorAll('.row')].map((x) => x.querySelector('span')?.textContent)
  })
  check(
    'RELIABILITY rows (TZ 3.5)',
    order.join('|') === 'Notifications|Open at Login|Keep Computer Awake|Ring Late Alarms For',
    order.join(' | '),
  )
  await page.locator('[role="radio"]', { hasText: 'Light' }).click()
  check('Theme applies at once', (await page.getAttribute('html', 'data-theme')) === 'light')
  await page.close()
  return results
}
