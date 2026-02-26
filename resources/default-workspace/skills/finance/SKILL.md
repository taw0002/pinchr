---
name: finance
description: Track invoices, manage expenses, monitor cash flow, and keep the books clean for small-to-medium businesses.
version: 1.0.0
triggers:
  - finance
  - invoice
  - invoices
  - expense
  - expenses
  - cash flow
  - budget
  - accounts receivable
  - accounts payable
  - quickbooks
  - tax prep
  - financial review
  - P&L
  - profit and loss
---

# Finance Skill

You help manage the financial operations of a small-to-medium business. Your job is to keep invoices moving, expenses categorized, cash flow visible, and nothing falling through the cracks.

You are NOT a CPA. You don't give tax advice. You organize, track, remind, and flag — the human (or their accountant) makes the financial decisions.

## Canonical Files

- **Invoices tracker:** `finance/invoices.json` — all outstanding and recent invoices
- **Expense log:** `finance/expenses.json` — categorized expenses
- **Budget:** `finance/budget.json` — budget vs actuals by category
- **Cash flow:** `finance/cashflow.json` — monthly cash flow tracking
- **Templates:** Check `references/finance-templates.md` for email templates and report formats

Create these files when first needed. Don't pre-populate with fake data — start empty and build from real entries.

---

## Invoice Tracking & Accounts Receivable

### Invoice Schema

`finance/invoices.json`:

```json
{
  "invoices": [
    {
      "id": "INV-001",
      "client": "Client Name",
      "description": "What the invoice is for",
      "amount": 5000.00,
      "currency": "USD",
      "issuedDate": "2026-01-15",
      "dueDate": "2026-02-14",
      "status": "sent | overdue-30 | overdue-60 | overdue-90 | paid | written-off | disputed",
      "paidDate": null,
      "paidAmount": null,
      "followUps": [
        {
          "date": "2026-02-15",
          "method": "email | phone | text",
          "notes": "Left voicemail, will follow up Friday"
        }
      ],
      "notes": "Any context about this invoice"
    }
  ]
}
```

### Status Lifecycle

- `sent` → invoice delivered, within payment terms
- `overdue-30` → 1-30 days past due
- `overdue-60` → 31-60 days past due
- `overdue-90` → 61-90+ days past due
- `paid` → payment received (record `paidDate` and `paidAmount`)
- `written-off` → deemed uncollectable (human decision only)
- `disputed` → client has raised a dispute

### Follow-Up Cadence

When checking invoices, flag any that need attention:

1. **Due in 3 days** — Send a friendly reminder ("Just a heads up, invoice #X is due on Friday")
2. **1 day overdue** — Polite nudge ("Following up on invoice #X — was due yesterday")
3. **30 days overdue** — Firmer follow-up, reference original terms. Use the 30-day template.
4. **60 days overdue** — Escalation tone. Mention late fees if applicable. Use the 60-day template.
5. **90 days overdue** — Final notice. Reference potential next steps. Use the 90-day template.

**Always log follow-ups** in the `followUps` array with date, method, and notes.

**Templates:** See `references/finance-templates.md` for pre-written follow-up emails at each stage.

### What to Track

When the human mentions an invoice, capture:
- Who it's to
- What it's for
- Amount and currency
- When it was sent
- When it's due
- Any special terms (net-30, net-60, deposits, milestones)

Don't guess amounts. If the human says "I sent an invoice to Acme," ask for the amount and due date.

---

## Expense Tracking & Categorization

### Expense Schema

`finance/expenses.json`:

```json
{
  "expenses": [
    {
      "id": "EXP-001",
      "date": "2026-02-10",
      "vendor": "Who was paid",
      "description": "What it was for",
      "amount": 150.00,
      "currency": "USD",
      "category": "See categories below",
      "subcategory": "Optional finer detail",
      "paymentMethod": "card | check | ach | cash | other",
      "receipt": false,
      "taxDeductible": true,
      "notes": "Any context"
    }
  ]
}
```

### Standard Categories

Use these consistently. Don't invent new top-level categories without asking:

| Category | Examples |
|---|---|
| `payroll` | Salaries, wages, contractor payments |
| `software` | SaaS subscriptions, licenses, tools |
| `marketing` | Ads, content, sponsorships, events |
| `office` | Supplies, furniture, equipment |
| `travel` | Flights, hotels, meals (business), mileage |
| `professional-services` | Accounting, legal, consulting |
| `insurance` | Business insurance, liability, workers comp |
| `utilities` | Internet, phone, electricity (if office) |
| `rent` | Office space, coworking, storage |
| `cost-of-goods` | Materials, inventory, direct costs |
| `meals-entertainment` | Client meals, team meals (note: partial deductibility) |
| `education` | Courses, books, conferences, training |
| `taxes-fees` | Business taxes, licenses, permits, bank fees |
| `other` | Anything that doesn't fit — flag for human to categorize |

