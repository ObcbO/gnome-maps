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
 * Author: Amisha Singla <amishas157@gmail.com>
 */

import GLib from 'gi://GLib';
import Gtk from 'gi://Gtk';

import {Application} from './application.js';
import {LongPrintLayout} from './longPrintLayout.js';
import {ShortPrintLayout} from './shortPrintLayout.js';
import {TransitPrintLayout} from './transitPrintLayout.js';
import * as Utils from './utils.js';

const _MIN_TIME_TO_ABORT = 3000;

/* Following constant has unit as meters */
const _SHORT_LAYOUT_MAX_DISTANCE = 3000;

export class PrintOperation {

    constructor(params) {
        this._mainWindow = params.mainWindow;
        delete params.mainWindow;

        this._operation = new Gtk.PrintOperation({ embed_page_setup: true });
        this._operation.connect('begin-print', this._beginPrint.bind(this));
        this._operation.connect('paginate', this._paginate.bind(this));
        this._operation.connect('draw-page', this._drawPage.bind(this));

        this._abortDialog = new Gtk.MessageDialog({
            transient_for: this._mainWindow,
            destroy_with_parent: true,
            message_type: Gtk.MessageType.OTHER,
            modal: true,
            text: _("Loading map tiles for printing"),
            secondary_text: _("You can abort printing if this takes too long")
        });
        this._abortDialog.add_button(_("Abort printing"),
                                     Gtk.ResponseType.CANCEL);
        this._responseId = this._abortDialog.connect('response',
                                                     this.onAbortDialogResponse.bind(this));

        this._runPrintOperation();
    }

    _beginPrint(operation, context, data) {
        let route = Application.routingDelegator.graphHopper.route;
        let selectedTransitItinerary =
            Application.routingDelegator.transitRouter.plan.selectedItinerary;
        let width = context.get_width();
        let height = context.get_height();

        GLib.timeout_add(null, _MIN_TIME_TO_ABORT, () => {
            if (!this._layout.renderFinished) {
                this._abortDialog.show();
            }
            return false;
        }, null);

        if (selectedTransitItinerary) {
            this._layout =
                new TransitPrintLayout({ itinerary: selectedTransitItinerary,
                                         pageWidth: width,
                                         pageHeight: height });
        } else {
            if (route.distance > _SHORT_LAYOUT_MAX_DISTANCE) {
                return new LongPrintLayout({ route: route,
                                             pageWidth: pageWidth,
                                             pageHeight: pageHeight });
            } else {
                return new ShortPrintLayout({ route: route,
                                              pageWidth: pageWidth,
                                              pageHeight: pageHeight });
            }
        }
        this._layout.render();
    }

    onAbortDialogResponse(dialog, response) {
        if (response === Gtk.ResponseType.DELETE_EVENT ||
            response === Gtk.ResponseType.CANCEL) {
            this._abortDialog.disconnect(this._responseId);
            this._operation.cancel();
            this._abortDialog.close();
        }
    }

    _paginate(operation, context) {
        if (this._layout.renderFinished) {
            operation.set_n_pages(this._layout.numPages);
            this._abortDialog.close();
        }
        return this._layout.renderFinished;
    }

    _drawPage(operation, context, page_num, data) {
        let cr = context.get_cairo_context();
        this._layout.surfaceObjects[page_num].forEach((so) => {
            cr.setSourceSurface(so.surface, so.x, so.y);
            cr.paint();
        });
    }

    _runPrintOperation() {
        try {
            let result = this._operation.run(Gtk.PrintOperationAction.PRINT_DIALOG,
                                             this._mainWindow);
            if (result === Gtk.PrintOperationResult.ERROR) {
                let error = this._operation.get_error();
                Utils.debug('Failed to print: %s'.format(error));
            }
        } catch(e) {
            Utils.debug('Failed to print: %s'.format(e.message));
        }
    }
}
