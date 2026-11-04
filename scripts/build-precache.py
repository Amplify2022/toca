"""Generate exact local URLs; keep private API traffic out of the service worker."""
from pathlib import Path
import re,json,hashlib
root=Path(__file__).resolve().parents[1]/'web'
html=(root/'index.html').read_text()
assets=list(dict.fromkeys(['/','/index.html']+re.findall(r'(?:src|href)="(/[^"#]+)"',html)+['/assets/icon.svg','/assets/toca-home-map.svg']+[f'/assets/venues/bar-{i}.webp' for i in range(1,7)]))
version=hashlib.sha256(b''.join((root/x.split('?')[0].lstrip('/')).read_bytes() for x in assets if x!='/')).hexdigest()[:16]
source=(root/'sw.js').read_text()
source=re.sub(r'const CACHE=(?:"[^\"]+"|\'[^\']+\');const SHELL=.*?;\n','const CACHE='+json.dumps('toca-shell-'+version)+';const SHELL='+json.dumps(assets)+';\n',source,count=1)
(root/'sw.js').write_text(source)
