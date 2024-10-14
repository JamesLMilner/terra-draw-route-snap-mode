import MapButton from "../map-button/MapButton";
import { h } from "preact";
import style from "./style.css";

const MapButtons = ({
  mode,

  changeMode,
}: {
  mode: string;
  changeMode: (mode: string) => void;
}) => {
  return (
    <div class={style.buttons}>
      <MapButton
        label={"Route Snap"}
        mode={"routesnap"}
        currentMode={mode}
        changeMode={changeMode}
      />
      {/* <MapButton
        label={"Select"}
        mode={"select"}
        currentMode={mode}
        changeMode={changeMode}
      /> */}
    </div>
  );
};

export default MapButtons;
