import { test, expect } from '@playwright/test'

test.describe('Example tests', () => {
  test('should have correct title', async ({ page }) => {
    await page.goto('/index.html')
    await expect(page.locator('#title')).toHaveText('Hello World')
  })

  test('should have welcome message', async ({ page }) => {
    await page.goto('/index.html')
    await expect(page.locator('#message')).toHaveText('Welcome to the test page')
  })

  test('should increment counter on click', async ({ page }) => {
    await page.goto('/index.html')
    const button = page.locator('#counter-btn')
    await expect(button).toHaveText('Count: 0')
    await button.click()
    await expect(button).toHaveText('Count: 1')
    await button.click()
    await expect(button).toHaveText('Count: 2')
  })
})
