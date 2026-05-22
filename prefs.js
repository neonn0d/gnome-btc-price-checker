import Adw from 'gi://Adw';
import Gdk from 'gi://Gdk';
import Gio from 'gi://Gio';
import Gtk from 'gi://Gtk';

import {ExtensionPreferences} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

const PRESETS = [
    {id: 'binance-usdt', label: 'Binance USDT (Tether)'},
    {id: 'binance-eur',  label: 'Binance EUR'},
    {id: 'binance-jpy',  label: 'Binance JPY'},
    {id: 'coinbase-usd', label: 'Coinbase USD'},
    {id: 'coinbase-eur', label: 'Coinbase EUR'},
    {id: 'coinbase-gbp', label: 'Coinbase GBP'},
    {id: 'kraken-usd',   label: 'Kraken USD'},
    {id: 'kraken-eur',   label: 'Kraken EUR'},
    {id: 'kraken-gbp',   label: 'Kraken GBP'},
    {id: 'custom',       label: 'Custom'},
];

const BOXES = [
    {id: 'left',   label: 'Left'},
    {id: 'center', label: 'Center'},
    {id: 'right',  label: 'Right'},
];

function rgbaToHex(rgba) {
    const c = (v) => Math.round(v * 255).toString(16).padStart(2, '0');
    return `#${c(rgba.red)}${c(rgba.green)}${c(rgba.blue)}`;
}

function hexToRgba(hex) {
    const rgba = new Gdk.RGBA();
    rgba.parse(hex);
    return rgba;
}

