import {
  TerraDraw,
  TerraDrawRenderMode,
  TerraDrawSelectMode,
} from "terra-draw";
import {
  TerraDrawLeafletAdapter
} from "terra-draw-leaflet-adapter";
import * as L from "leaflet";
import { RouteSnapMode } from "../../../src/route-snap.mode";
import { Routing } from "../../../src/routing";
import { FeatureCollection, LineString } from "geojson";
import TerraRoute from "../../../src/terra-route/terra-route";
import { createCheapRuler } from "../../../src/terra-route/distance/cheap-ruler";
import { getColorBlindSafeHex } from "./colors";


export function setupDraw(map: L.Map, leaflet: typeof L, network: FeatureCollection<LineString>) {

  // CheapRuler provides a fast way to measure distances geographically when
  // the distance is not too large i.e. less than 500km  
  const measureDistance = createCheapRuler(network.features[0].geometry.coordinates[0][1]);

  const terraRoute = new TerraRoute(network, measureDistance)

  const terraRouting = new Routing({
    network,
    useCache: false,
    routeFinder: terraRoute
  })

  const colorStore: Record<string, string> = {}

  const draw = new TerraDraw({
    adapter: new TerraDrawLeafletAdapter({
      lib: leaflet,
      map,
      coordinatePrecision: 9,
    }),
    modes: [
      new TerraDrawRenderMode({
        modeName: 'networkOutline',
        styles: {
          polygonOutlineColor: '#d1cfcf',
          polygonFillColor: '#eeeeee',
          polygonFillOpacity: 0.2,
          polygonOutlineWidth: 2,
        }
      }),
      new RouteSnapMode({
        routing: terraRouting,
        maxPoints: 5,
        styles: {
          lineStringColor: (feature) => {
            if (!colorStore[feature.properties.routeId as string]) {
              colorStore[feature.properties.routeId as string] = getColorBlindSafeHex() as any;
            }
            return colorStore[feature.properties.routeId as string] as any;
          },
          routePointColor: (feature) => {
            if (!colorStore[feature.properties.routeId as string]) {
              colorStore[feature.properties.routeId as string] = getColorBlindSafeHex() as any;
            }
            return colorStore[feature.properties.routeId as string] as any;
          }
        }
      }),
      new TerraDrawSelectMode({
        flags: {
          routesnap: {
            feature: {
              coordinates: {},
            },
          },
        },
      })
    ]
  });

  return draw;
}
