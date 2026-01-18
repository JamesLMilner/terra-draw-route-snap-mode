import {
  TerraDrawAdapterStyling,
  TerraDrawKeyboardEvent,
  TerraDrawMouseEvent,
  BehaviorConfig,
  GeoJSONStoreFeatures,
  TerraDrawExtend
} from "terra-draw";
import { LineString, Position } from "geojson";
import { Validation } from "terra-draw/dist/common";
import { RoutingInterface } from "./routing";

type TerraDrawLineStringModeKeyEvents = {
  cancel: KeyboardEvent["key"] | null;
  finish: KeyboardEvent["key"] | null;
};

const defaultKeyEvents = { cancel: "Escape", finish: "Enter" };

interface Cursors {
  draw?: TerraDrawExtend.Cursor;
  close?: TerraDrawExtend.Cursor;
}

const defaultCursors = {
  draw: "crosshair",
  close: "pointer"
} as Required<Cursors>;

type RouteStyling = {
  lineStringWidth: TerraDrawExtend.NumericStyling;
  lineStringColor: TerraDrawExtend.HexColorStyling
  routePointColor: TerraDrawExtend.HexColorStyling;
  routePointWidth: TerraDrawExtend.NumericStyling;
  routePointOutlineColor: TerraDrawExtend.HexColorStyling;
  routePointOutlineWidth: TerraDrawExtend.NumericStyling;
};

interface TerraDrawRouteSnapModeOptions<T extends TerraDrawExtend.CustomStyling>
  extends TerraDrawExtend.BaseModeOptions<T> {
  routing: RoutingInterface;
  pointerDistance?: number;
  keyEvents?: TerraDrawLineStringModeKeyEvents | null;
  maxPoints?: number;
  cursors?: Partial<Cursors>;
}

const { TerraDrawBaseDrawMode } = TerraDrawExtend;

export class TerraDrawRouteSnapMode extends TerraDrawBaseDrawMode<RouteStyling> {
  mode = "routesnap" as const;

  private currentCoordinate = 0;
  private currentId: string | undefined;
  private keyEvents: TerraDrawLineStringModeKeyEvents = defaultKeyEvents;
  private cursors: Required<Cursors> = defaultCursors;

  private maxPoints: number = 1
  private moveLineId: string | undefined;
  private routing!: RoutingInterface;
  private currentPointIds: string[] = [];
  private routeId = 0;

  constructor(options?: TerraDrawRouteSnapModeOptions<RouteStyling>) {
    super(options, true);
    this.updateOptions(options);
  }

  override updateOptions(options?: Partial<TerraDrawRouteSnapModeOptions<RouteStyling>>) {
    super.updateOptions(options);

    if (options?.routing && options.routing !== this.routing) {
      // We can't guarantee the rout created so far is valid with the new routing 
      // So we need to clean up the current state
      this.cleanUp();
      this.routing = options.routing;
    }

    if (options?.maxPoints !== undefined && options.maxPoints !== this.maxPoints && options.maxPoints > 0) {
      this.maxPoints = options.maxPoints;
    }

    if (options?.cursors) {
      this.cursors = { ...this.cursors, ...options.cursors };
    }

    // null is the case where we want to explicitly turn key bindings off
    if (options?.keyEvents === null) {
      this.keyEvents = { cancel: null, finish: null };
    } else if (options?.keyEvents) {
      this.keyEvents = { ...this.keyEvents, ...options.keyEvents };
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
  registerBehaviors(config: BehaviorConfig) { }

  /** @internal */
  start() {
    this.setStarted();
    this.setCursor(this.cursors.draw);
  }

  /** @internal */
  stop() {
    this.cleanUp();
    this.setStopped();
    this.setCursor("unset");
  }


  private latestEvent: TerraDrawMouseEvent | null = null;

  /** @internal */
  onMouseMove(event: TerraDrawMouseEvent) {
    this.latestEvent = event;

    requestAnimationFrame(() => {
      const latestEvent = this.latestEvent;
      if (latestEvent) {
        this.processMouseMove(latestEvent);
        this.latestEvent = null;
      }
    });
  }

  private processMouseMove(event: TerraDrawMouseEvent) {
    this.setCursor(this.cursors.draw);

    if (this.moveLineId && !this.store.has(this.moveLineId)) {
      this.moveLineId = undefined;
    }

    if (!this.currentId || this.currentCoordinate === 0) {
      return;
    }

    const currentLineGeometryForCloseCheck = this.store.getGeometryCopy<LineString>(
      this.currentId
    );

    if (!currentLineGeometryForCloseCheck) {
      return;
    }

    // If the cursor is close the last line
    // delete the current moving line and set the cursor to pointer
    if (
      this.measure(
        event,
        currentLineGeometryForCloseCheck.coordinates[
        currentLineGeometryForCloseCheck.coordinates.length - 1
        ]
      ) < this.pointerDistance
    ) {
      this.setCursor(this.cursors.close);

      if (!this.moveLineId) {
        return;
      }
      if (this.store.has(this.moveLineId)) {
        this.store.delete([this.moveLineId]);
      }
      this.moveLineId = undefined;
      return;
    }

    const currentLineGeometry = this.store.getGeometryCopy<LineString>(
      this.currentId
    );

    if (!currentLineGeometry) {
      return;
    }

    const eventCoord = [event.lng, event.lat] as Position;

    const closestPoint = this.routing.getClosestNetworkCoordinate(eventCoord);

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
          properties: { mode: this.mode, isDrawnRoute: true, routeId: this.routeId },
        },
      ]);

