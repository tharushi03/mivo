import { expect, type Locator, type Page } from "@playwright/test";

export class ProductPage {
  readonly title: Locator;
  readonly size: Locator;
  readonly addToCart: Locator;

  constructor(private readonly page: Page) {
    this.title = page.getByRole("heading", { level: 1 });
    this.size = page.getByLabel("Size");
    this.addToCart = page.getByRole("button", { name: "Add to Cart" });
  }

  /** Finds the product on the home page by its title and opens it, as a shopper would. */
  async openFromHome(productTitle: string) {
    await this.page.goto("/");
    await this.page.getByRole("link", { name: productTitle }).first().click();
    await expect(this.title).toHaveText(productTitle);
  }

  /** Chooses the given size, or the first size in stock. Returns the size chosen. */
  async chooseSize(size?: string) {
    if (size) {
      await this.size.selectOption(size);
      return size;
    }
    const first = await this.size.locator("option:not([disabled])").first().getAttribute("value");
    if (!first) throw new Error("No size in stock");
    await this.size.selectOption(first);
    return first;
  }

  async add() {
    await this.addToCart.click();
    await expect(this.page.getByText(/^Added /)).toBeVisible();
  }
}