export default class BitcoinPriceCheckerPreferences extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        const settings = this.getSettings();
        const page = new Adw.PreferencesPage();
        window.add(page);

        const sourceGroup = new Adw.PreferencesGroup({title: 'Price source'});
        page.add(sourceGroup);

        const presetIds = PRESETS.map(p => p.id);
        const presetRow = new Adw.ComboRow({
            title: 'Source',
            model: Gtk.StringList.new(PRESETS.map(p => p.label)),
        });
        presetRow.selected = Math.max(0, presetIds.indexOf(settings.get_string('source-preset')));
        presetRow.connect('notify::selected', () => {
            settings.set_string('source-preset', presetIds[presetRow.selected]);
        });
        sourceGroup.add(presetRow);

        const customGroup = new Adw.PreferencesGroup({
            title: 'Custom source',
            description: 'Any JSON endpoint that returns a Bitcoin price. The path points at the price field, in dot notation.',
        });
        page.add(customGroup);

        const urlRow = new Adw.EntryRow({title: 'API URL'});
        settings.bind('custom-url', urlRow, 'text', Gio.SettingsBindFlags.DEFAULT);
        customGroup.add(urlRow);

        const pathRow = new Adw.EntryRow({title: 'JSON path'});
        settings.bind('custom-path', pathRow, 'text', Gio.SettingsBindFlags.DEFAULT);
        customGroup.add(pathRow);

        const prefixRow = new Adw.EntryRow({title: 'Display prefix'});
        settings.bind('custom-prefix', prefixRow, 'text', Gio.SettingsBindFlags.DEFAULT);
        customGroup.add(prefixRow);

        const examplesExpander = new Adw.ExpanderRow({title: 'Examples'});
        customGroup.add(examplesExpander);

        const examples = [
            {name: 'mempool.space',   url: 'https://mempool.space/api/v1/prices',         path: 'USD',      prefix: '$'},
            {name: 'Gemini',          url: 'https://api.gemini.com/v1/pubticker/btcusd',  path: 'last',     prefix: '$'},
            {name: 'Blockchain.com',  url: 'https://blockchain.info/ticker',              path: 'USD.last', prefix: '$'},
        ];

        for (const ex of examples) {
            const row = new Adw.ActionRow({
                title: ex.name,
                subtitle: `${ex.url}\npath: ${ex.path}    prefix: ${ex.prefix}`,
            });
            const loadBtn = new Gtk.Button({
                label: 'Load',
                valign: Gtk.Align.CENTER,
            });
            loadBtn.add_css_class('flat');
            loadBtn.connect('clicked', () => {
                settings.set_string('custom-url', ex.url);
                settings.set_string('custom-path', ex.path);
                settings.set_string('custom-prefix', ex.prefix);
            });
            row.add_suffix(loadBtn);
            row.activatable_widget = loadBtn;
            examplesExpander.add_row(row);
        }

        const updateCustomVisible = () => {
            customGroup.visible = settings.get_string('source-preset') === 'custom';
        };
        settings.connect('changed::source-preset', updateCustomVisible);
        updateCustomVisible();

        const refreshGroup = new Adw.PreferencesGroup({title: 'Refresh'});
        page.add(refreshGroup);

        const refreshRow = new Adw.SpinRow({
            title: 'Refresh interval',
            subtitle: 'How often to fetch the price, in seconds',
            adjustment: new Gtk.Adjustment({lower: 60, upper: 3600, step_increment: 30}),
        });
        settings.bind('refresh-seconds', refreshRow, 'value', Gio.SettingsBindFlags.DEFAULT);
        refreshGroup.add(refreshRow);

        const positionGroup = new Adw.PreferencesGroup({title: 'Position'});
        page.add(positionGroup);

        const boxIds = BOXES.map(b => b.id);
        const boxRow = new Adw.ComboRow({
            title: 'Panel box',
            model: Gtk.StringList.new(BOXES.map(b => b.label)),
        });
        boxRow.selected = Math.max(0, boxIds.indexOf(settings.get_string('panel-box')));
        boxRow.connect('notify::selected', () => {
            settings.set_string('panel-box', boxIds[boxRow.selected]);
        });
        positionGroup.add(boxRow);

        const indexRow = new Adw.SpinRow({
            title: 'Position within the box',
            subtitle: 'Lower numbers sit further to the outside of the chosen box',
            adjustment: new Gtk.Adjustment({lower: 0, upper: 20, step_increment: 1}),
        });
        settings.bind('panel-index', indexRow, 'value', Gio.SettingsBindFlags.DEFAULT);
        positionGroup.add(indexRow);

        const appearanceGroup = new Adw.PreferencesGroup({title: 'Appearance'});
        page.add(appearanceGroup);

        const customColorsRow = new Adw.SwitchRow({title: 'Use custom colors'});
        settings.bind('use-custom-colors', customColorsRow, 'active', Gio.SettingsBindFlags.DEFAULT);
        appearanceGroup.add(customColorsRow);

        const textColorButton = new Gtk.ColorDialogButton({
            dialog: new Gtk.ColorDialog(),
            rgba: hexToRgba(settings.get_string('text-color')),
        });
        textColorButton.connect('notify::rgba', () => {
            settings.set_string('text-color', rgbaToHex(textColorButton.rgba));
        });
        const textColorRow = new Adw.ActionRow({title: 'Text color', activatable_widget: textColorButton});
        textColorRow.add_suffix(textColorButton);
        settings.bind('use-custom-colors', textColorRow, 'sensitive', Gio.SettingsBindFlags.GET);
        appearanceGroup.add(textColorRow);

        const bgColorButton = new Gtk.ColorDialogButton({
            dialog: new Gtk.ColorDialog(),
            rgba: hexToRgba(settings.get_string('background-color')),
        });
        bgColorButton.connect('notify::rgba', () => {
            settings.set_string('background-color', rgbaToHex(bgColorButton.rgba));
        });
        const bgColorRow = new Adw.ActionRow({title: 'Background color', activatable_widget: bgColorButton});
        bgColorRow.add_suffix(bgColorButton);
        settings.bind('use-custom-colors', bgColorRow, 'sensitive', Gio.SettingsBindFlags.GET);
        appearanceGroup.add(bgColorRow);

        const radiusRow = new Adw.SpinRow({
            title: 'Corner radius',
            subtitle: 'Rounded corners of the label background, in pixels',
            adjustment: new Gtk.Adjustment({lower: 0, upper: 20, step_increment: 1}),
        });
        settings.bind('label-radius', radiusRow, 'value', Gio.SettingsBindFlags.DEFAULT);
        appearanceGroup.add(radiusRow);
    }
}
