import { OPFFontError } from './font-error.js';

export const DEFAULT_FONT_BYTE_LIMIT = 64 * 1024 * 1024;
const SFNT_SIGNATURES = new Set([0x00010000, 0x4f54544f, 0x74727565]);
export const align4 = value => Math.ceil(value / 4) * 4;
export function fontFormat(data) {
  const signature = data.length >= 4 ? new DataView(data.buffer,data.byteOffset,data.byteLength).getUint32(0) : 0;
  return ({[0x774f4646]:'woff',[0x774f4632]:'woff2',[0x74746366]:'collection',[0x4f54544f]:'otf',[0x00010000]:'ttf',[0x74727565]:'ttf'})[signature];
}
export function checkFontByteLimit(value = DEFAULT_FONT_BYTE_LIMIT) {
  if (!Number.isSafeInteger(value) || value <= 0 || value > 0xffffffff)
    throw new OPFFontError('invalid-font-byte-limit','Font preparation requires a positive integer byte limit at most 4 GiB.');
  return value;
}
export function fontChecksum(bytes) {
  let sum = 0;
  for (let offset=0;offset<bytes.length;offset+=4) {
    const word=((bytes[offset]<<24) | ((bytes[offset+1]??0)<<16) | ((bytes[offset+2]??0)<<8) | (bytes[offset+3]??0))>>>0;
    sum=(sum+word)>>>0;
  }
  return sum;
}
export function buildSfnt(tables, flavor, maxBytes = DEFAULT_FONT_BYTE_LIMIT) {
  if (!SFNT_SIGNATURES.has(flavor) || !tables.length || tables.length > 4095)
    throw new OPFFontError('invalid-font-container','Unsupported SFNT header or table count.');
  const removedSignature=tables.some(table=>table.tag===0x44534947);
  const retained=tables.filter(table=>table.tag!==0x44534947).sort((a,b)=>a.tag-b.tag);
  if (!retained.length) throw new OPFFontError('invalid-font-container','A prepared font requires font tables.');
  const length=12+retained.length*16+retained.reduce((sum,table)=>sum+align4(table.data.length),0);
  if(length>maxBytes)throw new OPFFontError('font-size-limit','Prepared font exceeds the configured byte limit.',{bytes:length,maxBytes});
  const result=new Uint8Array(length),view=new DataView(result.buffer);
  const power=Math.floor(Math.log2(retained.length));
  view.setUint32(0,flavor);view.setUint16(4,retained.length);
  view.setUint16(6,2**power*16);view.setUint16(8,power);view.setUint16(10,retained.length*16-2**power*16);
  let offset=12+retained.length*16,head;
  retained.forEach((table,index)=>{
    const record=12+index*16;
    result.set(table.data,offset);
    if(table.tag===0x68656164){
      if(table.data.length<54)throw new OPFFontError('invalid-font-container','The font head table is truncated.');
      head=offset;view.setUint32(offset+8,0);
    }
    view.setUint32(record,table.tag);
    view.setUint32(record+4,fontChecksum(result.subarray(offset,offset+table.data.length)));
    view.setUint32(record+8,offset);view.setUint32(record+12,table.data.length);
    offset+=align4(table.data.length);
  });
  if(head===undefined)throw new OPFFontError('invalid-font-container','A prepared font requires a head table.');
  view.setUint32(head+8,(0xb1b0afba-fontChecksum(result))>>>0);
  return {data:result,removedSignature};
}
/** Preserve all selected font tables except invalidated signatures; never subset or renumber glyphs. */
export function extractSfnt(data, faceIndex=0, maxBytes=DEFAULT_FONT_BYTE_LIMIT) {
  const view=new DataView(data.buffer,data.byteOffset,data.byteLength);
  const range=(offset,length)=>{
    if(!Number.isSafeInteger(offset)||!Number.isSafeInteger(length)||offset<0||length<0||offset+length>data.length)
      throw new OPFFontError('invalid-font-container','A font table points outside its source bytes.');
  };
  range(0,12);
  let directory=0,collectionSignature=false;
  if(view.getUint32(0)===0x74746366){
    const version=view.getUint32(4),count=view.getUint32(8);
    if(![0x10000,0x20000].includes(version)||!Number.isInteger(faceIndex)||faceIndex<0||faceIndex>=count)
      throw new OPFFontError('font-collection','Select an existing face from a valid font collection.');
    range(12,count*4+(version===0x20000?12:0));
    directory=view.getUint32(12+faceIndex*4);range(directory,12);
    collectionSignature=version===0x20000&&view.getUint32(12+count*4)===0x44534947;
  }else if(faceIndex!==0)throw new OPFFontError('font-collection','A standalone font has only one face.');
  const flavor=view.getUint32(directory),count=view.getUint16(directory+4);
  range(directory+12,count*16);
  const tables=[];
  for(let index=0;index<count;index++){
    const record=directory+12+index*16,start=view.getUint32(record+8),length=view.getUint32(record+12);
    range(start,length);tables.push({tag:view.getUint32(record),data:data.subarray(start,start+length)});
  }
  const result=buildSfnt(tables,flavor,maxBytes);
  result.removedSignature ||= collectionSignature;
  return result;
}
