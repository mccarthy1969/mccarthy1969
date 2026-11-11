// U.S. equity calendar. Sources: nyse.com/markets/hours-calendars and NYSE closure notices.
const iso=d=>d.toISOString().slice(0,10),date=(y,m,d)=>new Date(Date.UTC(y,m-1,d));
const nth=(y,m,weekday,n)=>{const d=date(y,m,1);d.setUTCDate(1+(weekday-d.getUTCDay()+7)%7+7*(n-1));return iso(d);};
const observed=(y,m,d)=>{const day=date(y,m,d),w=day.getUTCDay();day.setUTCDate(d+(w===6?-1:w===0?1:0));return iso(day);};
function easter(y){const a=y%19,b=Math.floor(y/100),c=y%100,d=Math.floor(b/4),e=b%4,f=Math.floor((b+8)/25),g=Math.floor((b-f+1)/3),h=(19*a+b-d-g+15)%30,i=Math.floor(c/4),k=c%4,l=(32+2*e+2*i-h-k)%7,m=Math.floor((a+11*h+22*l)/451),month=Math.floor((h+l-7*m+114)/31),day=(h+l-7*m+114)%31+1;return date(y,month,day);}
const cache=new Map();
function holidays(y){if(cache.has(y))return cache.get(y);const goodFriday=easter(y);goodFriday.setUTCDate(goodFriday.getUTCDate()-2);const memorial=date(y,6,0);while(memorial.getUTCDay()!==1)memorial.setUTCDate(memorial.getUTCDate()-1);
 const days=new Set([nth(y,1,1,3),nth(y,2,1,3),iso(goodFriday),iso(memorial),observed(y,7,4),nth(y,9,1,1),nth(y,11,4,4),observed(y,12,25)]);
 // NYSE does not move a Saturday New Year's Day to the previous Friday.
 const ny=date(y,1,1);if(ny.getUTCDay()!==6)days.add(observed(y,1,1));if(y>=2022)days.add(observed(y,6,19));
 for(const special of ['2001-09-11','2001-09-12','2001-09-13','2001-09-14','2004-06-11','2007-01-02','2012-10-29','2012-10-30','2018-12-05','2025-01-09'])if(special.startsWith(String(y)))days.add(special);
 cache.set(y,days);return days;}
export function tradingDay(day){const d=new Date(day+'T12:00:00Z'),w=d.getUTCDay();return w!==0&&w!==6&&!holidays(d.getUTCFullYear()).has(day);}
export function exchangeClose(day){if(!tradingDay(day))return null;const y=Number(day.slice(0,4)),thanksgiving=new Date(nth(y,11,4,4)+'T12:00:00Z');thanksgiving.setUTCDate(thanksgiving.getUTCDate()+1);
 return day===iso(thanksgiving)||day===y+'-07-03'||day===y+'-12-24'?780:960;
}
