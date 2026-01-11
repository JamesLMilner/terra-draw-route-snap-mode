import { Feature, FeatureCollection, LineString, Point } from "geojson";
import { TerraRoute, createCheapRuler } from 'terra-route'
import PathFinder, { pathToGeoJSON } from "geojson-path-finder";
import { RouteFinder } from "../../../src/routing";

function withGeoJSONPathFinder(network: FeatureCollection<LineString>): RouteFinder {

  let pathFinder = new PathFinder(network);
  const storedNetwork = network;

  const routeFinder = {
    getRoute: (start: Feature<Point>, end: Feature<Point>) => {
      const route = pathFinder.findPath(start, end);
      if (route && route.path.length > 1) {
        const result = pathToGeoJSON(route);

        return result as Feature<LineString>;
      }

      return null;
    },
    setNetwork: (network: FeatureCollection<LineString>) => {
      pathFinder = new PathFinder(network);
    },
    expandNetwork: (additionalNetwork: FeatureCollection<LineString>) => {
      // TODO: there may be a cleaner way to approach this
      storedNetwork.features.push(...additionalNetwork.features);
      pathFinder = new PathFinder(storedNetwork);
    }
  }

  return routeFinder;
}

function withTerraRoute(network: FeatureCollection<LineString>): RouteFinder {
  // CheapRuler provides a fast way to measure distances geographically when
  // the distance is not too large i.e. less than 500km  
  const measureDistance = createCheapRuler(network.features[0].geometry.coordinates[0][1]);

  const terraRoute = new TerraRoute({
    distanceMeasurement: measureDistance,
  })

  terraRoute.buildRouteGraph(network)

  return {
    getRoute: terraRoute.getRoute.bind(terraRoute),
    setNetwork: (network: FeatureCollection<LineString>) => {
      terraRoute.buildRouteGraph(network);
    },
    expandNetwork: (additionalNetwork: FeatureCollection<LineString>) => {
      terraRoute.expandRouteGraph(additionalNetwork);
    }
  }
}

export const RouteFinders = {
  TerraRoute: 'terra-route',
  GeoJSONPathFinder: 'geojson-path-finder'
} as const;

export type RouteFinderOptions = typeof RouteFinders[keyof typeof RouteFinders];

export function setupRouting(network: FeatureCollection<LineString>, routing: RouteFinderOptions = RouteFinders.TerraRoute): RouteFinder {
  let routeFinder: RouteFinder;

  if (routing === RouteFinders.GeoJSONPathFinder) {
    routeFinder = withGeoJSONPathFinder(network);
  } else if (routing === RouteFinders.TerraRoute) {
    routeFinder = withTerraRoute(network);
  } else {
    throw new Error(`Unknown routing option: ${routing}`);
  }

  return routeFinder
}
