const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const jsonResponse = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

const escapeHtml = (value: string) => value
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&#039;');

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (request.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405);
  }

  const authorization = request.headers.get('Authorization');
  if (!authorization?.startsWith('Bearer ')) {
    return jsonResponse({ error: 'Missing authorization' }, 401);
  }

  const token = authorization.replace('Bearer ', '');
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const resendApiKey = Deno.env.get('RESEND_API_KEY');
  const emailFrom = Deno.env.get('EMAIL_FROM');

  if (!supabaseUrl || !supabaseAnonKey || !resendApiKey || !emailFrom) {
    return jsonResponse({ error: 'Email service is not configured' }, 500);
  }

  const authResponse = await fetch(`${supabaseUrl}/auth/v1/user`, {
    headers: {
      apikey: supabaseAnonKey,
      Authorization: `Bearer ${token}`,
    },
  });
  const user = await authResponse.json();

  if (!authResponse.ok || user.app_metadata?.role !== 'admin') {
    return jsonResponse({ error: 'Administrator access required' }, 403);
  }

  const body = await request.json();
  const email = typeof body.email === 'string' ? body.email.trim() : '';
  const name = typeof body.name === 'string' ? body.name.trim() : 'ToledoGo user';
  const source = body.source === 'vendors' ? 'vendor' : body.source === 'customers' ? 'customer' : '';
  const status = body.status === 'approved' || body.status === 'rejected' ? body.status : '';

  if (!email || !source || !status) {
    return jsonResponse({ error: 'Email, source, and approved/rejected status are required' }, 400);
  }

  const approved = status === 'approved';
  const statusLabel = approved ? 'approved' : 'rejected';
  const subject = `ToledoGo ${source} application ${statusLabel}`;
  const message = approved
    ? `Your ToledoGo ${source} application has been approved. You can now sign in and continue using your account.`
    : `Your ToledoGo ${source} application was not approved at this time. Please contact ToledoGo support if you need more information.`;

  const resendResponse = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${resendApiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: emailFrom,
      to: [email],
      subject,
      html: `<p>Hello ${escapeHtml(name)},</p><p>${escapeHtml(message)}</p><p>ToledoGo Administration</p>`,
    }),
  });

  if (!resendResponse.ok) {
    const error = await resendResponse.text();
    console.error('Resend error:', error);
    return jsonResponse({ error: 'The status changed, but the notification email could not be sent' }, 502);
  }

  return jsonResponse({ sent: true });
});
