import { Feature, FeatureCollection, LineString } from "geojson";
import { TerraDrawExtend, TerraDrawMouseEvent } from "terra-draw";

export function MockModeConfig() {
    return {
        mode: "routesnap",
        store: new TerraDrawExtend.GeoJSONStore(),
        setCursor: jest.fn(),
        onChange: jest.fn(),
        onSelect: jest.fn(),
        onDeselect: jest.fn(),
        project: jest.fn((lng, lat) => ({ x: lng * 40, y: lat * 40 })),
        unproject: jest.fn((x, y) => ({ lng: x / 40, lat: y / 40 })),
        setDoubleClickToZoom: jest.fn(),
        onFinish: jest.fn(),
        coordinatePrecision: 9,
        projection: "web-mercator",
    };
}


export const MockCursorEvent = ({
    lng,
    lat,
    button,
    isContextMenu,
}: {
    lng: TerraDrawMouseEvent["lng"];
    lat: TerraDrawMouseEvent["lat"];
    button?: TerraDrawMouseEvent["button"];
    isContextMenu?: boolean;
}) =>
    ({
        lng,
        lat,
        containerX: lng * 40,
        containerY: lat * 40,
        button: button ? button : ("left" as const),
        heldKeys: [],
        isContextMenu: isContextMenu ? isContextMenu : false,
    }) as TerraDrawMouseEvent;


export const CreateLineStringCollection = (lineStringCoordinates: LineString['coordinates'][]): FeatureCollection<LineString> => ({
    type: "FeatureCollection",
    features: lineStringCoordinates.map(coords => ({
        type: "Feature",
        geometry: {
            type: "LineString",
            coordinates: coords
        },
        properties: {}
    })),
});

export const CreateTwoPointNetwork = () =>
    CreateLineStringCollection([
        [
            [1, 2],
            [3, 4],
        ],
    ]);

export const CreateThreePointNetwork = () =>
    CreateLineStringCollection([
        [
            [1, 2],
            [3, 4],
            [5, 6],
        ],
    ]);

export const CreateLineString = (coordinates: LineString['coordinates']): Feature<LineString> => ({
    type: "Feature",
    geometry: {
        type: "LineString",
        coordinates
    },
    properties: {}
});