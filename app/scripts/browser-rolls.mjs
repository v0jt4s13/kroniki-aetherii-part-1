// Complete the mandatory dice chain through the real UI and server responses.
export async function rollUntilNoDouble(page) {
  let label = 'Rzuć kośćmi';
  for (;;) {
    const response = page.waitForResponse(r => r.url().endsWith('/action') && r.request().method() === 'POST');
    await page.getByRole('button', { name: label, exact: true }).click();
    const result = await response;
    if (!result.ok()) throw new Error(`Dice action failed: ${result.status()}`);
    const state = await result.json();
    if (!state.bonusRoll) return state;
    label = 'Rzuć ponownie';
  }
}
