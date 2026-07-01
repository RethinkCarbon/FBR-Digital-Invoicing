# SN018 Implementation — Services (FED in ST Mode)

Planetive FBR Digital Invoicing supports **SN018** alongside the existing **SN019** workflow. All field values for HS codes, rates, UOM, and transaction types are obtained at runtime from FBR Reference APIs — nothing is hardcoded for SN018 except the scenario identifier and sale-type label from the official scenario table.

## Scenario preset

| Field | SN018 | SN019 |
|-------|-------|-------|
| `scenarioId` | `SN018` | `SN019` |
| Description | Services Rendered or Provided Where FED is Charged in ST Mode | Services rendered or provided |
| `saleType` (preset) | `Services (FED in ST Mode)` | `Services` |
| `fedInStMode` | `true` | `false` |
| Default HS / rate / UOM | **From Reference APIs** | Preset: `9805.9200`, `18.5%`, `Numbers, pieces, units` |

Source: `src/constants/scenario-presets.js`

## APIs used

### Existing proxy routes (unchanged)

| App route | FBR endpoint | Purpose |
|-----------|--------------|---------|
| `GET /api/trans-types` | `pdi/v1/transtypecode` | Resolve transaction type ID for sale type |
| `GET /api/itemcodes` | `pdi/v1/itemdesccode` | Service HS codes (chapter `98xx`) |
| `GET /api/rates` | `pdi/v2/SaleTypeToRate` | Allowed rates for trans type + seller province + date |
| `GET /api/uom` | `pdi/v1/uom` | Unit-of-measure list |
| `GET /api/hs-uom` | `pdi/v2/HS_UOM` | UOM valid for a specific HS code |

### New scenario-specific routes

| Route | Description |
|-------|-------------|
| `GET /api/scenarios/:scenarioId/reference` | Aggregates trans type, rates, service HS codes, and UOM for the scenario |
| `GET /api/scenarios/:scenarioId/hs-uom?hs_code=` | HS-specific UOM lookup (wraps `/api/hs-uom`) |

Query parameters for `/reference`:

- `invoiceDate` (optional) — used for rate lookup date (`DD-Mon-YYYY`)
- `sellerProvince` (optional) — defaults to company settings province

Implementation: `src/services/scenario-reference-service.js`, `src/routes/scenarios.js`

## Transaction type lookup

1. Read `saleType` from scenario preset (`Services (FED in ST Mode)` for SN018).
2. `GET /api/trans-types` → match `transactioN_DESC` (case-insensitive).
3. **SN018** resolves to transaction type **ID 22** (FBR sandbox).
4. **SN019** resolves to transaction type **ID 18**.

## Rate lookup

```
GET /api/rates?date={DD-Mon-YYYY}&transTypeId=22&originationSupplier={provinceCode}
```

- `originationSupplier` = seller province code from `GET /api/provinces` (e.g. `5` for `CAPITAL TERRITORY`).
- SN018 rates are returned by FBR for the seller's province and invoice date (e.g. `8%`, `16%`, `17%`, `19.5%`, `200/bill` — exact list is API-driven).
- The invoice editor shows rates in a dropdown populated from `/api/scenarios/SN018/reference`.

## HS code lookup

1. `GET /api/itemcodes` (full list).
2. Filter rows where `hS_CODE` starts with `98` (service chapter, same approach as SN019).
3. Expose as datalist on the HS Code field.

Example valid service code (also used for SN019): `9805.9200` — *BUSINESS SUPPORT SERVICES*.

## UOM lookup

1. Initial UOM dropdown from `GET /api/uom` via scenario reference.
2. On HS code change: `GET /api/scenarios/SN018/hs-uom?hs_code={code}` tries annexures 1–6 until FBR returns a match.
3. UOM dropdown is refreshed with HS-specific allowed values.

## Tax calculation

No hardcoded FED percentages. Logic mirrors FBR v1.12 field descriptions:

- `salesTaxApplicable` = `valueSalesExcludingST × rate` (parsed from rate string, e.g. `19.5%`).
- For FED-in-ST-mode sale type, this amount represents the FED charged in ST mode.
- `fedPayable` is optional (defaults to `0`); passed through when entered.
- `totalValues` = value excl. + `salesTaxApplicable` + further tax + `fedPayable` − discount.

Server: `src/services/tax-calculator.js`  
Client: `public/js/tax-utils.js`

## Payload differences vs SN019

| Field | SN019 | SN018 |
|-------|-------|-------|
| `scenarioId` | `SN019` | `SN018` |
| `items[].saleType` | `Services` | `Services (FED in ST Mode)` |
| `items[].rate` | From API (e.g. `18.5%`) | From API (trans type 22 rates) |
| `items[].salesTaxApplicable` | ST amount | FED-in-ST-mode amount (same formula) |
| `items[].fedPayable` | Typically `0` | Optional; editable when `fedInStMode` |

`payload-builder.js` only applies preset `saleType` when missing on line items — unchanged for both scenarios.

