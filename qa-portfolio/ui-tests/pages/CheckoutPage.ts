import { expect, type Locator, type Page } from "@playwright/test";

export type Delivery = { name: string; phone: string; address: string; city: string };

export class CheckoutPage {
  /** Guests only: where the receipt and the secret order link are sent. */
  readonly email: Locator;
  readonly recipientName: Locator;
  readonly phone: Locator;
  readonly address: Locator;
  readonly city: Locator;
  readonly bankTransfer: Locator;
  readonly cashOnDelivery: Locator;
  readonly placeOrder: Locator;
  readonly error: Locator;

  constructor(private readonly page: Page) {
    this.email = page.getByLabel("Email");
    this.recipientName = page.getByLabel("Recipient name");
    this.phone = page.getByLabel("Phone number");
    this.address = page.getByLabel("Address");
    this.city = page.getByLabel("City / Town");
    this.bankTransfer = page.getByRole("radio", { name: /Bank Transfer/ });
    this.cashOnDelivery = page.getByRole("radio", { name: /Cash on Delivery/ });
    // There is a second, phone-only Place Order bar; use whichever is visible.
    this.placeOrder = page.getByRole("button", { name: "Place Order" }).filter({ visible: true }).first();
    this.error = page.getByRole("alert");
  }

  async goto() {
    await this.page.goto("/checkout");
    await expect(this.recipientName).toBeVisible(); // the cart has loaded
  }

  async fillDelivery(d: Delivery) {
    await this.recipientName.fill(d.name);
    await this.phone.fill(d.phone);
    await this.address.fill(d.address);
    await this.city.fill(d.city);
  }

  async payByBankTransfer() {
    await this.bankTransfer.check();
  }

  /**
   * Guest: submits and waits for the secret order link /track/<id>/<key>.
   * Returns the order id and the link.
   */
  async submitAsGuestAndWaitForOrder() {
    await this.placeOrder.click();
    await this.page.waitForURL(/\/track\/[0-9a-f-]{36}\/[A-Za-z0-9_-]{32}$/);
    const [, , id] = new URL(this.page.url()).pathname.split("/");
    return { orderId: id, link: new URL(this.page.url()).pathname };
  }

  /** Submits and waits for the order confirmation page. Returns the new order's id. */
  async submitAndWaitForOrder() {
    await this.placeOrder.click();
    await this.page.waitForURL(/\/order\/[0-9a-f-]{36}$/);
    return this.page.url().split("/order/")[1];
  }
}
