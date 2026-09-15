const TAG={glyf:0x676c7966,loca:0x6c6f6361,head:0x68656164,maxp:0x6d617870,hhea:0x68686561,hmtx:0x686d7478};

/** Resolve transformed hmtx dependencies when glyf/loca are literal. */
export function prepareHmtxMetrics(data,tables,info,transformFlag) {
  const find=tag=>tables.find(table=>table.tag===TAG[tag]);
  const metrics=find('hmtx');
  if(!metrics || !(metrics.flags&transformFlag))return false;
  const glyf=find('glyf'),loca=find('loca');
  if(!glyf||!loca||!!(glyf.flags&transformFlag)!==!!(loca.flags&transformFlag))
    throw new Error('Transformed hmtx requires a matching TrueType glyf/loca pair');
  if(glyf.flags&transformFlag)return false; // Glyph reconstruction supplies these metrics.
  const view=(table,minimum)=>{
    if(!table||table.srcLength<minimum||table.srcOffset<0||table.srcOffset+table.srcLength>data.length)
      throw new Error('Invalid WOFF2 metric dependency bounds');
    return new DataView(data.buffer,data.byteOffset+table.srcOffset,table.srcLength);
  };
  const head=view(find('head'),54),maxp=view(find('maxp'),6);
  view(find('hhea'),36);
  const indexFormat=head.getInt16(50),numGlyphs=maxp.getUint16(4);
  if(![0,1].includes(indexFormat))throw new Error('Invalid TrueType location format');
  const stride=indexFormat?4:2,locations=view(loca,(numGlyphs+1)*stride),glyphs=view(glyf,0);
  const offset=index=>indexFormat?locations.getUint32(index*stride):locations.getUint16(index*stride)*2;
  const xMins=new Int16Array(numGlyphs);
  for(let index=0;index<numGlyphs;index++) {
    const start=offset(index),end=offset(index+1);
    if(end<start||end>glyf.srcLength||start!==end&&end-start<10)throw new Error('Invalid glyph bounds for WOFF2 metrics');
    xMins[index]=start===end?0:glyphs.getInt16(start+2);
  }
  Object.assign(info,{numGlyphs,indexFormat,xMins});
  // The common Google browser decoder cannot decode this legal combination.
  return true;
}
