import { TerraDrawAdapterStyling, TerraDrawKeyboardEvent, TerraDrawMouseEvent, BehaviorConfig, GeoJSONStoreFeatures, TerraDrawExtend } from "terra-draw";
import { Validation } from "terra-draw/dist/common";
import { RoutingInterface } from "./routing";
type TerraDrawLineStringModeKeyEvents = {
    cancel: KeyboardEvent["key"] | null;
    finish: KeyboardEvent["key"] | null;
};
interface Cursors {
    draw?: TerraDrawExtend.Cursor;
    close?: TerraDrawExtend.Cursor;
}
type RouteStyling = {
    lineStringWidth: TerraDrawExtend.NumericStyling;
    lineStringColor: TerraDrawExtend.HexColorStyling;
    routePointColor: TerraDrawExtend.HexColorStyling;
    routePointWidth: TerraDrawExtend.NumericStyling;
    routePointOutlineColor: TerraDrawExtend.HexColorStyling;
    routePointOutlineWidth: TerraDrawExtend.NumericStyling;
};
interface TerraDrawPolygonModeOptions<T extends TerraDrawExtend.CustomStyling> extends TerraDrawExtend.BaseModeOptions<T> {
    routing: RoutingInterface;
    pointerDistance?: number;
    keyEvents?: TerraDrawLineStringModeKeyEvents | null;
    maxPoints?: number;
    cursors?: Partial<Cursors>;
}
declare const TerraDrawBaseDrawMode: typeof TerraDrawExtend.TerraDrawBaseDrawMode;
export declare class TerraDrawRouteSnapMode extends TerraDrawBaseDrawMode<RouteStyling> {
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
    constructor(options?: TerraDrawPolygonModeOptions<RouteStyling>);
    updateOptions(options?: Partial<TerraDrawPolygonModeOptions<RouteStyling>>): void;
    private pixelDistance;
    private measure;
    private close;
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
export { Routing, RouteFinder, RoutingInterface } from "./routing";
