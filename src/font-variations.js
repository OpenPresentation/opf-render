import {OPFFontError} from './font-error.js';

const tagPattern=/^[\x20-\x7e]{4}$/;
const fail=message=>{throw new OPFFontError('invalid-font-variations',message);};
const nameKeys={2:'fontSubfamily',6:'postscriptName',17:'preferredSubfamily'};
function nameForId(font,id){
  const names=id>=256?font.name?.records.fontFeatures?.[id]:font.name?.records[nameKeys[id]??id];
  return names?.en??Object.values(names??{}).find(value=>typeof value==='string');
}
/** Validate maps before passing them to native shaping or CSS. Never clamp caller choices. */
export function variationSettings(values){
  if(values===undefined)return undefined;
  if(!values||typeof values!=='object'||Array.isArray(values))fail('Font variations require an axis/value object or a known instance name.');
  const result={};
  for(const tag of Object.keys(values).sort()){
    const value=values[tag];
    if(!tagPattern.test(tag)||typeof value!=='number'||!Number.isFinite(value))fail('Variation axes require four ASCII characters and finite numeric values.');
    result[tag]=value;
  }
  return result;
}
export function variationCss(values){
  const settings=variationSettings(values);
  return settings&&Object.entries(settings).map(([tag,value])=>`"${tag.replace(/[^A-Za-z0-9 ]/g,c=>`\\${c.charCodeAt(0).toString(16)} `)}" ${value}`).join(', ');
}
/** Bounded fvar metadata reader. Original font bytes are never changed. */
export function selectFontVariations(font,data,{variations,postscriptName}={}){
  const table=font.directory.tables.fvar;
  if(!table){
    if(variations!==undefined&&Object.keys(variationSettings(variations)).length)fail('This font has no variation axes.');
    if(postscriptName!==undefined&&postscriptName!==font.postscriptName)throw new OPFFontError('font-collection','The requested PostScript name does not select this standalone font.');
    return {font};
  }
  if(table.offset<0||table.length<16||table.offset+table.length>data.length)fail('The font variation table is truncated.');
  const view=new DataView(data.buffer,data.byteOffset+table.offset,table.length);
  const range=(offset,length)=>{if(offset<16||offset+length>view.byteLength)fail('Font variation records exceed their table.');};
  const major=view.getUint16(0),minor=view.getUint16(2),offset=view.getUint16(4),count=view.getUint16(8),axisSize=view.getUint16(10),instanceCount=view.getUint16(12),instanceSize=view.getUint16(14);
  if(major!==1||view.getUint16(6)!==2||axisSize<20||instanceSize<4+count*4)fail('The font variation table has an unsupported header.');
  if(!count){if(variations!==undefined&&Object.keys(variationSettings(variations)).length)fail('This font has no functional variation axes.');return {font};}
  range(offset,count*axisSize+instanceCount*instanceSize);
  const axes=[],seen=new Set();
  for(let i=0;i<count;i++){
    const start=offset+i*axisSize,axisTag=String.fromCharCode(...data.subarray(table.offset+start,table.offset+start+4));
    const minValue=view.getInt32(start+4)/65536,defaultValue=view.getInt32(start+8)/65536,maxValue=view.getInt32(start+12)/65536,nameID=view.getUint16(start+18);
    if(!tagPattern.test(axisTag)||seen.has(axisTag)||minValue>defaultValue||defaultValue>maxValue)fail('Font variation axes must have unique tags and ordered ranges.');
    seen.add(axisTag);axes.push({axisTag,minValue,defaultValue,maxValue,flags:view.getUint16(start+16),nameID,name:{en:nameForId(font,nameID)??axisTag}});
  }
  const instances=[];
  for(let i=0;i<instanceCount;i++){
    const start=offset+count*axisSize+i*instanceSize,nameID=view.getUint16(start),postscriptNameID=instanceSize>=6+count*4?view.getUint16(start+4+count*4):0xffff;
    const coord=axes.map((axis,index)=>view.getInt32(start+4+index*4)/65536);
    if(coord.some((value,index)=>value<axes[index].minValue||value>axes[index].maxValue))fail('A named font instance exceeds its axis ranges.');
    instances.push({nameID,name:{en:nameForId(font,nameID)??''},flags:view.getUint16(start+2),coord,postscriptNameID});
  }
  // Fontkit 2.0.4 ignores fvar record offsets and only resolves feature name IDs.
  // Supply the validated metadata shape to its existing variation processor;
  // getVariation shares this cache. Do not rewrite or recompile the fvar bytes.
  font._tables.fvar={version:major+minor/65536,offsetToData:offset,countSizePairs:2,axisCount:count,axisSize,instanceCount,instanceSize,axis:axes,instance:instances};
  let requested=variations,namedInstance;
  if(postscriptName!==undefined&&postscriptName!==font.postscriptName){
    if(variations!==undefined)fail('Choose either a named PostScript instance or explicit variations.');
    requested=postscriptName;
  }
  let selected;
  if(typeof requested==='string'){
    const matches=instances.filter(instance=>instance.name.en===requested||instance.postscriptNameID!==0xffff&&nameForId(font,instance.postscriptNameID)===requested);
    if(!requested||matches.length!==1)fail('Select a unique instance name from this font.');
    const instance=matches[0];namedInstance=instance.name.en;
    selected=Object.fromEntries(axes.map((axis,index)=>[axis.axisTag,instance.coord[index]]));
  }else selected=variationSettings(requested)??{};
  for(const tag of Object.keys(selected))if(!seen.has(tag))fail(`Unknown variation axis '${tag}'.`);
  const resolved={};
  for(const axis of axes){
    const value=selected[axis.axisTag]??axis.defaultValue;
    if(value<axis.minValue||value>axis.maxValue)fail(`Variation '${axis.axisTag}' must be between ${axis.minValue} and ${axis.maxValue}.`);
    resolved[axis.axisTag]=value;
  }
  const values=variationSettings(resolved);
  return {font:font.getVariation(values),variations:values,...(namedInstance?{namedInstance}:{})};
}
