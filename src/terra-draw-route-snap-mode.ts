import {
  TerraDrawAdapterStyling,
  TerraDrawKeyboardEvent,
  TerraDrawMouseEvent,
  BehaviorConfig,
  GeoJSONStoreFeatures,
  TerraDrawExtend
} from "terra-draw";
import { Feature, LineString, Position } from "geojson";
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
  straightLineFallback?: boolean | {
    snapAgainWithinPx: number;
  }
}

const { TerraDrawBaseDrawMode } = TerraDrawExtend;

export class TerraDrawRouteSnapMode extends TerraDrawBaseDrawMode<RouteSnapStyling> {
  mode = "routesnap" as const;

  private currentCoordinate = 0;
  private currentId: FeatureId | undefined;
  private keyEvents: TerraDrawRouteSnapModeKeyEvents = defaultKeyEvents;
  private cursors: Required<Cursors> = defaultCursors;

  private maxPoints: number = 2
  private moveLineId: FeatureId | undefined;
  private routing!: RoutingInterface;
  private currentPointIds: FeatureId[] = [];
  private routeId = 0;
  private latestMouseMoveEvent: TerraDrawMouseEvent | null = null;
  private straightLineFallback: boolean = false;
  private snapAgainWithinPx: number | undefined;

  // We keep track of whether the current route incremented routeId so that we
  // can roll it back on cancel/cleanup (so cancelled routes don't consume ids).
  private didIncrementRouteIdForCurrentRoute = false;

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

    if (options?.maxPoints !== undefined && options.maxPoints !== this.maxPoints && options.maxPoints >= 2) {
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

    if (options?.straightLineFallback) {
      this.straightLineFallback = true;

      if (typeof options.straightLineFallback === "object" && options.straightLineFallback.snapAgainWithinPx !== undefined) {
        this.snapAgainWithinPx = options.straightLineFallback.snapAgainWithinPx;
      }
    }
  }

