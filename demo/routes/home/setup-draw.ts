import {
  GeoJSONStoreFeatures,
  HexColor,
  TerraDraw,
  TerraDrawExtend,
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

function getColorBlindSafeHex(): string {
  // Hues in degrees that are safer for colorblind users (approx. blues, oranges, purples, yellows)
  const safeHueRanges = [
    [30, 60],    // yellow-orange
    [190, 250],  // blue-turquoise
    [260, 290],  // purple
  ];

  // Pick a random range
  const [minHue, maxHue] = safeHueRanges[Math.floor(Math.random() * safeHueRanges.length)];
  const hue = Math.floor(Math.random() * (maxHue - minHue + 1)) + minHue;
  const saturation = 60 + Math.random() * 20; // 60–80% saturation
  const lightness = 50 + Math.random() * 10;  // 50–60% lightness

  return hslToHex(hue, saturation, lightness);
}

function hslToHex(h: number, s: number, l: number): string {
  s /= 100;
  l /= 100;

  const k = (n: number) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) =>
    Math.round(255 * (l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)))));

  return `#${[f(0), f(8), f(4)]
    .map((x) => x.toString(16).padStart(2, '0'))
    .join('')}`;
}

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
            console.log('routePointColor', feature.properties.routeId);

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
