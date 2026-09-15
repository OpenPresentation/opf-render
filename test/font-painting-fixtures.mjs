export const paintingDeck = {
  name: 'Source-preserving glyph painting',
  design: {
    fontScheme: {id:'roboto',heading:{family:'Arimo'},body:{family:'Arimo'},code:{family:'Cousine'}},
    header: {left:{text:'Owner o\u0302\u0301'},right:{section:true}},
    footer: {left:{text:'Keep source and metadata'},right:{slideNumber:true}},
  },
  slides: [
    {section:'Editing',title:'office AVATAR',text:[
      {text:'  Linked o\u0302\u0301 ',underline:true,link:'https://example.com'},
      {text:'and strike',strikethrough:true,color:'#E2A52B'},
      {text:'\nBold ',bold:true},{text:'italic ',italic:true},{text:'2',superscript:true},
    ]},
    {section:'Whitespace',title:'Plain source ranges',text:'  First  line\r\n\r\nSecond\tcolumn  \n'},
    {section:'Lists',title:'Bullets',items:['  First office item  ','Second o\u0302\u0301 item']},
    {section:'Code',code:{source:'\tconst value = "two  spaces";\r\nreturn "<&>";  \n',filename:'src/CaseSensitive.ts',language:'TypeScript'}},
    {section:'Metrics',metric:{value:42,unit:'ms',label:'Left\tRight  ',description:'Exact\r\n\r\ncontext',delta:0,trend:'flat'}},
  ],
};
