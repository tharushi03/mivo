import { type Locator, type Page } from "@playwright/test";

export class OrderConfirmationPage {
  readonly heading: Locator;

  constructor(private readonly page: Page) {
    this.heading = page.getByRole("heading", { name: "Thank you for your order!" });
  }

  /** The value shown next to a label in the bank details box, e.g. "Account number". */
  bankDetail(label: string) {
    return this.page.locator("dt", { hasText: new RegExp(`^${label}$`) }).locator("xpath=following-sibling::dd[1]");
  }

  /** The order total in the summary. */
  get total() {
    return this.page.locator("dt", { hasText: /^Total$/ }).locator("xpath=following-sibling::dd[1]");
  }
}
