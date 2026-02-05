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
  straightLineFallback?: boolean;
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

  // When straight-line fallback is enabled, we persist whether the user is currently
  // drawing off-network with straight segments (committed via click).
  private isDrawingStraightLine = false;

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

    if (options?.straightLineFallback !== undefined) {
      this.straightLineFallback = options.straightLineFallback;
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

  private measureCoordinateToCoordinate(coordinateOne: Position, coordinateTwo: Position) {
    const { x, y } = this.project(coordinateOne[0], coordinateOne[1]);
    const previousEvent = {
      lng: coordinateOne[0],
      lat: coordinateOne[1],
      containerX: x,
      containerY: y,
      button: 'left' as const,
      heldKeys: []
    }
    const distToPrevious = this.measure(previousEvent, coordinateTwo);

    return distToPrevious
  }


  private close() {
    if (!this.currentId) {
      return;
    }

    // Reset the state back to starting state
    this.currentCoordinate = 0;
    this.currentId = undefined;
    this.currentPointIds = [];
    this.isDrawingStraightLine = false;

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

    this.onFinish(this.currentId, { mode: this.mode, action: "draw" });

    this.close();
  }

  private getFeatureProperties() {
    return { mode: this.mode, isDrawnRoute: true, routeId: this.routeId };
  }

  private getStraightLineString(coordinates: Position[]) {
    return {
      type: "Feature",
      geometry: {
        type: "LineString",
        coordinates,
      },
      properties: this.getFeatureProperties(),
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

  private getMaxResults() {
    const max = 1000;
    const min = 10;
    const onePercentOfPoints = Math.ceil(this.routing.getNodeCount() / 100);
    const maxResults = Math.min(Math.max(onePercentOfPoints, min), max);
    const maxDistance = Infinity;

    return { maxResults, maxDistance };
  }

  private isClosestNetworkCoordinateNearPrevious(previousCoordinate: Position, closestNetworkCoordinate: Position): boolean {
    // Get points near previous coordinate to see if closest network coordinate is close to previous coordinate
    // If it is then we prefer a straight line to avoid doubling back on the route
    const { maxResults, maxDistance } = this.getMaxResults();
    const pointsGeoNearPreviousCoordinate = this.routing.getClosestNetworkCoordinates(previousCoordinate, maxResults, maxDistance)

    const pointsNearPreviousCoordinate = pointsGeoNearPreviousCoordinate
      .filter((coordinate) => {
        return this.measureCoordinateToCoordinate(previousCoordinate, coordinate) <= this.pointerDistance;
      });

    const isCloseToPrevious = pointsNearPreviousCoordinate.some((coordinate) => {
      const matching = coordinate[0] === closestNetworkCoordinate[0] &&
        coordinate[1] === closestNetworkCoordinate[1];
      return matching
    });

    return isCloseToPrevious;
  }

  private resolveFallbackRouteLine({
    closestNetworkCoordinate,
    routedLine,
    straightLine,
    forceStraightLine,
  }: {
    closestNetworkCoordinate: Position;
    routedLine: Feature<LineString> | null;
    straightLine: Feature<LineString>;
    forceStraightLine: boolean;
  }): { linestringRoute: Feature<LineString> | undefined; isStraightLine: boolean } {
    // If the user has already committed to drawing off-network, keep drawing straight
    // segments until a routed segment is committed (state flips on click).
    if (forceStraightLine) {
      return { linestringRoute: straightLine, isStraightLine: true };
    }

    // NOTE: We do not always fallback to a straight line because there may be times when a route cannot be generated
    // because the network is disconnected (i.e. the nearest route network point is on a different connected component). 
    // In these cases drawing a straight line may be undesirable as it may cross the network which may be confusing to the user. 

    const previousCoordinate = straightLine.geometry.coordinates[0];

    // If the closest network coordinate is already effectively "at" the previous
    // coordinate, prefer a straight line to avoid doubling back.
    const isCloseToPrevious = this.isClosestNetworkCoordinateNearPrevious(
      previousCoordinate,
      closestNetworkCoordinate
    );

    if (isCloseToPrevious) {
      return { linestringRoute: straightLine, isStraightLine: true };
    }

    return { linestringRoute: routedLine ? routedLine : undefined, isStraightLine: false };
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

    const routedLine = this.routing.getRoute(
      currentLastCoordinate,
      closestNetworkCoordinate
    );

    const { linestringRoute } = this.resolveFallbackRouteLine({
      closestNetworkCoordinate,
      routedLine,
      straightLine,
      forceStraightLine: this.isDrawingStraightLine,
    });

    if (!linestringRoute) {
      return;
    }

    if (!this.moveLineId) {
      this.createMoveLine(linestringRoute.geometry.coordinates);
    } else {
      this.updateMoveLine(linestringRoute.geometry.coordinates);

    }
  }

  private clickGetUpdateRoute({
    fromCoordinate,
    closestNetworkCoordinate,
  }: {
    fromCoordinate: Position;
    closestNetworkCoordinate: Position;
  }): { linestringRoute: Feature<LineString> | null; pointToCreate: Position } {
    let routedLine = this.routing.getRoute(fromCoordinate, closestNetworkCoordinate);

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
    linestringRoute: Feature<LineString> | undefined;
    pointToCreate: Position;
    isStraightLine: boolean;
  } {
    const eventCoord: Position = [event.lng, event.lat];

    const straightLine = this.getStraightLineString([fromCoordinate, eventCoord]);

    const routedLine = this.routing.getRoute(fromCoordinate, closestNetworkCoordinate);

    const { linestringRoute, isStraightLine } = this.resolveFallbackRouteLine({
      closestNetworkCoordinate,
      routedLine,
      straightLine,
      forceStraightLine: this.isDrawingStraightLine,
    });

    const pointToCreate = isStraightLine ? eventCoord : closestNetworkCoordinate;

    return { linestringRoute, pointToCreate, isStraightLine };
  }

  private createMoveLine(coordinates: Position[]) {
    const [createdId] = this.store.create([
      {
        geometry: {
          type: "LineString",
          coordinates,
        },
        properties: this.getFeatureProperties(),
      },
    ]);

    this.moveLineId = createdId;
  }

  private updateMoveLine(coordinates: Position[]) {
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
      this.isDrawingStraightLine = false;
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

      // New route starts on-network by definition (first click snaps), so reset.
      this.isDrawingStraightLine = false;
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
        });

      if (clickRoute && clickRoute.linestringRoute) {
        this.store.updateGeometry([
          {
            id: this.currentId,
            geometry: clickRoute.linestringRoute.geometry,
          },
        ]);

        // Commit straight-line mode state (only when fallback is enabled)
        this.isDrawingStraightLine =
          this.straightLineFallback && clickRoute && "isStraightLine" in clickRoute
            ? clickRoute.isStraightLine
            : false;

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
        });

      if (clickRoute && clickRoute.linestringRoute) {
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

        // Commit straight-line mode state (only when fallback is enabled)
        this.isDrawingStraightLine =
          this.straightLineFallback && clickRoute && "isStraightLine" in clickRoute
            ? clickRoute.isStraightLine
            : false;

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
    this.isDrawingStraightLine = false;

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