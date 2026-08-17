// Presentation constants shared by the Match history page and the graph's match
// modal. In lib/ rather than beside the components so those files export
// components only, which keeps Fast Refresh working
// (react-refresh/only-export-components).

// Drop-shadow applied to text that sits over a map photo, for legibility.
export const OVER_PHOTO = { textShadow: '0 1px 3px rgba(0,0,0,0.85)' };

export const categoryTone = {
  Ranked: 'yellow',
  'World Tour': 'purple',
  Casual: 'blue',
  LTM: 'emerald',
  Other: 'gray',
};

// Class colours — same scheme as the Loadouts page + the weapon-filter picker
export const ARCH_TONE = { Light: 'blue', Medium: 'emerald', Heavy: 'red' };
