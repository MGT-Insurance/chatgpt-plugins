---
name: mgt-quoting
description: Quote MGT small-business commercial insurance products (BOP, specialty general liability, specialty property, farm) for insurance agents through the MGT quoting MCP tools. Use when an agent wants to check appetite, classify a business, or create, edit, or validate a quote.
---

# Quote MGT products

Use the `mgt-quoting` MCP server tools to build quotes for MGT small-business commercial insurance products. The user is an insurance agent. A licensed person reviews every quote. Binding happens in Shadowfax, MGT's agent portal, not here. Never tell the user a quote is bound or offer to bind it.

## Tools

| Tool | Use it to |
|---|---|
| `resolve_business_classification` | Map one fact (NAICS code, business description, MGT BOP class code, or industry group) to its NAICS entries, BOP classes, and industry groups. It does not decide appetite. |
| `appetite_check` | Check per-product availability (`available`, `moratorium`, `declined`) for a business. |
| `get_quote_schema_catalog` | List the products live for this user and the common field registry. Use it as a mapping reference, not as validation. |
| `get_product_create_schema` | Get the exact field paths and valid option values for one product's create payload. |
| `create_quote` | Create a quote. It returns a rate when the data is sufficient, or the list of required fields. |
| `edit_quote` | Set field values on an existing quote and optionally re-rate it. |
| `validate_quote` | Validate a quote without rating it. |

## Steps

1. Collect the business name, a description of operations, the state, and the effective date. Ask for anything missing. Do not guess a value.
2. Classify the business. If you have an exact NAICS code, pass it as `naics`. Otherwise pass `businessDescription` to `appetite_check` or `resolve_business_classification`. If the code is not specific enough, the tool rejects it and names candidates; ask the user to pick one.
3. Run `appetite_check`. Report each product's decision as returned. If a product is `declined` or in `moratorium`, say so and don't create a quote for it.
4. Call `get_quote_schema_catalog` to confirm which products are live for the user.
5. For each product to quote, call `get_product_create_schema` before you set any value. Use the paths it returns and only the option values it lists. An out-of-options value is rejected and creates nothing.
6. Call `create_quote` with the information you have. If the result lists required fields, ask the user for them, then call `edit_quote`.
7. Call `edit_quote` to change fields. Send every `value` as a string, and JSON-encode structured values. To re-rate, set `rate: true`. Fields reported in `skipped` were not applied; tell the user.
8. Call `validate_quote` when the user wants a check without rating.

## Multiple agencies

If a tool returns `needs_organization`, nothing was created. Show the user the `organizations` list, ask which one to use, and call the same tool again with `organization` set to the chosen id. Never choose an organization yourself.

## Rules

- Read the premium and referral status from the tool result. Don't calculate or estimate a premium.
- If a result says `referred`, explain that underwriting must review the quote.
- Tell the user that a licensed person must review the quote in Shadowfax before anyone binds coverage.
- If a tool returns an error with `retryable: true`, retry once. Otherwise report the error text as returned.
- Send only the details the quote needs. Don't send unrelated personal data.
