// src/fieldpulse.ts
export class FieldPulseClient {
  private apiKey: string;
  private baseUrl = 'https://ywe3crmpll.execute-api.us-east-2.amazonaws.com/stage';

  constructor() {
    this.apiKey = process.env.FIELD_PULSE_API_KEY || '';
    if (!this.apiKey) throw new Error("Missing FIELD_PULSE_API_KEY");
  }

  async request<T>(endpoint: string, params?: {
    query?: Record<string, any>;
    filters?: Array<{
      attribute: string;
      operator?: string;
      value: any;
      class?: string;
      action?: string;
    }>;
    relations?: string[]; // e.g., ['teams']
  }): Promise<T> {
    const url = new URL(`${this.baseUrl}/${endpoint}`);
    
    // Handle complex filter arrays
    if (params?.filters) {
      params.filters.forEach((f, i) => {
        url.searchParams.append(`filter[${i}][action]`, f.action || 'where');
        url.searchParams.append(`filter[${i}][attribute]`, f.attribute);
        url.searchParams.append(`filter[${i}][operator]`, f.operator || '=');
        url.searchParams.append(`filter[${i}][value]`, f.value);
        if (f.class) url.searchParams.append(`filter[${i}][class]`, f.class);
      });
    }
    
    // Add relations (e.g., rel[]=teams)
    if (params?.relations) {
      params.relations.forEach(rel => url.searchParams.append('rel[]', rel));
    }
    
    // Add remaining query params
    if (params?.query) {
      Object.entries(params.query).forEach(([k, v]) => {
        if (Array.isArray(v)) {
          v.forEach(val => url.searchParams.append(k, String(val)));
        } else {
          url.searchParams.append(k, String(v));
        }
      });
    }

    const res = await fetch(url.toString(), {
      headers: { 
        'x-api-key': this.apiKey,
        'Accept': 'application/json'
      }
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`FieldPulse API ${res.status}: ${errText}`);
    }
    return res.json();
  }

  // Get HVAC technicians by role + team membership
  async getHVACTechnicians(teamIds: number[]) {
    return this.request<any[]>('users', {
      query: { 
        limit: 100,
        // Filter by role: 4 appears to be field technician based on your test data
        // Adjust this value after confirming with FieldPulse docs
      },
      filters: [
        { 
          attribute: 'role', 
          operator: '=', 
          value: 4, // Adjust based on actual role values for technicians
          class: 'int'
        },
        {
          attribute: 'is_active',
          operator: '=',
          value: true
        }
      ],
      relations: ['teams'] // Include team membership data
    });
  }

  // Get availability (timesheets) for a technician
  async getAvailability(userId: number, startDate: string, endDate: string) {
    const startUnix = Math.floor(new Date(startDate).getTime() / 1000);
    const endUnix = Math.floor(new Date(endDate).getTime() / 1000);
    
    return this.request<any[]>('timesheets', {
      query: {
        user_id: userId,
        in_time: startUnix,
        out_time: endUnix,
        type: 'job', // Filter to job-related timesheets
        limit: 100
      }
    });
  }
}