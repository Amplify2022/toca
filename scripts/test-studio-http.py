"""Dedicated local test API on 8081, provider credentials absent, restricted DB role."""
import urllib.request,urllib.error,json,uuid
base='http://127.0.0.1:8081'
def call(path,body=None,token=None,method=None,status=200):
 req=urllib.request.Request(base+path,data=json.dumps(body).encode() if body is not None else None,method=method,headers={'Content-Type':'application/json',**({'Authorization':'Bearer '+token} if token else {})})
 try:
  with urllib.request.urlopen(req) as res:code=res.status;data=json.load(res)
 except urllib.error.HTTPError as error:code=error.code;data=json.load(error)
 assert code==status,(path,code,data)
 return data
accounts=[];venue=None;password='Testing-password-123'
try:
 for i in range(2):
  account=call('/api/auth/register',dict(name='Studio HTTP test',email=str(uuid.uuid4())+'@example.test',password=password));accounts.append(account['token'])
 owner,other=accounts
 venue=call('/api/admin/venues',dict(name='Test import',address='Center 123',city='Montevideo',latitude=-34.9,longitude=-56.2,description='Imported biography',instagramHandle='@test.bar',openingHours='W2|18:00-02:00|-|-|-|-|-|-'),owner)['id']
 data=call('/api/venues/'+venue)
 assert data['description']=='Imported biography' and data['instagramHandle']=='test.bar' and data['openingHours'].startswith('W2|')
 path='/api/admin/venues/'+venue+'/music'
 call(path+'/browser-token',status=401)
 call(path+'/browser-token',token=other,status=403)
 call(path+'/player',dict(action='pause'),other,status=403)
 call(path+'/edits/'+str(uuid.uuid4()),dict(action='create',name='Never created'),other,status=403)
 empty=call(path+'/playlist',token=owner);assert empty.get('playlist') is None and empty.get('operation') is None
 call(path+'/browser-token',token=owner,status=412)
 call(path+'/player',dict(action='pause'),owner,status=412)
 call(path+'/edits/'+str(uuid.uuid4()),dict(action='create',name='Disabled'),owner,status=412)
 assert call('/api/admin/venue-import/status',token=owner)==dict(google=False,instagram=False)
 call('/api/admin/venue-import/google/search?q=Test',status=401)
 call('/api/admin/venue-import/google/search?q=Test',token=owner,status=412)
 call('/api/admin/venue-import/instagram/preview?profile=test.bar',token=owner,status=412)
 call('/api/admin/venue-import/instagram/preview?profile=https%3A%2F%2F127.0.0.1%2Fsecret',token=owner,status=400)
 print('PASS restricted API: imported fields on creation, admin ownership, unauthenticated denial, disabled flags and unavailable providers')
finally:
 if venue:call('/api/admin/venues/'+venue,token=accounts[0],method='DELETE')
 for token in accounts:call('/api/accounts/admin/delete',dict(password=password,confirmation='ELIMINAR'),token)
