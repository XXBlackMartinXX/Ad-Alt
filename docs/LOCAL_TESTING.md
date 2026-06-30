# Local End-to-End Testing

This walks through exercising the full wait-state -> impression -> ledger-credit flow on a local machine, without needing a real AI coding assistant installed and without using the web dashboard's OAuth login. It assumes you've completed [`SETUP.md`](./SETUP.md): infrastructure is running, `.env` is configured, migrations have been applied, and `pnpm db:seed` has been run.

All commands below assume the API is running locally on `http://localhost:3001` (the default).

## 1. Get a developer API key

The seed script (`packages/database/src/seed.ts`) creates a developer user (`dev@example.com`) but does not mint an API key for it  -  keys are normally issued by the web dashboard's `/dashboard/api-key` page after OAuth sign-in. To skip OAuth locally, exchange the seeded developer's user ID directly against the auth endpoint.

Find the seeded developer's user ID:

```bash
docker compose exec postgres psql -U promptprofit -d promptprofit_dev \
  -c "SELECT id FROM users WHERE email = 'dev@example.com';"
```

Exchange it for an API key (`POST /v1/auth/exchange`):

```bash
curl -s -X POST http://localhost:3001/v1/auth/exchange \
  -H "Content-Type: application/json" \
  -d '{
    "deviceId": "local-test-device-1",
    "userId": "<paste-the-uuid-here>"
  }'
```

The response includes `data.apiKey` (prefixed `ppft_...`). This is shown exactly once  -  the server stores only its hash. Save it:

```bash
export PP_API_KEY="ppft_..."
```

## 2. Request an ad decision (simulates the extension's wait-state trigger)

```bash
curl -s "http://localhost:3001/v1/ads/decision?deviceId=local-test-device-1&adapterName=mock&extensionVersion=0.0.1" \
  -H "Authorization: Bearer $PP_API_KEY"
```

A `200` response returns `data` containing an ad decision (`adDecisionId`, `campaignId`, `creativeId`, headline/body/displayUrl text). A `204 No Content` means no eligible campaign matched  -  check that the seed ran and that `feature_flags.kill_switch_all_ads` is `false`.

Save the returned `data.adDecisionId` as `DECISION_ID`, `data.campaignId` as `CAMPAIGN_ID`, `data.creativeId` as `CREATIVE_ID`.

## 3. Walk the impression lifecycle via `/v1/events`

Impressions move through `requested -> rendered -> viewable/billable` and only become billable (crediting the ledger) once a `viewability_threshold_met` event reports at least 3 seconds of display time and fraud scoring passes. Each event needs a fresh `eventId` (UUID) and a `sessionId` (UUID, can be reused across events in the same session).

Generate IDs:

```bash
EVENT_1=$(node -e "console.log(crypto.randomUUID())")
EVENT_2=$(node -e "console.log(crypto.randomUUID())")
EVENT_3=$(node -e "console.log(crypto.randomUUID())")
SESSION_ID=$(node -e "console.log(crypto.randomUUID())")
NOW=$(node -e "console.log(new Date().toISOString())")
```

**a. `impression_requested`**

```bash
curl -s -X POST http://localhost:3001/v1/events \
  -H "Authorization: Bearer $PP_API_KEY" -H "Content-Type: application/json" \
  -d "{
    \"eventId\": \"$EVENT_1\",
    \"eventType\": \"impression_requested\",
    \"deviceId\": \"local-test-device-1\",
    \"sessionId\": \"$SESSION_ID\",
    \"extensionVersion\": \"0.0.1\",
    \"adapterName\": \"mock\",
    \"clientTimestamp\": \"$NOW\",
    \"sequenceNumber\": 0,
    \"adDecisionId\": \"$DECISION_ID\",
    \"campaignId\": \"$CAMPAIGN_ID\",
    \"creativeId\": \"$CREATIVE_ID\"
  }"
```

**b. `impression_rendered`**

```bash
curl -s -X POST http://localhost:3001/v1/events \
  -H "Authorization: Bearer $PP_API_KEY" -H "Content-Type: application/json" \
  -d "{
    \"eventId\": \"$EVENT_2\",
    \"eventType\": \"impression_rendered\",
    \"deviceId\": \"local-test-device-1\",
    \"sessionId\": \"$SESSION_ID\",
    \"extensionVersion\": \"0.0.1\",
    \"adapterName\": \"mock\",
    \"clientTimestamp\": \"$NOW\",
    \"sequenceNumber\": 1,
    \"adDecisionId\": \"$DECISION_ID\",
    \"renderedAt\": \"$NOW\"
  }"
```

