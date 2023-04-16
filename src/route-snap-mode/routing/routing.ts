import PathFinder, { pathToGeoJSON } from "geojson-path-finder";
import kdbush from "kdbush";
import geokdbush from "geokdbush";
import {
  FeatureCollection,
  LineString,
  Position,
  Feature,
  Point,
} from "geojson";
import { RoutingInterface } from "../mode/route-snap.mode";

export class Routing implements RoutingInterface {
  constructor(network: FeatureCollection<LineString>) {
    this.network = network;
    this.pathFinder = new PathFinder(network);

    const points: Position[] = [];

    this.network.features.forEach((feature) => {
      feature.geometry.coordinates.forEach((coordinate) => {
        points.push(coordinate);
      });
    });

    this.indexedNetworkPoints = new kdbush(points);
  }
  private indexedNetworkPoints: any;
  private pathFinder: PathFinder<any, any>;
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

  public getRoute(startCoord: Position, endCoord: Position) {
    const routeKey = `${startCoord}-${endCoord}`;
    if (this._routeCache[routeKey]) {
      return this._routeCache[routeKey];
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

    const route = this.pathFinder.findPath(start, end);
    if (route && route.path.length > 1) {
      const result = pathToGeoJSON(route);
      if (result) {
        this._routeCache[routeKey] = result;
        return result;
      }
    }

    return undefined;
  }
}
