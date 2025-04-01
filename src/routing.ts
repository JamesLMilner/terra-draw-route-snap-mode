import kdbush from "kdbush";
import geokdbush from "geokdbush";
import {
  FeatureCollection,
  LineString,
  Position,
  Feature,
  Point,
} from "geojson";
import { RoutingInterface } from "./route-snap.mode";

type RouteFinder = {
  getRoute: (positionA: Feature<Point>, positionB: Feature<Point>) => Feature<LineString> | null
}

export class Routing implements RoutingInterface {
  constructor(options: {
    network: FeatureCollection<LineString>, useCache?: boolean,
    routeFinder: RouteFinder
  }) {
    this.useCache = options.useCache || true;
    this.network = options.network;

    this.routeFinder = options.routeFinder;

    const points: Position[] = [];

    this.network.features.forEach((feature) => {
      feature.geometry.coordinates.forEach((coordinate) => {
        points.push(coordinate);
      });
    });

    this.indexedNetworkPoints = new kdbush(points);
  }
  private useCache: boolean = true;
  private indexedNetworkPoints: any;
  private routeFinder: any;
  private network: FeatureCollection<LineString>;
  private _routeCache: Record<string, Feature<LineString>> = {};

  public getClosestNetworkCoordinate(inputCoordinate: Position) {
    const nearest: Position[] | undefined = geokdbush.around(
      this.indexedNetworkPoints,
      inputCoordinate[0],
      inputCoordinate[1],
      1
    );

    return nearest ? nearest[0] : undefined;
  }

  public getRoute(startCoord: Position, endCoord: Position): Feature<LineString> | undefined {

    // Check if caching is enabled, and if the coordinates are already in the cache  
    if (this.useCache) {
      const routeKey = `${startCoord}-${endCoord}`;

      if (this._routeCache[routeKey]) {
        return this._routeCache[routeKey];
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
      this._routeCache[routeKey] = route;
      return route;
    }

    return route;

  }
}
