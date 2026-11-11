"""Run against a dedicated test API. Synthetic accounts only; no provider calls."""
import base64,concurrent.futures,json,os,struct,urllib.error,urllib.request,uuid,zlib
BASE=os.environ.get('TOCA_HTTP_TEST_URL','http://127.0.0.1:8081')
PASSWORD='Synthetic-onboarding-123'
def call(path,body=None,token=None,method=None,status=200):
    request=urllib.request.Request(BASE+path,data=json.dumps(body).encode() if body is not None else None,method=method,headers={'Content-Type':'application/json',**({'Authorization':'Bearer '+token} if token else {})})
    try:
        with urllib.request.urlopen(request,timeout=20) as response:code,data=response.status,json.load(response)
    except urllib.error.HTTPError as error:code,data=error.code,json.load(error)
    assert code==status,(path,code,data)
    return data
def png():
    def chunk(kind,data):return struct.pack('>I',len(data))+kind+data+struct.pack('>I',zlib.crc32(kind+data)&0xffffffff)
    return b'\x89PNG\r\n\x1a\n'+chunk(b'IHDR',struct.pack('>IIBBBBB',1,1,8,2,0,0,0))+chunk(b'IDAT',zlib.compress(b'\x00\x50\x80\x30'))+chunk(b'IEND',b'')
tokens=[];venues=set()
try:
    for i in range(2):tokens.append(call('/api/auth/register',dict(name='Onboarding Test',email=str(uuid.uuid4())+'@example.test',password=PASSWORD))['token'])
    owner,other=tokens
    payload=dict(name='Synthetic draft',address='Test street 123',city='Test Registration City',latitude=-34.9,longitude=-56.2,requestAccessMode='ANYWHERE',registrationId=str(uuid.uuid4()))
    call('/api/admin/venues',payload,status=401)
    with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
        created=list(pool.map(lambda _:call('/api/admin/venues',payload,owner),range(2)))
    venue=created[0]['id'];venues.add((venue,owner))
    assert created[1]['id']==venue and created[0]['published'] is False
    assert created[0]['requestAccessMode']=='ANYWHERE' and not created[0]['active']
    assert call('/api/admin/venues',{**payload,'name':'Never overwritten'},owner)['name']==payload['name']
    distinct=call('/api/admin/venues',payload,other);venues.add((distinct['id'],other));assert distinct['id']!=venue
    call('/api/admin/venues',{**payload,'registrationId':str(uuid.uuid4()),'requestAccessMode':'INVALID'},owner,status=400)
    call('/api/admin/venues',{**payload,'registrationId':'not-a-uuid'},owner,status=400)
    updated=call('/api/admin/venues/'+venue,{**payload,'name':'Edited before cover'},owner,method='PUT')
    assert updated['name']=='Edited before cover' and updated['published'] is False
    endpoint='/api/admin/venues/'+venue+'/publication'
    call(endpoint,token=None,method='PUT',status=401)
    call(endpoint,token=other,method='PUT',status=403)
    call(endpoint,token=owner,method='PUT',status=412)
    photo=call('/api/admin/venues/'+venue+'/photos',dict(contentType='image/png',dataBase64=base64.b64encode(png()).decode()),owner)
    assert photo['coverPhotoUrl']
    assert not any(v['id']==venue for v in call('/api/venues?city=Test%20Registration%20City')),'Cover upload must not publish'
    call('/api/admin/venues/'+venue+'/session',dict(active=True),owner,status=412)
    published=call(endpoint,token=owner,method='PUT');assert published['published'] is True and published['active'] is False
    assert call(endpoint,token=owner,method='PUT')['published'] is True
    assert any(v['id']==venue for v in call('/api/venues?city=Test%20Registration%20City'))
    print('PASS real HTTP: concurrent/retried registration, owner isolation, atomic access mode, editable draft, cover without publication, explicit publication and music-session guard')
finally:
    for venue,token in venues:call('/api/admin/venues/'+venue,token=token,method='DELETE')
    for token in tokens:call('/api/accounts/admin/delete',dict(password=PASSWORD,confirmation='ELIMINAR'),token)
