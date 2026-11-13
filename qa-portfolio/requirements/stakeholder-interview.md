# Stakeholder Interview: QA Lead × MIVO Product Owner

*A mock requirements interview. The questions are what a QA lead would ask before writing tests.
The answers reflect the decisions actually built into MIVO.*

**Attendees:** QA Lead (QA), Product Owner (PO)
**Goal:** understand the business rules that carry the most risk, so testing can focus on them.

---

## Part 1: Payments and bank slips

**QA:** Who does the buyer actually pay: the boutique or MIVO?
**PO:** Always MIVO. Bank transfers go to MIVO's account. For cash on delivery, the courier
collects the cash and pays it to MIVO. Boutiques are paid later, minus a 10% commission.

**QA:** What happens after a buyer chooses bank transfer?
**PO:** The confirmation page shows MIVO's bank details, the exact amount and a reference like
`MIVO-1A2B3C4D`. The buyer transfers the money and uploads a photo of the slip. An admin checks
the bank account and clicks *Verify payment*. Only then are the boutiques told to ship.

**QA:** Bank slips contain account numbers and names. Who may see them?
**PO:** Only the buyer who uploaded it and MIVO admins. Not the boutiques, and not other buyers.
If someone guesses a slip's link, they must get nothing.

**QA:** What file types do you accept as slips?
**PO:** Photos only: JPG, PNG or WebP, up to 5 MB.
**QA:** We'll test a non-image file renamed to `.jpg`. The server should check the real file
type, not just the name.
**PO:** Agreed. That's a must.

**QA:** What if a buyer never pays?
**PO:** After 24 hours they get one reminder email. After 72 hours the order is cancelled and the
stock goes back on sale, unless they uploaded a slip. Then an admin must decide.

## Part 2: Multi-vendor shipping

**QA:** If one order has items from two boutiques, who ships it?
**PO:** Each boutique ships its own items directly to the buyer, so one order becomes two
packages. The buyer pays LKR 400 delivery per package.

**QA:** How is the order status worked out when one package has arrived and the other hasn't?
**PO:** From the packages: *Partially dispatched*, *Dispatched*, then *Delivered* when every
package has arrived. A returned package counts as finished.

**QA:** Can a boutique see the other boutique's items in a shared order?
**PO:** No. Each boutique sees only its own items, its own total and the delivery address.

**QA:** For COD, which courier account is the parcel booked on?
**PO:** MIVO's. The courier pays COD cash to whoever owns the account, so it has to be ours.
Boutiques can only pick couriers where MIVO has a COD account, and must confirm they booked it on
MIVO's account with the right amount. Prepaid packages can use any courier.

**QA:** How long do boutiques have to dispatch?
**PO:** Two days from when the order is ready. Late packages show in red on the admin Shipments page.

**QA:** What if a boutique types the wrong tracking number?
**PO:** They can correct it while the package is on the way. The buyer is emailed the new number.
Once it's delivered, it's locked.

## Part 3: Cancellations, returns and refunds

**QA:** When can a buyer cancel an order themselves?
**PO:** Only while nothing has been dispatched. Once any package is with a courier, they must
contact MIVO.

**QA:** If they already paid by bank transfer and then cancel?
**PO:** A refund record is created for the admin to pay back and mark as settled.

**QA:** What happens to stock when an order is cancelled?
**PO:** Items that were never sent go straight back into stock. Items already with a courier only
go back when the boutique presses *Back in stock*, once the parcel is physically returned.

**QA:** Returns after the boutique was already paid?
**PO:** The amount we paid them for those items is deducted from their next payout. If their next
sales are too small, the balance carries forward.

## Part 4: Payouts

**QA:** When does a boutique get paid for a delivered package?
**PO:** Seven days after delivery, once the return window has passed.

**QA:** What stops an admin paying a boutique twice, for example by double-clicking or two
admins at once?
**PO:** Each item can only be linked to one payout, and the button sends the amount and bank
account the admin saw. If anything changed, it refuses.
**QA:** We'll test double submission and two sessions paying at once.

## Part 5: Accounts and security

**QA:** Can anyone sign up and order straight away?
**PO:** Buyers must confirm their email before ordering. Boutiques must confirm their email and
then be approved by an admin before their products appear.

**QA:** How do you handle abuse, such as fake COD orders?
**PO:** At most three unfinished COD orders per buyer, and five orders an hour. Admins can suspend
an account, which logs it out immediately.

---

## Risks the QA lead took away

| # | Risk | Impact | Test focus |
|---|---|---|---|
| R1 | Bank slip visible to the wrong person | Critical (privacy) | Access tests per role; guessed links |
| R2 | Boutique paid twice or paid for a return | Critical (money) | Double submit; concurrent sessions; return after payout |
| R3 | COD cash goes to a boutique's own courier account | High (money) | Courier restrictions in the page **and** on the server |
| R4 | Overselling the last item | High | Two buyers buying the last unit at once |
| R5 | Buyer cancels after dispatch | High | State checks on cancel |
| R6 | Fake files uploaded as slips | High (security) | File signature checks |
