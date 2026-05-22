import GObject from 'gi://GObject';
import St from 'gi://St';
import Clutter from 'gi://Clutter';
import Soup from 'gi://Soup';
import GLib from 'gi://GLib';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import { Extension, gettext as _ } from 'resource:///org/gnome/shell/extensions/extension.js';

let soupSession = null;

const SOURCE_PRESETS = {
    'binance-usdt': {url: 'https://api.binance.com/api/v3/ticker/price?symbol=BTCUSDT', path: 'price',                prefix: '$'},
    'binance-eur':  {url: 'https://api.binance.com/api/v3/ticker/price?symbol=BTCEUR',  path: 'price',                prefix: '€'},
    'binance-jpy':  {url: 'https://api.binance.com/api/v3/ticker/price?symbol=BTCJPY',  path: 'price',                prefix: '¥'},
    'coinbase-usd': {url: 'https://api.coinbase.com/v2/prices/BTC-USD/spot',            path: 'data.amount',          prefix: '$'},
    'coinbase-eur': {url: 'https://api.coinbase.com/v2/prices/BTC-EUR/spot',            path: 'data.amount',          prefix: '€'},
    'coinbase-gbp': {url: 'https://api.coinbase.com/v2/prices/BTC-GBP/spot',            path: 'data.amount',          prefix: '£'},
    'kraken-usd':   {url: 'https://api.kraken.com/0/public/Ticker?pair=XBTUSD',         path: 'result.XXBTZUSD.c[0]', prefix: '$'},
    'kraken-eur':   {url: 'https://api.kraken.com/0/public/Ticker?pair=XBTEUR',         path: 'result.XXBTZEUR.c[0]', prefix: '€'},
    'kraken-gbp':   {url: 'https://api.kraken.com/0/public/Ticker?pair=XBTGBP',         path: 'result.XXBTZGBP.c[0]', prefix: '£'},
};

function readJsonPath(obj, path) {
    const parts = path.replace(/\[(\d+)\]/g, '.$1').split('.');
    return parts.reduce((o, k) => (o == null ? undefined : o[k]), obj);
}

function resolveSource(settings) {
    const preset = settings.get_string('source-preset');
    if (preset === 'custom') {
        return {
            url: settings.get_string('custom-url'),
            path: settings.get_string('custom-path'),
            prefix: settings.get_string('custom-prefix'),
        };
    }
    return SOURCE_PRESETS[preset] ?? SOURCE_PRESETS['binance-usdt'];
}

