import {deflateSync} from 'node:zlib';
const align = value => Math.ceil(value / 4) * 4;
export function makeCollection(fonts, withSignature=false) {
  let length = align(12 + fonts.length * 4 + (withSignature?12:0));
  const offsets = fonts.map(font => { const offset = length; length += align(font.length); return offset; });
  const result = Buffer.alloc(length+(withSignature?8:0));
  result.write('ttcf'); result.writeUInt32BE(withSignature?0x20000:0x10000,4); result.writeUInt32BE(fonts.length,8);
  if(withSignature) {
    const record=12+fonts.length*4;
    result.write('DSIG',record);result.writeUInt32BE(8,record+4);result.writeUInt32BE(length,record+8);
    result.writeUInt32BE(1,length); // Synthetic, unsigned DSIG header; no validity claim.
  }
  fonts.forEach((font,index) => {
    const start = offsets[index]; result.writeUInt32BE(start,12+index*4); font.copy(result,start);
    for(let i=0;i<font.readUInt16BE(4);i++) {
      const record=12+i*16,position=font.readUInt32BE(record+8);
      result.writeUInt32BE(position+start,start+record+8);
      if(font.toString('ascii',record,record+4)==='head')result.writeUInt32BE(0,start+position+8);
    }
  });
  return result;
}
export function makeWoff(font, withMetadata=false) {
  const count=font.readUInt16BE(4), tables=[];
  let offset=44+count*20, sfntSize=12+count*16;
  for(let i=0;i<count;i++) {
    const record=12+i*16,start=font.readUInt32BE(record+8),length=font.readUInt32BE(record+12);
    const source=font.subarray(start,start+length),compressed=deflateSync(source);
    const bytes=compressed.length<source.length?compressed:source;
    tables.push({tag:font.subarray(record,record+4),checksum:font.readUInt32BE(record+4),length,bytes,offset});
    offset+=align(bytes.length);sfntSize+=align(length);
  }
  const metadata=Buffer.from('<?xml version="1.0" encoding="UTF-8"?><metadata version="1.0"><uniqueid id="opf-fixture"/></metadata>');
  const compressedMetadata=deflateSync(metadata), privateData=Buffer.from('OPF private metadata sentinel');
  const result=Buffer.alloc(offset+(withMetadata?align(compressedMetadata.length)+privateData.length:0));
  result.write('wOFF');font.copy(result,4,0,4);result.writeUInt32BE(result.length,8);result.writeUInt16BE(count,12);result.writeUInt32BE(sfntSize,16);
  for(const [index,table]of tables.entries()) {
    const record=44+index*20;table.tag.copy(result,record);result.writeUInt32BE(table.offset,record+4);
    result.writeUInt32BE(table.bytes.length,record+8);result.writeUInt32BE(table.length,record+12);result.writeUInt32BE(table.checksum,record+16);table.bytes.copy(result,table.offset);
  }
  if(withMetadata) {
    result.writeUInt32BE(offset,24);result.writeUInt32BE(compressedMetadata.length,28);result.writeUInt32BE(metadata.length,32);
    compressedMetadata.copy(result,offset);offset+=align(compressedMetadata.length);
    result.writeUInt32BE(offset,36);result.writeUInt32BE(privateData.length,40);privateData.copy(result,offset);
  }
  return result;
}
export function fontTables(font) {
  const result=new Map();
  for(let i=0;i<font.readUInt16BE(4);i++) {
    const record=12+i*16,start=font.readUInt32BE(record+8),length=font.readUInt32BE(record+12);
    const tag=font.toString('ascii',record,record+4),bytes=Buffer.from(font.subarray(start,start+length));
    if(tag==='head')bytes.writeUInt32BE(0,8);
    result.set(tag,bytes);
  }
  return result;
}
