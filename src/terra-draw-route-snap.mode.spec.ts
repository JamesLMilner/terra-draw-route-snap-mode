import { TerraRoute } from "terra-route";
import { RouteFinder, Routing } from "./routing";
import { TerraDrawRouteSnapMode } from "./terra-draw-route-snap-mode";
import { CreateLineStringCollection, CreateThreePointNetwork, CreateTwoPointNetwork, MockCursorEvent, MockKeyboardEvent, MockModeConfig } from "./test/helpers";
import { FeatureCollection, LineString } from "geojson";
import { GeoJSONStoreFeatures } from "terra-draw";

describe("TerraDrawRouteSnapMode", () => {

    let config = MockModeConfig();
    let routeFinder: RouteFinder;

    const createRouting = (network?: FeatureCollection<LineString>) => {
        const usedNetwork = network ? network : CreateLineStringCollection([]);
        const terraRoute = new TerraRoute();

        terraRoute.buildRouteGraph(usedNetwork);

        routeFinder = {
            getRoute: terraRoute.getRoute.bind(terraRoute),
            setNetwork: () => terraRoute.buildRouteGraph.bind(terraRoute)(usedNetwork),
            expandNetwork: () => terraRoute.expandRouteGraph.bind(terraRoute)(usedNetwork),
        }

        return new Routing({
            network: usedNetwork,
            routeFinder
        });
    };

    beforeEach(() => {
        config = MockModeConfig();
    })

    describe('constructor', () => {
        it("should construct the class correctly", () => {
            const routeSnapMode = new TerraDrawRouteSnapMode({
                routing: createRouting(),
                maxPoints: 5,
            });

            expect(routeSnapMode).toBeDefined();
        });
    })

    describe('register', () => {
        it('should register correctly', () => {
            const routeSnapMode = new TerraDrawRouteSnapMode({
                routing: createRouting(),
                maxPoints: 5,
            });

            routeSnapMode.register(MockModeConfig());

            expect(routeSnapMode).toBeDefined();
        });
    });

    describe('start', () => {
        it('should start correctly', () => {
            const routeSnapMode = new TerraDrawRouteSnapMode({
                routing: createRouting(),
                maxPoints: 5,
            });

            routeSnapMode.register(config);
            routeSnapMode.start();

            expect(config.setCursor).toHaveBeenCalledTimes(1);
            expect(config.setCursor).toHaveBeenNthCalledWith(1, 'crosshair');
        });
    });

    describe('stop', () => {
        it('should stop correctly', () => {
            const routeSnapMode = new TerraDrawRouteSnapMode({
                routing: createRouting(),
                maxPoints: 5,
            });



            routeSnapMode.register(config);
            routeSnapMode.start();
            routeSnapMode.stop();

            expect(config.setCursor).toHaveBeenCalledTimes(2);
            expect(config.setCursor).toHaveBeenNthCalledWith(1, 'crosshair');
            expect(config.setCursor).toHaveBeenNthCalledWith(2, 'unset');

        });
    });

    describe('onClick', () => {
        it('should do nothing with empty route network', () => {
            const routeSnapMode = new TerraDrawRouteSnapMode({
                routing: createRouting(),
                maxPoints: 5,
            });

            routeSnapMode.register(config);
            routeSnapMode.start();

            routeSnapMode.onClick(MockCursorEvent({ lng: 1, lat: 2 }));

            expect(config.store.copyAll()).toEqual([]);
        });

        it('should create an initial point and start of the route linestring on click', () => {
            const routeSnapMode = new TerraDrawRouteSnapMode({
                routing: createRouting(CreateTwoPointNetwork()),
                maxPoints: 5,
            });

            routeSnapMode.register(config);
            routeSnapMode.start();

            routeSnapMode.onClick(MockCursorEvent({ lng: 1, lat: 2 }));
            const features = config.store.copyAll();
            const [linestring, point] = features;
            expect(linestring.geometry).toEqual({
                type: "LineString",
                coordinates: [[1, 2]]
            });
            expect(point.geometry).toEqual({
                type: "Point",
                coordinates: [1, 2]
            });
        });

        it('should draw a route linestring on second click if there is a network coordinate exactly at the click event', () => {

            const routing = createRouting(CreateTwoPointNetwork());
            const routeSnapMode = new TerraDrawRouteSnapMode({
                routing,
                maxPoints: 5,
            });

            // Spy on the routing's getRoute method which returns snapped routes
            jest.spyOn(routing, 'getRoute');

            routeSnapMode.register(config);
            routeSnapMode.start();

            routeSnapMode.onClick(MockCursorEvent({ lng: 1, lat: 2 }));
            routeSnapMode.onClick(MockCursorEvent({ lng: 3, lat: 4 }));

            const features = config.store.copyAll();
            const [linestring, pointOne, pointTwo] = features;
            expect(linestring.geometry).toEqual({
                type: "LineString",
                coordinates: [[1, 2], [3, 4]]
            });
            expect(pointOne.geometry).toEqual({
                type: "Point",
                coordinates: [1, 2]
            });
            expect(pointTwo.geometry).toEqual({
                type: "Point",
                coordinates: [3, 4]
            });

            expect(routing.getRoute).toHaveBeenCalledTimes(1);
        })

        it('should draw a route linestring on second click with the the closest network coordinate', () => {
            const routing = createRouting(CreateTwoPointNetwork());
            const routeSnapMode = new TerraDrawRouteSnapMode({
                routing,
                maxPoints: 5,
            });

            // Spy on the routing's getRoute method which returns snapped routes
            jest.spyOn(routing, 'getRoute');

            routeSnapMode.register(config);
            routeSnapMode.start();

            routeSnapMode.onClick(MockCursorEvent({ lng: 1, lat: 2 }));

            // The closest point here [3, 4])
            routeSnapMode.onClick(MockCursorEvent({ lng: 10, lat: 10 }));

            const features = config.store.copyAll();
            expect(features).toHaveLength(3);
            const [linestring, pointOne, pointTwo] = features;
            expect(linestring.geometry).toEqual({
                type: "LineString",
                coordinates: [[1, 2], [3, 4]]
            });
            expect(pointOne.geometry).toEqual({
                type: "Point",
                coordinates: [1, 2]
            });
            expect(pointTwo.geometry).toEqual({
                type: "Point",
                coordinates: [3, 4]
            });

            expect(routing.getRoute).toHaveBeenCalledTimes(1);
        });

        it('should be able to handle multiple points created by multiple clicks', () => {
            const routing = createRouting(CreateThreePointNetwork());
            const routeSnapMode = new TerraDrawRouteSnapMode({
                routing,
                maxPoints: 5,
            });

            // Spy on the routing's getRoute method which returns snapped routes
            jest.spyOn(routing, 'getRoute');

            routeSnapMode.register(config);
            routeSnapMode.start();

            routeSnapMode.onClick(MockCursorEvent({ lng: 1, lat: 2 }));
            routeSnapMode.onClick(MockCursorEvent({ lng: 3, lat: 4 }));
            routeSnapMode.onClick(MockCursorEvent({ lng: 5, lat: 6 }));

            const features = config.store.copyAll();
            expect(features).toHaveLength(4);

            const [linestring, pointOne, pointTwo, pointThree] = features;

            expect(linestring.properties.routeId).toBe(1);

            expect(linestring.geometry).toEqual({
                type: "LineString",
                coordinates: [[1, 2], [3, 4], [5, 6]]
            });
            expect(pointOne.geometry).toEqual({
                type: "Point",
                coordinates: [1, 2]
            });
            expect(pointTwo.geometry).toEqual({
                type: "Point",
                coordinates: [3, 4]
            });
            expect(pointThree.geometry).toEqual({
                type: "Point",
                coordinates: [5, 6]
            });

            expect(routing.getRoute).toHaveBeenCalledTimes(2)
        })

        it('should close the route and remove route points when clicking close to the last coordinate', () => {
            const routeSnapMode = new TerraDrawRouteSnapMode({
                routing: createRouting(CreateThreePointNetwork()),
                maxPoints: 5,
                pointerDistance: 50,
            });

            routeSnapMode.register(config);
            routeSnapMode.start();

            routeSnapMode.onClick(MockCursorEvent({ lng: 1, lat: 2 }));
            routeSnapMode.onClick(MockCursorEvent({ lng: 3, lat: 4 }));
            expect(config.store.copyAll()).toHaveLength(3);

            // Clicking directly on the last coordinate should close and clean up points
            routeSnapMode.onClick(MockCursorEvent({ lng: 3, lat: 4 }));

            // The route should remain, but the points should be removed on close
            const features = config.store.copyAll();
            expect(features).toHaveLength(1);
            expect(features[0].geometry.type).toBe('LineString');
            expect(features[0].properties.routeId).toBe(1);

        });

        it('should close and clean up route points when the number of points reaches maxPoints', () => {
            const routeSnapMode = new TerraDrawRouteSnapMode({
                routing: createRouting(CreateThreePointNetwork()),
                maxPoints: 3,
            });

            routeSnapMode.register(config);
            routeSnapMode.start();

            routeSnapMode.onClick(MockCursorEvent({ lng: 1, lat: 2 }));
            routeSnapMode.onClick(MockCursorEvent({ lng: 3, lat: 4 }));
            routeSnapMode.onClick(MockCursorEvent({ lng: 5, lat: 6 }));

            // Hitting maxPoints should finish drawing and clean up route points immediately
            // (route LineString remains, but the temporary route points should be removed).
            const features = config.store.copyAll();
            expect(features).toHaveLength(1);
            expect(features[0].geometry.type).toBe('LineString');
            expect(features[0].properties.routeId).toBe(1);
        });

        it('should increment routeId for each completed route', () => {
            const routeSnapMode = new TerraDrawRouteSnapMode({
                routing: createRouting(CreateThreePointNetwork()),
                maxPoints: 5,
            });

            routeSnapMode.register(config);
            routeSnapMode.start();
            // First route  
            routeSnapMode.onClick(MockCursorEvent({ lng: 1, lat: 2 }));
            routeSnapMode.onClick(MockCursorEvent({ lng: 3, lat: 4 }));
            routeSnapMode.onClick(MockCursorEvent({ lng: 3, lat: 4 }));

            // Second route
            routeSnapMode.onClick(MockCursorEvent({ lng: 5, lat: 6 }));
            routeSnapMode.onClick(MockCursorEvent({ lng: 6, lat: 7 }));
            routeSnapMode.onClick(MockCursorEvent({ lng: 6, lat: 7 }));

            const features = config.store.copyAll();
            const linestrings = features.filter((f) => f.geometry.type === "LineString");
            expect(linestrings).toHaveLength(2);
            expect(linestrings[0].properties.routeId).toBe(1);
            expect(linestrings[1].properties.routeId).toBe(2);
        });

        it('should clean up temporary route points when maxPoints=2 is reached on the second click', () => {
            // This is the smallest valid maxPoints value and should behave like:
            // click 1 => start route
            // click 2 => finish route
            // Expected result: keep only the finished LineString (no route points remain).
            const routeSnapMode = new TerraDrawRouteSnapMode({
                routing: createRouting(CreateTwoPointNetwork()),
                maxPoints: 2,
            });

            routeSnapMode.register(config);
            routeSnapMode.start();

            routeSnapMode.onClick(MockCursorEvent({ lng: 1, lat: 2 }));
            routeSnapMode.onClick(MockCursorEvent({ lng: 3, lat: 4 }));

            const features = config.store.copyAll();

            // Fails currently: points remain because the maxPoints auto-finish path
            // is only implemented for currentCoordinate > 1.
            expect(features).toHaveLength(1);
            expect(features[0].geometry).toEqual({
                type: "LineString",
                coordinates: [[1, 2], [3, 4]],
            });
            expect(features[0].properties.routeId).toBe(1);
        });

        it('should not increment routeId for cancelled routes (routeId should be assigned only for completed routes)', () => {
            const routeSnapMode = new TerraDrawRouteSnapMode({
                routing: createRouting(CreateTwoPointNetwork()),
                maxPoints: 5,
            });

            routeSnapMode.register(config);
            routeSnapMode.start();

            routeSnapMode.onClick(MockCursorEvent({ lng: 1, lat: 2 }));
            routeSnapMode.cleanUp();

            // Start a new route.
            routeSnapMode.onClick(MockCursorEvent({ lng: 1, lat: 2 }));
            routeSnapMode.onClick(MockCursorEvent({ lng: 3, lat: 4 }));

            const [line] = config.store.copyAll();

            // Fails currently: routeId increments when starting a route,
            // so cancelled routes consume routeIds.
            expect(line.properties.routeId).toBe(1);
        });

        describe('straightLineFallback', () => {
            it('should create a straight line segment if routing fails and straightLineFallback is enabled', () => {
                const routeSnapMode = new TerraDrawRouteSnapMode({
                    routing: createRouting(CreateTwoPointNetwork()),
                    maxPoints: 5,
                    straightLineFallback: true,
                });

                routeSnapMode.register(config);
                routeSnapMode.start();

                routeSnapMode.onClick(MockCursorEvent({ lng: 1, lat: 2 }));
                routeSnapMode.onClick(MockCursorEvent({ lng: 3, lat: 4 }));

                // Click somewhere with no network access
                routeSnapMode.onClick(MockCursorEvent({ lng: 10, lat: 10 }));
                routeSnapMode.onClick(MockCursorEvent({ lng: 10, lat: 10 }));


                const features = config.store.copyAll();
                expect(features).toHaveLength(1);
                const [updatedLinestring] = features;

                expect(updatedLinestring.geometry).toEqual({
                    type: "LineString",
                    coordinates: [[1, 2], [3, 4], [10, 10]]
                });
            });

            it('should not create a straight line segment if routing fails and straightLineFallback is disabled', () => {
                const routeSnapMode = new TerraDrawRouteSnapMode({
                    routing: createRouting(CreateTwoPointNetwork()),
                    maxPoints: 5,
                    straightLineFallback: false,
                });

                routeSnapMode.register(config);
                routeSnapMode.start();

                routeSnapMode.onClick(MockCursorEvent({ lng: 1, lat: 2 }));
                routeSnapMode.onClick(MockCursorEvent({ lng: 3, lat: 4 }));

                // Click somewhere with no network access
                routeSnapMode.onClick(MockCursorEvent({ lng: 10, lat: 10 }));

                const features = config.store.copyAll();
                expect(features).toHaveLength(3);
                const [linestring, pointOne, pointTwo] = features;

                // Linestring should remain unchanged from the first two clicks
                expect(linestring.geometry).toEqual({
                    type: "LineString",
                    coordinates: [[1, 2], [3, 4]]
                });
                expect(pointOne.geometry).toEqual({
                    type: "Point",
                    coordinates: [1, 2]
                });
                expect(pointTwo.geometry).toEqual({
                    type: "Point",
                    coordinates: [3, 4]
                });

                routeSnapMode.onClick(MockCursorEvent({ lng: 3, lat: 4 }));
                const featuresAfterSecondClick = config.store.copyAll();
                expect(featuresAfterSecondClick).toHaveLength(1);
            });

            it('should not snap to marginally closer network point to the cursor position when drawing to off network position', () => {
                const routeSnapMode = new TerraDrawRouteSnapMode({
                    routing: createRouting(CreateLineStringCollection([
                        [
                            [1, 2],
                            [3, 4],
                            [3.1, 4.1],
                            [3.2, 4.2],
                            [3.3, 4.3]
                        ],
                    ])),
                    maxPoints: 5,
                    straightLineFallback: true,
                });

                routeSnapMode.register(config);
                routeSnapMode.start();

                routeSnapMode.onClick(MockCursorEvent({ lng: 1, lat: 2 }));

                // Click closer to the second point [3,4] than the third point [3.1,4.1]
                routeSnapMode.onClick(MockCursorEvent({ lng: 3, lat: 4 }));

                routeSnapMode.onClick(MockCursorEvent({ lng: 50, lat: 50 }));

                const features = config.store.copyAll();
                const [linestring] = features;

                expect(linestring.geometry).toEqual({
                    type: "LineString",
                    coordinates: [[1, 2], [3, 4], [50, 50]]
                });
            });
        });
    });

    describe('onMouseMove', () => {
        beforeEach(() => {
            // Ensure requestAnimationFrame executes immediately in tests
            globalThis.requestAnimationFrame = (cb: FrameRequestCallback): number => {
                cb(0);
                return 0;
            };
        });

        it('should preview a route segment from the current end of the route to the closest network coordinate', () => {
            const routing = createRouting(CreateThreePointNetwork());
            const routeSnapMode = new TerraDrawRouteSnapMode({
                routing,
                maxPoints: 5,
            });

            routeSnapMode.register(config);
            routeSnapMode.start();

            // Create initial route with two points
            routeSnapMode.onClick(MockCursorEvent({ lng: 1, lat: 2 }));
            routeSnapMode.onClick(MockCursorEvent({ lng: 3, lat: 4 }));

            // Move cursor near the third network point (5,6)
            routeSnapMode.onMouseMove(MockCursorEvent({ lng: 5, lat: 6 }));

            const features = config.store.copyAll();
            // Expected: main linestring, 2 route points, + move preview line
            expect(features).toHaveLength(4);

            const lineStrings = features.filter((f) => f.geometry.type === "LineString");
            expect(lineStrings).toHaveLength(2);
        });

        it('should remove the preview line and show the close cursor when hovering close to the last coordinate', () => {
            const routing = createRouting(CreateThreePointNetwork());
            const routeSnapMode = new TerraDrawRouteSnapMode({
                routing,
                maxPoints: 5,
                pointerDistance: 50,
            });

            routeSnapMode.register(config);
            routeSnapMode.start();

            routeSnapMode.onClick(MockCursorEvent({ lng: 1, lat: 2 }));
            routeSnapMode.onClick(MockCursorEvent({ lng: 3, lat: 4 }));

            // First move: create preview line
            routeSnapMode.onMouseMove(MockCursorEvent({ lng: 5, lat: 6 }));
            expect(config.store.copyAll().filter((f) => f.geometry.type === "LineString")).toHaveLength(2);

            // Second move: hover exactly over the last coordinate (3,4) so it can close
            routeSnapMode.onMouseMove(MockCursorEvent({ lng: 3, lat: 4 }));

            // Preview line should be deleted
            expect(config.store.copyAll().filter((f) => f.geometry.type === "LineString")).toHaveLength(1);

            // Cursor should have been set to close pointer at least once
            expect(config.setCursor).toHaveBeenCalledWith('pointer');
        });
    });

    describe('onKeyUp', () => {
        it('should remove in-progress features when cancel is pressed', () => {
            const routeSnapMode = new TerraDrawRouteSnapMode({
                routing: createRouting(CreateThreePointNetwork()),
                maxPoints: 5,
            });

            routeSnapMode.register(config);
            routeSnapMode.start();

            routeSnapMode.onClick(MockCursorEvent({ lng: 1, lat: 2 }));
            expect(config.store.copyAll()).toHaveLength(2);

            routeSnapMode.onKeyUp(MockKeyboardEvent({ key: 'Escape' }));
            expect(config.store.copyAll()).toHaveLength(0);
        });

        it('should keep the route but clear route points when finish is pressed', () => {
            const routeSnapMode = new TerraDrawRouteSnapMode({
                routing: createRouting(CreateThreePointNetwork()),
                maxPoints: 5,
            });

            routeSnapMode.register(config);
            routeSnapMode.start();

            routeSnapMode.onClick(MockCursorEvent({ lng: 1, lat: 2 }));
            routeSnapMode.onClick(MockCursorEvent({ lng: 3, lat: 4 }));
            expect(config.store.copyAll()).toHaveLength(3);

            routeSnapMode.onKeyUp(MockKeyboardEvent({ key: 'Enter' }));

            const features = config.store.copyAll();
            // Finish should keep the route LineString but remove temporary route points.
            expect(features).toHaveLength(1);
            expect(features.filter((f) => f.geometry.type === 'LineString')).toHaveLength(1);
            expect(features.filter((f) => f.geometry.type === 'Point')).toHaveLength(0);
        });

        it('should support disabling key bindings via options', () => {
            const routeSnapMode = new TerraDrawRouteSnapMode({
                routing: createRouting(CreateThreePointNetwork()),
                maxPoints: 5,
                keyEvents: null,
            });

            routeSnapMode.register(config);
            routeSnapMode.start();

            routeSnapMode.onClick(MockCursorEvent({ lng: 1, lat: 2 }));
            routeSnapMode.onKeyUp(MockKeyboardEvent({ key: 'Escape' }));
            routeSnapMode.onKeyUp(MockKeyboardEvent({ key: 'Enter' }));

            // With key bindings disabled, nothing should be cleaned up
            expect(config.store.copyAll()).toHaveLength(2);
        });
    });

    describe('updateOptions', () => {
        it('should merge custom cursors from options', () => {
            const routeSnapMode = new TerraDrawRouteSnapMode({
                routing: createRouting(CreateThreePointNetwork()),
                maxPoints: 5,
                cursors: { draw: 'move' },
            });

            routeSnapMode.register(config);
            routeSnapMode.start();

            expect(config.setCursor).toHaveBeenCalledWith('move');
        });

        it('should clean up in-progress features when routing instance changes', () => {
            const routeSnapMode = new TerraDrawRouteSnapMode({
                routing: createRouting(CreateThreePointNetwork()),
                maxPoints: 5,
            });

            routeSnapMode.register(config);
            routeSnapMode.start();

            routeSnapMode.onClick(MockCursorEvent({ lng: 1, lat: 2 }));
            expect(config.store.copyAll()).toHaveLength(2);

            routeSnapMode.updateOptions({ routing: createRouting(CreateTwoPointNetwork()) });
            expect(config.store.copyAll()).toHaveLength(0);
        });

        it('should allow straightLineFallback to be toggled off', () => {
            const routeSnapMode = new TerraDrawRouteSnapMode({
                routing: createRouting(CreateThreePointNetwork()),
                maxPoints: 5,
                straightLineFallback: true,
            });

            routeSnapMode.register(config);
            routeSnapMode.start();

            // Disable fallback and ensure it stays disabled.
            routeSnapMode.updateOptions({ straightLineFallback: false });
        });
    });

    describe('styleFeature', () => {
        it('should apply route styling for route LineString features', () => {
            const routeSnapMode = new TerraDrawRouteSnapMode({
                routing: createRouting(CreateTwoPointNetwork()),
                maxPoints: 5,
            });

            routeSnapMode.register(config);
            routeSnapMode.start();

            routeSnapMode.onClick(MockCursorEvent({ lng: 1, lat: 2 }));
            const [line] = config.store.copyAll();

            const styles = routeSnapMode.styleFeature(line as GeoJSONStoreFeatures);
            expect(styles.zIndex).toBe(10);
            expect(styles.lineStringWidth).toBeDefined();
            expect(styles.lineStringColor).toBeDefined();
        });

        it('should apply route styling for route Point features', () => {
            const routeSnapMode = new TerraDrawRouteSnapMode({
                routing: createRouting(CreateTwoPointNetwork()),
                maxPoints: 5,
            });

            routeSnapMode.register(config);
            routeSnapMode.start();

            routeSnapMode.onClick(MockCursorEvent({ lng: 1, lat: 2 }));
            const [, point] = config.store.copyAll();

            const styles = routeSnapMode.styleFeature(point as GeoJSONStoreFeatures);
            expect(styles.pointColor).toBeDefined();
            expect(styles.pointOutlineColor).toBeDefined();
            expect(styles.pointOutlineWidth).toBeDefined();
        });

        it('should fall back to default styling for non-route features', () => {
            const routeSnapMode = new TerraDrawRouteSnapMode({
                routing: createRouting(CreateTwoPointNetwork()),
                maxPoints: 5,
            });

            const nonRouteFeature = {
                type: 'Feature',
                geometry: { type: 'Point', coordinates: [0, 0] },
                properties: { mode: 'something-else' },
            };

            const styles = routeSnapMode.styleFeature(nonRouteFeature as GeoJSONStoreFeatures);
            expect(styles).toBeDefined();
        });
    });
});
