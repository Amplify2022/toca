"""Private admin/customer avatars against a dedicated LOCAL API and PostgreSQL.
Uses the same explicit test-database guard as http_auth_probe.py. No real accounts.
"""
import base64,json,uuid
from playwright.sync_api import sync_playwright
from http_auth_probe import request,sql,verify_test_database_binding,cleanup,created,marker,password

def tests():
 customer_token=verify_test_database_binding()
 # Generate a small synthetic JPEG using the same browser encoding as the UI.
 with sync_playwright() as p:
  browser=p.chromium.launch(executable_path='/usr/bin/chromium',args=['--no-sandbox'])
  page=browser.new_page()
  jpeg=page.evaluate("""()=>{const c=document.createElement('canvas');c.width=c.height=360;const x=c.getContext('2d');x.fillStyle='#45825f';x.fillRect(0,0,360,360);x.fillStyle='#afea89';x.fillRect(50,50,200,200);return c.toDataURL('image/jpeg',.82)}""")
  browser.close()
 admins=[]
 for i in range(2):
  status,_,data=request('/api/auth/register',dict(name='Avatar fixture',email=f'{marker}-avatar-{i}@example.test',password=password))
  assert status==200,(status,data)
  created.append(('admin_user',data['user']['id']));admins.append(data)
 headers={'Authorization':'Bearer '+admins[0]['token']};other={'Authorization':'Bearer '+admins[1]['token']};customer={'Authorization':'Bearer '+customer_token}
 path='/api/auth/me/avatar'
 for method,body in [('GET',None),('PUT',{'image':jpeg}),('DELETE',None)]:
  status,_,_=request(path,body,headers=customer,method=method);assert status==401
  status,_,_=request(path,body,method=method);assert status==401
 status,cache,data=request(path,headers=headers,method='GET');assert status==200 and data=={'avatar':None},data
 assert 'no-store' in cache.get('Cache-Control','')
 # Metadata supplied by a client must never select the owner account.
 status,_,saved=request(path,{'image':jpeg,'id':admins[1]['user']['id']},headers=headers,method='PUT')
 assert status==200 and saved['avatar'].startswith('data:image/jpeg;base64,'),(status,saved)
 status,_,loaded=request(path,headers=headers,method='GET');assert status==200 and loaded==saved
 status,_,data=request(path,headers=other,method='GET');assert status==200 and data=={'avatar':None}
 # Invalid/oversized or JPEG-marker-only payloads cannot corrupt an existing photo.
 invalid=['data:image/svg+xml;base64,'+base64.b64encode(b'<svg/>').decode(),'data:image/jpeg;base64,invalid','data:image/jpeg;base64,'+base64.b64encode(b'\xff\xd8\xff'+b'x'*200+b'\xff\xd9').decode(),'data:image/jpeg;base64,'+'A'*220_001]
 for image in invalid:
  status,_,_=request(path,{'image':image},headers=headers,method='PUT');assert status in [400,413],status
  status,_,data=request(path,headers=headers,method='GET');assert status==200 and data==saved
 status,_,data=request('/api/auth/me',headers=headers,method='GET');assert status==200 and 'avatar' not in data and 'avatar_image' not in data
 # Existing customer uploads keep the same contract and remain independent.
 customer_path='/api/customers/me/avatar'
 status,_,data=request(customer_path,{'image':jpeg},headers=customer,method='PUT');assert status==200 and data['saved'] is True
 status,_,data=request(customer_path,headers=headers,method='GET');assert status==401
 status,_,data=request(customer_path,headers=customer,method='GET');assert status==200 and data['avatar'].startswith('data:image/jpeg;base64,')
 status,_,data=request(path,headers=headers,method='DELETE');assert status==200 and data['deleted'] is True
 status,_,data=request(path,headers=headers,method='GET');assert status==200 and data=={'avatar':None}
 status,_,data=request(customer_path,headers=customer,method='GET');assert status==200 and data['avatar'] is not None
 status,_,_=request(customer_path,headers=customer,method='DELETE');assert status==200
 print('PASS real avatar HTTP + PostgreSQL: migration, private persistence, normalization, validation, deletion and account/role isolation',flush=True)

if __name__=='__main__':
 try:tests()
 finally:cleanup()
