import { Routing } from "../../../src/terra-draw-route-snap-mode";
import { FeatureCollection, LineString } from "geojson";
import { TerraRoute, createCheapRuler } from 'terra-route';

export function setupRouting(network: FeatureCollection<LineString>) {
  // CheapRuler provides a fast way to measure distances geographically when
  // the distance is not too large i.e. less than 500km  
  const measureDistance = createCheapRuler(network.features[0].geometry.coordinates[0][1]);

  const terraRoute = new TerraRoute(measureDistance)

  terraRoute.buildRouteGraph(network)

  const terraRouting = new Routing({
    network,
    useCache: true,
    routeFinder: terraRoute
  })

  return terraRouting
}
