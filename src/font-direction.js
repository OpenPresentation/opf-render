import {rtlScriptTags,scriptDirectionRanges} from './font-direction-data.js';

// This reproduces HarfBuzz's existing single-buffer script/direction default.
// It does not perform paragraph bidi or itemization, and never changes shaping.
// The pinned JS wrapper does not expose hb_buffer_get_direction. Use pinned UCD
// data here, not the host's potentially different ICU version or cluster order.
export function shapingDirection(text,{direction,script}={}) {
  if(direction)return direction;
  if(script)return rtlScriptTags.includes(script[0].toUpperCase()+script.slice(1).toLowerCase())?'rtl':'ltr';
  for(const character of text){
    const codepoint=character.codePointAt(0);let low=0,high=scriptDirectionRanges.length-1;
    while(low<=high){
      const middle=(low+high)>>>1,[start,end,rtl]=scriptDirectionRanges[middle];
      if(codepoint<start)high=middle-1;else if(codepoint>end)low=middle+1;else return rtl?'rtl':'ltr';
    }
  }
  return 'ltr';
}
