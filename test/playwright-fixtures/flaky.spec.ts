import { test, expect } from '@playwright/test'

test.describe('Flaky tests', () => {
  test('should be flaky (fails first, passes on retry)', async ({ page }, testInfo) => {
    await page.goto('/index.html')

    // Use retry info from Playwright - fail on first attempt, pass on retry
    if (testInfo.retry === 0) {
      // First attempt - fail
      await expect(page.locator('#title')).toHaveText('Wrong Text')
    } else {
      // Retry attempt - pass
      await expect(page.locator('#title')).toHaveText('Hello World')
    }
  })

  test('should pass normally', async ({ page }) => {
    await page.goto('/index.html')
    await expect(page.locator('#title')).toHaveText('Hello World')
  })
})
