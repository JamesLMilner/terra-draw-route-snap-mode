import {
  TerraDrawExtend,

  // Types
  HexColor,
  TerraDrawAdapterStyling,
  TerraDrawKeyboardEvent,
  TerraDrawMouseEvent,
} from "terra-draw";
import { Feature, LineString } from "geojson";
import { BehaviorConfig } from "terra-draw/dist/modes/base.behavior";
import { GeoJSONStoreFeatures } from "terra-draw/dist/store/store";

import { Position } from "geojson";

const { TerraDrawBaseDrawMode } = TerraDrawExtend;

type TerraDrawLineStringModeKeyEvents = {
  cancel: KeyboardEvent["key"] | null;
  finish: KeyboardEvent["key"] | null;
};

type RouteStyling = {
  lineStringWidth: number;
  lineStringColor: HexColor;
  routePointColor: HexColor;
  routePointWidth: number;
  routePointOutlineColor: HexColor;
  routePointOutlineWidth: number;
};

export interface RoutingInterface {
  getRoute: (
    startCoord: Position,
    endCoord: Position
  ) => Feature<LineString> | undefined;
  getClosestNetworkCoordinate: (coordinate: Position) => Position | undefined;
}

export class RouteSnapMode extends TerraDrawBaseDrawMode<RouteStyling> {
  mode = "routesnap";

  private currentCoordinate = 0;
  private currentId: string | undefined;
  private keyEvents: TerraDrawLineStringModeKeyEvents;

  private maxPoints: number;
  private moveLineId: string | undefined;
  private routing: RoutingInterface;
  private currentPointIds: string[] = [];

  constructor(options: {
    routing: RoutingInterface;
    pointerDistance?: number;
    styles?: Partial<RouteStyling>;
    keyEvents?: TerraDrawLineStringModeKeyEvents | null;
    maxPoints?: number;
  }) {
    super(options);

    this.routing = options.routing;
    this.maxPoints = options.maxPoints || 1;

    // We want to have some defaults, but also allow key bindings
    // to be explicitly turned off
    if (options?.keyEvents === null) {
      this.keyEvents = { cancel: null, finish: null };
    } else {
      const defaultKeyEvents = { cancel: "Escape", finish: "Enter" };
      this.keyEvents =
        options && options.keyEvents
          ? { ...defaultKeyEvents, ...options.keyEvents }
          : defaultKeyEvents;
    }
  }

  private pixelDistance = (
    pointOne: { x: number; y: number },
    pointTwo: { x: number; y: number }
  ) => {
    const { x: x1, y: y1 } = pointOne;
    const { x: x2, y: y2 } = pointTwo;
    const y = x2 - x1;
    const x = y2 - y1;
    return Math.sqrt(x * x + y * y);
  };

  private measure(clickEvent: TerraDrawMouseEvent, secondCoordinate: Position) {
    const { x, y } = this.project(secondCoordinate[0], secondCoordinate[1]);

    const distance = this.pixelDistance(
      { x, y },
      { x: clickEvent.containerX, y: clickEvent.containerY }
    );

    return distance;
  }

  private close() {
    if (!this.currentId) {
      return;
    }

    // Reset the state back to starting state
    this.currentCoordinate = 0;
    this.currentId = undefined;
    this.currentPointIds = [];

    // Go back to started state
    if (this.state === "drawing") {
      this.setStarted();
    }
  }

  /** @internal */
  registerBehaviors(config: BehaviorConfig) {}

  /** @internal */
  start() {
    this.setStarted();
    this.setCursor("crosshair");
  }

  /** @internal */
  stop() {
    this.cleanUp();
    this.setStopped();
    this.setCursor("unset");
  }

  /** @internal */
  onMouseMove(event: TerraDrawMouseEvent) {
    this.setCursor("crosshair");

    if (!this.currentId || this.currentCoordinate === 0) {
      return;
    }

    if (this.currentId) {
      const currentLineGeometry = this.store.getGeometryCopy<LineString>(
        this.currentId
      );

      // If the cursor is close the last line
      // delete the current moving line and set the cursor to pointer
      if (
        this.measure(
          event,
          currentLineGeometry.coordinates[
            currentLineGeometry.coordinates.length - 1
          ]
        ) < this.pointerDistance
      ) {
        this.setCursor("pointer");
        if (this.moveLineId) {
          this.store.delete([this.moveLineId]);
          this.moveLineId = undefined;
        }

        return;
      }
    }

    const currentLineGeometry = this.store.getGeometryCopy<LineString>(
      this.currentId
    );

    const eventCoord = [event.lng, event.lat];

    let closestPoint = this.routing.getClosestNetworkCoordinate(eventCoord);

    if (!closestPoint) {
      return;
    }

    const length = currentLineGeometry.coordinates.length - 1;

    const geojsonRoute = this.routing.getRoute(
      currentLineGeometry.coordinates[length],
      closestPoint
    );

    if (!geojsonRoute) {
      return;
    }

    if (!this.moveLineId) {
      const [createdId] = this.store.create([
        {
          geometry: geojsonRoute.geometry,
          properties: { mode: this.mode, isDrawnRoute: true },
        },
      ]);

      this.moveLineId = createdId;
    } else {
      this.store.updateGeometry([
        {
          id: this.moveLineId,
          geometry: geojsonRoute.geometry,
        },
      ]);
    }
  }

