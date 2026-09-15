"""Record independent FreeType 2.14.1 / FontTools 4.60.2 coordinates (test only)."""
import json,hashlib,ctypes,sys
from pathlib import Path
import fontTools
from fontTools.ttLib import TTFont
from fontTools.varLib.models import normalizeLocation,piecewiseLinearMap
from fontTools.misc.fixedTools import floatToFixed
root=Path('test/fixtures/font-formats');metadata=json.loads((root/'reference.json').read_text())
assert fontTools.__version__=='4.60.2'
if len(sys.argv)!=2:raise SystemExit('Pass the path to the test-only FreeType 2.14.1 shared library.')
ft=ctypes.CDLL(sys.argv[1]);pointer=ctypes.c_void_p;integer=ctypes.c_int;fixed=ctypes.c_long
ft.FT_Init_FreeType.argtypes=[ctypes.POINTER(pointer)]
ft.FT_Library_Version.argtypes=[pointer,ctypes.POINTER(integer),ctypes.POINTER(integer),ctypes.POINTER(integer)]
ft.FT_New_Face.argtypes=[pointer,ctypes.c_char_p,ctypes.c_long,ctypes.POINTER(pointer)]
ft.FT_Set_Var_Design_Coordinates.argtypes=[pointer,ctypes.c_uint,ctypes.POINTER(fixed)]
ft.FT_Get_Var_Blend_Coordinates.argtypes=[pointer,ctypes.c_uint,ctypes.POINTER(fixed)]
ft.FT_Done_Face.argtypes=[pointer];ft.FT_Done_FreeType.argtypes=[pointer]
library=pointer();assert ft.FT_Init_FreeType(ctypes.byref(library))==0
version=[integer() for _ in range(3)];ft.FT_Library_Version(library,*[ctypes.byref(n) for n in version]);version=tuple(n.value for n in version)
assert version==(2,14,1),version
result={'fontTools':fontTools.__version__,'freeType':'.'.join(map(str,version)),'freeTypeSourceSha256':'32427e8c471ac095853212a37aef816c60b42052d4d9e48230bab3bdf2936ccc','method':'FreeType design-to-blend 16.16, then OpenType (fixed + 2) >> 2; independent FontTools floating reference retained','cases':[]}
for record in metadata['fonts']:
 if not record['axes']:continue
 path=root/record['file'];assert hashlib.sha256(path.read_bytes()).hexdigest()==record['sha256']
 face=pointer();assert ft.FT_New_Face(library,str(path.resolve()).encode(),0,ctypes.byref(face))==0
 font=TTFont(path,checkChecksums=2);axes={key:(a['min'],a['default'],a['max']) for key,a in record['axes'].items()};defaults={key:a[1] for key,a in axes.items()}
 cases=[('default',defaults)]+[('named:'+i['name'],i['coordinates']) for i in record['instances']]
 for name,fraction in [('minimum',0),('maximum',1),('interior',.37)]:cases.append((name,{key:a[0]+(a[2]-a[0])*fraction for key,a in axes.items()}))
 first=next(iter(axes));cases.append(('partial',{**defaults,first:axes[first][2]}))
 for name,values in cases:
  coords=normalizeLocation(values,axes)
  if 'avar' in font:coords={key:piecewiseLinearMap(value,font['avar'].segments[key]) for key,value in coords.items()}
  design=(fixed*len(axes))(*[floatToFixed(values[key],16) for key in axes]);blend=(fixed*len(axes))()
  assert ft.FT_Set_Var_Design_Coordinates(face,len(axes),design)==0
  assert ft.FT_Get_Var_Blend_Coordinates(face,len(axes),blend)==0
  result['cases'].append({'file':record['file'],'id':name,'coordinates':values,'freeType16_16':list(blend),'normalized':[((n+2)//4)/16384 for n in blend],'fontToolsNormalized':[floatToFixed(coords[key],14)/16384 for key in axes]})
 assert ft.FT_Done_Face(face)==0
assert ft.FT_Done_FreeType(library)==0
(root/'normalization-reference.json').write_text(json.dumps(result,indent=2)+'\n')
print('Independent FreeType/FontTools normalization:',len(result['cases']),'cases; original font hashes verified.')
