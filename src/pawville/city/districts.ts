import type {RegionId} from '../adventure/state.ts';
export const CITY_DISTRICTS:readonly {id:string;name:string;region:RegionId;x:number;y:number;detail:string}[]=[
{id:'station',name:'Whiskerwick Station',region:'city',x:76,y:452,detail:'Train connections'},
{id:'plaza',name:'Central Plaza',region:'city',x:500,y:410,detail:'Fountain and neighbours'},
{id:'shops',name:'Shopping Street',region:'city',x:450,y:206,detail:'Bakery and florist'},
{id:'entertainment',name:'Entertainment District',region:'city',x:830,y:440,detail:'Cinema, arcade and karaoke'},
{id:'cafe',name:'Cafe Quarter',region:'city',x:350,y:628,detail:'Bistro'},
{id:'boardwalk',name:'Boardwalk',region:'city',x:744,y:650,detail:'Ferris wheel and funfair'},
{id:'park',name:'Grand Park',region:'city-park',x:300,y:292,detail:'Pond and garden'},
{id:'residential',name:'Residential Quarter',region:'city-park',x:680,y:400,detail:'Courtyards'},
{id:'old-town',name:'Old Town',region:'old-town',x:368,y:108,detail:'Library and clock'},
{id:'rooftops',name:'Rooftops',region:'rooftops',x:64,y:400,detail:'Telescope and skyline'},
];
