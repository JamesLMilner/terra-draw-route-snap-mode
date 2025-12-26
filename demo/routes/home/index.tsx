import { h } from "preact";
import style from "./style.module.css";
import {
  useMemo,
  useRef,
  useEffect,
  useState,
  useCallback,
} from "preact/hooks";
import { setupDraw } from "./setup-draw";
import { setupLeafletMap } from "./setup-leaflet";
import * as L from "leaflet";
import MapButtons from "../../components/map-buttons/MapButtons";
import convex from '@turf/convex';
import { transformScale } from "@turf/transform-scale";
import { bboxPolygon } from "@turf/bbox-polygon";
import { bbox } from "@turf/bbox";
import { GeoJSONStoreFeatures } from "terra-draw";
import { FeatureCollection, LineString } from "geojson";
import { RouteFinderOptions, RouteFinders, setupRouting } from "./setup-routing";
import { Routing } from "../../../src/routing";
import { TerraRouteGraph } from "terra-route-graph";

const lat = 51.539931;
const lng = -0.0780000;
const mapOptions = {
  L,
  id: "leaflet-map",
  lng,
  lat,
  zoom: 13,
  minZoom: 10,
  maxZoom: 20,
  tapTolerance: 10,
  maxBounds: [[lat - 0.05, lng - 0.05], [lat + 0.05, lng + 0.05]] as any
};

const Home = () => {
  const ref = useRef(null);
  const [map, setMap] = useState<undefined | L.Map>();
  const [mode, setMode] = useState<string>("static");
  const [network, setNetwork] = useState<FeatureCollection<LineString>>();
  const [prunedGraph, setPrunedGraph] = useState<FeatureCollection<LineString>>();

  useEffect(() => {
    const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
    const path = isLocalhost ? '/public/network.json' : './network.json';

    fetch(path).then((res) => {
      res.json().then((network) => {
        setNetwork(network);
      });
    });
  }, []);

  useEffect(() => {
    if (!map) {
      setMap(setupLeafletMap(mapOptions));
    }
  }, [map]);

  const [routingOptionState, setRoutingOptionState] = useState<RouteFinderOptions>(RouteFinders.TerraRoute);

  const routingProviders = useMemo(() => {
    if (network) {
      return {
        [RouteFinders.TerraRoute]: setupRouting(network, RouteFinders.TerraRoute),
        [RouteFinders.GeoJSONPathFinder]: setupRouting(network, RouteFinders.GeoJSONPathFinder)
      }
    }
  }, [network]);

  const { draw, routing } = useMemo(() => {
    if (map && network && routingProviders) {
      const routing = new Routing({
        network,
        useCache: true,
        routeFinder: routingProviders[RouteFinders.TerraRoute]
      });
      const terraDraw = setupDraw(map, L, routing);

      terraDraw.start();

      const convexHull = convex(network) as GeoJSONStoreFeatures;
      if (convexHull && convexHull.properties) {
        convexHull.properties.mode = 'networkOutline';
      }
      terraDraw.addFeatures([convexHull]);

      return {
        draw: terraDraw,
        routing,
      };
    }
    return {
      draw: undefined,
      routing: undefined
    };
  }, [map, network, routingProviders]);

  const changeMode = useCallback(
    (newMode: string) => {
      if (draw) {
        setMode(newMode);
        draw.setMode(newMode);
      }
    },
    [draw]
  );

  const clear = useCallback(() => {
    if (!draw) {
      return;
    }
    const idsToRemove = draw.getSnapshot()
      .filter(({ properties }) =>
        properties.mode !== 'networkOutline')
      .map(({ id }) => id as string);
    draw.removeFeatures(idsToRemove);
  }, [draw]);

  return (
    <div class={style.home}>
      <div ref={ref} class={style.map} id={mapOptions.id}>
        <button class={style.split} onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();

          let networkToUse
          if (!prunedGraph && network) {
            networkToUse = network;
          } else if (prunedGraph) {
            networkToUse = prunedGraph;

          } else {
            return;
          }

          const result = bbox(networkToUse);
          const polygon = bboxPolygon(result);
          const scaled = transformScale(polygon, 0.9);
          const graph = new TerraRouteGraph(networkToUse);
          const shrunkBBox = bbox(scaled) as [number, number, number, number];
          const shrunkGraph = graph.getNetworkInBoundingBox(shrunkBBox);

          routing?.setNetwork(shrunkGraph);
          setPrunedGraph(shrunkGraph);
          const networkOutline = draw?.getSnapshot().find(({ properties }) => properties.mode === 'networkOutline');
          draw?.removeFeatures([networkOutline!.id as string]);

          const convexHull = convex(shrunkGraph) as GeoJSONStoreFeatures;
          if (convexHull && convexHull.properties) {
            convexHull.properties.mode = 'networkOutline';
          }
          draw?.addFeatures([convexHull]);
        }}>
          Prune
        </button>
        <select
          disabled={!routing || !routingProviders}
          onChange={(event) => {
            if (!routing || !routingProviders) return;
            const select = event.target as HTMLSelectElement;
            const value = select.options[select.selectedIndex].value as RouteFinderOptions;
            setRoutingOptionState(value);
            routing.setRouteFinder(routingProviders[value]);
          }}
          class={style.routingSelect}
        >
          <option value={RouteFinders.TerraRoute}>Terra Route</option>
          <option value={RouteFinders.GeoJSONPathFinder}>GeoJSON Path Finder</option>
        </select>
        {draw ? <MapButtons mode={mode} changeMode={changeMode} onClear={clear} /> : null}
        {draw ? null : <div class={style.loading}>Loading...</div>}
      </div>
    </div>
  );
};

export default Home;
