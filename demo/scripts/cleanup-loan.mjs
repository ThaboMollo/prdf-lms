const SUPABASE_URL='https://kjhibiawvvmzhdjbqhpq.supabase.co'
const SRK='eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtqaGliaWF3dnZtemhkamJxaHBxIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3ODk0MjU0NCwiZXhwIjoyMDk0NTE4NTQ0fQ.8B6o-HF_6WyeYrh5FONbEmuNSlg8i8BRypFfGL-5LIg'
const H={apikey:SRK,Authorization:`Bearer ${SRK}`,'Content-Type':'application/json'}
const loanId='6c3a2894-b563-4bf5-ab25-8ab440753d41'
const appId='9376c739-180f-43a3-9cf2-a0ca94035590'
await fetch(`${SUPABASE_URL}/rest/v1/repayment_schedule?loan_id=eq.${loanId}`,{method:'DELETE',headers:H})
await fetch(`${SUPABASE_URL}/rest/v1/loans?id=eq.${loanId}`,{method:'DELETE',headers:H})
await fetch(`${SUPABASE_URL}/rest/v1/loan_applications?id=eq.${appId}`,{method:'PATCH',headers:H,body:JSON.stringify({status:'UnderReview'})})
console.log('cleaned loan + restored app to UnderReview')
