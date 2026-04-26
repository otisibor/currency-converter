export interface Env {
  DB: D1Database;
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    const url = new URL(request.url);
    
    try {
      // GET /api/rates?provider=Wise&send=EUR&receive=GHS&limit=100
      if (url.pathname === '/api/rates') {
        const { provider, send, receive, limit = '100', date } = Object.fromEntries(url.searchParams);
        
        let sql = `SELECT * FROM exchange_rates WHERE 1=1`;
        const params: (string | number)[] = [];
        
        if (provider) { sql += ` AND provider = ?`; params.push(provider); }
        if (send) { sql += ` AND send_currency = ?`; params.push(send); }
        if (receive) { sql += ` AND receive_currency = ?`; params.push(receive); }
        if (date) { sql += ` AND date(timestamp) = ?`; params.push(date); }
        
        sql += ` ORDER BY timestamp DESC LIMIT ?`;
        params.push(parseInt(limit));
        
        const { results } = await env.DB.prepare(sql).bind(...params).all();
        return Response.json({ success: true, count: results?.length || 0, data: results }, { headers: corsHeaders });
      }

      // GET /api/latest?send=EUR&receive=GHS
      if (url.pathname === '/api/latest') {
        const { send, receive, provider } = Object.fromEntries(url.searchParams);
        
        let sql = `SELECT * FROM exchange_rates WHERE success = 1`;
        const params: (string | number)[] = [];
        
        if (provider) { sql += ` AND provider = ?`; params.push(provider); }
        if (send) { sql += ` AND send_currency = ?`; params.push(send); }
        if (receive) { sql += ` AND receive_currency = ?`; params.push(receive); }
        
        sql += ` ORDER BY timestamp DESC LIMIT 1`;
        
        const result = await env.DB.prepare(sql).bind(...params).first();
        return Response.json({ success: true, data: result }, { headers: corsHeaders });
      }

      // GET /api/providers
      if (url.pathname === '/api/providers') {
        const { results } = await env.DB.prepare(
          `SELECT DISTINCT provider FROM exchange_rates ORDER BY provider`
        ).all();
        return Response.json({ success: true, data: results?.map((r: any) => r.provider) || [] }, { headers: corsHeaders });
      }

      // GET /api/summary
      if (url.pathname === '/api/summary') {
        const { results } = await env.DB.prepare(`
          SELECT 
            provider,
            COUNT(*) as total_scrapes,
            SUM(CASE WHEN success = 1 THEN 1 ELSE 0 END) as success_count,
            MAX(timestamp) as last_scrape
          FROM exchange_rates
          GROUP BY provider
          ORDER BY provider
        `).all();
        return Response.json({ success: true, data: results }, { headers: corsHeaders });
      }

      return new Response('Not Found', { status: 404, headers: corsHeaders });
      
    } catch (err: any) {
      return Response.json({ success: false, error: err.message }, { status: 500, headers: corsHeaders });
    }
  }
};
