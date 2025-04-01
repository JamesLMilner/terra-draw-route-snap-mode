
import { Feature, FeatureCollection, LineString, Position } from 'geojson';
import { readFileSync } from 'fs';
import { Routing } from '../src/routing';
import TerraRoute from "../src/terra-route/terra-route";
import PathFinder, { pathToGeoJSON } from "geojson-path-finder";
import { pointNetworkPairs } from './points';
import { createCheapRuler } from '../src/terra-route/distance/cheap-ruler';
import { shuffleArray } from './shuffle';


const benchmark = (networkPath: string, pairs: [Position, Position][]) => {
    const network = readFileSync(networkPath, 'utf-8');
    const networkParsed = JSON.parse(network) as FeatureCollection<LineString>;

    const rulerDistance = createCheapRuler(networkParsed.features[0].geometry.coordinates[0][1]);

    const terraRoute = new TerraRoute(networkParsed);
    const terraRouteWithCheapRuler = new TerraRoute(networkParsed, (positionA, positionB) => rulerDistance(positionA, positionB));
    const pathFinder = new PathFinder(networkParsed)

    const terraRouting = new Routing({
        network: networkParsed,
        useCache: false,
        routeFinder: {
            getRoute: (positionA, positionB) => terraRoute.getRoute(positionA, positionB)
        }
    })

    const terraRoutingWithCheapRuler = new Routing({
        network: networkParsed,
        useCache: false,
        routeFinder: {
            getRoute: (positionA, positionB) => terraRouteWithCheapRuler.getRoute(positionA, positionB)
        }
    })

    const routingPathFinder = new Routing({
        network: networkParsed,
        useCache: false,
        routeFinder: {
            getRoute: (positionA, positionB) => {
                const route = pathFinder.findPath(positionA, positionB);

                if (route && route?.path.length > 1) {
                    return pathToGeoJSON(route) as Feature<LineString>;
                }

                return null
            }
        }
    })

    const startTimeCheapRuler = Date.now();
    for (let i = 0; i < pairs.length; i++) {
        const pair = pairs[i]
        terraRoutingWithCheapRuler.getRoute(pair[0], pair[1])
    }
    const endTimeCheapRuler = Date.now();
    console.log(`TerraRoute with CheapRuler took ${endTimeCheapRuler - startTimeCheapRuler}ms for ${pairs.length} pairs`);


    const startTime = Date.now();
    for (let i = 0; i < pairs.length; i++) {
        const pair = pairs[i]
        terraRouting.getRoute(pair[0], pair[1])
    }
    const endTime = Date.now();
    console.log(`TerraRoute took ${endTime - startTime}ms for ${pairs.length} pairs`);

    const startTimePathFinder = Date.now();
    for (let i = 0; i < pairs.length; i++) {
        const pair = pairs[i]
        routingPathFinder.getRoute(pair[0], pair[1])
    }
    const endTimePathFinder = Date.now();

    console.log(`PathFinder took ${endTimePathFinder - startTimePathFinder}ms for ${pairs.length} pairs`);

    console.log('')

    // Percentage difference of how much faster or slower TerraRoute is than PathFinder.
    // Here a lower times are better 
    const percentageDifference = ((endTimePathFinder - startTimePathFinder) - (endTime - startTime)) / (endTimePathFinder - startTimePathFinder) * 100;
    console.log(`TerraRoute with Haversine is ${percentageDifference.toFixed(2)}% ${percentageDifference > 0 ? 'faster' : 'slower'} than PathFinder`);

    // Percentage difference of how much faster or slower TerraRoute is than PathFinder.
    // Here a lower times are better 
    const percentageDifferenceWithCheapRuler = ((endTimePathFinder - startTimePathFinder) - (endTimeCheapRuler - startTimeCheapRuler)) / (endTimePathFinder - startTimePathFinder) * 100;
    console.log(`TerraRoute with CheapRuler is ${percentageDifferenceWithCheapRuler.toFixed(2)}% ${percentageDifferenceWithCheapRuler > 0 ? 'faster' : 'slower'} than PathFinder`);
}

benchmark(__dirname + '/../demo/public/network.json', shuffleArray(pointNetworkPairs));