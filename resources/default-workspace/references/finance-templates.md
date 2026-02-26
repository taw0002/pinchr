# Finance Templates

Reference templates for financial communications and reports. Adapt these to your business context — templates are starting points, not fill-in-the-blank forms.

Placeholders use `{curly_braces}`. Replace all placeholders before sending or presenting.

---

## 1. Invoice Follow-Up Emails

### 30-Day Overdue — Friendly Reminder

```
Subject: Invoice #{invoice_number} — Friendly Follow-Up

Hi {contact_name},

Hope you're doing well. I wanted to follow up on Invoice #{invoice_number} for {amount}, which was due on {due_date}.

I understand things get busy — just want to make sure this didn't slip through the cracks on your end.

For reference:
- Invoice #: {invoice_number}
- Amount: {amount}
- Original due date: {due_date}
- Description: {description}

If you've already sent payment, please disregard this note. Otherwise, could you let me know when we might expect it?

Happy to resend the invoice if that's helpful.

Thanks,
{your_name}
{your_company}
```

_Tone: warm, assumes good faith, no pressure. This is just a nudge._

### 60-Day Overdue — Firm Follow-Up

```
Subject: Invoice #{invoice_number} — Past Due (60 Days)

Hi {contact_name},

I'm reaching out again regarding Invoice #{invoice_number} for {amount}, originally due on {due_date}. This invoice is now 60 days past due.

I've followed up previously on {previous_followup_date} but haven't heard back. I want to make sure we can resolve this promptly.

Invoice details:
- Invoice #: {invoice_number}
- Amount due: {amount}
- Due date: {due_date}
- Days overdue: {days_overdue}

If there's an issue with the invoice or if you need to arrange a payment plan, I'm happy to discuss. Otherwise, I'd appreciate payment within the next 7 business days.

Please reply to this email to confirm receipt.

Best regards,
{your_name}
{your_company}
{your_phone}
```

_Tone: professional, direct, sets a clear timeline. Still leaves room for dialogue._

### 90-Day Overdue — Final Notice

```
Subject: FINAL NOTICE — Invoice #{invoice_number} Past Due (90 Days)

{contact_name},

This is a final notice regarding Invoice #{invoice_number} for {amount}, which has been outstanding since {due_date} — now {days_overdue} days past the original due date.

Previous follow-ups were sent on:
- {followup_date_1}
- {followup_date_2}

Despite multiple attempts to resolve this, payment has not been received and I have not received a response addressing the balance.

If payment of {amount} is not received or a payment arrangement agreed upon within 10 business days of this notice, I will need to {next_steps — e.g., "engage a collections process" / "consult with legal counsel" / "suspend future services"}.

I would strongly prefer to resolve this between us. Please contact me at {your_phone} or reply to this email.

Regards,
{your_name}
{your_company}
{your_phone}
{your_email}
```

_Tone: serious but not hostile. States consequences clearly. Always give one more chance to resolve directly._

---

## 2. Monthly Financial Summary Report

Use this format when generating the monthly financial overview.

```
# Monthly Financial Summary — {month} {year}

**Prepared:** {date_prepared}
**Period:** {start_date} to {end_date}

---

## Revenue

| Source               | Amount     |
|----------------------|------------|
| {revenue_source_1}   | ${amount}  |
| {revenue_source_2}   | ${amount}  |
| **Total Revenue**    | **${total}** |

Month-over-month change: {+/-}{percent}%

## Expenses

| Category             | Budget     | Actual     | Variance   |
|----------------------|------------|------------|------------|
| Payroll              | ${budget}  | ${actual}  | ${var}     |
| Software             | ${budget}  | ${actual}  | ${var}     |
| Marketing            | ${budget}  | ${actual}  | ${var}     |
| Office               | ${budget}  | ${actual}  | ${var}     |
| Professional Services| ${budget}  | ${actual}  | ${var}     |
| Other                | ${budget}  | ${actual}  | ${var}     |
| **Total Expenses**   | **${budget}** | **${actual}** | **${var}** |

## Profit / Loss

| Metric               | Amount     |
|----------------------|------------|
| Total Revenue        | ${revenue} |
| Total Expenses       | ${expenses}|
| **Net Income**       | **${net}** |
| Net Margin           | {percent}% |

## Cash Position

| Account              | Balance    |
|----------------------|------------|
| {account_name}       | ${balance} |
| **Total Cash**       | **${total}** |

Month-over-month change: {+/-}${amount} ({+/-}{percent}%)

## Accounts Receivable Aging

| Aging Bucket   | Amount     | # Invoices |
|----------------|------------|------------|
| Current        | ${amount}  | {count}    |
| 1-30 days      | ${amount}  | {count}    |
| 31-60 days     | ${amount}  | {count}    |
| 61-90 days     | ${amount}  | {count}    |
| 90+ days       | ${amount}  | {count}    |
| **Total AR**   | **${total}** | **{count}** |

## Key Highlights

- {highlight_1 — e.g., "Revenue up 15% driven by new client onboarding"}
- {highlight_2 — e.g., "Marketing spend came in 20% under budget"}
- {highlight_3 — e.g., "Two invoices over 60 days — follow-up initiated"}

## Action Items

- [ ] {action_1 — e.g., "Follow up on INV-042 and INV-045 (60+ days overdue)"}
- [ ] {action_2 — e.g., "Review software subscriptions — $200/mo in unused tools"}
- [ ] {action_3 — e.g., "Schedule quarterly review with accountant"}
```

