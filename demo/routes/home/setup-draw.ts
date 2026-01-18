import {
  TerraDraw,
  TerraDrawRenderMode,
  TerraDrawExtend
} from "terra-draw";
import {
  TerraDrawLeafletAdapter
} from "terra-draw-leaflet-adapter";
import * as L from "leaflet";
import { TerraDrawRouteSnapMode } from "../../../src/terra-draw-route-snap-mode";
import { Routing } from "../../../src/routing";
import { getColorBlindSafeHex } from "./colors";

export function setupDraw(map: L.Map, leaflet: typeof L, routing: Routing) {
  const colorStore: Record<string, TerraDrawExtend.HexColorStyling> = {}

  const draw = new TerraDraw({
    adapter: new TerraDrawLeafletAdapter({
      lib: leaflet,
      map,
      coordinatePrecision: 9,
    }),
    modes: [
      // Needed for outline
      new TerraDrawRenderMode({
        modeName: 'networkOutline',
        styles: {
          polygonOutlineColor: '#d1cfcf',
          polygonFillColor: '#eeeeee',
          polygonFillOpacity: 0.19,
          polygonOutlineWidth: 2,
        }
      }),
      new TerraDrawRouteSnapMode({
        routing,
        maxPoints: 5,
        styles: {
          lineStringColor: (feature) => {
            const routeId = feature.properties.routeId as string;
            if (!routeId) {
              colorStore[routeId] = getColorBlindSafeHex() as TerraDrawExtend.HexColorStyling;
            }
            return colorStore[routeId] as `#${string}`
          },
          routePointColor: (feature) => {
            const routeId = feature.properties.routeId as string;
            if (!colorStore[routeId]) {
              colorStore[routeId] = getColorBlindSafeHex() as TerraDrawExtend.HexColorStyling;
            }
            return colorStore[routeId] as `#${string}`;
          }
        }
      })
    ]
  });

  return draw;
}
