// src/index.ts
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { FieldPulseClient } from "./fieldpulse.js";
import { getTeamForZip, REGIONS } from "./regions.js";

const server = new McpServer({ name: "fieldpulse-scheduler", version: "1.0.0" });
const fp = new FieldPulseClient();

server.tool(
  "suggest_hvac_schedule",
  "Suggests available HVAC technicians and appointment times based on customer location.",
  {
    zip_code: z.string().length(5).describe("Customer's 5-digit zip code"),
    preferred_date: z.string().optional().describe("YYYY-MM-DD (defaults to today)"),
  },
  async ({ zip_code, preferred_date }) => {
    try {
      const date = preferred_date || new Date().toISOString().split('T')[0];
      
      // 1. Identify Region
      const region = getTeamForZip(zip_code);
      
      // 2. Fetch Technicians for this Region
      const technicians = await fp.getHVACTechnicians(region.teamId);
      
      if (!technicians || technicians.length === 0) {
        return {
          content: [{ type: "text", text: `No HVAC technicians found in the ${region.name} region.` }],
          isError: false
        };
      }

      // 3. Mock Distance Calculation (Replace with Google Maps API for production)
      // For now, we assume techs have a 'home_base_zip' or similar field in your FP data.
      const techsWithDistance = technicians.map((t: any) => {
        // MOCK LOGIC: Random distance for demonstration
        const dist = Math.floor(Math.random() * 20) + 1; 
        return { ...t, distanceMiles: dist };
      }).sort((a: any, b: any) => a.distanceMiles - b.distanceMiles);

      // 4. Format Response
      const suggestions = techsWithDistance.slice(0, 3).map((tech: any) => {
        return `**${tech.name}** (ID: ${tech.id})
            Distance: ~${tech.distanceMiles} miles from ${zip_code}
            Availability on ${date}: [Check FieldPulse Calendar for Slot]`;
      });

      return {
        content: [
          {
            type: "text",
            text: `**HVAC Service Suggestions for ${zip_code} (${region.name})**\n\n${suggestions.join('\n\n')}`
          }
        ],
        isError: false
      };

    } catch (error: any) {
      return {
        content: [{ type: "text", text: `Error: ${error.message}` }],
        isError: true
      };
    }
  }
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("FieldPulse Scheduler MCP Running...");
}

main();