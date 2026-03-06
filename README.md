# BEEorder_CLI

A practical CLI scaffold for BeeOrder mobile APIs (auth, cart, checkout, orders).

This project is designed for API replay against the Android app backend (`com.beeorder.customer`), with configurable routes and headers so it can be adapted as request shapes are discovered.

## What is implemented

- Local config store: `~/.beeorder-cli/config.json`
- Local session store: `~/.beeorder-cli/session.json`
- OTP auth flow commands (login / verify / resend / logout)
- Generic API command for any endpoint
- Helper commands for cart, orders, checkout, restaurants, and search
- Safety guard for order placement (`--yes` required)

## Prerequisites

- Node.js 18+

## Setup

```bash
git clone https://github.com/kinanzayat/BEEorder_CLI.git
cd BEEorder_CLI
node ./bin/beeorder.js help
```

Optional local install:

```bash
npm link
beeorder help
```

## Core usage

### Config

```bash
beeorder config show
beeorder config set baseUrl https://client.beeorder.com/
beeorder config set timeoutMs 45000
```

### Headers and routes

```bash
beeorder header set X-Device-Id <value>
beeorder header set X-Fingerprint-Id <value>
beeorder header show

beeorder route show
beeorder route set authLogin auth/login
beeorder route set ordersCreate orders/create
```

### Auth

Default payloads are intentionally simple. If the app expects a different schema, pass `--payload` or `--file`.

```bash
beeorder auth login --phone 9xxxxxxxx --countryCode 963
beeorder auth verify --phone 9xxxxxxxx --otp 1234
beeorder session show
```

Custom payload example:

```bash
beeorder auth login --payload '{"phoneNumber":"9xxxxxxxx","countryCode":"963"}'
```

### Generic API replay

```bash
beeorder api --method GET --path user/orders --auth --query page=1 --query limit=20
beeorder api --method POST --path orders/calculate --auth --file ./examples/checkout.json
```

### Checkout and order placement

```bash
beeorder checkout calc --file ./examples/checkout.json
beeorder checkout place --file ./examples/order.json --yes
```

## Auth and anti-bot handling strategy

For mobile-only apps, successful CLI replay usually depends on matching these pieces from real app traffic:

- OTP payload shape (`auth/login`, `auth/verify`)
- Authorization header format (Bearer token or custom)
- Device/app headers (`x-app-version`, fingerprint/device IDs, locale, platform)
- Any additional signing headers

This CLI already supports dynamic headers and route remapping; once you capture one valid mobile request, you can mirror it quickly.

## Suggested reverse-engineering workflow

1. Run app in Android emulator/device.
2. Capture HTTPS traffic (proxy + certificate trust / instrumentation if pinning exists).
3. Reproduce `auth/login` and `auth/verify` in `beeorder api` first.
4. Add required headers via `beeorder header set ...`.
5. Set accurate route names via `beeorder route set ...`.
6. Move to `checkout calc`, then `checkout place --yes`.

## Security notes

- Session tokens are stored locally at `~/.beeorder-cli/session.json`.
- Do not commit tokens or real request payloads.
- Prefer test accounts while validating order placement.

## Command summary

```bash
beeorder help
beeorder config show|set|reset
beeorder header show|set|unset|clear
beeorder route show|set|reset
beeorder session show|clear
beeorder auth login|verify|resend|logout
beeorder api --method <METHOD> --path <PATH> [--auth] [--query k=v] [--file body.json]
beeorder cart get|update
beeorder orders current|list|create
beeorder checkout calc|place
beeorder restaurants list
beeorder search restaurant --q chips
```
