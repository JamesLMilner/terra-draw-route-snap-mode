export default (config, env, helpers) => {
  if (env.production) {
    config.output.publicPath =
      "https://jameslmilner.github.io/terra-draw-route-snap-mode/";
  }
};
