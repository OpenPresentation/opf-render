/** Independent resource-fork writer for raw data-fork font fixtures. */
export function makeDfont(fonts,{dataOffset=256,mapFirst=false}={}) {
  const groups=[{tag:'NOTE',values:[{id:7,data:Buffer.from('Keep non-font resource\0bytes'),name:'annotation'}]},
    {tag:'sfnt',values:fonts.map((data,index)=>({id:128+index,data:Buffer.from(data),name:index%2===0?`face ${index}`:undefined}))}];
  let length=0,nameLength=0;
  for(const group of groups)for(const value of group.values){
    value.offset=length;length+=4+value.data.length;
    value.nameOffset=value.name===undefined?0xffff:nameLength;
    if(value.name!==undefined)nameLength+=1+Buffer.byteLength(value.name);
  }
  const typeOffset=28,referenceStart=2+groups.length*8;
  const nameOffset=typeOffset+referenceStart+groups.reduce((n,g)=>n+g.values.length*12,0),mapLength=nameOffset+nameLength;
  const mapOffset=mapFirst?dataOffset:dataOffset+length;
  if(mapFirst)dataOffset+=mapLength;
  const result=Buffer.alloc(Math.max(mapOffset+mapLength,dataOffset+length)+13,0);
  result.writeUInt32BE(dataOffset,0);result.writeUInt32BE(mapOffset,4);result.writeUInt32BE(length,8);result.writeUInt32BE(mapLength,12);
  result.copy(result,mapOffset,0,16);
  result.writeUInt16BE(typeOffset,mapOffset+24);result.writeUInt16BE(nameOffset,mapOffset+26);
  const typeStart=mapOffset+typeOffset;result.writeUInt16BE(groups.length-1,typeStart);
  let refOffset=referenceStart;
  groups.forEach((group,index)=>{
    const record=typeStart+2+index*8;result.write(group.tag,record);result.writeUInt16BE(group.values.length-1,record+4);result.writeUInt16BE(refOffset,record+6);
    for(const value of group.values){
      const ref=typeStart+refOffset;result.writeInt16BE(value.id,ref);result.writeUInt16BE(value.nameOffset,ref+2);
      result[ref+4]=0x20;result.writeUIntBE(value.offset,ref+5,3);
      result.writeUInt32BE(value.data.length,dataOffset+value.offset);value.data.copy(result,dataOffset+value.offset+4);
      if(value.name!==undefined){const start=mapOffset+nameOffset+value.nameOffset;result[start]=Buffer.byteLength(value.name);result.write(value.name,start+1);}
      refOffset+=12;
    }
  });
  result.write('retained tail',result.length-13);
  return result;
}
