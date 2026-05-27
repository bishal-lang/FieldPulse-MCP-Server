import axios from 'axios';
import fs from 'fs/promises';
import path from 'path';
import 'dotenv/config';

const API_KEY = process.env.FIELD_PULSE_API_KEY || '';
const BASE_URL = process.env.FIELD_PULSE_BASE_URL || 'https://ywe3crmpll.execute-api.us-east-2.amazonaws.com/stage';
const OUTPUT_FILE = path.join(process.cwd(), 'hvac_technician_ids.json');

const TARGET_TEAM_IDS = new Set([
  178661, 177568, 174715, 177569, 177570, 177571, // Service
  177574, 177573, 177572, 177575, 177576, 177577  // Install
]);

async function main() {  
  const allUserIds = new Set<number>();
  let foundTeams = new Set<number>();
  let page = 1;
  const limit = 5; 
  const maxPages = 100; 

  while (foundTeams.size < 12 && page <= maxPages) {
    try {
      console.error(`Scanning page ${page}...`);
      const res = await axios.get(`${BASE_URL}/teams`, {
        headers: { 'x-api-key': API_KEY },
        params: { limit, page },
        timeout: 30000
      });

      const teams = res.data.response || res.data.teams || [];
      if (teams.length === 0) break;

      for (const t of teams) {
        if (TARGET_TEAM_IDS.has(t.id)) {
          foundTeams.add(t.id);
          if (Array.isArray(t.members)) {
            t.members.forEach((m: any) => {
              if (m.id && m.is_active === true) allUserIds.add(m.id);
            });
          }
        }
      }

      if (teams.length < limit) break; 
      page++;
      await new Promise(r => setTimeout(r, 2000)); 
    } catch (err: any) {
      console.error(`Page ${page} failed: ${err.response?.data?.message || err.message}`);
      break;
    }
  }

  if (foundTeams.size < 12) {
    console.error(`\n Only found ${foundTeams.size}/12 target teams. Some may be on deeper pages.`);
  }

  const sortedIds = Array.from(allUserIds).sort((a, b) => a - b);
  await fs.writeFile(OUTPUT_FILE, JSON.stringify(sortedIds, null, 2), 'utf8');
  
  console.error(`\n Saved ${sortedIds.length} unique User IDs to ${OUTPUT_FILE}`);
  console.error('\n COPY THIS INTO src/index.ts:\n');
  console.error('const HVAC_USER_IDS = new Set([');
  console.error('  ' + sortedIds.join(',\n  '));
  console.error(']);');
}

main().catch(console.error);