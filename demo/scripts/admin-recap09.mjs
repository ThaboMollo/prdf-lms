import { chromium } from 'playwright'
import path from 'path'; import { fileURLToPath } from 'url'
const __d=path.dirname(fileURLToPath(import.meta.url))
const SHOTS=path.resolve(__d,'..','admin','screenshots')
const BASE=process.env.ADMIN_URL||'http://localhost:5175'
const wait=ms=>new Promise(r=>setTimeout(r,ms))
const b=await chromium.launch();const c=await b.newContext({viewport:{width:1440,height:900},deviceScaleFactor:2});const p=await c.newPage()
await p.goto(BASE+'/login',{waitUntil:'networkidle'})
await p.locator('input[type="email"]').fill('admin@prdf.co.za');await p.locator('input[type="password"]').fill('DemoAdmin1!')
await p.getByRole('button',{name:/Sign In/i}).click();await wait(3500)
await p.goto(BASE+'/applications?app=2ea702c6-751b-4715-82a3-bc1320f82b7c',{waitUntil:'networkidle'});await wait(3500)
// History tab to show the new transition, then screenshot detail
const hist=p.locator('button.tab',{hasText:/^History/i}).first()
if(await hist.count()){await hist.scrollIntoViewIfNeeded();await hist.click();await wait(1500)}
await p.screenshot({path:path.join(SHOTS,'09-app-status-updated.png'),fullPage:true})
console.log('recaptured 09')
await c.close();await b.close()
