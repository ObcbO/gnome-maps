/* -*- Mode: JS2; indent-tabs-mode: nil; js2-basic-offset: 4 -*- */
/* vim: set et ts=4 sw=4: */
/*
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
 * Author: Jonas Danielsson <jonas@threetimestwo.org>
 */

import gettext from 'gettext';

import Gdk from 'gi://Gdk';
import GObject from 'gi://GObject';
import Gtk from 'gi://Gtk';

import {Application} from './application.js';
import {PlaceEntry} from './placeEntry.js';
import {RouteQuery} from './routeQuery.js';

const _ = gettext.gettext;

export class RouteEntry extends Gtk.Grid {

    static Type = {
        FROM: 0,
        TO: 1,
        VIA: 2
    }

    constructor(params) {
        let type = params.type;
        delete params.type;

        let point = params.point ?? null;
        delete params.point;

        let mapView = params.mapView ?? null;
        delete params.mapView;

        super(params);

        this._type = type;
        this._point = point;
        this._mapView = mapView;
        this.entry = this._createEntry();
        this._entryGrid.attach(this.entry, 0, 0, 1, 1);

        // There is no GdkWindow on the widget until it is realized
        this._icon.connect('realize', function(icon) {
            if (icon.window && icon.window.get_cursor())
                return;

            icon.window.set_cursor(Gdk.Cursor.new(Gdk.CursorType.HAND1));
        });

        switch (this._type) {
        case RouteEntry.Type.FROM:
            let query = Application.routeQuery;
            this._buttonImage.icon_name = 'list-add-symbolic';
            this._icon.icon_name = 'maps-point-start-symbolic';
            /* Translators: this is add via location tooltip */
            this._button.tooltip_text = _("Add via location");
            query.connect('notify::points', () => {
                this._button.sensitive = query.points.length < RouteQuery.MAX_QUERY_POINTS;
            });

            break;
        case RouteEntry.Type.VIA:
            this._buttonImage.icon_name = 'list-remove-symbolic';
            this._icon.icon_name = 'maps-point-end-symbolic';
            /* Translators: this is remove via location tooltip */
            this._button.tooltip_text = _("Remove via location");
            break;
        case RouteEntry.Type.TO:
            this._buttonImage.icon_name = 'route-reverse-symbolic';
            this._icon.icon_name = 'maps-point-end-symbolic';
            /* Translators: this is reverse route tooltip */
            this._button.tooltip_text = _("Reverse route");
            break;
        }
    }

    get button() {
        return this._button;
    }

    get point() {
        return this._point;
    }

    _createEntry() {
        let entry = new PlaceEntry({ visible: true,
                                     can_focus: true,
                                     hexpand: true,
                                     receives_default: true,
                                     mapView: this._mapView,
                                     maxChars: 15 });
        if (this._point) {
            entry.bind_property('place',
                                this._point, 'place',
                                GObject.BindingFlags.BIDIRECTIONAL);
        }

        return entry;
    }
}

GObject.registerClass({
    Template: 'resource:///org/gnome/Maps/ui/route-entry.ui',
    Children: [ 'iconEventBox' ],
    InternalChildren: [ 'entryGrid',
                        'icon',
                        'button',
                        'buttonImage' ]
}, RouteEntry);