### Categorization Rules

- When the human logs an expense, suggest a category. Don't just assign silently.
- If it's ambiguous, ask: "Should I file the Zoom subscription under `software` or `marketing`?"
- Flag anything in `other` for human review — it shouldn't stay there.
- Track `taxDeductible` — when unsure, mark `true` and add a note: "Confirm deductibility with accountant."
- `receipt` tracks whether a receipt is on file. Flag missing receipts for expenses over $75.

---

## Accounts Payable

Track what the business owes using the same principles as receivables, but inverted.

### Bills Schema

`finance/bills.json`:

```json
{
  "bills": [
    {
      "id": "BILL-001",
      "vendor": "Who you owe",
      "description": "What it's for",
      "amount": 2400.00,
      "currency": "USD",
      "receivedDate": "2026-02-01",
      "dueDate": "2026-03-01",
      "status": "pending | scheduled | paid | overdue | disputed",
      "paidDate": null,
      "recurring": false,
      "recurringFrequency": null,
      "notes": ""
    }
  ]
}
```

### Payment Priority

When reviewing bills, flag:
1. **Overdue bills** — pay immediately or note why delayed
2. **Due within 7 days** — confirm payment is scheduled
3. **Early payment discounts** — flag if terms include net-10 discount (e.g., "2/10 net-30")
4. **Recurring bills** — make sure they're expected and haven't changed amounts

---

## Budget Tracking

### Budget Schema

`finance/budget.json`:

```json
{
  "year": 2026,
  "period": "monthly",
  "categories": [
    {
      "category": "payroll",
      "annualBudget": 120000,
      "monthlyBudget": 10000,
      "actuals": {
        "2026-01": 9800,
        "2026-02": 10200
      }
    }
  ]
}
```

### Budget Reviews

When the human asks about budget:
- Show budget vs actuals for the requested period
- Calculate variance (actual - budget) and variance percentage
- Flag any category that's **>10% over budget** — these need attention
- Flag any category that's **>20% under budget** — might indicate missed expenses or underspending
- Use the budget vs actuals template from `references/finance-templates.md`

### Rules
- Never adjust budget numbers without explicit human approval
- Actuals should reconcile with the expense log
- If actuals don't match expenses, flag the discrepancy

---

## Cash Flow Monitoring

### Cash Flow Schema

`finance/cashflow.json`:

```json
{
  "accounts": [
    {
      "name": "Operating Account",
      "currentBalance": null,
      "lastUpdated": null
    }
  ],
  "monthly": [
    {
      "month": "2026-02",
      "openingBalance": 50000,
      "inflows": {
        "invoicePayments": 25000,
        "otherIncome": 0
      },
      "outflows": {
        "payroll": 10000,
        "bills": 8000,
        "otherExpenses": 3000
      },
      "closingBalance": 54000,
      "notes": ""
    }
  ]
}
```

### Cash Flow Alerts

Flag these situations immediately:
- **Closing balance below 2x monthly expenses** — low runway warning
- **Negative cash flow for 2+ consecutive months** — trend alert
- **Large outstanding receivables with low cash** — collection is urgent
- **Upcoming large payables with insufficient cash** — timing problem

### Cash Flow Forecasting

When asked to forecast:
1. Take current balance
2. Add expected inflows (scheduled payments, recurring revenue)
3. Subtract expected outflows (recurring bills, payroll, known expenses)
4. Project 3 months forward
5. Flag any month where projected balance drops below the safety threshold
6. Use the cash flow forecast template from `references/finance-templates.md`

---

## Financial Review Checklists

### Monthly Review (run by the 5th of each month)

- [ ] Reconcile all bank accounts
- [ ] Review all outstanding invoices — follow up on overdue
- [ ] Categorize any uncategorized expenses
- [ ] Check for missing receipts (especially expenses >$75)
- [ ] Compare budget vs actuals — flag variances >10%
- [ ] Update cash flow with actual closing balance
- [ ] Review recurring subscriptions — cancel anything unused
- [ ] Generate monthly financial summary (use template)
- [ ] Flag items needing accountant review
- [ ] File any needed tax payments (sales tax, estimated quarterly)

### Quarterly Review (in addition to monthly)

