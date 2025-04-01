import { FeatureCollection, LineString, Point, Feature, Position } from "geojson";
import TerraRoute from "./terra-route";

const createPointFeature = (coord: Position): Feature<Point> => ({
    type: "Feature",
    geometry: {
        type: "Point",
        coordinates: coord,
    },
    properties: {},
});

const createFeatureCollection = (features: Feature<LineString>[]): FeatureCollection<LineString> => ({
    type: "FeatureCollection",
    features,
});

describe("TerraRoute", () => {
    it("finds the correct shortest route in a simple connected graph", () => {
        const network = createFeatureCollection([
            {
                type: "Feature",
                geometry: {
                    type: "LineString",
                    coordinates: [
                        [0, 0],
                        [1, 0],
                        [2, 0],
                    ],
                },
                properties: {},
            },
            {
                type: "Feature",
                geometry: {
                    type: "LineString",
                    coordinates: [
                        [2, 0],
                        [2, 1],
                    ],
                },
                properties: {},
            },
        ])

        const routeFinder = new TerraRoute(network);
        const start = createPointFeature([0, 0]);
        const end = createPointFeature([2, 1]);

        const result = routeFinder.getRoute(start, end);

        expect(result).not.toBeNull();
        expect(result!.geometry.coordinates).toEqual([
            [0, 0],
            [1, 0],
            [2, 0],
            [2, 1],
        ]);
    });

    it("returns null when no path exists between start and end", () => {
        const network = createFeatureCollection([
            {
                type: "Feature",
                geometry: {
                    type: "LineString",
                    coordinates: [
                        [0, 0],
                        [1, 0],
                    ],
                },
                properties: {},
            },
            {
                type: "Feature",
                geometry: {
                    type: "LineString",
                    coordinates: [
                        [5, 5],
                        [6, 5],
                    ],
                },
                properties: {},
            },
        ])

        const routeFinder = new TerraRoute(network);
        const start = createPointFeature([0, 0]);
        const end = createPointFeature([6, 5]);

        const result = routeFinder.getRoute(start, end);

        expect(result).toBeNull();
    });

    it("returns a single-point route if start and end are the same", () => {
        const network = createFeatureCollection([
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
        ])

        const routeFinder = new TerraRoute(network);
        const start = createPointFeature([0, 0]);

        const result = routeFinder.getRoute(start, start);

        expect(result).not.toBeNull();
        expect(result!.geometry.coordinates).toEqual([[0, 0]]);
    });

    it("selects one of the valid shortest paths if multiple exist", () => {
        const network = createFeatureCollection([
            {
                type: "Feature",
                geometry: {
                    type: "LineString",
                    coordinates: [
                        [0, 0],
                        [1, 0],
                        [2, 0],
                    ],
                },
                properties: {},
            },
            {
                type: "Feature",
                geometry: {
                    type: "LineString",
                    coordinates: [
                        [0, 0],
                        [0, 1],
                        [2, 0],
                    ],
                },
                properties: {},
            },
        ])

        const routeFinder = new TerraRoute(network);
        const start = createPointFeature([0, 0]);
        const end = createPointFeature([2, 0]);

        const result = routeFinder.getRoute(start, end);

        expect(result).not.toBeNull();
        expect(result!.geometry.coordinates[0]).toEqual([0, 0]);
        expect(result!.geometry.coordinates.at(-1)).toEqual([2, 0]);
        expect(result!.geometry.coordinates.length).toBeGreaterThanOrEqual(2);
    });

    it("returns null when the network is empty", () => {
        const network = createFeatureCollection([])

        const routeFinder = new TerraRoute(network);
        const start = createPointFeature([0, 0]);
        const end = createPointFeature([1, 1]);

        const result = routeFinder.getRoute(start, end);

        expect(result).toBeNull();
    });
});
