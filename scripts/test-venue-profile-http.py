"""Partial-profile updates against a dedicated local test API, with synthetic owners."""
import concurrent.futures,json,os,urllib.request,urllib.error,uuid
BASE=os.environ.get('TOCA_HTTP_TEST_URL','http://127.0.0.1:8081');PASSWORD='Synthetic-profile-123'
def call(path,body=None,token=None,method=None,status=200):
 req=urllib.request.Request(BASE+path,data=json.dumps(body).encode() if body is not None else None,method=method,headers={'Content-Type':'application/json',**({'Authorization':'Bearer '+token} if token else {})})
 try:
  with urllib.request.urlopen(req,timeout=20) as r:code,data=r.status,json.load(r)
 except urllib.error.HTTPError as e:code,data=e.code,json.load(e)
 if status is not None:assert code==status,(path,code,data)
 return (code,data) if status is None else data
tokens=[];venue=None
try:
 for _ in range(2):tokens.append(call('/api/auth/register',dict(name='Profile test',email=str(uuid.uuid4())+'@example.test',password=PASSWORD))['token'])
 owner,other=tokens
 record=call('/api/admin/venues',dict(name='Original bar',address='Original street 123',city='Montevideo',latitude=-34.9,longitude=-56.17,description='Keep biography',genre='Jazz',instagramHandle='test.bar',openingHours='W2|-|-|-|-|20:00-02:00|-|-'),owner);venue=record['id'];path='/api/admin/venues/'+venue
 def current():return next(v for v in call('/api/admin/venues',token=owner) if v['id']==venue)
 body=dict(changes=dict(name='Edited bar'),expected=dict(name='Original bar'))
 call(path,body,method='PATCH',status=401);call(path,body,other,method='PATCH',status=403)
 result=call(path,body,owner,method='PATCH')
 assert result['name']=='Edited bar' and result['description']=='Keep biography' and result['openingHours']==record['openingHours']
 call(path,body,owner,method='PATCH',status=409)
 call(path,dict(changes=dict(published=True),expected=dict(published=False)),owner,method='PATCH',status=400)
 call(path,dict(changes=dict(address='New street 456'),expected=dict(address=record['address'])),owner,method='PATCH',status=400)
 call(path,dict(changes=dict(name=''),expected=dict(name='Edited bar')),owner,method='PATCH',status=400)
 call(path,dict(changes=dict(genre='Rock'),expected={}),owner,method='PATCH',status=400)
 # Separate sections can save concurrently without replacing each other's fields.
 jobs=[dict(changes=dict(description='New biography'),expected=dict(description='Keep biography')),dict(changes=dict(openingHours='W2|19:00-23:00|-|-|-|-|-|-'),expected=dict(openingHours=record['openingHours']))]
 with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:list(pool.map(lambda b:call(path,b,owner,method='PATCH'),jobs))
 latest=current();assert latest['description']=='New biography' and latest['openingHours']==jobs[1]['changes']['openingHours'] and latest['name']=='Edited bar'
 competing=[dict(changes=dict(name=name),expected=dict(name='Edited bar')) for name in ['First name','Second name']]
 with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:results=list(pool.map(lambda b:call(path,b,owner,method='PATCH',status=None),competing))
 assert sorted(code for code,_ in results)==[200,409]
 geo=dict(changes=dict(address='New street 456',latitude=-34.91,longitude=-56.18),expected=dict(address=record['address'],latitude=record['latitude'],longitude=record['longitude']),locationConfirmed=True)
 latest=call(path,geo,owner,method='PATCH');assert latest['address']=='New street 456' and latest['latitude']==-34.91 and latest['genre']=='Jazz' and latest['description']=='New biography'
 req=urllib.request.Request(BASE+path,method='OPTIONS',headers={'Origin':'http://localhost:5173','Access-Control-Request-Method':'PATCH','Access-Control-Request-Headers':'authorization,content-type'})
 with urllib.request.urlopen(req,timeout=10) as r:assert r.status in [200,204] and 'PATCH' in r.headers.get('Access-Control-Allow-Methods','')
 print('PASS real PostgreSQL/API: owner permission, partial updates, independent concurrent editors, stale conflicts, confirmed coordinates and CORS PATCH')
finally:
 if venue:call('/api/admin/venues/'+venue,token=tokens[0],method='DELETE')
 for token in tokens:call('/api/accounts/admin/delete',dict(password=PASSWORD,confirmation='ELIMINAR'),token)
