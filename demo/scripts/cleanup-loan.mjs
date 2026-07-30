const SUPABASE_URL=process.env.SUPABASE_URL || 'https://kjhibiawvvmzhdjbqhpq.supabase.co'
const SRK=process.env.SUPABASE_SERVICE_ROLE_KEY
if (!SRK) throw new Error('SUPABASE_SERVICE_ROLE_KEY env var is required')
const H={apikey:SRK,Authorization:`Bearer ${SRK}`,'Content-Type':'application/json'}
const loanId='6c3a2894-b563-4bf5-ab25-8ab440753d41'
const appId='9376c739-180f-43a3-9cf2-a0ca94035590'
await fetch(`${SUPABASE_URL}/rest/v1/repayment_schedule?loan_id=eq.${loanId}`,{method:'DELETE',headers:H})
await fetch(`${SUPABASE_URL}/rest/v1/loans?id=eq.${loanId}`,{method:'DELETE',headers:H})
await fetch(`${SUPABASE_URL}/rest/v1/loan_applications?id=eq.${appId}`,{method:'PATCH',headers:H,body:JSON.stringify({status:'UnderReview'})})
console.log('cleaned loan + restored app to UnderReview')
