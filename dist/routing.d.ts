import { FeatureCollection, LineString, Position, Feature, Point } from "geojson";
import { RoutingInterface } from "./terra-draw-route-snap-mode";
type RouteFinder = {
    getRoute: (positionA: Feature<Point>, positionB: Feature<Point>) => Feature<LineString> | null;
};
/**
 * Routing class for finding routes on a network of LineStrings.
 * The LineString network must have coordinates that are shared between
 * the LineStrings in order to find a route.
 */
export declare class Routing implements RoutingInterface {
    constructor(options: {
        network: FeatureCollection<LineString>;
        useCache?: boolean;
        routeFinder: RouteFinder;
    });
    private useCache;
    private indexedNetworkPoints;
    private points;
    private routeFinder;
    private network;
    private routeCache;
    /**
     * Return the closest network coordinate to the input coordinate
     * @param inputCoordinate The coordinate to find the closest network coordinate to
     * @returns a coordinate on the network or null if no coordinate is found
     */
    getClosestNetworkCoordinate(inputCoordinate: Position): Position | null;
    /**
     * Get the route between two coordinates returned as a GeoJSON LineString
     * @param startCoord start coordinate
     * @param endCoord end coordinate
     * @returns The route as a GeoJSON LineString
     */
    getRoute(startCoord: Position, endCoord: Position): Feature<LineString> | null;
}
export {};
