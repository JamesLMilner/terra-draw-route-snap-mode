import {
  TerraDraw,
  TerraDrawLeafletAdapter,
  TerraDrawSelectMode,
} from "terra-draw";
import * as L from "leaflet";
import { RouteSnapMode } from "../../route-snap-mode/mode/route-snap.mode";
import { Routing } from "../../route-snap-mode/routing/routing";

export function setupDraw(map: L.Map, leaflet: typeof L, network: any) {
  return new TerraDraw({
    adapter: new TerraDrawLeafletAdapter({
      lib: leaflet,
      map,
      coordinatePrecision: 9,
    }),
    modes: {
      routesnap: new RouteSnapMode({
        routing: new Routing(network),
        maxPoints: 5,
      }),
      select: new TerraDrawSelectMode({
        flags: {
          routesnap: {
            feature: {
              coordinates: {},
            },
          },
        },
      }),
    },
  });
}
