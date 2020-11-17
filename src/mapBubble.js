/* -*- Mode: JS2; indent-tabs-mode: nil; js2-basic-offset: 4 -*- */
/* vim: set et ts=4 sw=4: */
/*
 * Copyright (c) 2014 Damián Nohales
 *
 * GNOME Maps is free software; you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by the
 * Free Software Foundation; either version 2 of the License, or (at your
 * option) any later version.
 *
 * GNOME Maps is distributed in the hope that it will be useful, but
 * WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY
 * or FITNESS FOR A PARTICULAR PURPOSE.  See the GNU General Public License
 * for more details.
 *
 * You should have received a copy of the GNU General Public License along
 * with GNOME Maps; if not, see <http://www.gnu.org/licenses/>.
 *
 * Author: Damián Nohales <damiannohales@gmail.com>
 */

const Gio = imports.gi.Gio;
const GLib = imports.gi.GLib;
const GObject = imports.gi.GObject;
const Gtk = imports.gi.Gtk;
const Mainloop = imports.mainloop;

const Application = imports.application;
const ContactPlace = imports.contactPlace;
const GeocodeFactory = imports.geocode;
const OSMAccountDialog = imports.osmAccountDialog;
const OSMEditDialog = imports.osmEditDialog;
const OSMUtils = imports.osmUtils;
const Place = imports.place;
const PlaceFormatter = imports.placeFormatter;
const PlaceStore = imports.placeStore;
const SendToDialog = imports.sendToDialog;
const Utils = imports.utils;

/* Maximum width of the popover content before it's forced to wrap */
const MAX_CONTENT_WIDTH = 300;
/* Margin between the height of the main window and the height of the popover
   contents */
const HEIGHT_MARGIN = 100;

var Button = {
    NONE: 0,
    ROUTE: 2,
    SEND_TO: 4,
    FAVORITE: 8,
    CHECK_IN: 16,
    EDIT_ON_OSM: 32,
};

