# Terra Draw Route Snapping Mode


This repository is for the `TerraDrawRouteSnappingMode` module. `TerraDrawRouteSnappingMode` is designed to help with the scenario where you want to be able to create a multi-stop route on a map, snapping the route against a predefined route network. This is achieved by client side routing on a FeatureCollection<LineString> where the LineStrings have identical coordinates.

## Install

```shell
npm install terra-draw-route-snap-mode
```

## Docs

You can find the [API Docs here](https://jameslmilner.github.io/terra-draw-route-snap-mode/api/)

## Basic Usage

We can import `TerraDrawRouteSnapMode` in this way:

```typescript
import { TerraDrawRouteSnapMode } from terra-draw-route-snap-mode
```

We can construct `TerraDrawRouteSnapMode` like so:

```typescript
  new TerraDrawRouteSnapMode({
    routing,
    maxPoints: 5,
    styles: {
        lineStringColor: '#990000',
        routePointColor: '#990000'
    }
    }),
```

Where `routing` is a property of type:

```typescript
 export interface RoutingInterface {
    getRoute: (startCoord: Position, endCoord: Position) => Feature<LineString> | null;
    getClosestNetworkCoordinate: (coordinate: Position) => Position | null;
}
```

You could construct the `routing` like so:

```typescript
import { Routing } from "../../../src/terra-draw-route-snap-mode";
import { FeatureCollection, LineString } from "geojson";
import { TerraRoute } from 'terra-route';

// Initialise the TerraRoute instance with the default distance
const terraRoute = new TerraRoute()

// Construct the route network ready to call `getRoute` on terraRoute later in the TerraDrawRouteSnapMode instance
terraRoute.buildRouteGraph(network)

const terraRouting = new Routing({
    network,
    useCache: true,
    routeFinder: terraRoute
})
```

If you want to see the faster CheapRuler implementation from the `terra-route` package, please see the demo folder in the `setup-routing.ts` file for an examples. CheapRuler is a reasonable distance metric to use for network graphs of less than 500km size that are not located on or near the poles.

## License

MIT