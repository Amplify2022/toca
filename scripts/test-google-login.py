"""Google/customer session regression tests with a mocked Google SDK and API.

Run with Python, Playwright and /usr/bin/chromium. No credentials or ZIP
fixtures are required; these tests exercise the repository's current modules.
"""
from pathlib import Path
from playwright.sync_api import sync_playwright
ROOT = Path(__file__).resolve().parents[1]
customer = (ROOT / 'web/toca-customer-v1826.js').read_text()
google = (ROOT / 'web/toca-google-v1847.js').read_text()

MOCK = r'''
window.API_URL='';window.state={demo:true,token:''};
window.__routes=[];window.__requests=[];window.__renderCount=0;
window.render=()=>++window.__renderCount;
window.route=()=>({path:location.hash.slice(1)});
window.navigate=destination=>{window.__routes.push(destination);location.hash=destination;};
window.mount=()=>{};window.iconSvg=()=>'';window.toast=()=>{};window.esc=s=>s;
window.google={accounts:{id:{
  initialize(opts){window.__callback=opts.callback;},
  renderButton(slot){const btn=document.createElement('button');btn.type='button';btn.id='fake-google';btn.textContent='Continuar con Google';btn.onclick=()=>window.__callback({credential:'signed-google-token'});slot.appendChild(btn);}
}}};
window.__googleStatus=200;
window.__googleUser='customer-123';
window.__meStatus=200;
window.fetch = async (url,opts={})=>{
 const address=String(url),method=opts.method||'GET';
 window.__requests.push({address,method,auth:opts.headers?.Authorization||''});
 let body={}; let status=200;
 if(address.endsWith('/google/config')) body={enabled:true,clientId:'my-google-client-id'};
 else if(address.endsWith('/api/customers/google') && method==='POST'){
   status=window.__googleStatus;
   body=status===200?{token:'1234567890abcdefghijklmnopqrstuvwxyz1234567890abcdef',user:{id:window.__googleUser}}:{message:'Ese correo ya tiene una cuenta.'};
 }
 else if(address.endsWith('/api/customers/me') && method==='GET'){
   if(opts.headers?.Authorization === 'Bearer expired-session') {
     return new Promise(resolve=>{
       window.__releaseOldMe=()=>resolve({ok:false,status:401,json:async()=>({message:'Sesión vencida'})});
     });
   }
   status=window.__meStatus;
   body={id:window.__meUser||'customer-123',name:'Cliente',email:'cliente@example.com'};
 }
 else throw Error('Unsupported mocked request '+address);
 return {ok:status>=200 && status<300,status,json:async()=>body};
};
'''

HTML='''<html><head></head><body><main id="app"><section class="toca-customer-card"><form id="toca-customer-auth-form" data-register="no"><div id="toca-customer-auth-error" hidden></div></form></section></main></body></html>'''

def setup(browser, status=200, pending=None, me_user=None, me_status=200, expired_session=False):
    ctx=browser.new_context()
    page=ctx.new_page()
    page.set_content(HTML)
    page.evaluate("""() => {
      const store = new Map();
      Object.defineProperty(window, 'sessionStorage', { configurable:true, value:{
        setItem:(k,v)=>store.set(k,String(v)),
        getItem:k=>store.has(k)?store.get(k):null,
        removeItem:k=>store.delete(k)
      }});
      location.hash='#/customer/login';
    }""")
    page.add_script_tag(content=MOCK)
    page.evaluate('(args)=>{window.__googleStatus=args.status;window.__meUser=args.me;window.__meStatus=args.meStatus;'+
                  'if(args.expired)sessionStorage.setItem("toca:customer:session","expired-session");'+
                  'if(args.pending)sessionStorage.setItem("toca:customer:after-login",args.pending);}',
                  {'status':status,'pending':pending,'me':me_user,'meStatus':me_status,'expired':expired_session})
    page.add_script_tag(content=customer)
    page.add_script_tag(content=google)
    page.locator('#fake-google').wait_for(timeout=5000)
    return page,ctx

def tests():
    with sync_playwright() as p:
        browser=p.chromium.launch(executable_path='/usr/bin/chromium', headless=True, args=['--no-sandbox'])
        page,ctx=setup(browser)
        page.locator('#fake-google').click()
        page.wait_for_function("window.tocaCustomerVerified?.() && location.hash === '#/profile'",timeout=5000)
        assert page.evaluate("sessionStorage.getItem('toca:customer:session') !== null")
        assert page.evaluate("window.__requests.filter(x => x.address.endsWith('/api/customers/me')).length") == 1
        assert page.evaluate('window.__routes').count('#/profile')==1
        ctx.close()

        page,ctx=setup(browser,pending='#/request/bar123?join=abc_AZ-1')
        page.locator('#fake-google').click()
        page.wait_for_function("window.tocaCustomerVerified?.() && location.hash.startsWith('#/request/')",timeout=5000)
        assert page.evaluate("location.hash")=='#/request/bar123?join=abc_AZ-1'
        assert page.evaluate("sessionStorage.getItem('toca:customer:after-login')") is None
        ctx.close()

        page,ctx=setup(browser,status=409)
        page.locator('#fake-google').click()
        page.locator('.toca-google-feedback:not([hidden])').wait_for(timeout=5000)
        assert 'vinculá Google' in page.locator('.toca-google-feedback').inner_text()
        assert page.evaluate("sessionStorage.getItem('toca:customer:session')") is None
        assert page.evaluate("location.hash")=='#/customer/login'
        ctx.close()

        page,ctx=setup(browser,me_user='other-client')
        page.locator('#fake-google').click()
        page.locator('.toca-google-feedback:not([hidden])').wait_for(timeout=5000)
        assert page.evaluate("sessionStorage.getItem('toca:customer:session')") is None
        assert not page.evaluate('window.tocaCustomerVerified?.()')
        ctx.close()

        # A late 401 for the restored session must not clear the new session.
        page,ctx=setup(browser,expired_session=True)
        page.wait_for_function('typeof window.__releaseOldMe === "function"')
        page.locator('#fake-google').click()
        page.wait_for_function("window.tocaCustomerVerified?.() && location.hash === '#/profile'")
        page.evaluate('window.__releaseOldMe()')
        page.wait_for_function("window.tocaCustomerUser?.()?.id === 'customer-123'")
        assert page.evaluate("window.tocaCustomerBearer().startsWith('Bearer 123456')")
        ctx.close()

        # Invalid /me responses never establish a customer session.
        page,ctx=setup(browser,me_status=403)
        page.locator('#fake-google').click()
        page.locator('.toca-google-feedback:not([hidden])').wait_for()
        assert not page.evaluate('window.tocaCustomerVerified()')
        assert page.evaluate("sessionStorage.getItem('toca:customer:session')") is None
        assert page.evaluate('location.hash')=='#/customer/login'
        ctx.close()

        # Stored destinations cannot redirect outside the app or into admin.
        for destination in ['https://example.com', '#/admin']:
            page,ctx=setup(browser,pending=destination)
            page.locator('#fake-google').click()
            page.wait_for_function("location.hash === '#/profile'")
            assert page.evaluate("sessionStorage.getItem('toca:customer:after-login')") is None
            assert page.evaluate('state.token')==''
            ctx.close()
        browser.close()
    print('PASS: 8 Google login scenarios (session, QR return, conflict, identity mismatch, late 401, role rejection, unsafe redirects)')

if __name__=='__main__':tests()
