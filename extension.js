import GObject from 'gi://GObject';
import St from 'gi://St';
import Clutter from 'gi://Clutter';
import Soup from 'gi://Soup';
import GLib from 'gi://GLib';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import { Extension, gettext as _ } from 'resource:///org/gnome/shell/extensions/extension.js';

let soupSession = null;

const Indicator = GObject.registerClass(
    class Indicator extends PanelMenu.Button {
        _init() {
            super._init(0.0, _('Bitcoin Price Checker'));

            this.label = new St.Label({
                y_align: Clutter.ActorAlign.CENTER,
            });
            this.add_child(this.label);

            this._inFlight = false;
            this.label.set_text(_('Loading...'));

            this._updatePrice();

            this._refreshTimeout = GLib.timeout_add_seconds(
                GLib.PRIORITY_DEFAULT,
                60,
                () => {
                    this._updatePrice();
                    return GLib.SOURCE_CONTINUE;
                }
            );
        }

        _updatePrice() {
            if (this._inFlight)
                return;

            this._inFlight = true;
            this.label.set_text(_('Fetching...'));

            this._fetchBitcoinPrice()
                .then(price => {
                    if (!Number.isFinite(price))
                        throw new Error('Invalid price');

                    const formatted = price.toLocaleString('en-US', {
                        style: 'currency',
                        currency: 'USD',
                        maximumFractionDigits: 0,
                    });

                    this.label.set_text(`BTC: ${formatted}`);
                })
                .catch(err => {
                    log(`BTC error: ${err.message}`);
                    this.label.set_text(_('Error '));
                })
                .finally(() => {
                    this._inFlight = false;
                });
        }

        _fetchBitcoinPrice() {
            if (!soupSession) {
                soupSession = new Soup.Session();
                soupSession.user_agent = 'gnome-shell-extension';
            }

            const url = 'https://api.binance.com/api/v3/ticker/price?symbol=BTCUSDT';

            return new Promise((resolve, reject) => {
                const message = Soup.Message.new('GET', url);

                soupSession.send_and_read_async(message, GLib.PRIORITY_DEFAULT, null, (session, result) => {
                    try {
                        const bytes = session.send_and_read_finish(result);

                        const status = message.get_status();
                        if (status !== Soup.Status.OK) {
                            reject(new Error(`HTTP ${status}`));
                            return;
                        }

                        const text = new TextDecoder().decode(bytes.get_data());
                        const data = JSON.parse(text);

                        if (!data.price)
                            throw new Error('Missing price');

                        resolve(parseFloat(data.price));

                    } catch (e) {
                        reject(e);
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
                soupSession.abort();
                soupSession = null;
            }

            super.destroy();
        }
    });

export default class BitcoinPriceCheckerExtension extends Extension {
    enable() {
        this._indicator = new Indicator();
        Main.panel.addToStatusArea(this.uuid, this._indicator);
    }

    disable() {
        this._indicator?.destroy();
        this._indicator = null;
    }
}
