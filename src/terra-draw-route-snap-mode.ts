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
import { FeatureId } from "terra-draw/dist/extend";

type TerraDrawRouteSnapModeKeyEvents = {
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

type RouteSnapStyling = {
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
  keyEvents?: TerraDrawRouteSnapModeKeyEvents | null;
  maxPoints?: number;
  cursors?: Partial<Cursors>;
}

const { TerraDrawBaseDrawMode } = TerraDrawExtend;

export class TerraDrawRouteSnapMode extends TerraDrawBaseDrawMode<RouteSnapStyling> {
  mode = "routesnap" as const;

  private currentCoordinate = 0;
  private currentId: FeatureId | undefined;
  private keyEvents: TerraDrawRouteSnapModeKeyEvents = defaultKeyEvents;
  private cursors: Required<Cursors> = defaultCursors;

  private maxPoints: number = 1
  private moveLineId: FeatureId | undefined;
  private routing!: RoutingInterface;
  private currentPointIds: FeatureId[] = [];
  private routeId = 0;
  private latestMouseMoveEvent: TerraDrawMouseEvent | null = null;

  constructor(options?: TerraDrawRouteSnapModeOptions<RouteSnapStyling>) {
    super(options, true);
    this.updateOptions(options);
  }

  override updateOptions(options?: Partial<TerraDrawRouteSnapModeOptions<RouteSnapStyling>>) {
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

  private getFeatureProperties() {
    return { mode: this.mode, isDrawnRoute: true, routeId: this.routeId }
  }

  private createRoutePoint(position: Position) {
    const [createdId] = this.store.create([
      {
        geometry: {
          type: "Point",
          coordinates: position,
        },
        properties: this.getFeatureProperties(),
      },
    ]);

    return createdId;
  }

  private processCursorMove(event: TerraDrawMouseEvent) {
    this.setCursor(this.cursors.draw);

    if (this.moveLineId && !this.store.has(this.moveLineId)) {
      this.moveLineId = undefined;
    }

    if (!this.currentId || this.currentCoordinate === 0) {
      return;
    }

    const currentLineGeometry = this.store.getGeometryCopy<LineString>(
      this.currentId
    );

    if (!currentLineGeometry) {
      return;
    }

    const currentCoordinates = currentLineGeometry.coordinates;
    const currentLength = currentCoordinates.length - 1;
    const currentLastCoordinate = currentCoordinates[currentLength];
    const canClose = this.measure(event, currentLastCoordinate) < this.pointerDistance;

    // If the cursor is close to the last line closing coordinate
    // delete the current moving line and set the cursor to pointer
    if (canClose) {
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

    const eventCoord: Position = [event.lng, event.lat];

    const closestNetworkCoordinate = this.routing.getClosestNetworkCoordinate(eventCoord);

    if (!closestNetworkCoordinate) {
      return;
    }

    const linestringRoute = this.routing.getRoute(currentLastCoordinate, closestNetworkCoordinate);

    if (!linestringRoute) {
      return;
    }

    if (!this.moveLineId) {
      const [createdId] = this.store.create([
        {
          geometry: linestringRoute.geometry,
          properties: this.getFeatureProperties(),
        },
      ]);

      this.moveLineId = createdId;
    } else {
      this.store.updateGeometry([
        {
          id: this.moveLineId,
          geometry: linestringRoute.geometry,
        },
      ]);
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

  /** @internal */
  onMouseMove(event: TerraDrawMouseEvent) {
    this.latestMouseMoveEvent = event;

    requestAnimationFrame(() => {
      const latestEvent = this.latestMouseMoveEvent;
      if (latestEvent) {
        this.processCursorMove(latestEvent);
        this.latestMouseMoveEvent = null;
      }
    });
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

      const currentCoordinates = currentLineGeometry.coordinates;
      const currentLastCoordinate = currentCoordinates[currentCoordinates.length - 1];
      const canClose = this.measure(event, currentLastCoordinate) < this.pointerDistance;

      if (canClose) {
        const deletable = this.currentPointIds.filter(id => this.store.has(id));
        this.store.delete(deletable);

        this.close();

        return;
      }
    } else {
      this.routeId++;
    }

    const closestPoint = this.routing.getClosestNetworkCoordinate(eventCoord);

    if (this.currentCoordinate === 0 && closestPoint) {
      const [createdId, pointId] = this.store.create([
        {
          geometry: {
            type: "LineString",
            coordinates: [closestPoint],
          },
          properties: this.getFeatureProperties(),
        },
        {
          geometry: {
            type: "Point",
            coordinates: closestPoint,
          },
          properties: this.getFeatureProperties(),
        },
      ]);

      this.currentId = createdId;
      this.currentPointIds.push(pointId);
      this.currentCoordinate++;

      if (this.state === "started") {
        this.setDrawing();
      }
    } else if (this.currentCoordinate === 1 && this.currentId && closestPoint) {
      const currentLineGeometry = this.store.getGeometryCopy<LineString>(
        this.currentId
      );
      const firstCoordinate = currentLineGeometry.coordinates[0];

      const linestringRoute = this.routing.getRoute(
        firstCoordinate,
        closestPoint
      );

      if (linestringRoute) {
        this.store.updateGeometry([
          {
            id: this.currentId,
            geometry: linestringRoute?.geometry,
          },
        ]);

        const pointId = this.createRoutePoint(closestPoint)

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

      const currentLength = currentLineGeometry.coordinates.length - 1;
      const currentLastCoordinate = currentLineGeometry.coordinates[currentLength];

      const linestringRoute = this.routing.getRoute(
        currentLastCoordinate,
        closestPoint
      );

      if (linestringRoute) {
        const newGeometry = {
          ...currentLineGeometry,
          coordinates: [
            ...currentLineGeometry.coordinates,
            ...linestringRoute.geometry.coordinates,
          ],
        };

        this.store.updateGeometry([
          {
            id: this.currentId,
            geometry: newGeometry,
          },
        ]);

        const pointId = this.createRoutePoint(closestPoint);

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