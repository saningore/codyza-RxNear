import { expect, test } from "@playwright/test";

test.describe("RxNear in the browser", () => {
  test("explains the service, rejects a bad ZIP, and keeps the footer", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByText("If this is an emergency, call 911.")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Find nearby pharmacies" })).toBeVisible();
    await expect(page.getByText("The map is ready. Pharmacies appear here after you search a U.S. location.")).toBeVisible();
    await expect(page.locator("[data-map-ready='true']")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole("link", { name: "Codyza" })).toHaveAttribute("href", "https://codyza.com");
    await expect(page.getByText("Powered by")).toBeVisible();

    await page.getByLabel("ZIP code, city, or street address").fill("1234");
    await page.getByRole("button", { name: "Search", exact: true }).click();
    await expect(page.getByRole("alert").filter({ hasText: "Enter a 5-digit U.S. ZIP code." })).toBeVisible();

    await page.getByRole("link", { name: "Sources" }).click();
    await expect(page.getByRole("heading", { name: "Where the information comes from" })).toBeVisible();
    await expect(page.getByRole("link", { name: "CMS NPPES" })).toHaveAttribute("href", /npiregistry\.cms\.hhs\.gov/);
    await expect(page.getByText("Information unavailable")).toBeVisible();
    await expect(page.getByRole("link", { name: "Codyza" })).toBeVisible();

    await page.getByRole("link", { name: "About" }).click();
    await expect(page.getByRole("heading", { name: "About RxNear" })).toBeVisible();
    await expect(page.getByText("Information unavailable")).toBeVisible();
  });

  test("shows the not-found page for an unknown NPI", async ({ page }) => {
    const response = await page.goto("/pharmacy/not-an-npi");
    expect(response?.status()).toBe(404);
    await expect(page.getByRole("heading", { name: "That page is not available" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Codyza" })).toBeVisible();
  });

  test("searches ZIP 10001 and opens a live pharmacy", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "5 mi", exact: true }).click();
    await page.getByLabel("ZIP code, city, or street address").fill("10001");
    await page.getByRole("button", { name: "Search", exact: true }).click();
    await expect(page.getByText("Searching public records…")).toBeVisible();
    await expect(page.getByRole("heading", { name: /pharmacies within 5 miles of ZIP code 10001|pharmacy within 5 miles of ZIP code 10001/ })).toBeVisible({ timeout: 150_000 });
    await expect(page.getByText("Distances are measured from the center of this ZIP code")).toBeVisible();
    await expect(page.locator("[data-map-ready='true']")).toBeVisible({ timeout: 30_000 });
    const card = page.locator("article[data-npi]").first();
    await expect(card).toBeVisible();
    const npi = await card.getAttribute("data-npi");
    expect(npi).toMatch(/^\d{10}$/);
    await card.getByRole("link", { name: "View pharmacy" }).click();
    await expect(page).toHaveURL(new RegExp(`/pharmacy/${npi}`));
    await expect(page.getByText("Listed in the federal NPI registry")).toBeVisible();
    await expect(page.getByRole("link", { name: `NPI ${npi}` })).toHaveAttribute("href", new RegExp(`provider-view/${npi}`));
    await expect(page.getByRole("link", { name: "Codyza" })).toBeVisible();
    const call = page.getByRole("link", { name: /^Call / });
    const unavailable = page.getByText("Call: Information unavailable");
    await expect(call.or(unavailable).first()).toBeVisible();
  });

  test("asks for a ZIP when location permission is denied", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Use my location" }).click();
    await expect(page.getByRole("alert").filter({ hasText: "Location access was denied. Enter a U.S. address or ZIP code to search." })).toBeVisible();
  });

  test("keeps the mobile search usable", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "Find nearby pharmacies" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Search", exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: "Sources" })).toBeVisible();
    await expect(page.getByText("Powered by")).toBeVisible();
    const box = await page.getByRole("button", { name: "Search", exact: true }).boundingBox();
    expect(box?.height ?? 0).toBeGreaterThanOrEqual(40);
  });
});
