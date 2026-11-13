# Test Reports

Test results are written here and are **not** committed (see `.gitignore`):

| Source | Output |
|---|---|
| Playwright | `reports/playwright-html/` (open `index.html`) and `reports/playwright-results/` (traces, screenshots and videos of failures) |
| k6 | `reports/k6-summary.json` |
| Postman / Newman | `reports/newman.html` (if run with the HTML reporter) |

In CI, the Playwright HTML report is uploaded as a build artifact named **playwright-report**
on each GitHub Actions run.

Summaries worth keeping, such as a release test summary, can be committed here as Markdown, e.g.
`reports/2026-11-release-summary.md`.
