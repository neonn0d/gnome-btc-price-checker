import GObject from 'gi://GObject';
import St from 'gi://St';
import Clutter from 'gi://Clutter';
import Soup from 'gi://Soup';
import GLib from 'gi://GLib';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import {Extension, gettext as _} from 'resource:///org/gnome/shell/extensions/extension.js';

const GETTEXT_DOMAIN = 'bitcoin-price-checker';

let soupSession = null;

const Indicator = GObject.registerClass(
    class Indicator extends PanelMenu.Button {
        _init() {
            super._init(0.0, _('Bitcoin Price Checker'));

            this.label = new St.Label({
                y_align: Clutter.ActorAlign.CENTER,
            });
            this.add_child(this.label);

            this._updatePrice();

            this._refreshTimeout = GLib.timeout_add_seconds(
                GLib.PRIORITY_DEFAULT,
                60,
                () => {
                    this._updatePrice();
                    return GLib.SOURCE_CONTINUE;
                },
            );
        }

        _updatePrice() {
            this.label.set_text(_('Fetching...'));

            this._fetchBitcoinPrice()
                .then((price) => {
                    const formattedPrice = price.toLocaleString('en-US', {
                        style: 'currency',
                        currency: 'USD',
                        maximumFractionDigits: 0,
                    });
                    this.label.set_text(`BTC: ${formattedPrice}`);
                })
                .catch((error) => {
                    console.error('Bitcoin Price Checker error:', error);
                    this.label.set_text(_('Error fetching price'));
                });
        }

        async _fetchBitcoinPrice() {
            if (!soupSession) {
                soupSession = new Soup.Session();
                soupSession.user_agent =
                    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.114 Safari/537.36';
            }

            const url = 'https://api.binance.com/api/v3/ticker/price?symbol=BTCUSDT';

            return new Promise((resolve, reject) => {
                const message = Soup.Message.new('GET', url);

                soupSession.send_and_read_async(message, GLib.PRIORITY_DEFAULT, null, (session, result) => {
                    try {
                        const bytes = session.send_and_read_finish(result);
                        const data = JSON.parse(new TextDecoder().decode(bytes.get_data()));
                        const price = parseFloat(data.price);
                        resolve(price);
                    } catch (e) {
                        reject(new Error('Failed to parse API response: ' + e.message));
                    }
                });
            });
        }

        destroy() {
            if (this._refreshTimeout) {
                GLib.source_remove(this._refreshTimeout);
                this._refreshTimeout = null;
            }
            if (this.label) {
                this.label.destroy();
                this.label = null;
            }
            if (soupSession) {
                soupSession = null;
            }
            super.destroy();
        }
    },
);

export default class BitcoinPriceCheckerExtension extends Extension {
    enable() {
        this._indicator = new Indicator();
        Main.panel.addToStatusArea(this.uuid, this._indicator, 0, 'right');
    }

    disable() {
        if (this._indicator) {
            this._indicator.destroy();
            this._indicator = null;
        }
    }
}