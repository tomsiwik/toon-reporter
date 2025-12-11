import { test, expect } from '@playwright/test'

test.describe('Failing tests', () => {
  test('should fail with wrong text', async ({ page }) => {
    await page.goto('/index.html')
    // This will fail - expecting wrong text
    await expect(page.locator('#title')).toHaveText('Wrong Title')
  })

  test('should pass', async ({ page }) => {
    await page.goto('/index.html')
    await expect(page.locator('#title')).toHaveText('Hello World')
  })
})
