/* -*- Mode: JS2; indent-tabs-mode: nil; js2-basic-offset: 4 -*- */
/* vim: set et ts=4 sw=4: */
/*
 * Copyright (c) 2019 Marcus Lundblad
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

import GLib from 'gi://GLib';

import {BoundingBox} from './boundingBox.js';
import * as Service from './service.js';
import {Plan} from './transitPlan.js';
import * as Utils from './utils.js';

// plugins
import {GoMetro} from './transitplugins/goMetro.js';
import {OpendataCH} from './transitplugins/opendataCH.js';
import {OpenTripPlanner} from './transitplugins/openTripPlanner.js';
import {Resrobot} from './transitplugins/resrobot.js';


/**
 * Class responsible for delegating requests to perform routing in transit
 * mode.
 * Holds the the shared plan instance (filled with journeys on successful
 * requests).
 */
export class TransitRouter {
    constructor(params) {
        this._plan = new Plan();
        this._query = params.query;
        this._providers = Service.getService().transitProviders;
        this._providerCache = [];
        this._language = Utils.getLanguage();
    }

    get enabled() {
        return this._providers !== undefined;
    }

    get plan() {
        return this._plan;
    }

    /**
     * Called when the query has been updated to trigger the first set
     * of results-
     */
    fetchFirstResults() {
        let pluginOverride = GLib.getenv('TRANSIT_PLUGIN');

        if (pluginOverride) {
            // override plugin was specified, try instanciating if not done yet
            if (!this._currPluginInstance) {
                try {
                    this._currentPluginInstance =
                        eval(`new ${pluginOverride}()`);
                } catch (e) {
                    Utils.debug('Unable to instanciate plugin: ' + pluginOverride);
                    throw e;
                }
            }
        } else {
            let bestProvider = this._getBestProviderForQuery();

            this._currPluginInstance = null;

            if (bestProvider) {
                let provider = bestProvider[0];

                this._currPluginInstance = bestProvider[1];
                this._plan.attribution = this._getAttributionForProvider(provider);
                if (provider.attributionUrl)
                    this._plan.attributionUrl = provider.attributionUrl;
            }
        }

        if (this._currPluginInstance) {
            this._currPluginInstance.fetchFirstResults();
        } else {
            this._plan.reset();
            this._plan.noProvider();
        }
    }

    /**
     * Called to fetch additional (later or earlier) results depending on the
     * query settings.
     */
    fetchMoreResults() {
        if (this._currPluginInstance)
            this._currPluginInstance.fetchMoreResults();
        else
            throw new Error('No previous provider');
    }

    /**
     * Get attribution for a provider. Returns a language-specific
     * 'attribution:<lang>' tag if available, otherwise 'attribution'
     */
    _getAttributionForProvider(provider) {
        if (provider['attribution:' + this._language])
            return provider['attribution:' + this._language];
        else if (provider.attribution)
            return provider.attribution;
        else
            return null;
    }

    _getMatchingProvidersForPlace(place) {
        let location = place.location;
        let country = place.country_code ??
                      Utils.getCountryCodeForCoordinates(location.latitude,
                                                         location.longitude);

        let matchingProviders = [];

        this._providers.forEach((p) => {
            let provider = p.provider;
            let areas = provider.areas;

            if (!areas) {
                Utils.debug('No coverage info for provider ' + provider.name);
                return;
            }

            areas.forEach((area) => {
                /* if the area has a specified priority, override the
                 * overall area priority, this allows sub-areas of of
                 * coverage for a provider to have higher or lowe priorities
                 * than other providers (e.g. one "native" to that area
                 */
                if (area.priority)
                    provider.priority = area.priority;

                let countries = area.countries;

                if (countries) {
                    if (countries.includes(country)) {
                        matchingProviders[provider.name] = provider;
                        return;
                    }
                }

                let bbox = area.bbox;

                if (bbox) {
                    if (bbox.length !== 4) {
                        Utils.debug('malformed bounding box for provider ' + provider.name);
                        return;
                    }

                    let [x1, y1, x2, y2] = bbox;
                    let cbbox = new BoundingBox({ bottom: x1,
                                                  left: y1,
                                                  top: x2,
                                                  right: y2 });

                    if (cbbox.covers(location.latitude,
                                     location.longitude)) {
                        matchingProviders[provider.name] = provider;
                        return;
                    }
                }
            });
        });

        return matchingProviders;
    }

    /**
     * Get the most preferred provider for a given query.
     * Return: an array with the provider definition and the plugin instance,
     *         or null if no matching provider was found.
     */
    _getBestProviderForQuery() {
        let startPlace = this._query.filledPoints[0].place;
        let endPlace = this._query.filledPoints.last().place;

        let matchingProvidersForStart =
            this._getMatchingProvidersForPlace(startPlace);
        let matchingProvidersForEnd =
            this._getMatchingProvidersForPlace(endPlace);

        let matchingProviders = [];

        // check all candidate providers matching on the start location
        for (let name in matchingProvidersForStart) {
            let providerAtStart = matchingProvidersForStart[name];
            let providerAtEnd = matchingProvidersForEnd[name];

            /* if the provider also matches on the end location, consider it
             * as a potential candidate
             */
            if (providerAtEnd) {
                let order = this._sortProviders(providerAtStart, providerAtEnd);

                /* add the provider at it lowest priority to favor higher
                 * priority providers in "fringe cases"
                 */
                if (order < 0)
                    matchingProviders.push(providerAtStart);
                else
                    matchingProviders.push(providerAtEnd);
            }
        }

        matchingProviders.sort(this._sortProviders);

        for (let i = 0; i < matchingProviders.length; i++) {
            let provider = matchingProviders[i];
            let plugin = provider.plugin;

            if (this._providerCache[provider.name])
                return [provider, this._providerCache[provider.name]];

            try {
                let params = provider.params;
                let instance =
                    params ? eval(`new ${plugin}(params)`):
                             eval(`new ${plugin}()`);

                this._providerCache[provider.name] = instance;

                return [provider, instance];
            } catch (e) {
                Utils.debug('Failed to instantiate transit plugin: ' +
                            plugin + ": " + e);
            }
        }

        Utils.debug('No suitable transit provider found');
        return null;
    }

    /**
     * Sort function to sort providers in by preference.
     * If both providers have a priority set, prefers the one with a lower
     * value (higher prio), otherwise the one that has a priority set (if any),
     * else no specific order.
     */
    _sortProviders(p1, p2) {
        if (p1.priority && p2.priority)
            return p1.priority - p2.priority;
        else if (p1.priority)
            return -1;
        else if (p2.priority)
            return 1;
        else
            return 0;
    }
};
