import { test, expect } from '@playwright/test'

test.describe('Skipped and todo tests', () => {
  test('should pass normally', async ({ page }) => {
    await page.goto('/index.html')
    await expect(page.locator('#title')).toHaveText('Hello World')
  })

  test.skip('should be skipped', async ({ page }) => {
    await page.goto('/index.html')
    await expect(page.locator('#title')).toHaveText('Hello World')
  })

  test.fixme('should be marked as todo', async ({ page }) => {
    await page.goto('/index.html')
    // This test needs to be implemented
    await expect(page.locator('#nonexistent')).toBeVisible()
  })
})
