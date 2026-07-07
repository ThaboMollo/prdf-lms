const U='https://kjhibiawvvmzhdjbqhpq.supabase.co'
const K='eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtqaGliaWF3dnZtemhkamJxaHBxIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3ODk0MjU0NCwiZXhwIjoyMDk0NTE4NTQ0fQ.8B6o-HF_6WyeYrh5FONbEmuNSlg8i8BRypFfGL-5LIg'
const UID='08050c65-32a7-4da0-af87-256216f2f53a'
const KEEP='9376c739-180f-43a3-9cf2-a0ca94035590'
const H={apikey:K,Authorization:`Bearer ${K}`,'Content-Type':'application/json'}
const j=async p=>JSON.parse(await (await fetch(`${U}/rest/v1/${p}`,{headers:H})).text())
const del=async p=>{const r=await fetch(`${U}/rest/v1/${p}`,{method:'DELETE',headers:H});return r.status}
const client=(await j(`clients?user_id=eq.${UID}&select=id`))[0]
const apps=await j(`loan_applications?client_id=eq.${client.id}&select=id,status`)
for(const a of apps){
  if(a.id===KEEP){console.log('keep',a.status,a.id);continue}
  await del(`application_consents?application_id=eq.${a.id}`)
  await del(`loan_documents?application_id=eq.${a.id}`)
  await del(`application_status_history?application_id=eq.${a.id}`)
  const s=await del(`loan_applications?id=eq.${a.id}`)
  console.log('deleted',a.status,a.id,'->',s)
}