var MapBubble = GObject.registerClass({ Abstract: true },
class MapBubble extends Gtk.Popover {

    _init(params) {
        this._place = params.place;
        delete params.place;

        this._mapView = params.mapView;
        params.relative_to = params.mapView;
        params.transitions_enabled = false;
        delete params.mapView;

        let buttonFlags = params.buttons || Button.NONE;
        delete params.buttons;

        params.modal = false;

        super._init(params);
        let ui = Utils.getUIObject('map-bubble', [ 'bubble-main-box',
                                                   'bubble-spinner',
                                                   'bubble-thumbnail',
                                                   'thumbnail-separator',
                                                   'label-title',
                                                   'contact-avatar',
                                                   'address-label',
                                                   'bubble-main-stack',
                                                   'bubble-content-area',
                                                   'bubble-button-area',
                                                   'bubble-route-button',
                                                   'bubble-send-to-button',
                                                   'bubble-send-to-button-alt',
                                                   'title-box',
                                                   'bubble-favorite-button',
                                                   'bubble-edit-button',
                                                   'bubble-favorite-button-image']);
        this._title = ui.labelTitle;
        this._thumbnail = ui.bubbleThumbnail;
        this._thumbnailSeparator = ui.thumbnailSeparator;
        this._content = ui.bubbleContentArea;
        this._mainStack = ui.bubbleMainStack;
        this._spinner = ui.bubbleSpinner;
        this._mainBox = ui.bubbleMainBox;
        this._contactAvatar = ui.contactAvatar;
        this._addressLabel = ui.addressLabel;

        if (!buttonFlags)
            ui.bubbleButtonArea.visible = false;
        else {
            if (buttonFlags & Button.ROUTE)
                this._initRouteButton(ui.bubbleRouteButton);
            if (buttonFlags & Button.SEND_TO)
                this._initSendToButton(ui.bubbleSendToButton, buttonFlags & Button.CHECK_IN);
            if (buttonFlags & Button.FAVORITE)
                this._initFavoriteButton(ui.bubbleFavoriteButton, ui.bubbleFavoriteButtonImage);
            if (buttonFlags & Button.EDIT_ON_OSM)
                this._initEditButton(ui.bubbleEditButton);
        }

        if (this.place.isCurrentLocation) {
            /* Current Location bubbles have a slightly different layout, to
               avoid awkward whitespace */

            /* hide the normal button area */
            ui.bubbleButtonArea.visible = false;
            /* show the top-end-corner share button instead */
            this._initSendToButton(ui.bubbleSendToButtonAlt, buttonFlags & Button.CHECK_IN);
            /* adjust some margins */
            ui.titleBox.margin = 12;
            ui.titleBox.marginStart = 18;
            ui.titleBox.spacing = 18;
        }

        let scrolledWindow = new MapBubbleScrolledWindow({ visible: true,
                                                           propagateNaturalWidth: true,
                                                           propagateNaturalHeight: true,
                                                           hscrollbarPolicy: Gtk.PolicyType.NEVER });
        scrolledWindow.add(this._mainStack);
        this.add(scrolledWindow);

        /* Set up contact avatar */
        if (this.place instanceof ContactPlace.ContactPlace) {
            this._contactAvatar.visible = true;
            Utils.load_icon(this.place.icon, 32, (pixbuf) => {
                this._contactAvatar.set_image_load_func((size) => Utils.loadAvatar(pixbuf, size));
            });
        }

        this.get_style_context().add_class("map-bubble");

        this.updatePlaceDetails();
    }

    get place() {
        return this._place;
    }

    get content() {
        return this._content;
    }

    get thumbnail() {
        return this._thumbnail.pixbuf;
    }

    set thumbnail(val) {
        if (val) {
            this._thumbnail.pixbuf = val;
            this._thumbnail.visible = true;
            this._thumbnailSeparator.visible = true;
        }
    }

    get loading() {
        return this._spinner.active;
    }
    set loading(val) {
        this._mainStack.set_visible_child(val ? this._spinner : this._mainBox);
        this._spinner.active = val;
    }

    updatePlaceDetails() {
        let place = this.place;
        let formatter = new PlaceFormatter.PlaceFormatter(place);

        let address = formatter.rows.map((row) => {
            row = row.map(function(prop) {
                return GLib.markup_escape_text(place[prop], -1);
            });
            return row.join(', ');
        });
        if (address.length > 0) {
            this._addressLabel.label = address.join('\n');
            this._addressLabel.show();
        } else {
            this._addressLabel.hide();
        }

        this._title.label = formatter.title;
        this._contactAvatar.text = formatter.title;
    }

    _initFavoriteButton(button, image) {
        let placeStore = Application.placeStore;
        button.visible = true;

        if (placeStore.exists(this._place,
                              PlaceStore.PlaceType.FAVORITE)) {
            image.icon_name = 'starred-symbolic';
        } else {
            image.icon_name = 'non-starred-symbolic';
        }

        button.connect('clicked', () => {
            if (placeStore.exists(this._place,
                                  PlaceStore.PlaceType.FAVORITE)) {
                image.icon_name = 'non-starred-symbolic';
                placeStore.removePlace(this._place,
                                       PlaceStore.PlaceType.FAVORITE);
            } else {
                image.icon_name = 'starred-symbolic';
                placeStore.addPlace(this._place,
                                    PlaceStore.PlaceType.FAVORITE);
            }
        });
    }

    _initSendToButton(button, showCheckIn) {
        button.visible = true;
        button.connect('clicked', () => {
            let dialog = new SendToDialog.SendToDialog({ transient_for: this.get_toplevel(),
                                                         modal: true,
                                                         mapView: this._mapView,
                                                         place: this._place,
                                                         showCheckIn });
            dialog.connect('response', () => dialog.destroy());
            dialog.show();
        });
    }

    _initRouteButton(button) {
        let query = Application.routeQuery;
        let from = query.points[0];
        let to = query.points[query.points.length - 1];

        button.visible = true;

        button.connect('clicked', () => {
            query.freeze_notify();
            query.reset();
            Application.routingDelegator.reset();

            if (Application.geoclue.place)
                from.place = Application.geoclue.place;
            to.place = this._place;

            this.destroy();
            query.thaw_notify();
        });
    }

    _initEditButton(button) {
        button.visible = true;
        button.connect('clicked', this._onEditClicked.bind(this));
    }

    _onEditClicked() {
        let osmEdit = Application.osmEdit;
        /* if the user is not already signed in, show the account dialog */
        if (!osmEdit.isSignedIn) {
            let dialog = osmEdit.createAccountDialog(this.get_toplevel(), true);

            dialog.show();
            dialog.connect('response', (dialog, response) => {
                dialog.destroy();
                if (response === OSMAccountDialog.Response.SIGNED_IN)
                    this._edit();
            });

            return;
        }

        this._edit();
    }

    _edit() {
        let osmEdit = Application.osmEdit;
        let dialog = osmEdit.createEditDialog(this.get_toplevel(), this._place);

        dialog.show();
        dialog.connect('response', (dialog, response) => {
            dialog.destroy();

            switch (response) {
            case OSMEditDialog.Response.UPLOADED:
                // update place
                let object = osmEdit.object;
                OSMUtils.updatePlaceFromOSMObject(this._place, object);
                // refresh place view
                this._clearView();
                this._populate(this._place);
                break;
            default:
                break;
            }
        });
    }
});

var MapBubbleScrolledWindow = GObject.registerClass(
class MapBubbleScrolledWindow extends Gtk.ScrolledWindow {
    vfunc_get_preferred_width() {
        let [min, nat] = this.get_child().get_preferred_width();
        min = Math.min(min, MAX_CONTENT_WIDTH);
        nat = Math.min(nat, MAX_CONTENT_WIDTH);
        return [min, nat];
    }

    vfunc_get_preferred_height_for_width(width) {
        let windowHeight = this.get_toplevel().get_allocated_height() - HEIGHT_MARGIN;
        let [min, nat] = this.get_child().get_preferred_height_for_width(width);
        min = Math.min(min, windowHeight);
        nat = Math.min(nat, windowHeight);
        return [min, nat];
    }

    vfunc_draw(cr) {
        let popover = this.get_ancestor(Gtk.Popover);
        if (popover) {
            let [{x, y, width, height}, baseline] = this.get_allocated_size();

            // clip the top corners to the rounded corner
            let radius = popover.get_style_context()
                                .get_property(Gtk.STYLE_PROPERTY_BORDER_RADIUS, popover.get_state_flags())
                                * this.scale_factor;

            // bottom left
            cr.moveTo(0, height);
            cr.lineTo(0, radius);
            cr.arc(radius, radius, radius, Math.PI, -Math.PI / 2.0);
            cr.arc(width - radius, radius, radius, -Math.PI / 2.0, 0);
            cr.lineTo(width, height);

            cr.clip();
        }

        return super.vfunc_draw(cr);
    }
});