  private pixelDistance = (
    pointOne: { x: number; y: number },
    pointTwo: { x: number; y: number }
  ) => {
    const { x: xOne, y: yOne } = pointOne;
    const { x: xTwo, y: yTwo } = pointTwo;

    const deltaX = xTwo - xOne;
    const deltaY = yTwo - yOne;

    return Math.sqrt(deltaX * deltaX + deltaY * deltaY);
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

  private finish() {
    if (!this.currentId) {
      return;
    }

    // Route is now completed; don't allow cleanUp() to roll back the id.
    this.didIncrementRouteIdForCurrentRoute = false;

    // When finishing a route, we keep the route LineString but remove any temporary
    // route points and preview (move) line segments.
    const deletable = [this.moveLineId, ...this.currentPointIds].filter(
      (id): id is FeatureId => Boolean(id) && this.store.has(id as FeatureId)
    );

    if (deletable.length) {
      this.store.delete(deletable);
    }

    this.close();
  }

  private getFeatureProperties(isStraightLine: boolean = false) {
    return { mode: this.mode, isDrawnRoute: true, routeId: this.routeId, isStraightLine };
  }

  private getStraightLineString(coordinates: Position[]) {
    return {
      type: "Feature",
      geometry: {
        type: "LineString",
        coordinates,
      },
      properties: this.getFeatureProperties(true),
    } as Feature<LineString>;
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

  private updateRoute({
    currentLastCoordinate,
    closestNetworkCoordinate
  }: {
    currentLastCoordinate: Position;
    closestNetworkCoordinate: Position;
  }) {
    const linestringRoute = this.routing.getRoute(currentLastCoordinate, closestNetworkCoordinate);

    if (!linestringRoute) {
      return;
    }

    if (!this.moveLineId) {
      this.createMoveLine(linestringRoute.geometry.coordinates);
    } else {
      this.updateMoveLine(linestringRoute.geometry.coordinates);
    }
  }

  private resolveFallbackRouteLine({
    event,
    closestNetworkCoordinate,
    routedLine,
    straightLine,
    wasStraightLine,
  }: {
    event: TerraDrawMouseEvent;
    closestNetworkCoordinate: Position;
    routedLine: Feature<LineString> | null;
    straightLine: Feature<LineString>;
    wasStraightLine: boolean;
  }): { linestringRoute: Feature<LineString>; isStraightLine: boolean } {
    let isStraightLine = false;
    let linestringRoute = routedLine ?? straightLine;

    if (!routedLine) {
      isStraightLine = true;
      linestringRoute = straightLine;
    } else if (wasStraightLine && this.snapAgainWithinPx !== undefined) {
      const pixelDistToClosestNetworkCoordinate = this.measure(
        event,
        closestNetworkCoordinate
      );

      const isWithinSnapAgainTolerance =
        pixelDistToClosestNetworkCoordinate < this.snapAgainWithinPx;

      if (!isWithinSnapAgainTolerance) {
        isStraightLine = true;
        linestringRoute = straightLine;
      }
    }

    return { linestringRoute, isStraightLine };
  }

  private updateRouteWithFallback({
    event,
    currentLastCoordinate,
    closestNetworkCoordinate
  }: {
    event: TerraDrawMouseEvent;
    currentLastCoordinate: Position;
    closestNetworkCoordinate: Position;
  }) {
    const eventCoord: Position = [event.lng, event.lat];

    const straightLine = this.getStraightLineString([currentLastCoordinate, eventCoord]);

    const wasStraightLine = this.moveLineId
      ? (this.store.getPropertiesCopy(this.moveLineId).isStraightLine as boolean)
      : false;

    const routedLine = this.routing.getRoute(
      currentLastCoordinate,
      closestNetworkCoordinate
    );

    const { linestringRoute, isStraightLine } = this.resolveFallbackRouteLine({
      event,
      closestNetworkCoordinate,
      routedLine,
      straightLine,
      wasStraightLine,
    });

    if (!this.moveLineId) {
      this.createMoveLine(linestringRoute.geometry.coordinates, isStraightLine);
    } else {
      this.updateMoveLine(linestringRoute.geometry.coordinates, isStraightLine);

    }
  }

  private clickGetUpdateRoute({
    fromCoordinate,
    closestNetworkCoordinate,
    eventCoord,
  }: {
    fromCoordinate: Position;
    closestNetworkCoordinate: Position;
    eventCoord: Position;
  }): { linestringRoute: Feature<LineString>; pointToCreate: Position } | null {
    let routedLine = this.routing.getRoute(fromCoordinate, closestNetworkCoordinate);

    if (!routedLine) {
      routedLine = this.getStraightLineString([fromCoordinate, eventCoord]);
    }

    return { linestringRoute: routedLine, pointToCreate: closestNetworkCoordinate };
  }

  private clickGetUpdateRouteWithFallback({
    event,
    fromCoordinate,
    closestNetworkCoordinate,
  }: {
    event: TerraDrawMouseEvent;
    fromCoordinate: Position;
    closestNetworkCoordinate: Position;
  }): {
    linestringRoute: Feature<LineString>;
    pointToCreate: Position;
    isStraightLine: boolean;
  } {
    const eventCoord: Position = [event.lng, event.lat];

    const straightLine = this.getStraightLineString([fromCoordinate, eventCoord]);

    const wasStraightLine = this.moveLineId
      ? (this.store.getPropertiesCopy(this.moveLineId).isStraightLine as boolean)
      : false;

    const routedLine = this.routing.getRoute(fromCoordinate, closestNetworkCoordinate);

    const { linestringRoute, isStraightLine } = this.resolveFallbackRouteLine({
      event,
      closestNetworkCoordinate,
      routedLine,
      straightLine,
      wasStraightLine,
    });

    const pointToCreate = isStraightLine ? eventCoord : closestNetworkCoordinate;

    return { linestringRoute, pointToCreate, isStraightLine };
  }

  private createMoveLine(coordinates: Position[], isStraightLine = false) {
    const [createdId] = this.store.create([
      {
        geometry: {
          type: "LineString",
          coordinates,
        },
        properties: this.getFeatureProperties(isStraightLine),
      },
    ]);

    this.moveLineId = createdId;
  }

  private updateMoveLine(coordinates: Position[], isStraightLine = false) {
    if (!this.moveLineId) {
      return;
    }

    this.store.updateGeometry([
      {
        id: this.moveLineId,
        geometry: {
          type: "LineString",
          coordinates,
        },
      },
    ]);
    this.store.updateProperty([
      {
        id: this.moveLineId,
        property: "isStraightLine",
        value: isStraightLine
      },
    ]);
  }

  private processCursorMove(event: TerraDrawMouseEvent) {
    this.setCursor(this.cursors.draw);

    if (this.moveLineId && !this.store.has(this.moveLineId)) {
      this.moveLineId = undefined;
    }

    if (!this.currentId || this.currentCoordinate === 0) {
      return;
    }

    if (!this.store.has(this.currentId)) {
      this.currentId = undefined;
      this.currentCoordinate = 0;
      this.currentPointIds = [];
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

    if (this.straightLineFallback) {
      this.updateRouteWithFallback({
        event,
        currentLastCoordinate,
        closestNetworkCoordinate
      });
    } else {
      this.updateRoute({
        currentLastCoordinate,
        closestNetworkCoordinate
      });
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
        this.finish();
        return;
      }
    } else {
      // Only increment when we're about to start a new route. We roll this back
      // if the user cancels the route via cleanUp.
      this.routeId++;
      this.didIncrementRouteIdForCurrentRoute = true;
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

      const clickRoute = this.straightLineFallback
        ? this.clickGetUpdateRouteWithFallback({
          event,
          fromCoordinate: firstCoordinate,
          closestNetworkCoordinate: closestPoint,
        })
        : this.clickGetUpdateRoute({
          fromCoordinate: firstCoordinate,
          closestNetworkCoordinate: closestPoint,
          eventCoord,
        });

      if (clickRoute) {
        this.store.updateGeometry([
          {
            id: this.currentId,
            geometry: clickRoute.linestringRoute.geometry,
          },
        ]);

        const pointId = this.createRoutePoint(clickRoute.pointToCreate);

        this.currentCoordinate = 2;
        this.currentPointIds.push(pointId);

        // Handle the edge-case where maxPoints is 2.
        if (this.currentCoordinate >= this.maxPoints) {
          this.finish();
        }
      }
    } else if (
      this.currentCoordinate > 1 &&
      this.currentId &&
      closestPoint &&
      this.currentCoordinate < this.maxPoints
    ) {
      const currentLineGeometry = this.store.getGeometryCopy<LineString>(
        this.currentId
      );

      const currentLength = currentLineGeometry.coordinates.length - 1;
      const currentLastCoordinate = currentLineGeometry.coordinates[currentLength];

      const clickRoute = this.straightLineFallback
        ? this.clickGetUpdateRouteWithFallback({
          event,
          fromCoordinate: currentLastCoordinate,
          closestNetworkCoordinate: closestPoint,
        })
        : this.clickGetUpdateRoute({
          fromCoordinate: currentLastCoordinate,
          closestNetworkCoordinate: closestPoint,
          eventCoord,
        });

      if (clickRoute) {
        const newGeometry = {
          ...currentLineGeometry,
          coordinates: [
            ...currentLineGeometry.coordinates,
            ...clickRoute.linestringRoute.geometry.coordinates.slice(1),
          ],
        };

        this.store.updateGeometry([
          {
            id: this.currentId,
            geometry: newGeometry,
          },
        ]);

        // If adding another point would exceed maxPoints, finish immediately.
        // At this stage we already have `currentCoordinate` route points.
        if (this.currentCoordinate + 1 > this.maxPoints) {
          this.finish();
        } else {
          const pointId = this.createRoutePoint(clickRoute.pointToCreate);

          this.currentCoordinate++;
          this.currentPointIds.push(pointId);

          if (this.currentCoordinate === this.maxPoints) {
            this.finish();
          }
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
      this.finish();
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
    this.currentPointIds = [];
    this.currentCoordinate = 0;

    // If the current route was never finished and we incremented the routeId on
    // start, roll it back so cancelled routes don't consume ids.
    if (this.didIncrementRouteIdForCurrentRoute) {
      this.routeId = Math.max(0, this.routeId - 1);
      this.didIncrementRouteIdForCurrentRoute = false;
    }

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
      styles.pointOutlineColor = this.getHexColorStylingValue(this.styles.routePointOutlineColor, "#B90E0A", feature);
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