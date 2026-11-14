import { expect, type Locator, type Page } from "@playwright/test";

export class LoginPage {
  readonly email: Locator;
  readonly password: Locator;
  readonly submit: Locator;
  readonly error: Locator;

  constructor(private readonly page: Page) {
    this.email = page.locator('input[name="email"]');
    this.password = page.locator('input[name="password"]');
    this.submit = page.getByRole("button", { name: "Sign In" });
    this.error = page.getByRole("alert");
  }

  async goto() {
    await this.page.goto("/login");
    // The page streams: a placeholder form shows first and is swapped for the real one.
    // Wait for the swap, or a fill could land in the placeholder that is about to vanish.
    await expect(this.email).toHaveCount(1);
    await expect(this.submit).toBeVisible();
  }

  /** Logs in and waits until MIVO has moved away from the login page. */
  async login(email: string, password: string) {
    await this.goto();
    await this.email.fill(email);
    await this.password.fill(password);
    await this.submit.click();
    await this.page.waitForURL((url) => !url.pathname.startsWith("/login"));
  }
}
