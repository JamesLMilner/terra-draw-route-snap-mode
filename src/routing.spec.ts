import { Feature, LineString, FeatureCollection } from "geojson";
import { Routing } from "./routing";
import { TerraRoute } from "terra-route";

const mockRoute: Feature<LineString> = {
    type: "Feature",
    geometry: {
        type: "LineString",
        coordinates: [
            [0, 0],
            [1, 1],
        ],
    },
    properties: {},
};

describe("Routing", () => {
    const network: FeatureCollection<LineString> = {
        type: "FeatureCollection",
        features: [
            {
                type: "Feature",
                geometry: {
                    type: "LineString",
                    coordinates: [
                        [0, 0],
                        [1, 1],
                    ],
                },
                properties: {},
            },
        ],
    };

    const mockRouteFinder = {
        getRoute: jest.fn().mockReturnValue(mockRoute),
        setNetwork: jest.fn(),
    };

    it("should return null for empty network", () => {
        const routing = new Routing({
            network: {
                type: "FeatureCollection",
                features: [
                ],
            }, routeFinder: mockRouteFinder
        });

        const closest = routing.getClosestNetworkCoordinate([0, 0]);

        expect(closest).toEqual(null);
    });

    it("should find the closest network coordinate with exact match", () => {
        const routing = new Routing({ network, routeFinder: mockRouteFinder });

        const closest = routing.getClosestNetworkCoordinate([0, 0]);

        expect(closest).toEqual([0, 0]);
    });

    it("should find the closest network coordinate if not exact match", () => {
        const routing = new Routing({ network, routeFinder: mockRouteFinder });

        const closest = routing.getClosestNetworkCoordinate([0.1, 0.1]);

        expect(closest).toEqual([0, 0]);
    });

    it("should return a route and cache it if enabled", () => {
        const routing = new Routing({ network, routeFinder: mockRouteFinder, useCache: true });

        const route = routing.getRoute([0, 0], [1, 1]);

        expect(route).toEqual(mockRoute);
        expect(mockRouteFinder.getRoute).toHaveBeenCalledTimes(1);

        // Call again to hit cache
        const cachedRoute = routing.getRoute([0, 0], [1, 1]);

        expect(cachedRoute).toEqual(mockRoute);
        expect(mockRouteFinder.getRoute).toHaveBeenCalledTimes(1); // Still 1 because cache used
    });

    it("should return a new route if cache is disabled", () => {
        const routing = new Routing({ network, routeFinder: mockRouteFinder, useCache: false });

        routing.getRoute([0, 0], [1, 1]);
        routing.getRoute([0, 0], [1, 1]);

        expect(mockRouteFinder.getRoute).toHaveBeenCalledTimes(2);
    });

    it('should update the network correctly with real a route finder', () => {
        const terraRoute = new TerraRoute();
        terraRoute.buildRouteGraph(network);

        const routing = new Routing({
            network, routeFinder: {
                getRoute: terraRoute.getRoute.bind(terraRoute),
                setNetwork: terraRoute.buildRouteGraph.bind(terraRoute)
            }
        });

        jest.spyOn(routing, "setNetwork");

        const existingRoute = routing.getRoute([0, 0], [1, 1]);
        expect(existingRoute?.geometry.coordinates).toEqual([[0, 0], [1, 1]]);
        expect(routing.getRoute([2, 2], [3, 3])).toBeNull();

        const newNetwork: FeatureCollection<LineString> = {
            type: "FeatureCollection",
            features: [
                {
                    type: "Feature",
                    geometry: {
                        type: "LineString",
                        coordinates: [
                            [2, 2],
                            [3, 3],
                        ],
                    },
                    properties: {},
                },
            ],
        };

        routing.setNetwork(newNetwork);

        expect(routing.setNetwork).toHaveBeenCalledWith(newNetwork);

        const newRoute = routing.getRoute([2, 2], [3, 3]);
        expect(newRoute?.geometry.coordinates).toEqual([[2, 2], [3, 3]]);
        expect(routing.getRoute([0, 0], [1, 1])).toBeNull();
    });
});
