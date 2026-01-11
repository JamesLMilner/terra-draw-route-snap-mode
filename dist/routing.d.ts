import { FeatureCollection, LineString, Position, Feature, Point } from "geojson";
export type RouteFinder = {
    getRoute: (positionA: Feature<Point>, positionB: Feature<Point>) => Feature<LineString> | null;
    setNetwork: (network: FeatureCollection<LineString>) => void;
};
export interface RoutingInterface {
    getRoute: (startCoord: Position, endCoord: Position) => Feature<LineString> | null;
    getClosestNetworkCoordinate: (coordinate: Position) => Position | null;
    setRouteFinder: (routeFinder: RouteFinder) => void;
    setNetwork: (network: FeatureCollection<LineString>) => void;
}
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
    private initialise;
    /**
     * Return the closest network coordinate to the input coordinate
     * @param inputCoordinate The coordinate to find the closest network coordinate to
     * @returns a coordinate on the network or null if no coordinate is found
     */
    getClosestNetworkCoordinate(inputCoordinate: Position): Position | null;
    /**
     * Set the route finder for the routing instance
     * @param routeFinder The route finder to use
     */
    setRouteFinder(routeFinder: RouteFinder): void;
    /**
     * Set the network for the routing instance
     * @param network The network to use
     */
    setNetwork(network: FeatureCollection<LineString>): void;
    /**
     * Get the route between two coordinates returned as a GeoJSON LineString
     * @param startCoord start coordinate
     * @param endCoord end coordinate
     * @returns The route as a GeoJSON LineString
     */
    getRoute(startCoord: Position, endCoord: Position): Feature<LineString> | null;
}
