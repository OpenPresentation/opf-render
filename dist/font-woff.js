import { Unzlib } from 'fflate';
import { OPFFontError } from './font-error.js';
import { buildSfnt, align4, fontChecksum } from './font-sfnt.js';

function inflateTable(data, expected) {
  if(data.length<6)throw new OPFFontError('invalid-font-container','A compressed WOFF table is truncated.');
  const output=new Uint8Array(expected);
  let offset=0,finished=false;
  const stream=new Unzlib((chunk,final)=>{
    if(offset+chunk.length>expected)throw new OPFFontError('font-size-limit','A WOFF table expands beyond its declared length.');
    output.set(chunk,offset);offset+=chunk.length;finished=final;
  });
  // Limit compressed input per push as well as total output; a hostile stream
  // must not allocate its entire expansion before the size check runs.
  for(let index=0;index<data.length;index+=1024)stream.push(data.subarray(index,index+1024),index+1024>=data.length);
  if(!finished||offset!==expected)throw new OPFFontError('invalid-font-container','A WOFF table has the wrong decompressed length.');
  let a=1,b=0;
  for(const byte of output){a=(a+byte)%65521;b=(b+a)%65521;}
  const declared=new DataView(data.buffer,data.byteOffset,data.length).getUint32(data.length-4);
  if((((b<<16)|a)>>>0)!==declared)throw new OPFFontError('invalid-font-container','A WOFF table failed its zlib checksum.');
  return output;
}
export function decodeWoff(data,maxBytes) {
  if(data.length<44)throw new OPFFontError('invalid-font-container','The WOFF header is truncated.');
  const view=new DataView(data.buffer,data.byteOffset,data.byteLength),count=view.getUint16(12);
  if(view.getUint32(0)!==0x774f4646||view.getUint32(8)!==data.length||view.getUint16(14)!==0||count===0||count>4095||44+count*20>data.length)
    throw new OPFFontError('invalid-font-container','The WOFF header or table directory is invalid.');
  const declaredSize=view.getUint32(16);
  if(declaredSize>maxBytes)throw new OPFFontError('font-size-limit','WOFF decompression exceeds the configured byte limit.',{bytes:declaredSize,maxBytes});
  let expectedSize=12+count*16;
  const records=[],ranges=[];
  for(let index=0;index<count;index++){
    const record=44+index*20,tag=view.getUint32(record),start=view.getUint32(record+4),compressed=view.getUint32(record+8),length=view.getUint32(record+12);
    if(start%4||start<44+count*20||compressed>length||start+compressed>data.length)
      throw new OPFFontError('invalid-font-container','A WOFF table has invalid bounds or lengths.');
    expectedSize+=align4(length);
    if(expectedSize>maxBytes)throw new OPFFontError('font-size-limit','WOFF table lengths exceed the configured byte limit.');
    ranges.push([start,start+compressed]);records.push({tag,start,compressed,length,checksum:view.getUint32(record+16)});
  }
  if(expectedSize!==declaredSize)throw new OPFFontError('invalid-font-container','WOFF SFNT size does not match its table directory.');
  ranges.sort((a,b)=>a[0]-b[0]);
  for(let index=1;index<ranges.length;index++)if(ranges[index][0]<ranges[index-1][1])throw new OPFFontError('invalid-font-container','WOFF tables overlap.');
  const tables=records.map(record=>{
    let bytes=data.subarray(record.start,record.start+record.compressed);
    if(record.compressed<record.length)bytes=inflateTable(bytes,record.length);
    const checked=Uint8Array.from(bytes);
    if(record.tag===0x68656164&&checked.length>=12)new DataView(checked.buffer).setUint32(8,0);
    if(fontChecksum(checked)!==record.checksum)throw new OPFFontError('invalid-font-container','A WOFF font table failed its OpenType checksum.');
    return {tag:record.tag,data:bytes};
  });
  return buildSfnt(tables,view.getUint32(4),maxBytes);
}