const Indicator = GObject.registerClass(
    class Indicator extends PanelMenu.Button {
        _init(settings, onActivate) {
            super._init(0.0, _('Bitcoin Price Checker'), true);

            this._settings = settings;
            this._onActivate = onActivate;

            this.connect('button-press-event', (_actor, event) => {
                if (event.get_button() === 1) {
                    this._onActivate?.();
                    return Clutter.EVENT_STOP;
                }
                return Clutter.EVENT_PROPAGATE;
            });

            this.label = new St.Label({
                y_align: Clutter.ActorAlign.CENTER,
            });
            this.add_child(this.label);

            this._inFlight = false;
            this._hasPrice = false;
            this.label.set_text(_('Loading...'));

            this._applyStyle();
            this._updatePrice();
            this._startTimer();

            const onSourceChange = () => {
                this._hasPrice = false;
                this._updatePrice();
            };

            this._handlers = [
                settings.connect('changed::refresh-seconds',    () => this._startTimer()),
                settings.connect('changed::source-preset',      onSourceChange),
                settings.connect('changed::custom-url',         onSourceChange),
                settings.connect('changed::custom-path',        onSourceChange),
                settings.connect('changed::custom-prefix',      onSourceChange),
                settings.connect('changed::use-custom-colors',  () => this._applyStyle()),
                settings.connect('changed::text-color',         () => this._applyStyle()),
                settings.connect('changed::background-color',   () => this._applyStyle()),
                settings.connect('changed::label-radius',       () => this._applyStyle()),
            ];
        }

        _startTimer() {
            if (this._refreshTimeout) {
                GLib.source_remove(this._refreshTimeout);
            }
            const seconds = this._settings.get_int('refresh-seconds');
            this._refreshTimeout = GLib.timeout_add_seconds(
                GLib.PRIORITY_DEFAULT,
                seconds,
                () => {
                    this._updatePrice();
                    return GLib.SOURCE_CONTINUE;
                }
            );
        }

        _applyStyle() {
            const parts = [];
            if (this._settings.get_boolean('use-custom-colors')) {
                parts.push(`color: ${this._settings.get_string('text-color')}`);
                parts.push(`background-color: ${this._settings.get_string('background-color')}`);
            }
            const radius = this._settings.get_int('label-radius');
            if (radius > 0)
                parts.push(`border-radius: ${radius}px`);
            this.set_style(parts.length ? parts.join('; ') : '');
            this.label.set_style('');
        }

        _updatePrice() {
            if (this._inFlight) {
                this._pendingFetch = true;
                return;
            }

            this._inFlight = true;
            this._pendingFetch = false;

            const source = resolveSource(this._settings);

            this._fetchPrice(source)
                .then(price => {
                    if (!this.label) return;
                    if (!Number.isFinite(price))
                        throw new Error('Invalid price');

                    this.label.set_text(`BTC: ${source.prefix}${Math.round(price).toLocaleString('en-US')}`);
                    this._hasPrice = true;
                })
                .catch(err => {
                    log(`BTC error: ${err.message}`);
                    if (!this._pendingFetch && !this._hasPrice)
                        this.label?.set_text(_('Error'));
                })
                .finally(() => {
                    this._inFlight = false;
                    if (this._pendingFetch) {
                        this._pendingFetch = false;
                        this._updatePrice();
                    }
                });
        }

        _fetchPrice(source) {
            if (!soupSession) {
                soupSession = new Soup.Session();
                soupSession.user_agent = 'gnome-shell-extension';
            }

            return new Promise((resolve, reject) => {
                if (!source.url) {
                    reject(new Error('No URL configured'));
                    return;
                }

                const message = Soup.Message.new('GET', source.url);
                if (!message) {
                    reject(new Error('Invalid URL'));
                    return;
                }

                soupSession.send_and_read_async(message, GLib.PRIORITY_DEFAULT, null, (session, result) => {
                    try {
                        const bytes = session.send_and_read_finish(result);

                        const status = message.get_status();
                        if (status !== Soup.Status.OK) {
                            reject(new Error(`HTTP ${status}`));
                            return;
                        }

                        const data = JSON.parse(new TextDecoder().decode(bytes.get_data()));
                        const raw = readJsonPath(data, source.path);

                        if (raw == null)
                            throw new Error(`Missing price at path "${source.path}"`);

                        resolve(parseFloat(raw));
                    } catch (e) {
                        reject(e);
                    }
                });
            });
        }

        destroy() {
            if (this._handlers) {
                this._handlers.forEach(id => this._settings.disconnect(id));
                this._handlers = null;
            }

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
        this._settings = this.getSettings();
        this._mountIndicator();

        this._positionHandlers = [
            this._settings.connect('changed::panel-box',   () => this._mountIndicator()),
            this._settings.connect('changed::panel-index', () => this._mountIndicator()),
        ];
    }

    _mountIndicator() {
        if (this._indicator) {
            this._indicator.destroy();
            this._indicator = null;
            delete Main.panel.statusArea[this.uuid];
        }

        this._indicator = new Indicator(this._settings, () => this.openPreferences());
        const box = this._settings.get_string('panel-box');
        const index = this._settings.get_int('panel-index');
        Main.panel.addToStatusArea(this.uuid, this._indicator, index, box);
    }

    disable() {
        if (this._positionHandlers) {
            this._positionHandlers.forEach(id => this._settings.disconnect(id));
            this._positionHandlers = null;
        }
        this._indicator?.destroy();
        this._indicator = null;
        this._settings = null;
    }
}
