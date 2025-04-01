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

const Home = () => {
  console.log("Home.tsx");

  const lat = 51.532831;
  const lng = -0.0969151;
  const mapOptions = {
    L,
    id: "leaflet-map",
    lng,
    lat,
    zoom: 16,
    minZoom: 14,
    maxZoom: 20,
    tapTolerance: 10,
    maxBounds: [[lat - 0.1, lng - 0.1], [lat + 0.1, lng + 0.1]] as any
  };
  const ref = useRef(null);
  const [map, setMap] = useState<undefined | L.Map>();
  const [mode, setMode] = useState<string>("static");
  const [network, setNetwork] = useState<any>();

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

  const draw = useMemo(() => {
    if (map && network) {
      const terraDraw = setupDraw(map, L, network);
      terraDraw.start();


      console.log('mode')
      const convexHull = convex(network)

      if (convexHull && convexHull.properties) {
        convexHull.properties.mode = 'networkOutline'
      }

      console.log(convexHull);
      terraDraw.addFeatures([convexHull as GeoJSONStoreFeatures]);

      return terraDraw;
    }
  }, [map, network]);

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
          const routes = draw.getSnapshot().filter((f) => f.properties.mode === 'routesnap');
          draw.removeFeatures(routes.map((f) => f.id) as any[]);
        }} /> : null}
        {!draw ? <div class={style.loading}>Loading...</div> : null}
      </div>
    </div>
  );
};

export default Home;
