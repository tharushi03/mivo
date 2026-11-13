# MIVO User Stories

Each story has acceptance criteria (AC) written so a tester can pass or fail them.
The traceability matrix (`traceability-matrix.csv`) maps every AC to test cases.

---

## US-01: Buyer checkout with bank transfer

**As a** buyer
**I want to** pay for my order by bank transfer
**So that** I can buy without paying cash at the door.

**Acceptance criteria**
- **AC1:** Only a logged-in buyer with a confirmed email can place an order. Guests are sent to login.
- **AC2:** The order total = item prices from the database (not the cart) + LKR 400 per boutique package.
- **AC3:** If a price or stock level changed since the item was added to the cart, the order is
  not placed, and the buyer is shown what changed.
- **AC4:** After placing the order, the confirmation page shows MIVO's bank name, account name,
  account number, the exact total and a reference in the form `MIVO-XXXXXXXX`.
- **AC5:** The buyer can upload a slip (JPG, PNG or WebP, at most 5 MB). Anything else is rejected,
  including a non-image file renamed `.jpg`.
- **AC6:** Boutiques are **not** told to ship until an admin verifies the payment.
- **AC7:** Stock is reserved when the order is placed. It returns to stock if the order is cancelled.

## US-02: Boutique dispatches a cash-on-delivery package

**As a** boutique owner
**I want to** record the courier and tracking number for a COD package
**So that** the buyer can track it and MIVO receives the cash.

**Acceptance criteria**
- **AC1:** The courier list shows only active couriers where MIVO has a COD account.
- **AC2:** Choosing a courier shows MIVO's account number, the order reference and the exact COD
  amount (items + LKR 400 delivery).
- **AC3:** The boutique must confirm it booked the parcel on MIVO's account before it can dispatch.
- **AC4:** The server refuses a courier without a MIVO COD account, even if the page was tampered with.
- **AC5:** A boutique cannot dispatch another boutique's package (it gets "Package not found").
- **AC6:** After dispatch, the buyer is emailed the courier and tracking number.

## US-03: Admin verifies a bank transfer payment

**As a** MIVO admin
**I want to** confirm a bank transfer has arrived
**So that** boutiques can start shipping.

**Acceptance criteria**
- **AC1:** Only admins can verify payments.
- **AC2:** Verifying sets the payment to *Paid* and emails each boutique in the order its own packing list.
- **AC3:** Verifying the same order twice (double click, two admins) has no extra effect.
- **AC4:** A cancelled order cannot be verified.
- **AC5:** The action is recorded in the admin activity log.

## US-04: Buyer cancels an order before dispatch

**As a** buyer
**I want to** cancel my order if I change my mind
**So that** I'm not charged for something I no longer want.

**Acceptance criteria**
- **AC1:** The *Cancel order* button appears only while no package has been dispatched.
- **AC2:** The server refuses a cancel once any package is dispatched, even if the page is out of date.
- **AC3:** On cancel, every item goes back into stock and each boutique is emailed not to ship.
- **AC4:** If the order was already paid, a refund record is created for the admin to settle.
- **AC5:** A buyer cannot cancel another buyer's order.

## US-05: Boutique corrects a tracking number

**As a** boutique owner
**I want to** fix a mistyped tracking number
**So that** the buyer can still track the parcel.

**Acceptance criteria**
- **AC1:** Tracking can be edited only while the package is *Dispatched* (not before, and not after delivery).
- **AC2:** Only the boutique that owns the package, or an admin, can edit it.
- **AC3:** For a COD package, the courier can only be changed to another courier with a MIVO COD account.
- **AC4:** Saving a change emails the buyer the corrected details. Saving with no change sends nothing.
- **AC5:** Tracking numbers are stored in upper case, 4 to 60 characters of letters, numbers,
  spaces and dashes. Anything else is rejected with a clear message.
