import axios from 'axios';
import * as fs from 'fs/promises';
import * as path from 'path';
import 'dotenv/config'; 

const API_KEY = process.env.FIELD_PULSE_API_KEY;
const BASE_URL = process.env.FIELD_PULSE_BASE_URL || 'https://ywe3crmpll.execute-api.us-east-2.amazonaws.com/stage';

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

async function fetchAllTeams() {
    const allTeams: any[] = [];
    let page = 1;
    const limit = 10; 
    const MAX_PAGES = 150; 
    let hasMore = true;

    while (hasMore && page <= MAX_PAGES) {
        try {
            const res = await axios.get(`${BASE_URL}/teams`, {
                headers: { 
                    'x-api-key': API_KEY, 
                    'Accept': 'application/json' 
                },
                params: {
                "filter[0][action]": "where",
                "filter[0][attribute]": "id",
                "filter[0][operator]": "=",
                "filter[0][value]": 177571,
                "filter[0][class]": "int",
                "rel[]": "pivot",
                limit: 20
            },
                timeout: 200000
            });

            const teams = res.data.response || res.data.teams || [];
            allTeams.push(...teams);

            if (teams.length === 0 || teams.length < limit) {
                hasMore = false;
            } else {
                page++;
                await sleep(2000);
            }
        } catch (error: any) {
            console.error(` Failed to fetch page ${page}:`, error.response?.data || error.message);
            throw error;
        }
    }

    if (page > MAX_PAGES) {
        console.warn(' Reached maximum page limit. Verify if more teams exist.');
    }

    console.log(`Saving ${allTeams.length} teams to teams_export.json...`);
    const outputPath = path.resolve(process.cwd(), 'name_export6.json');
    await fs.writeFile(outputPath, JSON.stringify(allTeams, null, 2), 'utf-8');
    console.log(`Successfully exported to ${outputPath}`);
}

fetchAllTeams().catch(console.error);