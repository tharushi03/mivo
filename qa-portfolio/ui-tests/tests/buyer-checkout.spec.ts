// US-01: Buyer checkout with bank transfer.
// Covers TC-01 (happy path), TC-02 (guest blocked) and TC-03 (cart price tampering).
import { test, expect } from "./fixtures";
import { appEnv, withDb } from "../support/db";

const PRODUCT = { title: "Linen Wrap Dress", price: 6450 };
const SIZE_FOR: Record<string, string> = { chromium: "S", firefox: "M", webkit: "L" };
const DELIVERY_PER_PACKAGE = 400;
const DELIVERY = { name: "QA Test Buyer", phone: "0771234567", address: "12 Galle Road", city: "Colombo" };

/** "LKR 6,850.00" in MIVO's format (Intl may use a non-breaking space after LKR). */
const lkr = (n: number) => new RegExp(`LKR\\s${n.toLocaleString("en-US")}\\.00`);

test.describe("US-01 Buyer checkout (bank transfer)", () => {
  test("TC-01 buyer pays by bank transfer and sees MIVO's bank details and the right total", async ({
    page,
    buyer,
    loginPage,
    productPage,
    checkoutPage,
    confirmationPage,
  }) => {
    const total = PRODUCT.price + DELIVERY_PER_PACKAGE;

    await test.step("log in as a buyer", async () => {
      await loginPage.login(buyer.email, buyer.password);
    });

    // Each browser buys a different size, so parallel runs can't disturb each other's stock check.
    const size = SIZE_FOR[test.info().project.name] ?? "S";
    await test.step("add the product to the cart", async () => {
      await productPage.openFromHome(PRODUCT.title);
      await productPage.chooseSize(size);
      await productPage.add();
    });

    const stockBefore = await stockOf(PRODUCT.title, size);

    const orderId = await test.step("check out with bank transfer", async () => {
      await checkoutPage.goto();
      await checkoutPage.fillDelivery(DELIVERY);
      await checkoutPage.payByBankTransfer();
      return checkoutPage.submitAndWaitForOrder();
    });

    await test.step("confirmation shows MIVO's bank details, reference and total", async () => {
      await expect(confirmationPage.heading).toBeVisible();

      for (const [label, setting] of [
        ["Bank", "PLATFORM_BANK_NAME"],
        ["Account name", "PLATFORM_BANK_ACCOUNT_NAME"],
        ["Account number", "PLATFORM_BANK_ACCOUNT_NUMBER"],
      ] as const) {
        const value = confirmationPage.bankDetail(label);
        await expect(value).not.toHaveText("Not configured");
        const expected = appEnv(setting);
        if (expected) await expect(value).toHaveText(expected);
      }

      const reference = `MIVO-${orderId.slice(0, 8).toUpperCase()}`;
      await expect(confirmationPage.bankDetail("Reference")).toHaveText(reference);
      await expect(confirmationPage.bankDetail("Amount")).toHaveText(lkr(total));
      await expect(confirmationPage.total).toHaveText(lkr(total));
    });

    await test.step("database: order saved unpaid with the right total, stock reserved", async () => {
      const order = await withDb(async (db) =>
        (await db.query("select total_amount, payment_method, payment_status from orders where id = $1", [orderId])).rows[0],
      );
      expect(order).toMatchObject({ payment_method: "BANK_TRANSFER", payment_status: "PENDING" });
      expect(Number(order.total_amount)).toBe(total);
      const items = await withDb(async (db) =>
        (await db.query("select selected_size, quantity from order_items where order_id = $1", [orderId])).rows,
      );
      expect(items).toEqual([{ selected_size: size, quantity: 1 }]);
      // At least 1: another run may buy the same size at the same moment.
      expect(await stockOf(PRODUCT.title, size)).toBeLessThanOrEqual(stockBefore - 1);
    });
  });

  test("TC-02 a guest is sent to log in before checkout", async ({ page }) => {
    await page.goto("/checkout");
    await expect(page).toHaveURL(/\/login\?callbackUrl=%2Fcheckout$/);
  });

  test("TC-03 a price changed in the browser is not accepted", async ({ page, buyer, loginPage, productPage, checkoutPage }) => {
    await loginPage.login(buyer.email, buyer.password);
    await productPage.openFromHome(PRODUCT.title);
    await productPage.chooseSize();
    await productPage.add();

    await test.step("tamper with the cart on the checkout page: set the price to LKR 1", async () => {
      await checkoutPage.goto();
      await page.evaluate(() => {
        const cart = JSON.parse(localStorage.getItem("mivo-cart") ?? "{}");
        for (const item of cart.state.items) item.price = 1;
        localStorage.setItem("mivo-cart", JSON.stringify(cart));
      });
      // Reload so the page reads the edited cart; confirm the fake price is what it shows.
      await expect
        .poll(() => page.evaluate(() => JSON.parse(localStorage.getItem("mivo-cart") ?? "{}").state?.items?.[0]?.price))
        .toBe(1);
      await page.reload();
      await expect(checkoutPage.recipientName).toBeVisible();
      await expect(page.getByText(lkr(1)).first()).toBeVisible();
    });

    await checkoutPage.fillDelivery(DELIVERY);
    await checkoutPage.payByBankTransfer();
    await checkoutPage.placeOrder.click();

    await expect(page.getByText("Some items in your cart changed")).toBeVisible();
    await expect(page).toHaveURL(/\/checkout$/);
    // TC-01 may place a real order with the same buyer at the same time, so check that no
    // order exists at the fake price rather than counting orders.
    expect(await ordersBelow(buyer.email, PRODUCT.price)).toBe(0);
    // The cart now shows the real price again.
    await expect(page.getByText(lkr(PRODUCT.price)).first()).toBeVisible();
  });
});

async function stockOf(title: string, size: string) {
  return withDb(async (db) => {
    const { rows } = await db.query(
      "select v.stock from product_variants v join products p on p.id = v.product_id where p.title = $1 and v.size = $2",
      [title, size],
    );
    return Number(rows[0].stock);
  });
}

/** Orders by this buyer whose total is below the given amount (i.e. placed at a fake price). */
async function ordersBelow(email: string, amount: number) {
  return withDb(async (db) => {
    const { rows } = await db.query(
      "select count(*)::int as n from orders o join users u on u.id = o.buyer_id where u.email = $1 and o.total_amount < $2",
      [email, amount],
    );
    return rows[0].n as number;
  });
}
