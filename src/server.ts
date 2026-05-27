import 'dotenv/config'
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import axios from "axios";

if (!process.env.GOOGLE_MAPS_API_KEY) {
    throw new Error("Missing GOOGLE_MAPS_API_KEY environment variable");
}
if (!process.env.FIELD_PULSE_API_KEY) {
    throw new Error("Missing FIELD_PULSE_API_KEY environment variable");
}

const GOOGLE_MAPS_API_KEY = process.env.GOOGLE_MAPS_API_KEY;
const FIELD_PULSE_API_KEY = process.env.FIELD_PULSE_API_KEY;
const FIELD_PULSE_BASE_URL = process.env.FIELD_PULSE_BASE_URL || "https://ywe3crmpll.execute-api.us-east-2.amazonaws.com/stage";

const HVAC_USER_IDS = new Set([
  270238,
  274775,
  283126,
  283184,
  283186,
  283187,
  283190,
  283192,
  283193,
  283194,
  283203,
  283206,
  283207,
  283271,
  283273,
  283275,
  283276,
  283277,
  283280,
  283281,
  283282,
  283283,
  283285,
  283288,
  283291,
  283293,
  283295,
  283296,
  283297,
  283418,
  283421,
  285011,
  285018,
  285033,
  285089,
  286582,
  287541,
  288229,
  289374,
  289376,
  289428,
  290293,
  293840,
  294796,
  295853,
  295855,
  297832,
  297833,
  298304,
  299791,
  299792,
  299795,
  300558,
  300730,
  300731,
  300732,
  300733,
  300737,
  300741,
  300751,
  301287,
  301290,
  301291,
  301313,
  307280,
  307281,
  307282,
  307283,
  307835,
  308590,
  308591,
  316711,
  322456,
  325620,
  328708,
  328714
]);

function haversineMiles(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const R = 3959;
    const toRad = (deg: number) => deg * Math.PI / 180;
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a = Math.sin(dLat/2)**2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon/2)**2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

async function geocodeAddress(address: string) {
    const geocodeUrl = `https://maps.googleapis.com/maps/api/geocode/json`;
    const response = await axios.get(geocodeUrl, {
        params: {
            address,
            key: GOOGLE_MAPS_API_KEY,
            region: "us"
        },
        timeout: 5000
    });

    if (response.data.status !== "OK" || !response.data.results?.length) {
        throw new Error(`Failed to geocode address "${address}": ${response.data.status}`);
    }

    const location = response.data.results[0].geometry.location;
    return {
        lat: location.lat,
        lng: location.lng,
    };
}

const server = new McpServer({
    name: "FieldPulse HVAC Scheduler",
    version: "1.0.0",
});

function formatUSPhone(phone: string | null): string {
    if (!phone) {
        return "N/A";
    }
    else{
        return `(${phone.slice(0, 3)}) ${phone.slice(3, 6)}-${phone.slice(6)}`;
    }
}

server.registerTool(
    "FindNearestTechnician",
    {
        title: "Find Nearest Technician",
        description: "Finds the nearest active HVAC technician (role=4) based on customer zip code using Google Routes API for actual driving distance.",
        inputSchema: {
            zip_code: z.string().length(5, "Zip code must be 5 digits").describe("Customer's 5-digit zip code"),
        },
    },
    async (args: { zip_code: string }) => {
        const customerCoords = await geocodeAddress(args.zip_code);

        const response = await axios.get(`${FIELD_PULSE_BASE_URL}/users`, {
            headers: { "x-api-key": FIELD_PULSE_API_KEY },
            params: {
                limit: 300
            },
            timeout: 8000
        });

        const technicians = response.data.response?.filter((user: any) => {
            return user.is_active && user.last_known_location?.coordinates && HVAC_USER_IDS.has(user.id);
        }) || [];

        if (technicians.length === 0) {
            return {
                content: [{ type: "text", text: "No active technicians with location data found in FieldPulse." }],
                isError: false
            };
        }

       const sorted = technicians.sort((a: { last_known_location: { coordinates: { latitude: number; longitude: number; }; }; }, b: { last_known_location: { coordinates: { latitude: number; longitude: number; }; }; }) => {
                const latA = Number(a.last_known_location.coordinates.latitude);
                const lonA = Number(a.last_known_location.coordinates.longitude);
                const latb = Number(b.last_known_location.coordinates.latitude);
                const lonB = Number(b.last_known_location.coordinates.longitude);
                const distA = haversineMiles(latA, lonA, customerCoords.lat, customerCoords.lng);
                const distB = haversineMiles(latb, lonB, customerCoords.lat, customerCoords.lng);
                return distA - distB;
        });
 
        const candidates = sorted.slice(0, 5);
        const routePromises = candidates.map(async (tech: any) => {
            const techCoords = tech.last_known_location.coordinates;
            
            const url = `https://routes.googleapis.com/directions/v2:computeRoutes`;
            const requestBody = {
                origin: {
                    location: {
                        latLng: {
                            latitude: customerCoords.lat,
                            longitude: customerCoords.lng,
                        },
                    },
                },
                destination: {
                    location: {
                        latLng: {
                            latitude: techCoords.latitude,
                            longitude: techCoords.longitude,
                        },
                    },
                },
                travelMode: "DRIVE",
                routingPreference: "TRAFFIC_AWARE",
                units: "IMPERIAL",
                computeAlternativeRoutes: false,
            };

            try {
                const routeResponse = await axios.post(
                    url,
                    requestBody,
                    {
                        headers: {
                            "Content-Type": "application/json",
                            "X-Goog-Api-Key": GOOGLE_MAPS_API_KEY,
                            "X-Goog-FieldMask": "routes.distanceMeters,routes.duration"
                        },
                        timeout: 6000
                    }
                );

                const route = routeResponse.data.routes?.[0];
                if (route?.distanceMeters) {
                    return {
                        ...tech,
                        distanceMiles: Math.round(route.distanceMeters * 0.000621371),
                        durationMin: Math.round(parseInt(route.duration.replace('s', '')) / 60),
                        routeSuccess: true
                    };
                }
                return { ...tech, distanceMiles: null, durationMin: null, routeSuccess: false };
            } catch (error: any) {
                console.error(`[Routes API] Failed for tech ${tech.id}:`, error.message);
                return { ...tech, distanceMiles: null, durationMin: null, routeSuccess: false };
            }
        });



        const results = await Promise.all(routePromises);
        const validResults = results
            .filter((r: any) => r.routeSuccess && r.distanceMiles !== null)
            .sort((a: any, b: any) => ( a.distanceMiles ?? Infinity ) - ( b.distanceMiles ?? Infinity ))

        if (validResults.length === 0) {
            return {
                content: [{ type: "text", text: "Could not calculate driving routes to any technicians." }],
                isError: false
            };
        }

        const nearest = validResults[0];
        const resultText = `Nearest HVAC Technician for ${args.zip_code}


        Name: ${nearest.first_name} ${nearest.last_name} (ID: ${nearest.id})
        Distance: ${nearest.distanceMiles} mi away (~${nearest.durationMin} min drive)
        Email: ${nearest.email || "N/A"}
        Phone: ${formatUSPhone(nearest.phone) || "N/A"}
        Location last updated: ${nearest.last_known_location.time}
        Customer Coordinates: ${customerCoords.lat}, ${customerCoords.lng}
        Coordinates ${nearest.last_known_location.coordinates.latitude}, ${nearest.last_known_location.coordinates.longitude}`

        return {
            content: [{ type: "text", text: resultText }],
        };
    }
);

server.connect(new StdioServerTransport());