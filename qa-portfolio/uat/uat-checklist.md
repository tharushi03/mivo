# User Acceptance Test (UAT) Checklist

Run by the product owner on a staging copy before launch, using real phones and real couriers
where possible. Tick each line, or write the bug ID next to it.

**Tester:** ______________ **Date:** ____________ **Build / commit:** ____________

## Buyer
- [ ] Sign up, receive the confirmation email, confirm, and log in on a phone
- [ ] Find a product, choose a size, add to cart, change quantity
- [ ] Bank transfer order: bank details, amount and reference are correct and easy to copy
- [ ] Upload a slip photo from the phone camera
- [ ] COD order: the amount to pay each courier is clear when items come from two boutiques
- [ ] Cancel an order before dispatch; the confirmation email arrives
- [ ] Track a package from the email link
- [ ] Download the invoice PDF
- [ ] Forgot password: email arrives, link works once

## Boutique
- [ ] Sign up as a boutique; approval only after email confirmation
- [ ] Add a product with photos and stock per size
- [ ] Receive the "New order" email; it shows only this boutique's items
- [ ] Book a COD parcel on MIVO's real Koombiyo / Pronto account using the shown details
- [ ] Mark dispatched; fix a tracking typo
- [ ] Press "Back in stock" after a returned parcel arrives
- [ ] Payout page shows the right amount after 7 days

## Admin
- [ ] Verify a real bank transfer against the bank app
- [ ] Mark a COD package delivered after the courier's payment arrives; match it with the CSV
- [ ] Record a return and settle the refund
- [ ] Pay a boutique and check the amount and bank account
- [ ] Suspend and restore a test account
- [ ] Every action above appears in Activity

## Sign-off
- [ ] No open Critical or High bugs
- [ ] Product owner approves launch: ______________
