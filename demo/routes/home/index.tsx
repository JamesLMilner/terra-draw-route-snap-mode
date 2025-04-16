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
import { GeoJSONStoreFeatures } from "terra-draw";
import { FeatureCollection, LineString } from "geojson";
import { setupRouting } from "./setup-routing";

const Home = () => {
  const lat = 51.532831;
  const lng = -0.0780000;
  const mapOptions = {
    L,
    id: "leaflet-map",
    lng,
    lat,
    zoom: 16,
    minZoom: 14,
    maxZoom: 20,
    tapTolerance: 10,
    maxBounds: [[lat - 0.05, lng - 0.05], [lat + 0.05, lng + 0.05]] as any
  };
  const ref = useRef(null);
  const [map, setMap] = useState<undefined | L.Map>();
  const [mode, setMode] = useState<string>("static");
  const [network, setNetwork] = useState<FeatureCollection<LineString>>();

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
  }, []);

  const routing = useMemo(() => {
    if (network) {
      return setupRouting(network);
    }
  }, [network]);

  const draw = useMemo(() => {
    if (map && routing && network) {
      const terraDraw = setupDraw(map, L, routing);
      terraDraw.start();

      return terraDraw;
    }
  }, [map, network, routing]);

  const convexHull = useMemo(() => {
    if (network && draw) {
      const convexHull = convex(network) as GeoJSONStoreFeatures;
      if (convexHull && convexHull.properties) {
        convexHull.properties.mode = 'networkOutline';
      }
      draw.addFeatures([convexHull]);
      return convexHull;
    }
  }, [draw, network]);

  const changeMode = useCallback(
    (newMode: string) => {
      if (draw) {
        setMode(newMode);
        draw.setMode(newMode);
      }
    },
    [draw]
  );

  return (
    <div class={style.home}>
      <div ref={ref} class={style.map} id={mapOptions.id}>
        {draw ? <MapButtons mode={mode} changeMode={changeMode} onClear={() => {
          draw.clear();
          convexHull && draw.addFeatures([convexHull]);
        }} /> : null}
        {!draw ? <div class={style.loading}>Loading...</div> : null}
      </div>
    </div>
  );
};

export default Home;
