import { KDBush } from "./kdbush/kdbush";
import { around } from "./kdbush/geokdbush";
import {
  FeatureCollection,
  LineString,
  Position,
  Feature,
  Point,
} from "geojson";
import { RoutingInterface } from "./terra-draw-route-snap-mode";

export type RouteFinder = {
  getRoute: (positionA: Feature<Point>, positionB: Feature<Point>) => Feature<LineString> | null
  setNetwork: (network: FeatureCollection<LineString>) => void
}

/**
 * Routing class for finding routes on a network of LineStrings.
 * The LineString network must have coordinates that are shared between
 * the LineStrings in order to find a route.
 */
export class Routing implements RoutingInterface {
  constructor(options: {
    network: FeatureCollection<LineString>, useCache?: boolean,
    routeFinder: RouteFinder
  }) {
    this.useCache = options.useCache || true;
    this.network = options.network;
    this.routeFinder = options.routeFinder;

    this.initialise();
  }

  private useCache: boolean = true;
  private indexedNetworkPoints!: KDBush;
  private points: Position[] = []
  private routeFinder: RouteFinder;
  private network: FeatureCollection<LineString>;
  private routeCache: Record<string, Feature<LineString> | null> = {};

  // Initialise the routing instance setting internal data structures
  private initialise() {
    this.network.features.forEach((feature) => {
      feature.geometry.coordinates.forEach((coordinate) => {
        this.points.push(coordinate);
      });
    });

    this.indexedNetworkPoints = new KDBush(this.points.length);

    this.points.forEach(coordinate => {
      this.indexedNetworkPoints.add(coordinate[0], coordinate[1]);
    })

    this.indexedNetworkPoints.finish();

    this.routeCache = {};
  }

  /**
   * Return the closest network coordinate to the input coordinate
   * @param inputCoordinate The coordinate to find the closest network coordinate to
   * @returns a coordinate on the network or null if no coordinate is found
   */
  public getClosestNetworkCoordinate(inputCoordinate: Position) {
    const aroundInput: number[] = around(
      this.indexedNetworkPoints,
      inputCoordinate[0],
      inputCoordinate[1],
      1
    );

    const nearest = this.points[aroundInput[0]]
    return nearest ? nearest : null;
  }

  /**
   * Set the route finder for the routing instance
   * @param routeFinder The route finder to use
   */
  public setRouteFinder(routeFinder: RouteFinder) {
    this.routeFinder = routeFinder;
  }

  /**
   * Set the network for the routing instance
   * @param network The network to use
   */
  public setNetwork(network: FeatureCollection<LineString>) {
    this.network = network;

    // Ensure the network is updated correctly for the router finder
    this.routeFinder.setNetwork(network);

    // Re-initialize all internal data structures for this class
    this.initialise();
  }

  /**
   * Get the route between two coordinates returned as a GeoJSON LineString
   * @param startCoord start coordinate
   * @param endCoord end coordinate
   * @returns The route as a GeoJSON LineString
   */
  public getRoute(startCoord: Position, endCoord: Position): Feature<LineString> | null {

    // Check if caching is enabled, and if the coordinates are already in the cache  
    if (this.useCache) {
      const routeKey = `${startCoord}-${endCoord}`;

      if (this.routeCache[routeKey]) {
        return this.routeCache[routeKey];
      }
    }

    const start = {
      type: "Feature",
      geometry: {
        type: "Point",
        coordinates: startCoord,
      },
      properties: {},
    } as Feature<Point>;

    const end = {
      type: "Feature",
      geometry: {
        type: "Point",
        coordinates: endCoord,
      },
      properties: {},
    } as Feature<Point>;

    const route = this.routeFinder.getRoute(start, end);

    // If caching is enabled, store the route in the cache
    if (this.useCache) {
      const routeKey = `${startCoord}-${endCoord}`
      this.routeCache[routeKey] = route;
      return route;
    }

    return route;

  }
}