      this.moveLineId = createdId as string;
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

    const eventCoord = [event.lng, event.lat] as Position;

    if (this.currentId && !this.store.has(this.currentId)) {
      this.currentId = undefined;
      this.currentCoordinate = 0;
      this.currentPointIds = [];
    }

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
    } else {
      this.routeId++;
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
            properties: { mode: this.mode, isDrawnRoute: true, routeId: this.routeId },
          },
          {
            geometry: {
              type: "Point",
              coordinates: closestPoint,
            },
            properties: { mode: this.mode, isDrawnRoute: true, routeId: this.routeId },
          },
        ]);

        this.currentId = createdId as string;
        this.currentPointIds.push(pointId as string);
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
            properties: { mode: this.mode, isDrawnRoute: true, routeId: this.routeId },
          },
        ]);

        this.currentCoordinate = 2;
        this.currentPointIds.push(pointId as string);
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
            properties: { mode: this.mode, isDrawnRoute: true, routeId: this.routeId },
          },
        ]);

        if (this.maxPoints === this.currentCoordinate) {
          this.close();
        } else {
          this.currentCoordinate++;
          this.currentPointIds.push(pointId as string);
        }
      }
    }
  }

  /** @internal */
  onKeyDown() { }

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
  onDragStart() { }

  /** @internal */
  onDrag() { }

  /** @internal */
  onDragEnd() { }

  /** @internal */
  cleanUp() {
    if (!this.store) {
      return;
    }
    const present = [this.currentId, this.moveLineId, ...this.currentPointIds].filter(id => id && this.store.has(id)) as string[];

    this.store.delete(present);

    this.currentId = undefined;
    this.moveLineId = undefined;
    this.currentCoordinate = 0;
    if (this.state === "drawing") {
      this.setStarted();
    }
  }

  /** @internal */
  styleFeature(feature: GeoJSONStoreFeatures): TerraDrawAdapterStyling {
    const styles = TerraDrawExtend.getDefaultStyling();

    if (
      feature.type === "Feature" &&
      feature.geometry.type === "LineString" &&
      feature.properties.mode === this.mode
    ) {
      styles.lineStringColor = this.getHexColorStylingValue(this.styles.lineStringColor, "#B90E0A", feature);
      styles.lineStringWidth = this.getNumericStylingValue(this.styles.lineStringWidth, 4, feature);
      styles.zIndex = 10;

      return styles;
    } else if (
      feature.type === "Feature" &&
      feature.geometry.type === "Point" &&
      feature.properties.mode === this.mode
    ) {
      styles.pointColor = this.getHexColorStylingValue(this.styles.routePointColor, "#B90E0A", feature);
      styles.pointOutlineColor = this.getHexColorStylingValue(this.styles.routePointColor, "#B90E0A", feature);
      styles.pointOutlineWidth = this.getNumericStylingValue(this.styles.routePointOutlineWidth, 1, feature);

      return styles;
    }

    return styles;
  }

  validateFeature(feature: unknown): ReturnType<Validation> {
    return super.validateFeature(feature)
  }

  afterFeatureAdded(feature: GeoJSONStoreFeatures) { }

}

export { Routing, type RouteFinder, type RoutingInterface } from "./routing";