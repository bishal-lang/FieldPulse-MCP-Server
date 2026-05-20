// src/regions.ts
export interface Region {
  name: string;
  teamId: number;
  areaCodes: string[];
}

export const HVAC_REGIONS: Region[] = [
  { name: "HVAC - DFW", teamId: 19834, areaCodes: ["817", "682", "214", "469", "945"] },
  { name: "HVAC - Houston", teamId: 73585, areaCodes: ["713", "281", "832", "346"] },
  { name: "HVAC - Austin", teamId: 82473, areaCodes: ["512", "737"] },
  { name: "HVAC - San Antonio", teamId: 114723, areaCodes: ["210", "830"] },
  { name: "HVAC - Orlando", teamId: 208422, areaCodes: ["407", "689"] },
  { name: "HVAC - Tampa", teamId: 208423, areaCodes: ["813"] },
];

export function getTeamForZip(zip: string): Region {
  const zipPrefix = zip.substring(0, 3);
  
  if (["770", "773", "774", "775"].includes(zipPrefix)) 
    return HVAC_REGIONS.find(r => r.name === "HVAC - Houston")!;
  if (["787", "786"].includes(zipPrefix)) 
    return HVAC_REGIONS.find(r => r.name === "HVAC - Austin")!;
  if (["782"].includes(zipPrefix)) 
    return HVAC_REGIONS.find(r => r.name === "HVAC - San Antonio")!;
  if (["407", "689"].includes(zipPrefix)) 
    return HVAC_REGIONS.find(r => r.name === "HVAC - Orlando")!;
  if (["813"].includes(zipPrefix)) 
    return HVAC_REGIONS.find(r => r.name === "HVAC - Tampa")!;
  
  // Default to DFW
  return HVAC_REGIONS.find(r => r.name === "HVAC - DFW")!;
}