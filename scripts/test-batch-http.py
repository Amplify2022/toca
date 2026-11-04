"""Local HTTP smoke against the dedicated restricted-role API on 8081."""
import urllib.request,urllib.error,json,uuid
base='http://127.0.0.1:8081'
def call(path,body=None,token=None,method=None):
 req=urllib.request.Request(base+path,data=json.dumps(body).encode() if body is not None else None,method=method,headers={'Content-Type':'application/json',**({'Authorization':'Bearer '+token} if token else {})})
 with urllib.request.urlopen(req) as res:return json.load(res)
marker=str(uuid.uuid4());password='Testing-password-123'
owner=call('/api/auth/register',dict(name='HTTP test',email=marker+'@example.test',password=password));token=owner['token'];venue=None
try:
 assert isinstance(call('/api/venues?city=Montevideo&limit=1&offset=0'),list)
 venue=call('/api/admin/venues',dict(name='Test',address='Center',city='Montevideo',latitude=-34.9,longitude=-56.2),token)['id']
 assert call('/api/admin/venues/'+venue+'/stats',token=token)['tracks']==0
 call('/api/admin/venues/'+venue,token=token,method='DELETE');venue=None
 call('/api/accounts/admin/delete',dict(password=password,confirmation='ELIMINAR'),token)
 token=None
 print('PASS restricted API: registration, filtered pagination, venue creation, aggregate statistics, account deletion')
finally:
 if token:
  if venue:call('/api/admin/venues/'+venue,token=token,method='DELETE')
  call('/api/accounts/admin/delete',dict(password=password,confirmation='ELIMINAR'),token)
