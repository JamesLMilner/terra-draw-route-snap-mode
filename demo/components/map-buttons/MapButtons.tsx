import MapButton from "../map-button/MapButton";
import ClearButton from "../map-button/ClearButton";
import { h } from "preact";
import style from "./style.module.css";
import { RouteFinderOptions, RouteFinders } from "../../routes/home/setup-routing";

const MapButtons = ({
  mode,
  onClear,
  changeMode,
  onPrune,
  routingOption,
  routingDisabled,
  onRoutingChange,
}: {
  mode: string;
  changeMode: (mode: string) => void;
  onClear: () => void;
  onPrune: () => void;
  routingOption: RouteFinderOptions;
  routingDisabled: boolean;
  onRoutingChange: (value: RouteFinderOptions) => void;
}) => {
  return (
    <div class={style.controls}>
      <div class={style.primaryRow}>
        <div class={style.primaryControl}>
          <MapButton
            label={"Route Snap"}
            mode={"routesnap"}
            currentMode={mode}
            changeMode={changeMode}
          />
        </div>
        <div class={style.primaryControl}>
          <ClearButton onClick={onClear} label="Clear" />
        </div>
      </div>
      <button class={style.button} onClick={onPrune}>
        Prune
      </button>
      <select
        value={routingOption}
        disabled={routingDisabled}
        onChange={(event) => {
          const select = event.target as HTMLSelectElement;
          const value = select.options[select.selectedIndex]
            .value as RouteFinderOptions;
          onRoutingChange(value);
        }}
        class={style.routingSelect}
      >
        <option value={RouteFinders.TerraRoute}>Terra Route</option>
        <option value={RouteFinders.GeoJSONPathFinder}>GeoJSON Path Finder</option>
      </select>
    </div>
  );
};

export default MapButtons;
