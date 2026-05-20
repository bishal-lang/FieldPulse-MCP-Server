// src/regions.ts

export interface Region {
  name: string;
  teamId: number;
  areaCodes: string[];
}

// Derived from the SalesMsg 'teams' JSON response
export const REGIONS: Region[] = [
  { name: "DFW (HQ)", teamId: 19834, areaCodes: ["817", "682", "214", "469", "945"] },
  { name: "Houston", teamId: 73585, areaCodes: ["713", "281", "832", "346"] },
  { name: "Austin", teamId: 82473, areaCodes: ["512", "737"] },
  { name: "San Antonio", teamId: 114723, areaCodes: ["210", "830"] },
  { name: "Orlando", teamId: 208422, areaCodes: ["407", "689"] },
  { name: "Tampa", teamId: 208423, areaCodes: ["813"] },
];

export function getTeamForZip(zip: string): Region {
  // Simple heuristic: In production, use a ZipCode API to get Area Code.
  // For testing, we check if the Zip starts with known prefixes or fallback.
  
  const zipPrefix = zip.substring(0, 3);
  
  if (["770", "773", "774", "775"].includes(zipPrefix)) return REGIONS.find(r => r.name === "Houston")!;
  if (["787", "786"].includes(zipPrefix)) return REGIONS.find(r => r.name === "Austin")!;
  if (["782"].includes(zipPrefix)) return REGIONS.find(r => r.name === "San Antonio")!;
  if (["327", "328", "347"].includes(zipPrefix)) return REGIONS.find(r => r.name === "Orlando")!;
  if (["336", "335"].includes(zipPrefix)) return REGIONS.find(r => r.name === "Tampa")!;
  
  // Default to DFW
  return REGIONS.find(r => r.name === "DFW (HQ)")!;
}