_Populate only sections where you have real data. Omit sections rather than filling with zeros or estimates (unless clearly labeled as projections)._

---

## 3. Expense Report

Use when summarizing expenses for a specific period, project, or category.

```
# Expense Report

**Period:** {start_date} to {end_date}
**Prepared by:** {name}
**Purpose:** {purpose — e.g., "Monthly expense review" / "Project: Website Redesign" / "Q1 Travel"}

---

## Summary

| Category             | Total      | % of Total |
|----------------------|------------|------------|
| {category_1}         | ${amount}  | {percent}% |
| {category_2}         | ${amount}  | {percent}% |
| {category_3}         | ${amount}  | {percent}% |
| **Grand Total**      | **${total}** | **100%** |

## Detail

| Date       | Vendor           | Description          | Category    | Amount   | Receipt |
|------------|------------------|----------------------|-------------|----------|---------|
| {date}     | {vendor}         | {description}        | {category}  | ${amount}| ✅ / ❌  |
| {date}     | {vendor}         | {description}        | {category}  | ${amount}| ✅ / ❌  |

## Notes

- {note_1 — e.g., "Missing receipt for $120 hotel charge — requesting duplicate"}
- {note_2 — e.g., "Mileage calculated at $0.67/mile (2025 IRS rate — verify current year)"}

## Missing Receipts

| Date       | Vendor           | Amount   | Status              |
|------------|------------------|----------|---------------------|
| {date}     | {vendor}         | ${amount}| {requested / lost}  |
```

_Flag all missing receipts. For tax purposes, receipts matter — especially for expenses over $75._

---

## 4. Budget vs Actuals Comparison

Use for monthly or quarterly budget reviews.

```
# Budget vs Actuals — {period}

**Period:** {month/quarter} {year}
**Prepared:** {date}

---

## Overview

| Metric           | Budget     | Actual     | Variance ($) | Variance (%) | Status |
|------------------|------------|------------|--------------|--------------|--------|
| Total Revenue    | ${budget}  | ${actual}  | ${var}       | {percent}%   | {🟢/🔴} |
| Total Expenses   | ${budget}  | ${actual}  | ${var}       | {percent}%   | {🟢/🔴} |
| Net Income       | ${budget}  | ${actual}  | ${var}       | {percent}%   | {🟢/🔴} |

_🟢 = within 10% of budget | 🔴 = more than 10% off budget_

## Expense Breakdown

| Category             | Budget     | Actual     | Variance ($) | Variance (%) | Flag |
|----------------------|------------|------------|--------------|--------------|------|
| Payroll              | ${budget}  | ${actual}  | ${var}       | {pct}%       | {flag}|
| Software             | ${budget}  | ${actual}  | ${var}       | {pct}%       | {flag}|
| Marketing            | ${budget}  | ${actual}  | ${var}       | {pct}%       | {flag}|
| Travel               | ${budget}  | ${actual}  | ${var}       | {pct}%       | {flag}|
| Professional Services| ${budget}  | ${actual}  | ${var}       | {pct}%       | {flag}|
| Office               | ${budget}  | ${actual}  | ${var}       | {pct}%       | {flag}|
| Other                | ${budget}  | ${actual}  | ${var}       | {pct}%       | {flag}|
| **Total**            | **${budget}** | **${actual}** | **${var}** | **{pct}%** | |

_Flag key: ⚠️ >10% over | 🔴 >20% over | 📉 >20% under (investigate)_

## Variance Analysis

### Over Budget (needs attention)
- **{category}** — Over by ${amount} ({percent}%). Reason: {explanation}
- **{category}** — Over by ${amount} ({percent}%). Reason: {explanation}

### Under Budget (investigate)
- **{category}** — Under by ${amount} ({percent}%). Reason: {explanation}

### On Track
- {category}, {category}, {category} — all within acceptable range.

## Recommendations

- [ ] {recommendation_1 — e.g., "Reduce marketing spend by $500/mo to stay within annual budget"}
- [ ] {recommendation_2 — e.g., "Reallocate $1,000 from unused travel budget to software"}
- [ ] {recommendation_3 — e.g., "Review payroll trend — 3 months of 5%+ overage"}
```

