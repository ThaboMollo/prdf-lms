const SUPABASE_URL = 'https://kjhibiawvvmzhdjbqhpq.supabase.co'
const SRK = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtqaGliaWF3dnZtemhkamJxaHBxIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3ODk0MjU0NCwiZXhwIjoyMDk0NTE4NTQ0fQ.8B6o-HF_6WyeYrh5FONbEmuNSlg8i8BRypFfGL-5LIg'
const UID = '08050c65-32a7-4da0-af87-256216f2f53a'

const H = {
  apikey: SRK,
  Authorization: `Bearer ${SRK}`,
  'Content-Type': 'application/json',
  Prefer: 'return=representation',
}

async function post(table, body) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, { method: 'POST', headers: H, body: JSON.stringify(body) })
  const text = await r.text()
  if (!r.ok) throw new Error(`${table} insert ${r.status}: ${text}`)
  return JSON.parse(text)
}
async function get(path) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, { headers: H })
  return { status: r.status, body: await r.text() }
}

const action = process.argv[2] || 'seed'

if (action === 'seed') {
  // reuse existing client row if present
  let client
  const existing = await get(`clients?user_id=eq.${UID}&select=id`)
  const rows = JSON.parse(existing.body || '[]')
  if (Array.isArray(rows) && rows.length) {
    client = rows[0]
    console.log('reusing client', client.id)
  } else {
    ;[client] = await post('clients', {
      user_id: UID,
      business_name: 'Brightfields Trading (Pty) Ltd',
      registration_no: '2021/123456/07',
      province: 'Gauteng',
      spatial_type: 'Township',
      industry: 'Retail',
      gender: 'Female',
      is_black_women_owned: true,
      sa_citizenship_percentage: 100,
      is_director_operational: true,
      cipc_registered: true,
      sars_tax_pin: '1234567890',
    })
    console.log('created client', client.id)
  }

  const [app] = await post('loan_applications', {
    client_id: client.id,
    requested_amount: 250000,
    term_months: 24,
    purpose: 'Working Capital: Purchase two refrigerated delivery vehicles to expand fresh-produce distribution across Gauteng.',
    status: 'UnderReview',
    submitted_at: new Date(Date.now() - 3 * 86400000).toISOString(),
  })
  console.log('created application', app.id, app.status)
} else if (action === 'loan-on') {
  // Attach a disbursed loan + repayment schedule to the demo user's application
  const appsRes = await get(`loan_applications?client_id=eq.${(JSON.parse((await get(`clients?user_id=eq.${UID}&select=id`)).body))[0].id}&order=submitted_at.desc&select=id,status`)
  const apps = JSON.parse(appsRes.body)
  const app = apps.find((a) => a.status !== 'Draft') || apps[0]
  await fetch(`${SUPABASE_URL}/rest/v1/loan_applications?id=eq.${app.id}`, { method: 'PATCH', headers: H, body: JSON.stringify({ status: 'Disbursed' }) })
  const principal = 250000
  const term = 24
  const rate = 0.185
  const monthly = Math.round((principal * (rate / 12)) / (1 - Math.pow(1 + rate / 12, -term)))
  const disbursedAt = new Date(Date.now() - 90 * 86400000).toISOString()
  const [loan] = await post('loans', {
    application_id: app.id,
    principal_amount: principal,
    outstanding_principal: principal - monthly * 3 * 0.7,
    interest_rate: rate,
    term_months: term,
    status: 'InRepayment',
    disbursed_at: disbursedAt,
  })
  console.log('created loan', loan.id)
  const rows = []
  for (let i = 1; i <= term; i++) {
    const due = new Date(Date.now() + (i - 3) * 30 * 86400000)
    const interest = Math.round(principal * (rate / 12))
    rows.push({
      loan_id: loan.id,
      installment_no: i,
      due_date: due.toISOString().slice(0, 10),
      due_principal: monthly - interest,
      due_interest: interest,
      due_total: monthly,
      paid_amount: i <= 3 ? monthly : 0,
      status: i <= 3 ? 'Paid' : 'Pending',
      paid_at: i <= 3 ? new Date(due.getTime()).toISOString() : null,
    })
  }
  await post('repayment_schedule', rows)
  console.log('created schedule rows', rows.length, 'monthly', monthly)
  console.log('APP_ID', app.id)
} else if (action === 'loan-off') {
  const appId = process.argv[3]
  await fetch(`${SUPABASE_URL}/rest/v1/loan_applications?id=eq.${appId}`, { method: 'PATCH', headers: H, body: JSON.stringify({ status: 'UnderReview' }) })
  console.log('restored app', appId, 'to UnderReview')
} else if (action === 'inspect') {
  for (const t of ['clients', 'loan_applications', 'loans', 'loan_documents', 'application_status_history']) {
    const res = await get(`${t}?select=*&limit=5`)
    console.log(`\n== ${t} (${res.status}) ==\n${res.body.slice(0, 800)}`)
  }
}
