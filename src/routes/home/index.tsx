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
import GeolocationButton from "../../components/geolocation-button/GeolocationButton";

const Home = () => {
  console.log("Home.tsx");

  const mapOptions = {
    L,
    id: "leaflet-map",
    lng: -0.0969151,
    lat: 51.532831,
    zoom: 16,
  };
  const ref = useRef(null);
  const [map, setMap] = useState<undefined | L.Map>();
  const [mode, setMode] = useState<string>("static");
  const [network, setNetwork] = useState<any>();

  useEffect(() => {
    fetch("./src/assets/network/network.json").then((res) => {
      res.json().then((network) => {
        setNetwork(network);
      });
    });
  }, []);

  useEffect(() => {
    setMap(setupLeafletMap(mapOptions));
  }, []);

  const draw = useMemo(() => {
    if (map && network) {
      const terraDraw = setupDraw(map, L, network);
      terraDraw.start();
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
        {navigator.geolocation && draw ? (
          <GeolocationButton
            setLocation={(position) => {
              map && map.setView([position[1], position[0]], 14);
            }}
          />
        ) : null}
        {draw ? <MapButtons mode={mode} changeMode={changeMode} /> : null}
        {!draw ? <div class={style.loading}>Loading...</div> : null}
      </div>
    </div>
  );
};

export default Home;