_Variance percentage = ((Actual - Budget) / Budget) × 100. Positive = over budget. Negative = under._

---

## 5. Cash Flow Forecast

Use for 3-month forward projections.

```
# Cash Flow Forecast

**As of:** {date}
**Forecast period:** {month_1} through {month_3}
**Starting balance:** ${starting_balance}

---

## Projected Cash Flow

|                          | {Month 1}  | {Month 2}  | {Month 3}  |
|--------------------------|------------|------------|------------|
| **Opening Balance**      | ${bal}     | ${bal}     | ${bal}     |
|                          |            |            |            |
| **Inflows**              |            |            |            |
| Expected invoice payments| ${amount}  | ${amount}  | ${amount}  |
| Recurring revenue        | ${amount}  | ${amount}  | ${amount}  |
| Other income             | ${amount}  | ${amount}  | ${amount}  |
| **Total Inflows**        | **${total}** | **${total}** | **${total}** |
|                          |            |            |            |
| **Outflows**             |            |            |            |
| Payroll                  | ${amount}  | ${amount}  | ${amount}  |
| Rent / facilities        | ${amount}  | ${amount}  | ${amount}  |
| Software / subscriptions | ${amount}  | ${amount}  | ${amount}  |
| Recurring bills          | ${amount}  | ${amount}  | ${amount}  |
| Known one-time expenses  | ${amount}  | ${amount}  | ${amount}  |
| Estimated tax payments   | ${amount}  | ${amount}  | ${amount}  |
| **Total Outflows**       | **${total}** | **${total}** | **${total}** |
|                          |            |            |            |
| **Net Cash Flow**        | **${net}** | **${net}** | **${net}** |
| **Closing Balance**      | **${bal}** | **${bal}** | **${bal}** |

## Assumptions

- {assumption_1 — e.g., "Invoice payments based on historical 85% collection rate within terms"}
- {assumption_2 — e.g., "Payroll assumes current headcount, no new hires"}
- {assumption_3 — e.g., "Q2 estimated tax payment of $X due in June"}

## Risk Flags

| Risk                                    | Impact     | Likelihood | Mitigation                    |
|-----------------------------------------|------------|------------|-------------------------------|
| {risk — e.g., "Client X delays payment"}| -${amount} | {H/M/L}   | {action — "accelerate follow-up"} |
| {risk — e.g., "Unexpected equipment repair"}| -${amount} | {H/M/L} | {action — "maintain reserve"} |

## Safety Metrics

- **Monthly burn rate:** ${amount}/month
- **Cash runway:** {X} months at current burn
- **Safety threshold (2x monthly expenses):** ${amount}
- **Current vs threshold:** {🟢 Above / 🔴 Below}

## Recommendations

- [ ] {recommendation_1}
- [ ] {recommendation_2}
```

_Always state assumptions. A forecast without assumptions is fiction. Update monthly as actuals replace projections._

---

## Usage Notes

- **Real data only.** Never populate templates with made-up numbers. If you don't have the data, leave it blank or mark it as "TBD."
- **Adapt the format.** These templates work for most SMBs, but every business is different. Add or remove line items as needed.
- **Platform formatting.** If presenting in WhatsApp or Discord, convert tables to bullet lists — markdown tables don't render well on those platforms.
- **Currency.** Templates default to USD. Adjust for your business's operating currency.
- **Keep it actionable.** Every report should end with clear next steps. Numbers without actions are just data.
