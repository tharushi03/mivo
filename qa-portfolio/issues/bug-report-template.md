# Bug Report Template

Copy this into a GitHub issue (or a new file `issues/BUG-<number>.md`).

```markdown
## BUG-000: <short summary: what is wrong, where>

**Severity:** Critical / High / Medium / Low   (see qms/quality-policy.md §3)
**Priority:** P1 / P2 / P3
**Found in:** <commit or date>   **Environment:** Local / CI / Production
**Browser / device:** <e.g. Chrome 130, Windows 11 / Safari, iPhone 13>
**Related:** <user story, e.g. US-04 AC2> · <test case, e.g. TC-12>

### Steps to reproduce
1.
2.
3.

### Expected result

### Actual result

### Evidence
<screenshot, Playwright trace, server log lines, SQL showing the bad data>

### Impact
<who is affected, how much money or data is at risk>

### Root cause (filled in by the developer)

### Fix and regression test
<commit link> · <new or updated test case ID>
```

## Example

```markdown
## BUG-001: Buyer can cancel after a package was dispatched (stale page)

**Severity:** High   **Priority:** P1
**Related:** US-04 AC2 · TC-12

### Steps to reproduce
1. Buyer opens their order page (Cancel order button visible).
2. Boutique dispatches the package in another browser.
3. Buyer clicks Cancel order on the old page.

### Expected result
Refused: "This order can no longer be cancelled. Please contact MIVO."

### Actual result
(If the server only trusted the page, the order would be cancelled while the parcel is with the
courier, and stock would be returned twice.)

### Root cause
Cancel rules must be re-checked on the server inside the order lock, not only when drawing the page.
```