  /** @internal */
  onClick(event: TerraDrawMouseEvent) {
    if (event.button === "right") {
      return;
    }

    this.setCursor("pointer");

    const eventCoord = [event.lng, event.lat] as Position;

    if (this.currentId) {
      const currentLineGeometry = this.store.getGeometryCopy<LineString>(
        this.currentId
      );

      if (
        this.measure(
          event,
          currentLineGeometry.coordinates[
            currentLineGeometry.coordinates.length - 1
          ]
        ) < this.pointerDistance
      ) {
        if (this.currentCoordinate === 1) {
          this.store.delete(this.currentPointIds);
        }

        this.close();

        return;
      }
    }

    let closestPoint = this.routing.getClosestNetworkCoordinate(eventCoord);

    if (this.currentCoordinate === 0) {
      if (closestPoint) {
        const [createdId, pointId] = this.store.create([
          {
            geometry: {
              type: "LineString",
              coordinates: [closestPoint],
            },
            properties: { mode: this.mode, isDrawnRoute: true },
          },
          {
            geometry: {
              type: "Point",
              coordinates: closestPoint,
            },
            properties: { mode: this.mode, isDrawnRoute: true },
          },
        ]);

        this.currentId = createdId;
        this.currentPointIds.push(pointId);
        this.currentCoordinate++;

        if (this.state === "started") {
          this.setDrawing();
        }
      }
    } else if (this.currentCoordinate === 1 && this.currentId && closestPoint) {
      const currentLineGeometry = this.store.getGeometryCopy<LineString>(
        this.currentId
      );

      const geojsonRoute = this.routing.getRoute(
        currentLineGeometry.coordinates[0],
        closestPoint
      );
      if (geojsonRoute) {
        this.store.updateGeometry([
          {
            id: this.currentId,
            geometry: geojsonRoute?.geometry,
          },
        ]);

        const [pointId] = this.store.create([
          {
            geometry: {
              type: "Point",
              coordinates: closestPoint,
            },
            properties: { mode: this.mode, isDrawnRoute: true },
          },
        ]);

        this.currentCoordinate = 2;
        this.currentPointIds.push(pointId);
      }

      if (this.maxPoints === 1) {
        this.close();

        return;
      }
    } else if (
      this.currentCoordinate > 1 &&
      this.currentId &&
      closestPoint &&
      this.currentCoordinate <= this.maxPoints
    ) {
      const currentLineGeometry = this.store.getGeometryCopy<LineString>(
        this.currentId
      );

      const length = currentLineGeometry.coordinates.length - 1;

      const geojsonRoute = this.routing.getRoute(
        currentLineGeometry.coordinates[length],
        closestPoint
      );

      if (geojsonRoute) {
        const newGeometry = {
          ...currentLineGeometry,
          coordinates: [
            ...currentLineGeometry.coordinates,
            ...geojsonRoute.geometry.coordinates,
          ],
        };

        this.store.updateGeometry([
          {
            id: this.currentId,
            geometry: newGeometry,
          },
        ]);

        const [pointId] = this.store.create([
          {
            geometry: {
              type: "Point",
              coordinates: closestPoint,
            },
            properties: { mode: this.mode, isDrawnRoute: true },
          },
        ]);

        if (this.maxPoints === this.currentCoordinate) {
          this.close();
        } else {
          this.currentCoordinate++;
          this.currentPointIds.push(pointId);
        }
      }
    }
  }

  /** @internal */
  onKeyDown() {}

  /** @internal */
  onKeyUp(event: TerraDrawKeyboardEvent) {
    if (event.key === this.keyEvents.cancel) {
      this.cleanUp();
    }

    if (event.key === this.keyEvents.finish) {
      this.close();
    }
  }

  /** @internal */
  onDragStart() {}

  /** @internal */
  onDrag() {}

  /** @internal */
  onDragEnd() {}

  /** @internal */
  cleanUp() {
    try {
      if (this.currentId) {
        this.store.delete([this.currentId, ...this.currentPointIds]);
      }
    } catch (error) {}

    this.currentId = undefined;
    this.currentCoordinate = 0;
    if (this.state === "drawing") {
      this.setStarted();
    }
  }

  /** @internal */
  styleFeature(feature: GeoJSONStoreFeatures): TerraDrawAdapterStyling {
    const styles = {
      polygonFillColor: "#3f97e0",
      polygonOutlineColor: "#3f97e0",
      polygonOutlineWidth: 4,
      polygonFillOpacity: 0.3,
      pointColor: "#B90E0A",
      pointOutlineColor: "#ffffff",
      pointOutlineWidth: 2,
      pointWidth: 5,
      lineStringColor: "#B90E0A",
      lineStringWidth: 4,
      zIndex: 0,
    } as TerraDrawAdapterStyling;

    if (
      feature.type === "Feature" &&
      feature.geometry.type === "LineString" &&
      feature.properties.mode === this.mode
    ) {
      styles.lineStringColor = this.styles.lineStringColor
        ? this.styles.lineStringColor
        : styles.lineStringColor;
      styles.zIndex = 10;

      styles.lineStringWidth = this.styles.lineStringWidth
        ? this.styles.lineStringWidth
        : styles.lineStringWidth;

      return styles;
    } else if (
      feature.type === "Feature" &&
      feature.geometry.type === "Point" &&
      feature.properties.mode === this.mode
    ) {
      styles.pointOutlineColor =
        this.styles.routePointColor !== undefined
          ? this.styles.routePointColor
          : styles.pointOutlineColor;
      styles.pointOutlineWidth =
        this.styles.routePointOutlineWidth !== undefined
          ? this.styles.routePointOutlineWidth
          : styles.pointOutlineWidth;

      return styles;
    }

    return styles;
  }
}
