import { TerraDrawAdapterStyling, TerraDrawKeyboardEvent, TerraDrawMouseEvent, BehaviorConfig, GeoJSONStoreFeatures, TerraDrawExtend } from "terra-draw";
import { Validation } from "terra-draw/dist/common";
import { RoutingInterface } from "./routing";
type TerraDrawRouteSnapModeKeyEvents = {
    cancel: KeyboardEvent["key"] | null;
    finish: KeyboardEvent["key"] | null;
};
interface Cursors {
    draw?: TerraDrawExtend.Cursor;
    close?: TerraDrawExtend.Cursor;
}
type RouteSnapStyling = {
    lineStringWidth: TerraDrawExtend.NumericStyling;
    lineStringColor: TerraDrawExtend.HexColorStyling;
    routePointColor: TerraDrawExtend.HexColorStyling;
    routePointWidth: TerraDrawExtend.NumericStyling;
    routePointOutlineColor: TerraDrawExtend.HexColorStyling;
    routePointOutlineWidth: TerraDrawExtend.NumericStyling;
};
interface TerraDrawRouteSnapModeOptions<T extends TerraDrawExtend.CustomStyling> extends TerraDrawExtend.BaseModeOptions<T> {
    routing: RoutingInterface;
    pointerDistance?: number;
    keyEvents?: TerraDrawRouteSnapModeKeyEvents | null;
    maxPoints?: number;
    cursors?: Partial<Cursors>;
}
declare const TerraDrawBaseDrawMode: typeof TerraDrawExtend.TerraDrawBaseDrawMode;
export declare class TerraDrawRouteSnapMode extends TerraDrawBaseDrawMode<RouteSnapStyling> {
    mode: "routesnap";
    private currentCoordinate;
    private currentId;
    private keyEvents;
    private cursors;
    private maxPoints;
    private moveLineId;
    private routing;
    private currentPointIds;
    private routeId;
    private latestMouseMoveEvent;
    private didIncrementRouteIdForCurrentRoute;
    constructor(options?: TerraDrawRouteSnapModeOptions<RouteSnapStyling>);
    updateOptions(options?: Partial<TerraDrawRouteSnapModeOptions<RouteSnapStyling>>): void;
    private pixelDistance;
    private measure;
    private close;
    private finish;
    private getFeatureProperties;
    private createRoutePoint;
    private processCursorMove;
    /** @internal */
    registerBehaviors(config: BehaviorConfig): void;
    /** @internal */
    start(): void;
    /** @internal */
    stop(): void;
    /** @internal */
    onMouseMove(event: TerraDrawMouseEvent): void;
    /** @internal */
    onClick(event: TerraDrawMouseEvent): void;
    /** @internal */
    onKeyDown(): void;
    /** @internal */
    onKeyUp(event: TerraDrawKeyboardEvent): void;
    /** @internal */
    onDragStart(): void;
    /** @internal */
    onDrag(): void;
    /** @internal */
    onDragEnd(): void;
    /** @internal */
    cleanUp(): void;
    /** @internal */
    styleFeature(feature: GeoJSONStoreFeatures): TerraDrawAdapterStyling;
    validateFeature(feature: unknown): ReturnType<Validation>;
    afterFeatureAdded(feature: GeoJSONStoreFeatures): void;
}
export { Routing, type RouteFinder, type RoutingInterface } from "./routing";
