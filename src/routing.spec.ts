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
        expandNetwork: jest.fn(),
    };

    beforeEach(() => {
        jest.clearAllMocks();
    })

    describe("constructor", () => {
        it("should not be affected if the original network is mutated after construction", () => {
            const inputNetwork: FeatureCollection<LineString> = {
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

            const routing = new Routing({ network: inputNetwork, routeFinder: mockRouteFinder });

            // Mutate the original object after construction
            inputNetwork.features.pop();

            // Routing should still behave as if the original feature exists
            expect(routing.getClosestNetworkCoordinate([0, 0])).toEqual([0, 0]);
            expect(routing.getClosestNetworkCoordinate([1, 1])).toEqual([1, 1]);

            expect(routing.getRoute([0, 0], [1, 1])).toEqual({
                type: "Feature",
                geometry: {
                    type: "LineString",
                    coordinates: [
                        [0, 0],
                        [1, 1],
                    ],
                },
                properties: {},
            });
        });
    });

    describe("getClosestNetworkCoordinate", () => {
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

        it("should still return a closest coordinate when a network repeats points", () => {
            const networkWithDuplicates: FeatureCollection<LineString> = {
                type: "FeatureCollection",
                features: [
                    {
                        type: "Feature",
                        geometry: {
                            type: "LineString",
                            coordinates: [
                                [0, 0],
                                [1, 1],
                                [1, 1],
                            ],
                        },
                        properties: {},
                    },
                ],
            };

            const routing = new Routing({ network: networkWithDuplicates, routeFinder: mockRouteFinder });
            expect(routing.getClosestNetworkCoordinate([1, 1])).toEqual([1, 1]);
        });
    });

    describe("getRoute", () => {
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

        it("should not call the route finder again when the previous result was null and useCache is true", () => {
            const nullRouteFinder = {
                getRoute: jest.fn().mockReturnValue(null),
                setNetwork: jest.fn(),
                expandNetwork: jest.fn(),
            };

            const routing = new Routing({ network, routeFinder: nullRouteFinder, useCache: true });

            expect(routing.getRoute([0, 0], [1, 1])).toBeNull();
            expect(routing.getRoute([0, 0], [1, 1])).toBeNull();
            // Result is already calculated as null, so we only call once
            expect(nullRouteFinder.getRoute).toHaveBeenCalledTimes(1);
        });

        it("should return a new route if cache is disabled", () => {
            const routing = new Routing({ network, routeFinder: mockRouteFinder, useCache: false });

            routing.getRoute([0, 0], [1, 1]);
            routing.getRoute([0, 0], [1, 1]);

            expect(mockRouteFinder.getRoute).toHaveBeenCalledTimes(2);
        });
    });

    describe("setNetwork", () => {
        it("should clear the route cache when the network is replaced", () => {
            const routing = new Routing({ network, routeFinder: mockRouteFinder, useCache: true });

            routing.getRoute([0, 0], [1, 1]);
            expect(mockRouteFinder.getRoute).toHaveBeenCalledTimes(1);

            // Warm cache
            routing.getRoute([0, 0], [1, 1]);
            expect(mockRouteFinder.getRoute).toHaveBeenCalledTimes(1);

            const newNetwork: FeatureCollection<LineString> = {
                type: "FeatureCollection",
                features: [
                    {
                        type: "Feature",
                        geometry: {
                            type: "LineString",
                            coordinates: [
                                [10, 10],
                                [11, 11],
                            ],
                        },
                        properties: {},
                    },
                ],
            };

            routing.setNetwork(newNetwork);

            // Cache should be cleared, so it calls through again.
            routing.getRoute([0, 0], [1, 1]);
            expect(mockRouteFinder.getRoute).toHaveBeenCalledTimes(2);
        });

        it("should not be affected if the original network is mutated after setNetwork", () => {
            const terraRoute = new TerraRoute();
            terraRoute.buildRouteGraph(network);

            const routing = new Routing({
                network,
                routeFinder: {
                    getRoute: terraRoute.getRoute.bind(terraRoute),
                    setNetwork: terraRoute.buildRouteGraph.bind(terraRoute),
                    expandNetwork: terraRoute.expandRouteGraph.bind(terraRoute),
                },
            });

            const replacementNetwork: FeatureCollection<LineString> = {
                type: "FeatureCollection",
                features: [
                    {
                        type: "Feature",
                        geometry: {
                            type: "LineString",
                            coordinates: [
                                [10, 10],
                                [11, 11],
                            ],
                        },
                        properties: {},
                    },
                ],
            };

            routing.setNetwork(replacementNetwork);

            // Mutate the original object after setNetwork
            replacementNetwork.features.pop();

            // Routing should still behave as if the replacement feature exists
            expect(routing.getClosestNetworkCoordinate([10, 10])).toEqual([10, 10]);
            expect(routing.getClosestNetworkCoordinate([11, 11])).toEqual([11, 11]);

            expect(routing.getRoute([10, 10], [11, 11])).toEqual({
                type: "Feature",
                geometry: {
                    type: "LineString",
                    coordinates: [
                        [10, 10],
                        [11, 11],
                    ],
                },
                properties: {},
            });

        });
    });

    describe("expandRouteNetwork", () => {
        it("should clear the route cache when the network is expanded", () => {
            const routing = new Routing({
                network,
                routeFinder: mockRouteFinder,
                useCache: true,
            });

            const additionalNetwork: FeatureCollection<LineString> = {
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

            const getRouteSpy = jest.spyOn(
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                (routing as any).routeFinder,
                "getRoute"
            );

            routing.getRoute([0, 0], [1, 1]);
            routing.getRoute([0, 0], [1, 1]);
            expect(getRouteSpy).toHaveBeenCalledTimes(1);

            routing.expandRouteNetwork(additionalNetwork);

            // Cache should be cleared after expansion.
            routing.getRoute([0, 0], [1, 1]);
            expect(getRouteSpy).toHaveBeenCalledTimes(2);
        });

        it("should expand the route network and re-index points", () => {
            const routing = new Routing({
                network,
                routeFinder: mockRouteFinder,
                useCache: true,
            });

            expect(routing.getClosestNetworkCoordinate([2, 2])).toEqual([1, 1]);

            const additionalNetwork: FeatureCollection<LineString> = {
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

            const expandSpy = jest.spyOn(
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                (routing as any).routeFinder,
                "expandNetwork"
            );
            routing.expandRouteNetwork(additionalNetwork);

            expect(expandSpy).toHaveBeenCalledWith(additionalNetwork);

            expect(routing.getClosestNetworkCoordinate([1, 1])).toEqual([1, 1]);
            expect(routing.getClosestNetworkCoordinate([2, 2])).toEqual([2, 2]);
            expect(routing.getClosestNetworkCoordinate([3, 3])).toEqual([3, 3]);

        });
    });

    describe("integration (TerraRoute)", () => {
        it('should update the network correctly with real a route finder', () => {
            const terraRoute = new TerraRoute();
            terraRoute.buildRouteGraph(network);

            const routing = new Routing({
                network, routeFinder: {
                    getRoute: terraRoute.getRoute.bind(terraRoute),
                    setNetwork: terraRoute.buildRouteGraph.bind(terraRoute),
                    expandNetwork: terraRoute.expandRouteGraph.bind(terraRoute)
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

        it('should be able to route after expanding the network', () => {
            const terraRoute = new TerraRoute();
            terraRoute.buildRouteGraph(network);

            const routing = new Routing({
                network, routeFinder: {
                    getRoute: terraRoute.getRoute.bind(terraRoute),
                    setNetwork: terraRoute.buildRouteGraph.bind(terraRoute),
                    expandNetwork: terraRoute.expandRouteGraph.bind(terraRoute)
                }
            });

            jest.spyOn(routing, "expandRouteNetwork");

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

            routing.expandRouteNetwork(newNetwork);

            expect(routing.expandRouteNetwork).toHaveBeenCalledWith(newNetwork);

            const newRoute = routing.getRoute([2, 2], [3, 3]);
            expect(newRoute?.geometry.coordinates).toEqual([[2, 2], [3, 3]]);
            expect(routing.getRoute([0, 0], [1, 1])).toEqual({
                type: "Feature",
                geometry: {
                    type: "LineString",
                    coordinates: [
                        [0, 0],
                        [1, 1],
                    ],
                },
                properties: {},
            });

            // 1, 1 is not connected to 2, 2
            expect(routing.getRoute([0, 0], [3, 3])).toBeNull();
        });
    });
});
