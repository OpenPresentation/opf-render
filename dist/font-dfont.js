import {OPFFontError} from './font-error.js';
import {fontFormat,checkFontByteLimit} from './font-sfnt.js';

/** Read sfnt resources from supplied resource-fork bytes; never access the OS. */
export function readDfontResources(data,maxBytes) {
  maxBytes=checkFontByteLimit(maxBytes);
  if(data.length>maxBytes)throw new OPFFontError('font-size-limit','Font resource container exceeds the configured byte limit.');
  const fail=message=>{throw new OPFFontError('invalid-font-container',message);};
  const range=(start,length,min=0,end=data.length)=>{
    if(!Number.isSafeInteger(start)||!Number.isSafeInteger(length)||start<min||length<0||start+length>end)
      fail('A font resource points outside its declared container region.');
  };
  range(0,16);
  const view=new DataView(data.buffer,data.byteOffset,data.byteLength);
  const dataStart=view.getUint32(0),mapStart=view.getUint32(4),dataLength=view.getUint32(8),mapLength=view.getUint32(12);
  range(dataStart,dataLength,16);range(mapStart,mapLength,16);
  const dataEnd=dataStart+dataLength,mapEnd=mapStart+mapLength;
  if(dataStart<mapEnd&&mapStart<dataEnd)fail('Font resource data and map overlap.');
  range(mapStart,28,mapStart,mapEnd);
  const typeStart=mapStart+view.getUint16(mapStart+24),nameStart=mapStart+view.getUint16(mapStart+26);
  range(nameStart,0,mapStart+28,mapEnd);range(typeStart,2,mapStart+28,nameStart);
  const count=view.getUint16(typeStart)+1;
  range(typeStart+2,count*8,typeStart,nameStart);
  const typeEnd=typeStart+2+count*8,types=new Set(),references=[],resources=[];
  for(let i=0;i<count;i++){
    const record=typeStart+2+i*8,tag=view.getUint32(record),refCount=view.getUint16(record+4)+1;
    if(types.has(tag))fail('Font resource types must be unique.');types.add(tag);
    const refStart=typeStart+view.getUint16(record+6),refEnd=refStart+refCount*12;
    range(refStart,refCount*12,typeEnd,nameStart);references.push([refStart,refEnd]);
    const ids=new Set();
    for(let j=0;j<refCount;j++){
      const ref=refStart+j*12,id=view.getInt16(ref),nameOffset=view.getUint16(ref+2);
      if(ids.has(id))fail('Font resource IDs must be unique within a type.');ids.add(id);
      if(nameOffset!==0xffff){const name=nameStart+nameOffset;range(name,1,nameStart,mapEnd);range(name+1,data[name],nameStart,mapEnd);}
      const start=dataStart+(view.getUint32(ref+4)&0xffffff);
      range(start,4,dataStart,dataEnd);
      const length=view.getUint32(start);range(start+4,length,dataStart,dataEnd);
      if(tag===0x73666e74){
        const bytes=data.subarray(start+4,start+4+length);
        if(!['ttf','otf'].includes(fontFormat(bytes)))fail('An sfnt resource must contain a standalone font face.');
        resources.push({data:bytes,id,index:j});
      }
    }
  }
  references.sort((a,b)=>a[0]-b[0]);
  for(let i=1;i<references.length;i++)if(references[i][0]<references[i-1][1])fail('Font resource reference lists overlap.');
  if(!resources.length)fail('The resource container has no sfnt font faces.');
  return resources;
}
