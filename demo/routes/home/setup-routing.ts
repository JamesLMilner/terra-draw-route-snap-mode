import { Routing } from "../../../src/terra-draw-route-snap-mode";
import { Feature, FeatureCollection, LineString, Point } from "geojson";
import { TerraRoute, createCheapRuler } from 'terra-route'
import PathFinder, { pathToGeoJSON } from "geojson-path-finder";

function withGeoJSONPathFinder(network: FeatureCollection<LineString>) {

  const pathFinder = new PathFinder(network);

  const routeFinder = {
    getRoute: (start: Feature<Point>, end: Feature<Point>) => {
      const route = pathFinder.findPath(start, end);
      if (route && route.path.length > 1) {
        const result = pathToGeoJSON(route);

        return result as Feature<LineString>;
      }

      return null;
    }
  }

  const pathFinderRouting = new Routing({
    network,
    useCache: true,
    routeFinder
  })
  return pathFinderRouting;
}

function withTerraRoute(network: FeatureCollection<LineString>) {
  // CheapRuler provides a fast way to measure distances geographically when
  // the distance is not too large i.e. less than 500km  
  const measureDistance = createCheapRuler(network.features[0].geometry.coordinates[0][1]);

  const terraRoute = new TerraRoute({
    distanceMeasurement: measureDistance,
  })

  terraRoute.buildRouteGraph(network)

  const terraRouting = new Routing({
    network,
    useCache: true,
    routeFinder: terraRoute
  })

  return terraRouting;
}


export function setupRouting(network: FeatureCollection<LineString>, routing: 'terra-route' | 'geojson-path-finder' = 'terra-route') {
  console.log(routing);
  if (routing === 'geojson-path-finder') {
    return withGeoJSONPathFinder(network);
  } else if (routing === 'terra-route') {
    return withTerraRoute(network);
  }

  throw new Error(`Routing ${routing} not supported`);
}
