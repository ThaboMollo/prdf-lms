const U = 'https://kjhibiawvvmzhdjbqhpq.supabase.co'
const K = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtqaGliaWF3dnZtemhkamJxaHBxIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3ODk0MjU0NCwiZXhwIjoyMDk0NTE4NTQ0fQ.8B6o-HF_6WyeYrh5FONbEmuNSlg8i8BRypFfGL-5LIg'
const UID = '08050c65-32a7-4da0-af87-256216f2f53a'
const H = { apikey: K, Authorization: `Bearer ${K}` }
const j = async p => JSON.parse(await (await fetch(`${U}/rest/v1/${p}`, { headers: H })).text())
const client = (await j(`clients?user_id=eq.${UID}&select=id`))[0]
const apps = await j(`loan_applications?client_id=eq.${client.id}&select=id,status,submitted_at,requested_amount,created_at&order=created_at.desc`)
console.log('applications:'); apps.forEach(a => console.log(' ', a.status.padEnd(12), a.requested_amount, a.id, a.submitted_at || ''))
const latest = apps[0]
const consents = await j(`application_consents?application_id=eq.${latest.id}&select=id,consent_version,acknowledged_at,items`)
console.log('\nconsents for latest app:', consents.length, consents[0] ? `v${consents[0].consent_version} items=${consents[0].items.length}` : '')
const docs = await j(`loan_documents?application_id=eq.${latest.id}&select=doc_type,status`)
console.log('documents for latest app:', docs.length); docs.forEach(d => console.log('  ', d.doc_type, d.status))
const hist = await j(`application_status_history?application_id=eq.${latest.id}&select=from_status,to_status`)
console.log('status history:', hist.map(h => `${h.from_status}->${h.to_status}`).join(', '))
