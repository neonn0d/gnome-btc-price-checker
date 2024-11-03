const GETTEXT_DOMAIN = "bitcoin-price-checker"

const { GObject, St, Clutter, Soup, GLib } = imports.gi
const ExtensionUtils = imports.misc.extensionUtils
const Main = imports.ui.main
const PanelMenu = imports.ui.panelMenu

const _ = ExtensionUtils.gettext
let soupSession

const Indicator = GObject.registerClass(
  class Indicator extends PanelMenu.Button {
    _init() {
      super._init(0.0, _("Bitcoin Price Checker"))

      this.label = new St.Label({ y_align: Clutter.ActorAlign.CENTER })
      this.add_child(this.label)

      this._updatePrice()

      this._refreshTimeout = GLib.timeout_add_seconds(
        GLib.PRIORITY_DEFAULT,
        60,
        () => {
          this._updatePrice()
          return GLib.SOURCE_CONTINUE
        },
      )
    }

    _updatePrice() {
      this.label.set_text(_("Fetching..."))

      this._fetchBitcoinPrice()
        .then((price) => {
          const formattedPrice = price.toLocaleString("en-US", {
            style: "currency",
            currency: "USD",
            maximumFractionDigits: 0,
          })
          this.label.set_text(`BTC: ${formattedPrice}`)
        })
        .catch((error) => {
          this.label.set_text(_("Error fetching price"))
        })
    }

    async _fetchBitcoinPrice() {
      if (!soupSession) {
        soupSession = new Soup.Session()
        soupSession.user_agent =
          "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.114 Safari/537.36"
      }

      const url = "https://api.binance.com/api/v3/ticker/price?symbol=BTCUSDT"

      return new Promise((resolve, reject) => {
        let message = new Soup.Message({
          method: "GET",
          uri: Soup.URI.new(url),
        })

        soupSession.queue_message(message, (session, response) => {
          if (response.status_code === 200) {
            try {
              let data = JSON.parse(response.response_body.data)
              let price = parseFloat(data.price)
              resolve(price)
            } catch (e) {
              reject(new Error("Failed to parse JSON data from API response."))
            }
          } else {
            reject(
              new Error(
                `API request failed with status code: ${response.status_code}`,
              ),
            )
          }
        })
      })
    }

    destroy() {
      if (this._refreshTimeout) {
        GLib.source_remove(this._refreshTimeout)
        this._refreshTimeout = null
      }
      if (this.label) {
        this.label.destroy()
        this.label = null
      }
      if (soupSession) {
        soupSession.abort()
        soupSession = null
      }
      super.destroy()
    }
  },
)

class Extension {
  constructor(uuid) {
    this._uuid = uuid
    ExtensionUtils.initTranslations(GETTEXT_DOMAIN)
  }

  enable() {
    this._indicator = new Indicator()
    Main.panel.addToStatusArea(this._uuid, this._indicator, 0, "right")
  }

  disable() {
    if (this._indicator) {
      this._indicator.destroy()
      this._indicator = null
    }
  }
}

function init(meta) {
  return new Extension(meta.uuid)
}
