import {OPFFontError} from './font-error.js';

const fail=message=>{throw new OPFFontError('invalid-font-variations',message);};
const fixed=value=>Math.floor(value*65536+.5);
const round=value=>Math.sign(value)*Math.floor(Math.abs(value)+.5);
const clamp=value=>Math.max(-65536,Math.min(65536,value));

/** Read bounded avar 1.0 maps without relying on Fontkit's unbounded decoder. */
export function readVariationMaps(data,table,axisCount){
  if(!table)return undefined;
  if(table.offset<0||table.length<8||table.offset+table.length>data.length)fail('The axis mapping table is truncated.');
  const view=new DataView(data.buffer,data.byteOffset+table.offset,table.length);
  if(view.getUint16(0)!==1||view.getUint16(2)!==0)fail('This axis mapping table version is not supported.');
  if(view.getUint16(4)!==0||view.getUint16(6)!==axisCount)fail('The axis mapping table does not match the font axes.');
  const segment=[];let offset=8;
  for(let i=0;i<axisCount;i++){
    if(offset+2>view.byteLength)fail('Axis mapping records exceed their table.');
    const count=view.getUint16(offset);offset+=2;
    if(offset+count*4>view.byteLength)fail('Axis mapping records exceed their table.');
    const correspondence=[];
    for(let j=0;j<count;j++,offset+=4){
      const fromCoord=view.getInt16(offset)/16384,toCoord=view.getInt16(offset+2)/16384,previous=correspondence.at(-1);
      if(Math.abs(fromCoord)>1||Math.abs(toCoord)>1||previous&&(fromCoord<=previous.fromCoord||toCoord<previous.toCoord))fail('Axis mapping records require ordered coordinates in [-1, 1].');
      correspondence.push({fromCoord,toCoord});
    }
    // OpenType requires an identity mapping for an axis missing any anchor.
    const anchored=[-1,0,1].every(value=>correspondence.some(pair=>pair.fromCoord===value&&pair.toCoord===value));
    segment.push({pairCount:anchored?count:0,correspondence:anchored?correspondence:[]});
  }
  return {version:1,axisCount,segment};
}

/** OpenType user 16.16 -> normalized 16.16 -> avar 16.16 -> signed 2.14.
 * Apply before glyph, blend-vector or feature-variation caches are populated.
 * Keep authored user coordinates and source font bytes separate and unchanged.
 */
export function normalizeVariationCoordinates(axes,values,maps){
  return axes.map((axis,index)=>{
    const value=fixed(values[axis.axisTag]),minimum=fixed(axis.minValue),normal=fixed(axis.defaultValue),maximum=fixed(axis.maxValue);
    let coordinate=value===normal?0:clamp(round((value-normal)*65536/(value<normal?normal-minimum:maximum-normal)));
    const pairs=maps?.segment[index]?.correspondence??[];
    for(let i=0;i<pairs.length;i++){
      const end=pairs[i],endFrom=fixed(end.fromCoord);
      if(endFrom===coordinate){coordinate=fixed(end.toCoord);break;}
      if(endFrom>coordinate&&i){
        const start=pairs[i-1],startFrom=fixed(start.fromCoord);
        const ratio=round((coordinate-startFrom)*65536/(endFrom-startFrom));
        coordinate=clamp(fixed(start.toCoord)+round(ratio*(fixed(end.toCoord)-fixed(start.toCoord))/65536));
        break;
      }
    }
    return Math.floor((coordinate+2)/4)/16384;
  });
}