## Validation and submit flow

1. User selects **SN018** in the scenario dropdown (sandbox).
2. Reference data loads automatically (trans type, rates, HS datalist, UOM).
3. User fills invoice and clicks **Validate** → `POST /api/invoices/validate` → FBR `validateinvoicedata_sb`.
4. On success, workflow status becomes `pending` and `request_payload` (with rate) is stored in Supabase.
5. **Submit** is blocked for SN018 until validation succeeded (`workflow_status === 'pending'`).
6. On submit, when status is `pending`, the server reuses the **validated** `request_payload` from the database (not a fresh DOM read) so `rate` cannot be lost.
7. SN019 submit behaviour is unchanged for direct submit; validate-then-submit also benefits from pending payload reuse.

### Known bug fixed (FBR 0020 on submit)

**Symptom:** Validate succeeds; Submit fails with `0020 — Rate field cannot be empty or null`.

**Cause:** `applyReferenceToItemRow()` replaced the rate text input with a `<select>` whose first option was empty. If the current rate (e.g. SN019 default `18.5%`) was not in SN018’s API rate list, the browser left `select.value` as `""`. Validate had already stored the correct rate in DB; Submit re-read the form and sent `rate: ""`.

**Divergence point:** `public/js/scenario-reference.js` (`applyReferenceToItemRow`) + `public/js/app.js` (`buildPayload` line reading `rate`).

**Fix:** (1) Resolve rate/UOM only from API lists when building selects. (2) On `POST /api/invoices/post`, reuse `request_payload` when `workflow_status === 'pending'`.

## UI behaviour

- Planetive sandbox shows scenario dropdown: **SN019**, then **SN018**.
- Same invoice editor for both scenarios.
- Changing scenario or invoice date invalidates cached reference data and reloads.
- `Load Sample` for SN018 uses first API-returned HS code, rate, and UOM (not SN019 defaults).

Frontend: `public/js/scenario-reference.js`, `public/js/app.js`

## Example reference response (shape)

```json
{
  "scenarioId": "SN018",
  "description": "Services Rendered or Provided Where FED is Charged in ST Mode",
  "saleType": "Services (FED in ST Mode)",
  "fedInStMode": true,
  "transType": { "id": 22, "description": "Services (FED in ST Mode)" },
  "sellerProvince": "CAPITAL TERRITORY",
  "provinceCode": 5,
  "rateQueryDate": "01-Jul-2026",
  "rates": [
    { "rateId": 1, "rateDesc": "8%", "rateValue": 8 },
    { "rateId": 2, "rateDesc": "16%", "rateValue": 16 }
  ],
  "serviceHsCodes": [
    { "hsCode": "9805.9200", "description": "BUSINESS SUPPORT SERVICES" }
  ],
  "uomList": [
    { "uomId": 1, "description": "Numbers, pieces, units" }
  ]
}
```

Rates and lists vary by seller province, invoice date, and FBR dataset — always use live `/api/scenarios/SN018/reference` output.

## Example validate payload (structure)

```json
{
  "invoiceType": "Sale Invoice",
  "invoiceDate": "2026-07-01",
  "scenarioId": "SN018",
  "buyerNTNCNIC": "1234567",
  "buyerBusinessName": "Sample Client Ltd.",
  "buyerProvince": "PUNJAB",
  "buyerAddress": "Lahore",
  "buyerRegistrationType": "Unregistered",
  "items": [{
    "hsCode": "9805.9200",
    "productDescription": "Consulting / software services",
    "saleType": "Services (FED in ST Mode)",
    "rate": "<from /api/rates for transTypeId=22>",
    "uoM": "<from /api/hs-uom or /api/uom>",
    "quantity": 1,
    "valueSalesExcludingST": 1000,
    "salesTaxApplicable": "<value × rate>",
    "fedPayable": 0,
    "totalValues": "<auto-calculated>"
  }]
}
```

Seller fields are injected server-side from company settings before FBR submission.

## Backwards compatibility

- SN019 preset, defaults, tax logic, and submit flow are unchanged.
- `APP_MODE=planetive` exposes both SN019 and SN018 in config and scenario dropdown.
- `APP_MODE=full` continues to show all FBR scenarios when not in planetive mode.

## Files changed / added

| File | Role |
|------|------|
| `src/constants/scenario-presets.js` | SN018 preset |
| `src/services/scenario-reference-service.js` | Reference API aggregation |
| `src/routes/scenarios.js` | Scenario reference routes |
| `src/services/tax-calculator.js` | FED-in-ST-mode tax enrichment |
| `src/constants/provinces.js` | `getProvinceCode()` for rate lookup |
| `server.js` | Mount scenarios router; planetive config |
| `public/js/scenario-reference.js` | Client reference loading |
| `public/js/tax-utils.js` | Client tax helpers |
| `public/js/app.js` | Scenario UI, sample, validate-before-submit |
| `public/index.html` | Script include |
