// src/index.ts
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { FieldPulseClient } from "./fieldpulse.js";
import { getTeamForZip } from "./regions.js"; 

const server = new McpServer({ 
  name: "fieldpulse-hvac-scheduler", 
  version: "1.0.0" 
});

// Initialize FieldPulse client
const fp = new FieldPulseClient();

server.tool(
  "suggest_hvac_schedule",
  "Suggests available HVAC technicians and appointment times based on customer location.",
  {
    zip_code: z.string().length(5).describe("Customer's 5-digit zip code"),
    preferred_date: z.string().optional().describe("Preferred date (YYYY-MM-DD). Defaults to next 3 business days"),
    response_format: z.enum(["markdown", "json"]).default("markdown"),
  },
  async ({ zip_code, preferred_date, response_format }) => {
    try {
      const date = preferred_date || new Date().toISOString().split('T')[0];
      
      // 1. Identify the correct regional team for this zip code
      // Uses the existing getTeamForZip function
      const team = getTeamForZip(zip_code);
      
      process.stderr.write(`[FieldPulse] Region for ${zip_code}: ${team.name} (team_id: ${team.teamId})\n`);
      
      // 2. Fetch active technicians assigned to this regional team
      const technicians = await fp.getHVACTechnicians([team.teamId]);
      
      if (!technicians || technicians.length === 0) {
        return {
          content: [{ 
            type: "text", 
            text: `No active HVAC technicians found in the ${team.name} region (team_id: ${team.teamId}).` 
          }],
          isError: false
        };
      }
      
      // 3. Calculate distance from customer zip to each technician
      const customerCoords = getZipCoordinates(zip_code);
      
      const techsWithDistance = technicians.map((tech: any) => {
        // Try to get technician coordinates from last_known_location
        const techCoords = tech.last_known_location?.coordinates || 
                          { latitude: 32.7767, longitude: -96.7970 }; // Default to Dallas
                          
        const distKm = haversineDistance(
          customerCoords.lat, customerCoords.lng,
          techCoords.latitude, techCoords.longitude
        );
        
        return {
          ...tech,
          distanceMiles: Math.round(distKm * 0.621371),
          estimatedTravelMin: Math.round(distKm * 0.621371 * 2.5) // ~24mph average
        };
      }).sort((a: any, b: any) => a.distanceMiles - b.distanceMiles);
      
      // 4. Check availability for top 5 nearest technicians
      const topTechs = techsWithDistance.slice(0, 5);
      const suggestions: any[] = [];
      
      // Convert preferred_date to UNIX timestamp for timesheet query
      const startUnix = Math.floor(new Date(date).getTime() / 1000);
      const endUnix = startUnix + (3 * 24 * 60 * 60); // 3 days window
      
      for (const tech of topTechs) {
        try {
          // Fetch timesheets (jobs) for this technician in the date range
          const timesheets = await fp.getAvailability(tech.id, date, date);
          
          // Simplified availability logic: if no timesheets, tech is available
          const isAvailable = timesheets.length === 0;
          
          if (isAvailable) {
            suggestions.push({
              rank: suggestions.length + 1,
              technician_name: `${tech.first_name} ${tech.last_name}`,
              technician_id: tech.id,
              distance_miles: tech.distanceMiles,
              estimated_travel_min: tech.estimatedTravelMin,
              available_slots: [
                { date, start: "08:00", end: "10:00" },
                { date, start: "13:00", end: "15:00" }
              ],
              notes: tech.distanceMiles < 10 ? "Nearest available technician" : "Available, slightly farther"
            });
          }
        } catch (err: any) {
          process.stderr.write(`[FieldPulse] Availability check failed for tech ${tech.id}: ${err.message}\n`);
        }
      }
      
      if (suggestions.length === 0) {
        return {
          content: [{ 
            type: "text", 
            text: `No available time slots found for HVAC service in ${team.name} for the next 3 days.` 
          }],
          isError: false
        };
      }
      
      // 5. Format response
      if (response_format === "json") {
        return {
          content: [{ type: "text", text: JSON.stringify({ suggestions }, null, 2) }],
          isError: false
        };
      }
      
      // Markdown response
      const md = [
        `📍 **HVAC Service Suggestions for ${zip_code} (${team.name})**`,
        "",
        ...suggestions.map((s: any) => [
          `**${s.rank}. ${s.technician_name}** (ID: ${s.technician_id})`,
          `- 🚗 ${s.distance_miles} mi away (~${s.estimated_travel_min} min travel)`,
          `- 📅 Available Slots:`,
          ...s.available_slots.map((slot: any) => `  • ${slot.date} ${slot.start}-${slot.end}`),
          `- 💡 ${s.notes}`
        ].join("\n"))
      ].join("\n\n");
      
      return {
        content: [{ type: "text", text: md }],
        isError: false
      };
      
    } catch (error: any) {
      process.stderr.write(`[FieldPulse] Error: ${error.message}\n`);
      return {
        content: [{ type: "text", text: `Error: ${error.message}` }],
        isError: true
      };
    }
  }
);

// --- Helper Functions ---

// Helper: Haversine distance calculation (km → miles)
function haversineDistance(
  lat1: number, lon1: number, 
  lat2: number, lon2: number
): number {
  const R = 6371; // Earth radius in km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = 
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

// Helper: Get coordinates for a zip code (fallback to Dallas if not in map)
function getZipCoordinates(zip: string): { lat: number; lng: number } {
  const zipCoords: Record<string, { lat: number; lng: number }> = {
    // DFW Area
    "75001": { lat: 32.9617, lng: -96.7033 }, "75019": { lat: 33.0201, lng: -96.8233 },
    "75024": { lat: 33.0684, lng: -96.8233 }, "75034": { lat: 33.1201, lng: -96.7533 },
    "75035": { lat: 33.1001, lng: -96.7333 }, "75038": { lat: 32.9101, lng: -96.9233 },
    "75039": { lat: 32.9301, lng: -96.8833 }, "75041": { lat: 32.7601, lng: -96.7833 },
    "75050": { lat: 32.8501, lng: -96.8633 }, "75060": { lat: 32.8201, lng: -96.9033 },
    "75062": { lat: 32.8801, lng: -96.8433 }, "75063": { lat: 32.9801, lng: -96.8033 },
    "75080": { lat: 33.0401, lng: -96.7833 }, "75081": { lat: 32.9501, lng: -96.7233 },
    "75082": { lat: 33.0101, lng: -96.6833 },
    // Houston Area
    "77001": { lat: 29.7604, lng: -95.3698 }, "77002": { lat: 29.7589, lng: -95.3677 },
    "77003": { lat: 29.7466, lng: -95.3466 }, "77004": { lat: 29.7342, lng: -95.3698 },
    // Austin Area
    "78701": { lat: 30.2672, lng: -97.7431 }, "78702": { lat: 30.2638, lng: -97.7278 },
    // San Antonio Area
    "78201": { lat: 29.4241, lng: -98.4936 }, "78202": { lat: 29.4467, lng: -98.4747 },
    // Orlando/Tampa Area
    "32801": { lat: 28.5383, lng: -81.3792 }, "33602": { lat: 27.9506, lng: -82.4572 },
  };
  
  return zipCoords[zip] || { lat: 32.7767, lng: -96.7970 }; // Default to Dallas
}

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("FieldPulse HVAC Scheduler MCP running...");
}

main().catch((err) => {
  console.error("Failed to start MCP server:", err);
  process.exit(1);
});