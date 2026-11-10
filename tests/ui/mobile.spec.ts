import { expect, test, type Locator, type Page } from '@playwright/test';

const rackLabel = 'Sláðu inn stafi úr skraflrekkanum';
const searchLabel = 'Finna öll möguleg orð';

async function openResults(page: Page): Promise<void> {
  await page.goto('?rack=stafir');
  await expect(page.locator('#results-heading')).toBeVisible();
}

async function width(locator: Locator): Promise<number> {
  return locator.evaluate((element) => element.getBoundingClientRect().width);
}

test('keeps the search controls usable and the button label on one line', async ({ page }) => {
  await page.goto('./');
  await page.getByRole('textbox', { name: rackLabel }).fill('stafir');
  const search = page.getByRole('button', { name: searchLabel });
  const icons = [
    page.getByRole('button', { name: 'Hreinsa stafi' }),
    page.getByRole('button', { name: 'Mynstur (=)' }),
    page.getByRole('button', { name: 'Eyða (?)' }),
  ];

  for (const viewportWidth of [320, 375, 393, 402, 430, 560, 561]) {
    await page.setViewportSize({ width: viewportWidth, height: 874 });
    const lines = await search.evaluate((button) => {
      const range = document.createRange();
      range.selectNodeContents(button);
      return range.getClientRects().length;
    });
    expect(lines, `search label at ${viewportWidth}px`).toBe(1);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(viewportWidth);
    for (const icon of icons) {
      const size = await icon.evaluate((button) => {
        const rect = button.getBoundingClientRect();
        return { width: rect.width, height: rect.height };
      });
      expect(size.width, `icon width at ${viewportWidth}px`).toBeGreaterThanOrEqual(44);
      expect(size.height, `icon height at ${viewportWidth}px`).toBeGreaterThanOrEqual(44);
    }
  }
});

test('releases momentary buttons and keeps the pattern toggle distinct', async ({ page }) => {
  await page.goto('./');
  const rack = page.getByRole('textbox', { name: rackLabel });
  const question = page.getByRole('button', { name: 'Eyða (?)' });
  const equals = page.getByRole('button', { name: 'Mynstur (=)' });
  const clear = page.getByRole('button', { name: 'Hreinsa stafi' });
  await rack.fill('stafir');
  await rack.focus();
  await rack.evaluate((input: HTMLInputElement) => input.setSelectionRange(2, 2));
  await question.tap();
  await expect(rack).toHaveValue('st?afir');
  await expect(rack).toBeFocused();
  expect(await rack.evaluate((input: HTMLInputElement) => input.selectionStart)).toBe(3);
  await expect(question).toHaveCSS('filter', 'none');
  expect(await question.evaluate((button) => button.matches(':active'))).toBe(false);
  expect(await page.evaluate(() => matchMedia('(hover: none)').matches)).toBe(true);
  for (const button of [question, clear]) {
    const box = await button.boundingBox();
    if (!box) throw new Error('The search button has no layout box.');
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    expect(await button.evaluate((element) => element.matches(':hover'))).toBe(true);
    await expect(button).toHaveCSS('filter', 'none');
  }

  const unpressedColor = await equals.evaluate((button) => getComputedStyle(button).backgroundColor);
  await equals.tap();
  await expect(rack).toHaveValue('=st?afir');
  await expect(rack).toBeFocused();
  await expect(equals).toHaveAttribute('aria-pressed', 'true');
  expect(await equals.evaluate((button) => getComputedStyle(button).backgroundColor)).not.toBe(unpressedColor);
  await equals.tap();
  await expect(rack).toHaveValue('st?afir');
  await expect(equals).toHaveAttribute('aria-pressed', 'false');
  await expect(equals).toHaveCSS('background-color', unpressedColor);

  await clear.tap();
  await expect(rack).toHaveValue('');
  await expect(rack).toBeFocused();
  await expect(clear).toHaveCount(0);
});

