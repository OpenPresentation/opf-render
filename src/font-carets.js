import {OPFFontError} from './font-error.js';

/** Carets use accepted cluster advances and physical-font GDEF coordinates. */
export function caretGeometry(run,direction,extents,ligatureCarets) {
  const {text,glyphs}=run;
  const boundaries=[...new Intl.Segmenter(undefined,{granularity:'grapheme'}).segment(text)].map(part=>part.index).concat(text.length);
  const groups=new Map();let pen=0;
  for(const glyph of glyphs){
    let group=groups.get(glyph.sourceStart);
    if(!group){group={start:glyph.sourceStart,end:glyph.sourceEnd,left:pen,right:pen,glyphs:[]};groups.set(group.start,group);}
    group.glyphs.push({glyph,origin:pen+glyph.xOffset});
    pen+=glyph.xAdvance;group.right=pen;
  }
  const stops=new Map();let next=0;
  for(const group of [...groups.values()].sort((a,b)=>a.start-b.start)){
    while(next<boundaries.length&&boundaries[next]<group.start)next++;
    const offsets=[];
    while(next<boundaries.length&&boundaries[next]<group.end)offsets.push(boundaries[next++]);
    if(!offsets.length)continue;
    const start=direction==='rtl'?group.right:group.left,end=direction==='rtl'?group.left:group.right;
    stops.set(offsets[0],{offset:offsets[0],x:start,basis:'cluster'});
    stops.set(group.end,{offset:group.end,x:end,basis:'cluster'});
    const inside=offsets.slice(1);
    if(!inside.length)continue;
    const definitions=group.glyphs.flatMap(({glyph,origin})=>{
      const carets=ligatureCarets(glyph.id);
      if(!carets.every(Number.isFinite))throw new OPFFontError('invalid-shaped-carets','Font caret coordinates must be finite.');
      return carets.length===inside.length?[{origin,carets}]:[];
    });
    const definition=definitions.length===1?definitions[0]:undefined;
    const coordinates=definition?[...definition.carets].sort((a,b)=>direction==='rtl'?b-a:a-b):undefined;
    for(const [index,offset]of inside.entries())stops.set(offset,{
      offset,x:definition?definition.origin+coordinates[index]:start+(end-start)*(index+1)/offsets.length,
      // Many valid fonts omit GDEF carets. Keep the deterministic editing
      // fallback explicit; never present interpolation as physical-font data.
      basis:definition?'font':'interpolated',
    });
  }
  if(!glyphs.length)for(const offset of boundaries)stops.set(offset,{offset,x:0,basis:'cluster'});
  const ordered=[...stops.values()].sort((a,b)=>a.offset-b.offset);
  if(ordered.length!==boundaries.length||ordered.some((stop,index)=>stop.offset!==boundaries[index]||!Number.isFinite(stop.x))||
    ![extents.ascender,extents.descender].every(Number.isFinite)||extents.ascender<=extents.descender)
    throw new OPFFontError('invalid-shaped-carets','Caret geometry must cover every original grapheme boundary with finite font coordinates.');
  return {direction,ascent:extents.ascender,descent:extents.descender,stops:ordered};
}