**c. `viewability_threshold_met`** (must report `displayedDurationMs >= 3000`)

```bash
curl -s -X POST http://localhost:3001/v1/events \
  -H "Authorization: Bearer $PP_API_KEY" -H "Content-Type: application/json" \
  -d "{
    \"eventId\": \"$EVENT_3\",
    \"eventType\": \"viewability_threshold_met\",
    \"deviceId\": \"local-test-device-1\",
    \"sessionId\": \"$SESSION_ID\",
    \"extensionVersion\": \"0.0.1\",
    \"adapterName\": \"mock\",
    \"clientTimestamp\": \"$NOW\",
    \"sequenceNumber\": 2,
    \"adDecisionId\": \"$DECISION_ID\",
    \"displayedDurationMs\": 3500,
    \"thresholdMs\": 3000
  }"
```

Each call should return `{"data":{"status":"accepted",...}}`. Replaying the same `eventId` returns `{"data":{"status":"duplicate",...}}` instead of double-processing  -  this is the dedup path, not an error.

## 4. Verify the ledger was credited

```bash
curl -s http://localhost:3001/v1/ledger/me \
  -H "Authorization: Bearer $PP_API_KEY"
```

After step 3c, `data.entries` should contain a new ledger entry and `data.totalEarnedMicrocents` should have increased. If it's unchanged:

- Check the API logs for `impression_fraud_blocked` or `viewability_without_rendered_impression`  -  the fraud scorer or lifecycle guard rejected the event.
- Confirm `displayedDurationMs` was >= 3000 in step 3c.
- Confirm steps 3a/3b/3c were sent in order with the same `adDecisionId`.

Each ledger entry's `balanceAfterMicrocents` reflects the real running balance for its account (advertiser, developer, or platform) at the time of the write  -  the `balances` table is updated atomically in the same transaction as the ledger-entry insert. Verify directly in Postgres: `SELECT account_id, account_type, balance_microcents FROM balances;` should match the latest `balanceAfterMicrocents` per account in `ledger_entries`, and `SELECT entry_type, sum(amount_microcents) FROM ledger_entries GROUP BY entry_type;`  -  `developer_credit + platform_fee` should equal `advertiser_charge`.

## 5. Test the click flow (optional)

```bash
EVENT_4=$(node -e "console.log(crypto.randomUUID())")
curl -s -X POST http://localhost:3001/v1/events \
  -H "Authorization: Bearer $PP_API_KEY" -H "Content-Type: application/json" \
  -d "{
    \"eventId\": \"$EVENT_4\",
    \"eventType\": \"click\",
    \"deviceId\": \"local-test-device-1\",
    \"sessionId\": \"$SESSION_ID\",
    \"extensionVersion\": \"0.0.1\",
    \"adapterName\": \"mock\",
    \"clientTimestamp\": \"$(node -e "console.log(new Date().toISOString())")\",
    \"sequenceNumber\": 3,
    \"adDecisionId\": \"$DECISION_ID\",
    \"creativeId\": \"$CREATIVE_ID\"
  }"
```

A click requires a prior impression in `billable`/`reconciled` status (enforced by a foreign-key relationship and an explicit lifecycle check in `EventProcessor.processClick`); sending it before step 3 completes successfully will return `fraudDecision: "no_impression"`.

To follow the actual click redirect a developer would open from the status bar:

```bash
curl -sI "http://localhost:3001/v1/ads/click/$DECISION_ID"
```

This is unauthenticated by design (it's opened via `vscode.env.openExternal`, not an API call from the extension's backend session) and 302-redirects to the creative's `clickUrl` after confirming the creative is still `approved` and the URL is `https://`.

## 6. Test inside the actual extension (mock adapter)

Rather than calling the API directly, you can let the extension drive this flow itself:

1. Set `promptprofit.adapter` to `"mock"` in VS Code settings (see `SETUP.md`).
2. Launch the Extension Development Host (`F5`).
3. The bundled mock adapter (`apps/extension/src/adapters/mock.adapter.ts`) fires a synthetic wait-state every 15 seconds (configurable via its `cycleMs` constructor parameter), lasting 8 seconds each time  -  long enough to clear the 3-second viewability threshold.
4. Watch the status bar for the sponsored text line, and check the API's stdout logs for `event_ingested` lines confirming the extension is sending real events through the same `/v1/events` path exercised above.

## Privacy note

Every payload in this walkthrough only ever carries the fields defined in `packages/shared/src/schemas/events.ts` (`TelemetryEventSchema`). There is no field for source code, prompt text, file paths, or AI responses anywhere in this flow  -  see [`PRIVACY.md`](./PRIVACY.md) for the full guarantee and how it's enforced.
