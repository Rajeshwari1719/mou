import { test, expect } from 'playwright/test';
import { Buffer } from 'node:buffer';
import process from 'node:process';

test('Admin creates an MOU and Viewer can read it but cannot access Admin pages', async ({ page, request }) => {
  const adminEmail = process.env.E2E_ADMIN_EMAIL;
  const adminPassword = process.env.E2E_ADMIN_PASSWORD;
  const unique = `E2E Partner ${Date.now()}`;
  await page.goto('/login');
  await page.getByLabel('Email').fill(adminEmail);
  await page.getByLabel('Password').fill(adminPassword);
  await page.getByRole('button', { name: 'Sign In' }).click();
  await expect(page).toHaveURL(/dashboard/);
  await page.goto('/mous/new');
  await page.getByLabel('Partner Name').fill(unique);
  await page.getByLabel('MOU Date').fill('2026-01-15');
  await page.getByLabel('Valid Until').fill('2027-01-15');
  await page.getByRole('button', { name: 'Save MOU' }).click();
  await expect(page).toHaveURL(/mous$/);
  await expect(page.getByText(unique)).toBeVisible();

  const email = `e2e-viewer-${Date.now()}@example.test`;
  const signup = await request.post('http://127.0.0.1:4187/api/auth/signup', { data: { name: 'E2E Viewer', email, password: 'ViewerPass123!', confirmPassword: 'ViewerPass123!', role: 'admin' } });
  expect(signup.status()).toBe(201);
  expect((await signup.json()).data.role).toBe('viewer');
  await page.getByRole('button', { name: 'User menu' }).click();
  await page.getByRole('button', { name: 'Logout' }).click();
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill('ViewerPass123!');
  await page.getByRole('button', { name: 'Sign In' }).click();
  await expect(page).toHaveURL(/dashboard/);
  await page.goto('/mous');
  await expect(page.getByText(unique)).toBeVisible();
  await expect(page.getByRole('link', { name: 'Create MOU' })).toHaveCount(0);
  await page.goto('/students');
  await expect(page).not.toHaveURL(/students/);
});

test('Admin can preview imports, manage documents, read notifications, and update profile', async ({ page }) => {
  const adminEmail = process.env.E2E_ADMIN_EMAIL;
  const adminPassword = process.env.E2E_ADMIN_PASSWORD;
  const unique = `E2E Document Partner ${Date.now()}`;
  await page.goto('/login');
  await page.getByLabel('Email').fill(adminEmail);
  await page.getByLabel('Password').fill(adminPassword);
  await page.getByRole('button', { name: 'Sign In' }).click();
  await expect(page).toHaveURL(/dashboard/);

  await page.goto('/mous/new');
  await page.getByLabel('Partner Name').fill(unique);
  await page.getByLabel('MOU Date').fill('2026-01-15');
  await page.getByLabel('Valid Until').fill('2027-01-15');
  await page.getByRole('button', { name: 'Save MOU' }).click();
  await expect(page).toHaveURL(/mous$/);

  await page.goto('/documents');
  const mouId = await page.locator('select[name="mou_id"] option').filter({ hasText: unique }).getAttribute('value');
  expect(mouId).toBeTruthy();
  await page.locator('select[name="mou_id"]').selectOption(mouId);
  await page.getByLabel('Document Name').fill(`Agreement ${unique}`);
  await page.locator('input[type="file"]').setInputFiles({
    name: 'agreement.pdf',
    mimeType: 'application/pdf',
    buffer: Buffer.from('%PDF-1.4\nE2E agreement\n%%EOF'),
  });
  await page.getByRole('button', { name: 'Upload Document' }).click();
  await expect(page.getByText('Document uploaded successfully.')).toBeVisible();
  const documentRow = page.getByRole('row').filter({ hasText: `Agreement ${unique}` });
  await expect(documentRow).toBeVisible();
  const downloadWait = page.waitForEvent('download');
  await documentRow.getByRole('button', { name: 'Download' }).click();
  expect((await downloadWait).suggestedFilename()).toContain('Agreement');
  page.once('dialog', (dialog) => dialog.accept());
  await documentRow.getByRole('button', { name: 'Delete' }).click();
  await expect(page.getByText(`Agreement ${unique}`)).toHaveCount(0);

  await page.goto('/dashboard');
  const importedName = `E2E Imported ${Date.now()}`;
  const csv = [
    'Sr. No.,National / International,Name of the College,Department,Date of MOU,MOU valid upto,Broad Purpose(s) of the MOU,Activities conducted so far,Number of students benefited so far,Contact person name,Contact person designation,Contact person email,Contact person phone',
    `1,National,"${importedName}",Engineering,2026-01-15,2027-01-15,Research,Workshops,10,Test Contact,Director,contact@example.test,9876543210`,
  ].join('\n');
  await page.locator('input[name="file"]').setInputFiles({ name: 'mous.csv', mimeType: 'text/csv', buffer: Buffer.from(csv) });
  await expect(page.getByRole('region', { name: 'Import preview' })).toBeVisible();
  await page.getByRole('button', { name: 'Confirm import' }).click();
  await expect(page.getByText(/MOU\(s\) added/)).toBeVisible();

  await page.goto('/notifications');
  await expect(page.getByRole('heading', { name: 'Notifications' })).toBeVisible();
  const reminder = page.getByRole('article').filter({ hasText: 'E2E reminder fixture' });
  await expect(reminder).toBeVisible();
  await reminder.getByRole('button', { name: 'Mark as read' }).click();
  await expect(reminder.getByText('Read')).toBeVisible();

  await page.goto('/profile');
  await page.getByRole('button', { name: 'Edit Profile' }).click();
  const name = page.getByLabel('Full Name');
  await name.fill('E2E Admin Profile');
  await page.getByRole('button', { name: 'Save Changes' }).click();
  await expect(page.getByRole('heading', { name: 'E2E Admin Profile' })).toBeVisible();
});
