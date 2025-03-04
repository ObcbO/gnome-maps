/* -*- Mode: JS2; indent-tabs-mode: nil; js2-basic-offset: 4 -*- */
/* vim: set et ts=4 sw=4: */
/*
 * Copyright (c) 2020 Marcus Lundblad
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
 * Author: Marcus Lundblad <ml@update.uu.se>
 */

const JsUnit = imports.jsUnit;

import * as Time from './time.js';

function formatTimeWithTZOffsetTest() {
    // mock to always use 24 hour format
    Time._setIs12HourFunction(() => { return false; });

    JsUnit.assertEquals('22:54',
                        Time.formatTimeWithTZOffset(1607982864000, 3600000));
    JsUnit.assertEquals('21:54',
                        Time.formatTimeWithTZOffset(1607982864000, 0));

    // mock to always use 12 hour format
    Time._setIs12HourFunction(() => { return true; });

    JsUnit.assertEquals('10:54 PM',
                        Time.formatTimeWithTZOffset(1607982864000, 3600000));
}

function formatTimeFromHoursAndMinsTest() {
    // mock to always use 24 hour format
    Time._setIs12HourFunction(() => { return false; });

    JsUnit.assertEquals('12:34', Time.formatTimeFromHoursAndMins(12, 34));
    JsUnit.assertEquals('00:00', Time.formatTimeFromHoursAndMins(24, 0));
    JsUnit.assertEquals('12:01', Time.formatTimeFromHoursAndMins(12, 1));

    // mock to always use 12 hour format
    Time._setIs12HourFunction(() => { return true; });

    JsUnit.assertEquals('12:34 PM', Time.formatTimeFromHoursAndMins(12, 34));
    JsUnit.assertEquals('12:00 AM', Time.formatTimeFromHoursAndMins(24, 0));
    JsUnit.assertEquals('12:01 PM', Time.formatTimeFromHoursAndMins(12, 1));
}

formatTimeWithTZOffsetTest();
formatTimeFromHoursAndMinsTest();
