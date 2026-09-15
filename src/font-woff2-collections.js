/** A collection may reuse only a complete, consistently paired glyf/loca set. */
export function validateWoff2Collections(header,transformFlag) {
  const glyphPairs=new Map(),locationPairs=new Map();
  for(const font of header.ttcFonts){
    const tags=new Map();
    for(const index of font.tableIndices){
      const table=header.tables[index];
      if(tags.has(table.tag))throw new Error('Duplicate font table in WOFF2 collection');
      tags.set(table.tag,index);
    }
    const glyph=tags.get(0x676c7966),location=tags.get(0x6c6f6361);
    if(glyph===undefined&&location===undefined)continue;
    if(glyph===undefined||location===undefined)throw new Error('WOFF2 collection requires paired glyph/location tables');
    const transformed=!!(header.tables[glyph].flags&transformFlag);
    if(transformed!==!!(header.tables[location].flags&transformFlag)||transformed&&location!==glyph+1)
      throw new Error('Mismatched glyph/location pair in WOFF2 collection');
    if(glyphPairs.has(glyph)&&glyphPairs.get(glyph)!==location||locationPairs.has(location)&&locationPairs.get(location)!==glyph)
      throw new Error('WOFF2 collection must share glyph/location tables together');
    glyphPairs.set(glyph,location);locationPairs.set(location,glyph);
  }
}
