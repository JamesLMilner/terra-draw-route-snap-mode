import { h } from "preact";
import style from "./style.module.css";

const ClearButton = ({
  label,
  onClick,
}: {
  onClick: () => void;
  label?: string;
}) => {
  let classes = style.button;

  return (
    <button
      id={'clear'}
      class={classes}
      onClick={() => {
        onClick()
      }}
    >
      {label}
    </button>
  );
};

export default ClearButton;
