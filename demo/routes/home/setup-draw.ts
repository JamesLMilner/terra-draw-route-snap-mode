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
import { getColorBlindSafeHex } from "./colors";

export function setupDraw(map: L.Map, leaflet: typeof L, routing: Routing) {
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
          polygonFillOpacity: 0.19,
          polygonOutlineWidth: 2,
        }
      }),
      new RouteSnapMode({
        routing,
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
