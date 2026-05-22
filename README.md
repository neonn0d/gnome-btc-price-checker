# Bitcoin Price Checker

A GNOME Shell extension that displays the current price of Bitcoin in the top bar.

## Configuration

Open the extension's settings (Extensions app → gear icon, or `gnome-extensions prefs bitcoin-price-checker@misfits.dev`).

### Price source

Pick a built-in preset (Binance, Coinbase, or Kraken, in USD, EUR, GBP, or JPY depending on the exchange), or pick **Custom** to point at any JSON API:

- **API URL**: full URL of a JSON endpoint
- **JSON path**: dot-notation path to the price field, with `[N]` for array indices (e.g. `price`, `data.amount`, `result.XXBTZUSD.c[0]`)
- **Display prefix**: what shows before the number (e.g. `$`, `€`, `£`, `₿`)

### Refresh

How often to fetch the price, 60–3600 seconds.

### Position

Which panel box the indicator sits in (Left / Center / Right) and the position within that box. Absolute ordering relative to other extensions depends on which one loads first, so this is best-effort.

### Appearance

Toggle custom text and background colors for the indicator label.
