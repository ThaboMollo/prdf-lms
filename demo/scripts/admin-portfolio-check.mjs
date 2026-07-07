import { chromium } from 'playwright'
import path from 'path'
import { fileURLToPath } from 'url'
const __d=path.dirname(fileURLToPath(import.meta.url))
const SHOTS=path.resolve(__d,'..','admin','screenshots')
const BASE=process.env.ADMIN_URL||'http://localhost:5175'
const wait=ms=>new Promise(r=>setTimeout(r,ms))
const b=await chromium.launch();const c=await b.newContext({viewport:{width:1440,height:900},deviceScaleFactor:2});const p=await c.newPage()
await p.goto(BASE+'/login',{waitUntil:'networkidle'})
await p.locator('input[type="email"]').fill('admin@prdf.co.za');await p.locator('input[type="password"]').fill('DemoAdmin1!')
await p.getByRole('button',{name:/Sign In/i}).click();await wait(3500)
await p.goto(BASE+'/portfolio',{waitUntil:'networkidle'});await wait(3000)
await p.screenshot({path:path.join(SHOTS,'03-portfolio.png'),fullPage:true})
console.log('portfolio recaptured')
await c.close();await b.close()
