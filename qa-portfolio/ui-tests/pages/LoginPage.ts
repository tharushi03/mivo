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
