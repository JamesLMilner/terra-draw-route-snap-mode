import { Routing } from "./routing";
import { TerraDrawRouteSnapMode } from "./terra-draw-route-snap-mode";

describe("TerraDrawRouteSnapMode", () => {
    const mockRouteFinder = {
        getRoute: jest.fn(),
        setNetwork: jest.fn(),
        expandNetwork: jest.fn(),
    };

    it("should construct the class correctly", () => {
        const routeSnapMode = new TerraDrawRouteSnapMode({
            routing: new Routing({
                network: {
                    type: "FeatureCollection",
                    features: [],
                },
                routeFinder: mockRouteFinder,
            }),
            maxPoints: 5,
        });

        expect(routeSnapMode).toBeDefined();
    });
});
