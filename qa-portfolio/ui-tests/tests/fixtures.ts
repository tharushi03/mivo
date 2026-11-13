// Shared test setup: page objects, and the fresh buyer that global-setup created for the
// browser running this test.
import { readFileSync } from "node:fs";
import { test as base } from "@playwright/test";
import { LoginPage } from "../pages/LoginPage";
import { ProductPage } from "../pages/ProductPage";
import { CheckoutPage } from "../pages/CheckoutPage";
import { OrderConfirmationPage } from "../pages/OrderConfirmationPage";
import { USERS_FILE } from "../support/db";

type Buyer = { email: string; password: string };

type Fixtures = {
  buyer: Buyer;
  loginPage: LoginPage;
  productPage: ProductPage;
  checkoutPage: CheckoutPage;
  confirmationPage: OrderConfirmationPage;
};

export const test = base.extend<Fixtures>({
  // eslint-disable-next-line no-empty-pattern
  buyer: async ({}, use, testInfo) => {
    const users = JSON.parse(readFileSync(USERS_FILE, "utf8")) as Record<string, Buyer>;
    const buyer = users[testInfo.project.name];
    if (!buyer) throw new Error(`No test buyer for project ${testInfo.project.name}; did global-setup run?`);
    await use(buyer);
  },
  loginPage: async ({ page }, use) => use(new LoginPage(page)),
  productPage: async ({ page }, use) => use(new ProductPage(page)),
  checkoutPage: async ({ page }, use) => use(new CheckoutPage(page)),
  confirmationPage: async ({ page }, use) => use(new OrderConfirmationPage(page)),
});

export { expect } from "@playwright/test";
