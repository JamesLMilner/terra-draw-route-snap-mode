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

  /**
   * When enabled, if the routing engine can't find a route between two
   * coordinates, the mode will fall back to drawing a straight line segment.
   */
  fallbackToStraightLine?:
  | boolean
  | {
    /**
     * If set, snapping back to the closest network coordinate will only happen
     * when that coordinate is at least this many pixels closer to the cursor
     * position than the current straight-line start position (the last route
     * coordinate). This increasing this value will mean there is a tolerance before
     * snapping back to the network will occur when moving the cursor when you have a
     * straight line drawn.
     *
     * Default: 0
     */
    closerByTolerancePx?: number;

    /**
     * The value by which we always allows snapping to a nearby
     * network coordinate, even if `closerByTolerancePx` would
     * otherwise block it. This prevents the user not being able to snap even in
     * situations where they are very close to a network coordinate.
     *
     * Default: 5
     */
    forceSnapWithinPx?: number;
  };
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
  private fallbackToStraightLine = false;
  private closerByTolerancePx = 0;
  private forceSnapWithinPx = 5;

  private resetFallbackToStraightLineDefaults() {
    this.closerByTolerancePx = 0;
    this.forceSnapWithinPx = 5;
  }

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

    if (options?.fallbackToStraightLine !== undefined) {
      const cfg = options.fallbackToStraightLine;

      // Supported forms:
      // - false: disable
      // - true: enable with defaults
      // - { ... }: enable and override any provided tuning values
      if (cfg === false) {
        this.fallbackToStraightLine = false;
        this.resetFallbackToStraightLineDefaults();
      } else if (cfg === true) {
        this.fallbackToStraightLine = true;
        this.resetFallbackToStraightLineDefaults();
      } else if (cfg && typeof cfg === "object") {
        this.fallbackToStraightLine = true;

        // Only override tuning values when provided.
        if (cfg.closerByTolerancePx !== undefined) {
          this.closerByTolerancePx = cfg.closerByTolerancePx;
        }

        if (cfg.forceSnapWithinPx !== undefined) {
          this.forceSnapWithinPx = cfg.forceSnapWithinPx;
        }
      } else {
        // null/undefined: disable (undefined is handled by outer condition)
        this.fallbackToStraightLine = false;
        this.resetFallbackToStraightLineDefaults();
      }
    }
  }

  private createStraightLineRoute(start: Position, end: Position): Feature<LineString> {
    return {
      type: "Feature",
      geometry: {
        type: "LineString",
        coordinates: [start, end],
      },
      properties: {},
    };
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

  private shouldAllowSnapToNetworkCoordinate(
    event: TerraDrawMouseEvent,
    currentLastCoordinate: Position,
    candidateNetworkCoordinate: Position
  ) {
    // Only gate snapping attempts when straight-line fallback is available.
    // Otherwise, a failed routing attempt should simply produce no segment.
    if (!this.fallbackToStraightLine) {
      return true;
    }

    if (this.closerByTolerancePx <= 0) {
      return true;
    }

    const distToCandidate = this.measure(event, candidateNetworkCoordinate);
    const distToStart = this.measure(event, currentLastCoordinate);
    const delta = distToStart - distToCandidate;

    // Allow snapping if the candidate is meaningfully closer *or* we're within
    // the override distance.
    return (
      delta >= this.closerByTolerancePx ||
      distToCandidate < this.forceSnapWithinPx
    );
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

  private syncIntermediateRoutePoints(coordinates: Position[]) {
    // Remove any previously created intermediate points (keep only the
    // "anchor" route points created on click).
    if (this.currentPointIds.length > this.currentCoordinate) {
      const intermediateIds = this.currentPointIds.slice(this.currentCoordinate);
      const deletable = intermediateIds.filter((id) => this.store.has(id));
      if (deletable.length) {
        this.store.delete(deletable);
      }
      this.currentPointIds = this.currentPointIds.slice(0, this.currentCoordinate);
    }

    // Add points for any extra rendered coordinates beyond the anchor points.
    // We exclude the first coordinate because it's already represented by an
    // anchor point (last clicked point) for the current segment.
    for (let i = 1; i < coordinates.length; i++) {
      const id = this.createRoutePoint(coordinates[i]);
      this.currentPointIds.push(id);
    }
  }

  private clearIntermediateRoutePoints() {
    // Keep only the anchor points (created on click). Anything beyond
    // `currentCoordinate` is considered an intermediate rendered point.
    if (this.currentPointIds.length <= this.currentCoordinate) {
      return;
    }

    const intermediateIds = this.currentPointIds.slice(this.currentCoordinate);
    const deletable = intermediateIds.filter((id) => this.store.has(id));
    if (deletable.length) {
      this.store.delete(deletable);
    }

    this.currentPointIds = this.currentPointIds.slice(0, this.currentCoordinate);
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

      // If we were previewing a straight line, ensure its intermediate points
      // are removed when the user moves into the close/finish state.
      this.clearIntermediateRoutePoints();
      return;
    }

    const eventCoord: Position = [event.lng, event.lat];

    const closestNetworkCoordinate = this.routing.getClosestNetworkCoordinate(eventCoord);

    if (!closestNetworkCoordinate) {
      return;
    }

    // When straight-line fallback is enabled, optionally require the target
    // network coordinate to be *meaningfully* closer than the straight-line
    // start before we attempt to snap/rout to it.
    //
    // If this condition isn't met, we still allow straight-line preview; we
    // just skip routing/snapped preview for this mouse move.
    const allowSnapToNetworkCoordinate = this.shouldAllowSnapToNetworkCoordinate(
      event,
      currentLastCoordinate,
      closestNetworkCoordinate
    );

    const linestringRoute = allowSnapToNetworkCoordinate
      ? this.routing.getRoute(currentLastCoordinate, closestNetworkCoordinate)
      : null;

    if (!linestringRoute && this.fallbackToStraightLine) {
      // Preview segment falls back to a straight line
      const straightLine = this.createStraightLineRoute(currentLastCoordinate, eventCoord);

      // Important: do not create point features on mouse move. Snapped routes
      // only create points on click, so straight-line fallback should match.
      this.clearIntermediateRoutePoints();

      if (!this.moveLineId) {
        const [createdId] = this.store.create([
          {
            geometry: straightLine.geometry,
            properties: this.getFeatureProperties(),
          },
        ]);

        this.moveLineId = createdId;
      } else {
        this.store.updateGeometry([
          {
            id: this.moveLineId,
            geometry: straightLine.geometry,
          },
        ]);
      }

      return;
    }

    if (!linestringRoute) {
      // No preview segment - clear any intermediate points from prior fallback.
      this.clearIntermediateRoutePoints();
      return;
    }

    // We have a routed preview segment; clear any intermediate points from a
    // prior straight-line fallback preview.
    this.clearIntermediateRoutePoints();

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
        this.finish();
        return;
      }
    } else {
      // Only increment when we're about to start a new route. We roll this back
      // if the user cancels the route via cleanUp.
      this.routeId++;
      this.didIncrementRouteIdForCurrentRoute = true;
    }

    const closestNetworkCoordinate = this.routing.getClosestNetworkCoordinate(eventCoord);

    if (this.currentCoordinate === 0 && closestNetworkCoordinate) {
      const [createdId, pointId] = this.store.create([
        {
          geometry: {
            type: "LineString",
            coordinates: [closestNetworkCoordinate],
          },
          properties: this.getFeatureProperties(),
        },
        {
          geometry: {
            type: "Point",
            coordinates: closestNetworkCoordinate,
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
    } else if (this.currentCoordinate === 1 && this.currentId && closestNetworkCoordinate) {
      const currentLineGeometry = this.store.getGeometryCopy<LineString>(
        this.currentId
      );
      const firstCoordinate = currentLineGeometry.coordinates[0];

      const allowSnapToNetworkCoordinate = this.shouldAllowSnapToNetworkCoordinate(
        event,
        firstCoordinate,
        closestNetworkCoordinate
      );

      const linestringRoute = allowSnapToNetworkCoordinate
        ? this.routing.getRoute(firstCoordinate, closestNetworkCoordinate)
        : null;

      if (linestringRoute || this.fallbackToStraightLine) {
        const usedRoute = linestringRoute
          ? linestringRoute
          : this.createStraightLineRoute(firstCoordinate, eventCoord);

        if (!linestringRoute && this.fallbackToStraightLine) {
          this.syncIntermediateRoutePoints(usedRoute.geometry.coordinates);
        }

        this.store.updateGeometry([
          {
            id: this.currentId,
            geometry: usedRoute.geometry,
          },
        ]);

        // If we fell back to a straight line, the committed segment ends at the
        // raw click location (eventCoord), not the snapped network coordinate.
        // Creating a point at the snapped coord would be misleading and tends
        // to get cleared on the next mouse move.
        const pointId = this.createRoutePoint(
          linestringRoute ? closestNetworkCoordinate : eventCoord
        )

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
      closestNetworkCoordinate &&
      this.currentCoordinate < this.maxPoints
    ) {
      const currentLineGeometry = this.store.getGeometryCopy<LineString>(
        this.currentId
      );

      const currentLength = currentLineGeometry.coordinates.length - 1;
      const currentLastCoordinate = currentLineGeometry.coordinates[currentLength];

      const allowSnapToNetworkCoordinate = this.shouldAllowSnapToNetworkCoordinate(
        event,
        currentLastCoordinate,
        closestNetworkCoordinate
      );

      const linestringRoute = allowSnapToNetworkCoordinate
        ? this.routing.getRoute(currentLastCoordinate, closestNetworkCoordinate)
        : null;

      const usedRoute = linestringRoute
        ? linestringRoute
        : (this.fallbackToStraightLine
          ? this.createStraightLineRoute(currentLastCoordinate, eventCoord)
          : null);

      if (usedRoute) {
        if (!linestringRoute && this.fallbackToStraightLine) {
          this.syncIntermediateRoutePoints(usedRoute.geometry.coordinates);
        }
        const newGeometry = {
          ...currentLineGeometry,
          coordinates: [
            ...currentLineGeometry.coordinates,
            ...usedRoute.geometry.coordinates.slice(1),
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
          // If we fell back to a straight line, the committed segment ends at
          // the raw click location (eventCoord), not the snapped network
          // coordinate.
          const pointId = this.createRoutePoint(
            linestringRoute ? closestNetworkCoordinate : eventCoord
          );
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