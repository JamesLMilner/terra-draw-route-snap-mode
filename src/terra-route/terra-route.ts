import { FeatureCollection, LineString, Point, Feature, Position } from "geojson";
import { MinHeap } from "./min-heap";
import { haversineDistance } from "./distance/haversine";

class TerraRoute {
    private network: FeatureCollection<LineString>;
    private distanceMeasurement: (positionA: Position, positionB: Position) => number;
    private adjacencyList: Map<number, Array<{ node: number; distance: number }>>;
    private coords: Position[];
    private coordMap: Map<number, Map<number, number>>;

    constructor(
        network: FeatureCollection<LineString>,
        distanceMeasurement?: (positionA: Position, positionB: Position) => number
    ) {
        this.network = network;
        this.adjacencyList = new Map();
        this.coords = [];
        this.coordMap = new Map();
        this.distanceMeasurement = distanceMeasurement ? distanceMeasurement : haversineDistance;

        // 
        this.buildNetworkGraph();
    }

    private coordinateIndex(coord: Position): number {
        const [lng, lat] = coord;
        if (!this.coordMap.has(lng)) this.coordMap.set(lng, new Map());

        const latMap = this.coordMap.get(lng)!;
        if (latMap.has(lat)) {
            return latMap.get(lat)!;
        }

        const idx = this.coords.length;
        this.coords.push(coord);
        latMap.set(lat, idx);

        return idx;
    }


    private buildNetworkGraph(): void {
        for (const feature of this.network.features) {
            const coords = feature.geometry.coordinates;
            for (let i = 0; i < coords.length - 1; i++) {
                const aIdx = this.coordinateIndex(coords[i]);
                const bIdx = this.coordinateIndex(coords[i + 1]);
                const distance = this.distanceMeasurement(coords[i], coords[i + 1]);

                if (!this.adjacencyList.has(aIdx)) this.adjacencyList.set(aIdx, []);
                if (!this.adjacencyList.has(bIdx)) this.adjacencyList.set(bIdx, []);

                this.adjacencyList.get(aIdx)!.push({ node: bIdx, distance });
                this.adjacencyList.get(bIdx)!.push({ node: aIdx, distance });
            }
        }
    }

    public getRoute(start: Feature<Point>, end: Feature<Point>): Feature<LineString> | null {
        const startIdx = this.coordinateIndex(start.geometry.coordinates);
        const endIdx = this.coordinateIndex(end.geometry.coordinates);

        const openSet = new MinHeap();
        openSet.insert(0, startIdx);
        const cameFrom = new Map<number, number>();
        const gScore = new Map<number, number>([[startIdx, 0]]);

        while (openSet.size() > 0) {
            const current = openSet.extractMin()!;

            if (current === endIdx) {
                const path: Position[] = [];
                let currNode: number | undefined = current;
                while (currNode !== undefined) {
                    path.unshift(this.coords[currNode]);
                    currNode = cameFrom.get(currNode);
                }
                return {
                    type: "Feature",
                    geometry: { type: "LineString", coordinates: path },
                    properties: {},
                };
            }

            for (const neighbor of this.adjacencyList.get(current) || []) {
                const tentativeGScore = (gScore.get(current) ?? Infinity) + neighbor.distance;
                if (tentativeGScore < (gScore.get(neighbor.node) ?? Infinity)) {
                    cameFrom.set(neighbor.node, current);
                    gScore.set(neighbor.node, tentativeGScore);
                    const fScore = tentativeGScore + this.distanceMeasurement(this.coords[neighbor.node], this.coords[endIdx]);
                    openSet.insert(fScore, neighbor.node);
                }
            }
        }

        return null;
    }
}

export default TerraRoute;