test('spaces length controls and results and grows position inputs', async ({ page }) => {
  await openResults(page);
  await page.getByRole('button', { name: 'Lágmarkslengd auka' }).tap();
  await page.getByRole('button', { name: 'Hámarkslengd minnka' }).tap();
  await page.getByRole('button', { name: 'Hámarkslengd minnka' }).tap();
  await expect(page.locator('.range-text')).toHaveText('3 – 5');

  const alignment = await page.locator('.length-row').evaluate((row) => {
    const steppers = row.querySelectorAll('.stepper');
    if (steppers.length !== 2) throw new Error('Expected two length controls.');
    const outer = row.getBoundingClientRect();
    const left = steppers[0]!.getBoundingClientRect();
    const right = steppers[1]!.getBoundingClientRect();
    return {
      leftGap: left.left - outer.left,
      rightGap: outer.right - right.right,
      rowDifference: Math.abs(left.top - right.top),
    };
  });
  expect(Math.abs(alignment.leftGap)).toBeLessThan(1);
  expect(Math.abs(alignment.rightGap)).toBeLessThan(1);
  expect(alignment.rowDifference).toBeLessThan(1);

  for (const list of [
    page.locator('[aria-labelledby="results-heading"] > .word-list'),
    page.locator('[aria-labelledby="combinations-heading"] > .word-list'),
  ]) {
    const gap = await list.evaluate((element) => {
      const heading = element.previousElementSibling;
      if (!heading) throw new Error('Expected a heading before the result list.');
      return element.getBoundingClientRect().top - heading.getBoundingClientRect().bottom;
    });
    expect(gap).toBeGreaterThanOrEqual(11.5);
  }

  for (const field of [
    page.getByRole('textbox', { name: 'Stafir í sæti 1', exact: true }),
    page.getByRole('textbox', { name: 'Stafir í sæti 1 frá enda', exact: true }),
  ]) {
    const emptyWidth = await width(field);
    expect(emptyWidth).toBeGreaterThanOrEqual(44);
    expect(emptyWidth).toBeLessThan(45);
    await field.fill('s');
    await expect.poll(() => width(field)).toBeGreaterThan(emptyWidth);
    const oneWidth = await width(field);
    await field.fill('ssssssss');
    await expect.poll(() => width(field)).toBeGreaterThan(oneWidth);
    await field.fill('');
    await expect.poll(() => width(field)).toBeLessThan(45);
  }
});

test('retains and clears both position filters without changing the results', async ({ page }) => {
  await openResults(page);
  const from = page.getByRole('textbox', { name: 'Stafir í sæti 1', exact: true });
  const to = page.getByRole('textbox', { name: 'Stafir í sæti 1 frá enda', exact: true });
  const mainWords = page.locator('[aria-labelledby="results-heading"] .word-list [data-word]');
  const allWords = page.locator('.word-list [data-word]');
  const initialCount = await mainWords.count();
  expect(initialCount).toBeGreaterThan(0);
  await from.fill('s');
  await to.fill('r');
  const clear = page.getByRole('region', { name: 'Sía niðurstöður' }).getByRole('button', { name: 'Hreinsa síur' });
  await expect(clear).toBeEnabled();
  const filteredWords = await allWords.evaluateAll((words) => words.map((word) => word.getAttribute('data-word')));
  expect(filteredWords.length).toBeGreaterThan(0);
  expect(filteredWords.every((word) => word?.startsWith('s') && word.endsWith('r'))).toBe(true);
  expect(await mainWords.count()).toBeLessThan(initialCount);

  await page.reload();
  await expect(from).toHaveValue('s');
  await expect(to).toHaveValue('r');
  const restoredWords = await allWords.evaluateAll((words) => words.map((word) => word.getAttribute('data-word')));
  expect(restoredWords).toEqual(filteredWords);
  await clear.tap();
  await expect(from).toHaveValue('');
  await expect(to).toHaveValue('');
  await expect.poll(() => mainWords.count()).toBe(initialCount);
  expect(await width(from)).toBeLessThan(45);
  expect(await width(to)).toBeLessThan(45);
});

test('keeps rapid taps usable without disabling pinch zoom', async ({ page }) => {
  await page.goto('./');
  const viewport = await page.locator('meta[name="viewport"]').getAttribute('content');
  expect(viewport).not.toBeNull();
  expect(viewport).not.toMatch(/user-scalable\s*=\s*no|maximum-scale\s*=\s*1(?:\D|$)/i);
  await expect(page.locator('html')).toHaveCSS('touch-action', 'manipulation');
  await expect(page.locator('skrafl-app')).toHaveCSS('touch-action', 'manipulation');

  const rack = page.getByRole('textbox', { name: rackLabel });
  await rack.fill('stafir');
  const question = page.getByRole('button', { name: 'Eyða (?)' });
  await question.tap();
  await question.tap();
  await expect(rack).toHaveValue('stafir??');
  expect(await page.evaluate(() => window.visualViewport?.scale)).toBe(1);
  await expect(question).toHaveCSS('filter', 'none');

  await page.getByRole('button', { name: 'Hjálp' }).tap();
  await expect(page.getByRole('dialog', { name: 'Skraflorðahjálp' })).toHaveCSS('touch-action', 'manipulation');
});

test('reloads and searches offline after the production PWA is cached', async ({ page, context }) => {
  test.setTimeout(60_000);
  await page.goto('?rack=h%C3%BAs');
  await expect(page.locator('#results-heading')).toContainText('hús');
  const workerState = await page.evaluate(async () => {
    const registration = await navigator.serviceWorker.ready;
    return registration.active?.state;
  });
  expect(workerState).toBe('activated');
  await page.reload();
  await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);

  await context.setOffline(true);
  try {
    await page.reload();
    await expect(page.locator('#results-heading')).toContainText('hús');
    await page.getByRole('textbox', { name: rackLabel }).fill('ást');
    await page.getByRole('button', { name: searchLabel }).tap();
    await expect(page.locator('#results-heading')).toContainText('ást');
    await expect(page.locator('[aria-labelledby="results-heading"] [data-word]').first()).toBeVisible();
    await expect(page.getByRole('alert')).toHaveCount(0);
  } finally {
    await context.setOffline(false);
  }
});
