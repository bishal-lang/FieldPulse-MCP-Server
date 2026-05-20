// src/fieldpulse.ts
import { z } from 'zod';

const FPConfig = z.object({
  apiKey: z.string(),
  accountId: z.string()
});

export class FieldPulseClient {
  private apiKey: string;
  private accountId: string;
  private baseUrl = 'https://api.fieldpulse.com/v1';

  constructor() {
    const result = FPConfig.safeParse({
      apiKey: process.env.FIELD_PULSE_API_KEY,
      accountId: process.env.FIELD_PULSE_ACCOUNT_ID
    });
    if (!result.success) throw new Error("Missing FieldPulse Env Vars");
    
    this.apiKey = result.data.apiKey;
    this.accountId = result.data.accountId;
  }

  // Helper to make API requests
  async request<T>(endpoint: string, query?: Record<string, any>): Promise<T> {
    const url = new URL(`${this.baseUrl}/${endpoint}`);
    if (query) Object.entries(query).forEach(([k, v]) => url.searchParams.append(k, String(v)));

    const res = await fetch(url.toString(), {
      headers: { 'Authorization': `Bearer ${this.apiKey}` }
    });

    if (!res.ok) throw new Error(`FieldPulse API Error: ${res.statusText}`);
    return res.json();
  }

  // 1. Get Technicians in a specific Team with HVAC Skills
  async getHVACTechnicians(teamId: number) {
    // Adjust endpoint to match actual FieldPulse API docs
    return this.request<any[]>('technicians', { 
      team_id: teamId,
      skills: 'HVAC Service', 
      status: 'active' 
    });
  }

  // 2. Get Availability for a specific technician
  async getAvailability(techId: number, date: string) {
    return this.request<any[]>(`technicians/${techId}/availability`, { date });
  }
}