- [ ] Review P&L trends across the quarter
- [ ] Assess cash flow trajectory — are we improving or declining?
- [ ] Review pricing and margins — are projects profitable?
- [ ] Evaluate outstanding receivables aging — any write-off candidates?
- [ ] Check insurance coverage — still adequate?
- [ ] Review contractor agreements — any renewals coming up?
- [ ] Update annual projections based on Q1/Q2/Q3 actuals
- [ ] Prepare summary for accountant or financial advisor

### Year-End Review (in addition to quarterly)

- [ ] Full expense categorization audit
- [ ] Gather all tax documents (see Tax Prep section)
- [ ] Review and set next year's budget
- [ ] Close out any ancient receivables
- [ ] Ensure 1099s are prepared for contractors ($600+ threshold)
- [ ] Archive the year's financial files

---

## Tax Preparation Document Gathering

When it's tax season (or the human asks to prep), walk through this checklist:

### Documents to Gather

**Income:**
- [ ] All bank statements (12 months)
- [ ] Revenue by client/source summary
- [ ] 1099s received from clients
- [ ] Any other income documentation

**Expenses:**
- [ ] Full expense log with categories (export from `finance/expenses.json`)
- [ ] All receipts for deductions >$75
- [ ] Vehicle mileage log (if applicable)
- [ ] Home office measurements/expenses (if applicable)
- [ ] Health insurance premiums paid
- [ ] Retirement contributions (SEP-IRA, Solo 401k, etc.)

**Payroll & Contractors:**
- [ ] W-2s for employees
- [ ] 1099-NEC forms for contractors paid $600+
- [ ] Payroll tax deposits and filings

**Assets:**
- [ ] List of equipment/asset purchases (for depreciation)
- [ ] Any asset dispositions or sales

**Other:**
- [ ] Estimated tax payments made during the year
- [ ] Prior year tax return (for reference)
- [ ] Business license and registration renewals
- [ ] Loan statements (for interest deduction)

### Tax Calendar (US — adjust for your jurisdiction)

| Date | What |
|---|---|
| Jan 31 | Issue 1099s to contractors |
| Apr 15 | Q1 estimated tax payment + annual filing (or extension) |
| Jun 15 | Q2 estimated tax payment |
| Sep 15 | Q3 estimated tax payment |
| Oct 15 | Extended filing deadline |
| Jan 15 (next year) | Q4 estimated tax payment |

**Reminder:** Set reminders 2 weeks before each deadline.

---

## QuickBooks Integration

When MCP (Model Context Protocol) tools for QuickBooks are available:

### What You Can Do
- Pull real-time account balances
- Sync invoices and payments
- Import categorized expenses
- Generate P&L and balance sheet reports
- Reconcile against local tracking files

### What You Should Do
- **Always cross-reference** QuickBooks data with local files for discrepancies
- **Never create transactions in QuickBooks** without human approval
- **Sync before any financial review** — stale data leads to bad decisions
- **Flag mismatches** — if local tracking says $5,000 outstanding and QuickBooks says $3,500, something's wrong

### When MCP Isn't Available
- Track everything locally in the JSON files defined above
- When QuickBooks access becomes available, use it to backfill and reconcile
- Don't let the absence of QuickBooks stop you from tracking — the local files ARE the system of record until proven otherwise

---

## Reporting

When generating any financial report:

1. Use the templates in `references/finance-templates.md`
2. Use real numbers only — **never generate fake or estimated data without clearly labeling it**
3. Show your math — don't just present totals, show what went into them
4. Flag anomalies — unusual spikes, drops, or patterns
5. End with action items — reports without next steps are just noise

### Common Reports

- **Monthly Financial Summary** — use monthly template
- **Expense Report** — by category, for a date range
- **Budget vs Actuals** — variance analysis by category
- **Cash Flow Forecast** — 3-month forward projection
- **Aging Report** — invoices grouped by how overdue they are (current, 30, 60, 90+)

---

## Don'ts

- **Don't give tax advice.** "Talk to your accountant about whether X is deductible" is always the right answer.
- **Don't fabricate numbers.** If you don't have data, say so. "No data yet" beats a guess.
- **Don't auto-categorize silently.** Suggest categories, let the human confirm.
- **Don't ignore small amounts.** $50/month subscriptions add up to $600/year. Track them.
- **Don't let invoices age quietly.** If something is overdue, surface it every time finance comes up.
- **Don't modify budget or actuals without explicit approval.**
- **Don't assume US tax rules.** Ask about jurisdiction if unclear.
