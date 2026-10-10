(function(){
var $=function(i){return document.getElementById(i)},v=$('v');
window.addEventListener('error',function(e){
  try{
    var el=$('msg');
    if(el) el.textContent='Błąd aplikacji: '+(e.message||'nieznany błąd')+'. Odśwież stronę i spróbuj ponownie.';
  }catch(_){}
});
window.addEventListener('unhandledrejection',function(e){
  try{
    var el=$('msg');
    if(el) el.textContent='Błąd podczas wczytywania: '+(e.reason&&e.reason.message?e.reason.message:String(e.reason||'nieznany błąd'));
  }catch(_){}
});
var chans=[],view=[],cur=-1,hls=null,ts=null,mode='',group='Wszystkie',q='',shown=0,PAGE=200,favs={},retried=0,gen=0,tmr=null,whys=[],netlog=[],played=false,tsTries=0,wtm=null,anim=false,osdt=null,everPlayed=false,goodMode='',rcn=0,rtok=0,userPaused=false,lastT=-1,frozen=0,hard=false;
if(window.net)window.net.on(function(d){if(/ERR_ABORTED/.test(d.error||''))return;netlog.push(d);if(netlog.length>40)netlog.shift()});
var KEY='iptv-favs',LAST='iptv-last',URLK='iptv-url';

function store(k,val){try{if(val===undefined)return localStorage.getItem(k);localStorage.setItem(k,val)}catch(e){return null}}
try{favs=JSON.parse(store(KEY)||'{}')||{}}catch(e){favs={}}
function msg(t){$('msg').textContent=t}

var epg={byId:{},names:{},fz:{},total:0,sample:[],latest:0};
function emsg(t){$('emsg').textContent=t}
function norm(s){return String(s||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/\.(pl|com|net|tv)\b/g,'').replace(/\b(hd|fhd|uhd|4k|sd|pl)\b/g,'').replace(/[^a-z0-9]+/g,'')}
function dec(s){
  return s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g,'$1').replace(/&(#x?[0-9a-f]+|amp|lt|gt|quot|apos);/gi,function(m,e){
    var M={amp:'&',lt:'<',gt:'>',quot:'"',apos:"'"};e=e.toLowerCase();
    if(M[e])return M[e];
    try{return String.fromCodePoint(e[1]==='x'?parseInt(e.slice(2),16):parseInt(e.slice(1),10))}catch(x){return m}
  });
}
var STOP={hd:1,fhd:1,uhd:1,'4k':1,'8k':1,sd:1,pl:1,tv:1,polska:1,hevc:1,h265:1,raw:1,vip:1};
function toks(s){
  var seen={},out=[];
  String(s||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').split(/[^a-z0-9]+/).forEach(function(t){if(t&&!STOP[t]&&!seen[t]){seen[t]=1;out.push(t)}});
  return out;
}
function xtime(s){
  var m=/^(\d{4})(\d\d)(\d\d)(\d\d)(\d\d)(\d\d)?\s*([+-])?(\d\d)?(\d\d)?/.exec(s);if(!m)return 0;
  var t=Date.UTC(+m[1],+m[2]-1,+m[3],+m[4],+m[5],+(m[6]||0));
  if(m[7])t-=(m[7]==='-'?-1:1)*((+m[8]||0)*60+(+m[9]||0))*60000;
  return t;
}
function hm(t){var d=new Date(t);return ('0'+d.getHours()).slice(-2)+':'+('0'+d.getMinutes()).slice(-2)}
function pct(p){return Math.max(0,Math.min(100,(Date.now()-p.s)/(p.e-p.s)*100))}
function progs(c){return(c&&c.eid&&epg.byId[c.eid])||[]}
function cutNow(c){var l=progs(c),n=Date.now();for(var i=0;i<l.length;i++){if(l[i].s<=n&&n<l[i].e)return{p:l[i],next:l[i+1]||null}}return null}
async function toText(buf){
  var u=new Uint8Array(buf);
  if(u[0]===0x50&&u[1]===0x4b)throw new Error('plik .zip nie jest obsługiwany — użyj .xml lub .xml.gz');
  if(u[0]===0xfd&&u[1]===0x37&&u[2]===0x7a)throw new Error('plik .xz nie jest obsługiwany — użyj .xml lub .xml.gz');
  if(u[0]===0x42&&u[1]===0x5a&&u[2]===0x68)throw new Error('plik .bz2 nie jest obsługiwany — użyj .xml lub .xml.gz');
  if(u[0]===0x1f&&u[1]===0x8b){return await new Response(new Blob([buf]).stream().pipeThrough(new DecompressionStream('gzip'))).text()}
  return new TextDecoder().decode(u);
}
async function ingest(txt){
  epg.snip=txt.slice(0,160).replace(/\s+/g,' ');
  var idset={},nameset={};
  chans.forEach(function(c){if(c.tvgId)idset[c.tvgId]=1;nameset[norm(c.tvgName||c.name)]=1;nameset[norm(c.name)]=1});
  var ptoks=chans.map(function(c){return toks(c.tvgName||c.name)}),pidx={};
  ptoks.forEach(function(P,i){P.forEach(function(t){(pidx[t]=pidx[t]||[]).push(i)})});
  function fuzzy(id,name){
    var te=toks(name);if(!te.length)return;
    var tset={},seen={};te.forEach(function(t){tset[t]=1});
    te.forEach(function(t){(pidx[t]||[]).forEach(function(i){
      if(seen[i])return;seen[i]=1;
      var P=ptoks[i];if(!P.length||(P.length===1&&P[0].length<5))return;
      if(!P.every(function(p){return tset[p]}))return;
      var extra=te.length-P.length,cur=epg.fz[i];
      if(!cur||extra<cur.extra)epg.fz[i]={id:id,extra:extra,amb:false};
      else if(extra===cur.extra&&cur.id!==id)cur.amb=true;
    })});
  }
  var want={},m,re=/<channel\s+id=["']([^"']*)["'][^>]*>([\s\S]*?)<\/channel>/g;
  while((m=re.exec(txt))){
    var id=dec(m[1]),hit=!!idset[id];epg.total++;if(epg.sample.length<4)epg.sample.push(id);var dn=/<display-name[^>]*>([\s\S]*?)<\/display-name>/g,x;
    while((x=dn.exec(m[2]))){var rawn=dec(x[1]);fuzzy(id,rawn);var nn=norm(rawn);if(nn){if(!epg.names[nn])epg.names[nn]=id;if(nameset[nn])hit=true}}
    fuzzy(id,id.replace(/[._]+/g,' '));
    if(hit)want[id]=1;
  }
  Object.keys(epg.fz).forEach(function(i){var f=epg.fz[i];if(!f.amb)want[f.id]=1});
  var now=Date.now(),lo=now-2*3600e3,hi=now+48*3600e3,n=0,pr=/<programme\s+([^>]*)>([\s\S]*?)<\/programme>/g;
  while((m=pr.exec(txt))){
    var ch=/channel=["']([^"']*)["']/.exec(m[1]);if(!ch)continue;
    var cid=dec(ch[1]);if(!want[cid])continue;
    var s=xtime((/start=["']([^"']*)["']/.exec(m[1])||[])[1]||''),e=xtime((/stop=["']([^"']*)["']/.exec(m[1])||[])[1]||'');
    if(!s)continue;if(!e)e=s+3600e3;
    if(e>epg.latest)epg.latest=e;
    if(e<lo||s>hi)continue;
    var t=/<title[^>]*>([\s\S]*?)<\/title>/.exec(m[2]),d=/<desc[^>]*>([\s\S]*?)<\/desc>/.exec(m[2]);
    (epg.byId[cid]=epg.byId[cid]||[]).push({s:s,e:e,t:t?dec(t[1]).trim():'',d:d?dec(d[1]).trim():''});
    if(++n%3000===0)await new Promise(function(r){setTimeout(r,0)});
  }
}
async function loadEpgs(urls,file){
  epg={byId:{},names:{},fz:{},total:0,sample:[],latest:0};
  try{
    for(var k=0;k<urls.length;k++){
      emsg('Pobieranie EPG…');
      var buf;
      if(file)buf=await file.arrayBuffer();
      else{var r=await fetch(urls[k]);if(!r.ok)throw new Error('HTTP '+r.status);buf=await r.arrayBuffer()}
      emsg('Przetwarzanie EPG…');
      var txt=await toText(buf);buf=null;
      await ingest(txt);txt=null;
    }
    var progN=0,chN=0;
    Object.keys(epg.byId).forEach(function(id){epg.byId[id].sort(function(a,b){return a.s-b.s});progN+=epg.byId[id].length});
    chans.forEach(function(c,ci){
      var id=c.tvgId&&epg.byId[c.tvgId]?c.tvgId:null;
      if(!id){var a=epg.names[norm(c.tvgName||c.name)]||epg.names[norm(c.name)];if(a&&epg.byId[a])id=a}
      if(!id){var f=epg.fz[ci];if(f&&!f.amb&&epg.byId[f.id])id=f.id}
      c.eid=id;if(id)chN++;
    });
    var anyNow=chans.some(function(c){return c.eid&&cutNow(c)});
    if(!epg.total)emsg('To nie wygląda na plik XMLTV (brak kanałów w pliku). Serwer zwrócił: „'+(epg.snip||'(pusta odpowiedź)')+'”');
    else if(!chN&&epg.latest){emsg('EPG jest nieaktualny — najnowszy program kończy się '+new Date(epg.latest).toLocaleString('pl-PL')+'. Użyj świeższego pliku.')}
    else if(!chN){var ls=chans.slice(0,3).map(function(c){return c.tvgId||c.name}).join(', ');emsg('EPG wczytany ('+epg.total+' kanałów w pliku), ale żaden nie pasuje do listy. W EPG np.: '+epg.sample.join(', ')+' | w liście np.: '+ls)}
    else if(!anyNow){emsg('EPG jest nieaktualny — najnowszy program kończy się '+new Date(epg.latest).toLocaleString('pl-PL')+'. Użyj świeższego pliku.')}
    else emsg('EPG: '+chN+' kanałów, '+progN+' programów');
    render();updateInfo();if($('guide').classList.contains('open'))fillGuide();
  }catch(err){emsg('Nie udało się wczytać EPG: '+(/string length/i.test(err.message||'')?'plik jest za duży — użyj mniejszego EPG (np. tylko Polska)':(err.message||err)))}
}
function splitUrls(u){return u.split(',').map(function(x){return x.trim()}).filter(Boolean)}
function epgAuto(list){
  var u=$('epg').value.trim();
  if(!u&&list.epg){u=list.epg;$('epg').value=u}
  if(u){store('iptv-epg',$('epg').value.trim());loadEpgs(splitUrls(u))}
}
function updateInfo(){
  var el=$('epgl');el.textContent='';if(cur<0)return;
  var r=cutNow(chans[cur]);if(!r)return;
  var a=document.createElement('span');a.textContent='Teraz '+hm(r.p.s)+'–'+hm(r.p.e)+'  '+r.p.t;
  var bar=document.createElement('span');bar.className='pb wide';var fi=document.createElement('i');fi.style.width=pct(r.p)+'%';bar.appendChild(fi);
  el.appendChild(a);el.appendChild(bar);
  if(r.next){var nx=document.createElement('span');nx.className='nx';nx.textContent='Następnie '+hm(r.next.s)+'  '+r.next.t;el.appendChild(nx)}
}
function fillGuide(){
  var gl=$('gl');gl.textContent='';if(cur<0)return;
  var c=chans[cur],n=Date.now();$('gt').textContent=c.name;
  var list=progs(c).filter(function(p){return p.e>n-3600e3});
  if(!list.length){var e=document.createElement('div');e.className='ge';e.textContent='Brak danych programu dla tego kanału. Wczytaj EPG lub sprawdź, czy kanał ma poprawne tvg-id.';gl.appendChild(e);return}
  list.forEach(function(p,k){
    var isNow=p.s<=n&&n<p.e,g=document.createElement('div');
    g.className='gi in'+(isNow?' now':'');g.style.animationDelay=Math.min(k,12)*30+'ms';
    var t=document.createElement('span');t.className='gtime';t.textContent=hm(p.s);
    var b=document.createElement('div'),h=document.createElement('b');h.textContent=p.t||'—';b.appendChild(h);
    if(p.d){var d=document.createElement('p');d.textContent=p.d;b.appendChild(d)}
    if(isNow){var pb=document.createElement('span');pb.className='pb';var pi=document.createElement('i');pi.style.width=pct(p)+'%';pb.appendChild(pi);b.appendChild(pb)}
    g.appendChild(t);g.appendChild(b);gl.appendChild(g);
  });
  var nowEl=gl.querySelector('.now');if(nowEl)nowEl.scrollIntoView({block:'start'});
}
function toggleGuide(){var g=$('guide');g.classList.toggle('open');if(g.classList.contains('open'))fillGuide()}
function parse(text){
  var out=[],m=null,n=0;
  text.replace(/^\uFEFF/,'').split(/\r?\n/).forEach(function(raw){
    var l=raw.trim();if(!l)return;
    if(l.indexOf('#EXTM3U')===0){var hm0=/(?:url-tvg|x-tvg-url)="([^"]+)"/i.exec(l);if(hm0)out.epg=hm0[1]}
    else if(l.indexOf('#EXTINF')===0){
      var c=l.lastIndexOf(','),a=function(k){var r=new RegExp(k+'="([^"]*)"','i').exec(l);return r?r[1]:''};
      m={name:(c>-1?l.slice(c+1).trim():'')||a('tvg-name'),logo:a('tvg-logo'),group:a('group-title'),tvgId:a('tvg-id'),tvgName:a('tvg-name')};
    }else if(l.indexOf('#EXTGRP:')===0){m=m||{};m.group=l.slice(8).trim()}
    else if(l[0]!=='#'){
      n++;
      out.push({id:l,url:l,name:(m&&m.name)||l.split('/').pop()||('Kanał '+n),logo:(m&&m.logo)||'',group:(m&&m.group)||'Bez grupy',tvgId:(m&&m.tvgId)||'',tvgName:(m&&m.tvgName)||'',bad:false});
      m=null;
    }
  });
  return out;
}

function setList(list,label){
  if(!list.length){msg('Nie znaleziono kanałów w tej liście.');return}
  chans=list;group='Wszystkie';q='';$('q').value='';cur=-1;
  msg(label+': '+list.length+' kanałów');
  chips();apply();epgAuto(list);
  var last=store(LAST),i=chans.findIndex(function(c){return c.id===last});
  if(i>-1)play(i);
}
function chips(){
  var gs=['Wszystkie','Ulubione'],seen={};
  chans.forEach(function(c){if(!seen[c.group]){seen[c.group]=1;gs.push(c.group)}});
  var box=$('chips');box.innerHTML='';
  gs.forEach(function(g){
    var b=document.createElement('button');b.type='button';b.className='chip'+(g===group?' on':'');b.textContent=g;
    b.onclick=function(){group=g;chips();apply()};box.appendChild(b);
  });
}
function apply(){
  var f=q.toLowerCase();
  view=chans.filter(function(c){
    if(group==='Ulubione'&&!favs[c.id])return false;
    if(group!=='Wszystkie'&&group!=='Ulubione'&&c.group!==group)return false;
    return !f||c.name.toLowerCase().indexOf(f)>-1;
  });
  anim=true;shown=PAGE;render();
}
function render(){
  var an=anim;anim=false;var ul=$('ul');ul.innerHTML='';
  if(!view.length){var e=document.createElement('li');e.style.cssText='padding:20px;color:var(--mute)';e.textContent=chans.length?'Brak kanałów w tym widoku':'Lista jest pusta';ul.appendChild(e);return}
  view.slice(0,shown).forEach(function(c,k){
    var i=chans.indexOf(c),li=document.createElement('li');
    li.className=(i===cur?'cur ':'')+(c.bad?'bad':'');
    if(an){li.classList.add('in');li.style.animationDelay=Math.min(k,14)*28+'ms'}
    var b=document.createElement('button');b.type='button';b.className='ch';
    var no=document.createElement('span');no.className='no';if(i===cur){no.innerHTML='<span class="eq"><i></i><i></i><i></i></span>'}else{no.textContent=i+1}
    var lg=document.createElement('span');lg.className='logo';logoInto(lg,c);
    var nm=document.createElement('span');nm.className='nm';var dot=document.createElement('i');dot.className='st'+(c.bad?' bad':(c.ok?' ok':''));c._dot=dot;nm.appendChild(dot);nm.appendChild(document.createTextNode(c.name));
    var w=document.createElement('span');w.className='w';w.appendChild(nm);
    var cn=cutNow(c);if(cn){var pt=document.createElement('span');pt.className='pt';pt.textContent=cn.p.t;var pb=document.createElement('span');pb.className='pb';var pi=document.createElement('i');pi.style.width=pct(cn.p)+'%';pb.appendChild(pi);w.appendChild(pt);w.appendChild(pb)}
    b.appendChild(no);b.appendChild(lg);b.appendChild(w);b.onclick=function(){play(i)};
    var fv=document.createElement('button');fv.type='button';fv.className='fav'+(favs[c.id]?' on':'');fv.textContent=favs[c.id]?'★':'☆';fv.title='Ulubione';
    fv.onclick=function(){if(favs[c.id])delete favs[c.id];else favs[c.id]=1;store(KEY,JSON.stringify(favs));if(group==='Ulubione')apply();else render()};
    li.appendChild(b);li.appendChild(fv);ul.appendChild(li);
  });
  if(view.length>shown){
    var m=document.createElement('button');m.className='btn more';m.type='button';m.textContent='Pokaż więcej ('+(view.length-shown)+')';
    m.onclick=function(){shown+=PAGE;render()};ul.appendChild(m);
  }
  var c=ul.querySelector('.cur');if(c&&c.scrollIntoView)c.scrollIntoView({block:'nearest'});
}

function kill(){
  clearTimeout(tmr);v.onerror=null;
  if(hls){hls.destroy();hls=null}
  if(ts){try{ts.destroy()}catch(e){}ts=null}
  v.removeAttribute('src');v.load();
}
function go(src,how){
  kill();mode=how;var my=++gen;
  var bail=function(why){if(my!==gen)return;gen++;whys.push(why);if(/\(HTTP 4\d\d\)/.test(why))hard=true;fail()};
  played=false;tsTries=0;
  tmr=setTimeout(function(){bail(how+': brak odpowiedzi po 20 s')},20000);
  if(how==='hls'){
    // Większy bufor i łagodniejsze odzyskiwanie po chwilowych błędach
    hls=new Hls({enableWorker:true,lowLatencyMode:false,
      liveSyncDurationCount:5,liveMaxLatencyDurationCount:15,
      maxBufferLength:40,maxMaxBufferLength:90,backBufferLength:30,maxBufferHole:0.5,nudgeMaxRetry:6,
      manifestLoadingMaxRetry:2,levelLoadingMaxRetry:3,fragLoadingMaxRetry:6});
    var mediaTries=0,netTries=0;
    hls.loadSource(src);hls.attachMedia(v);
    hls.on(Hls.Events.FRAG_BUFFERED,function(){mediaTries=0;netTries=0});
    hls.on(Hls.Events.ERROR,function(_,d){
      if(!d.fatal)return;
      if(d.type===Hls.ErrorTypes.MEDIA_ERROR&&mediaTries<3){mediaTries++;if(mediaTries===2)hls.swapAudioCodec();hls.recoverMediaError();return}
      if(d.type===Hls.ErrorTypes.NETWORK_ERROR&&played&&netTries<5){netTries++;hls.startLoad();return}
      bail('HLS: '+d.details+(d.response&&d.response.code?' (HTTP '+d.response.code+')':''));
    });
  }else if(how==='ts'){
    ts=mpegts.createPlayer({type:'mpegts',isLive:true,url:src},{
      enableWorker:false,enableStashBuffer:true,stashInitialSize:1024*1024,
      liveBufferLatencyChasing:false,lazyLoad:false,
      autoCleanupSourceBuffer:true,autoCleanupMaxBackwardDuration:60,autoCleanupMinBackwardDuration:30});
    ts.attachMediaElement(v);ts.load();
    ts.on(mpegts.Events.ERROR,function(t,d,info){
      if(played&&tsTries<5){tsTries++;try{ts.unload();ts.load();ts.play()}catch(e){bail('MPEG-TS: '+d)}return}
      bail('MPEG-TS: '+d+(info&&info.code?' (HTTP '+info.code+')':''));
    });
  }else{
    v.onerror=function(){bail('natywny: '+(v.error?(v.error.message||('kod '+v.error.code)):'błąd'))};
    v.src=src;
  }
  var p=v.play();if(p&&p.catch)p.catch(function(){});
}
function methods(url){
  var hlsOk=window.Hls&&Hls.isSupported(),tsOk=window.mpegts&&mpegts.getFeatureList().mseLivePlayback;
  // Na iPhonie preferuj natywny odtwarzacz Apple dla HLS. WebKit zwykle
  // odtwarza HLS lepiej natywnie niż przez Media Source Extensions.
  var isIOS=/iPad|iPhone|iPod/.test(navigator.userAgent)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1);
  var nativeHls=!!(v.canPlayType&&v.canPlayType('application/vnd.apple.mpegurl'));
  var list;
  if(isIOS && /\.m3u8(\?|$)/i.test(url) && nativeHls) list=['native','hls','ts'];
  else list=/\.m3u8(\?|$)/i.test(url)?['hls','native','ts']:['ts','hls','native'];
  return list.filter(function(m){return m==='native'||(m==='hls'&&hlsOk)||(m==='ts'&&tsOk)});
}
function play(i){
  if(i<0||i>=chans.length)return;
  cur=i;retried=0;whys=[];netlog=[];everPlayed=false;rcn=0;rtok++;hard=false;userPaused=false;frozen=0;var c=chans[i];c.bad=false;
  $('cn').textContent=(i+1)+'. '+c.name;logoInto($('il'),c);$('cg').textContent=c.group;updateInfo();if($('guide').classList.contains('open'))fillGuide();
  v.classList.remove('live');showTune(c);osd(c,i);
  store(LAST,c.id);
  go(c.url,methods(c.url)[0]);
  render();
}
function fail(){
  if(cur<0)return;var c=chans[cur];
  if(everPlayed&&!(hard&&rcn>=6)){
    // Kanał już grał — nigdy się nie poddajemy: łączymy ponownie z rosnącą przerwą (maks. 15 s)
    var my=rtok,d=Math.min(1000*Math.pow(2,rcn++),15000),why=whys[whys.length-1]||'';
    showBuf('Ponowne łączenie… '+why);
    setTimeout(function(){if(my===rtok&&cur>=0&&chans[cur]===c)go(c.url,goodMode||methods(c.url)[0])},d);
    return;
  }
  var ms=methods(c.url);
  retried++;
  // Serwer jawnie odrzucił link (HTTP 4xx) — kolejne metody trafiałyby w ten sam adres (i mogłyby zużyć token)
  if(retried<ms.length&&!hard){go(c.url,ms[retried]);return}
  kill();c.bad=true;c.ok=false;if(c._dot)c._dot.className='st bad';$('ov').hidden=false;$('ov').className='ov err';
  var host='';try{host=new URL(c.url).host}catch(e){}
  var seen={},net=[];
  netlog.forEach(function(d){if(host&&d.url.indexOf(host)>-1){var k=d.error||('HTTP '+d.status);if(!seen[k]){seen[k]=1;net.push(k)}}});
  var ov=$('ov'),box=document.createElement('div'),u=document.createElement('small');
  box.className='card';
  var h=document.createElement('h2');h.textContent='Brak sygnału';
  var p=document.createElement('p');p.textContent='Nie można odtworzyć tego kanału. Szczegóły: '+whys.join(' → ')+(net.length?' | Sieć: '+net.join(', '):'');
  box.appendChild(h);box.appendChild(p);
  var hint=hintFor(whys);if(hint){var hp=document.createElement('p');hp.textContent=hint;hp.style.color='var(--ink)';box.appendChild(hp)}
  u.textContent=c.url;box.appendChild(u);ov.textContent='';ov.appendChild(box);
  render();
}
function logoInto(lg,c){
  lg.textContent='';
  var ini=document.createElement('span');
  ini.textContent=c.name.replace(/^[^|]*\|\s*/,'').slice(0,2).toUpperCase();
  lg.appendChild(ini);
  if(c.logo){
    var im=new Image();im.alt='';im.referrerPolicy='no-referrer';
    im.onload=function(){ini.style.visibility='hidden'};
    im.onerror=function(){im.remove()};
    im.src=c.logo;lg.appendChild(im);
  }
}
function setStatus(c,ok){c.ok=ok;c.bad=!ok;if(c._dot)c._dot.className='st '+(ok?'ok':'bad')}
async function probe(c){
  var ac=new AbortController(),t=setTimeout(function(){ac.abort()},8000);
  try{
    var r=await fetch(c.url,{signal:ac.signal});
    if(!r.ok)return false;
    if(/text\/html|application\/json/.test((r.headers.get('content-type')||'').toLowerCase()))return false;
    var rd=r.body.getReader(),res=await rd.read();
    try{ac.abort()}catch(e){}
    if(!res.value||!res.value.length)return false;
    if(/\.m3u8(\?|$)/i.test(c.url))return new TextDecoder().decode(res.value.slice(0,16)).indexOf('#EXTM3U')>-1;
    return true;
  }catch(e){return false}
  finally{clearTimeout(t)}
}
var checking=false;
async function checkAll(){
  var btn=$('chk');
  if(checking){checking=false;return}
  var list=view.slice();if(!list.length)return;
  checking=true;var done=0,idx=0;
  btn.textContent='Sprawdzam 0/'+list.length+' (stop)';
  async function worker(){
    while(checking&&idx<list.length){
      var c=list[idx++];
      if(c!==chans[cur])setStatus(c,await probe(c));
      done++;btn.textContent='Sprawdzam '+done+'/'+list.length+' (stop)';
    }
  }
  await Promise.all([worker(),worker(),worker()]);
  checking=false;btn.textContent='Sprawdź';
  var okN=list.filter(function(c){return c.ok}).length,badN=list.filter(function(c){return c.bad}).length;
  msg('Sprawdzono: działa '+okN+', nie działa '+badN+' (z '+list.length+')');
}
function hintFor(w){
  var m=/HTTP (\d{3})/.exec(w.join(' '));if(!m)return '';
  var k=+m[1];
  if(k===458)return 'Kod 458 to niestandardowa odpowiedź serwera dostawcy. Zwykle oznacza wygasły token w linku (play_token) albo przekroczony limit połączeń na koncie. Odśwież listę u dostawcy i zamknij inne urządzenia korzystające z konta.';
  if(k===401||k===403)return 'Serwer odmawia dostępu: zły login lub token, wygasły link albo blokada adresu IP.';
  if(k===404)return 'Takiego kanału nie ma już na serwerze — link jest nieaktualny.';
  if(k===429)return 'Za dużo połączeń naraz. Poczekaj chwilę lub zamknij inne odtwarzacze na tym koncie.';
  if(k>=500)return 'Błąd po stronie serwera dostawcy — spróbuj ponownie później.';
  return '';
}
function showBuf(t){var b=$('buf');b.textContent=t;b.hidden=false}
function reconnect(why){
  if(cur<0)return;var c=chans[cur];
  whys.push(why);showBuf('Ponowne łączenie… '+why);
  go(c.url,goodMode||methods(c.url)[0]);
}
function showTune(c){
  var ov=$('ov');ov.hidden=false;ov.className='ov load';ov.textContent='';
  var card=document.createElement('div');card.className='card';
  var rw=document.createElement('div');rw.className='rw';
  var lg=document.createElement('span');lg.className='logo';logoInto(lg,c);
  rw.appendChild(lg);
  var n=document.createElement('div');n.className='tn';n.textContent=c.name;
  var t=document.createElement('div');t.className='tt';t.textContent='Łączenie z kanałem';
  for(var j=0;j<3;j++)t.appendChild(document.createElement('i'));
  card.appendChild(rw);card.appendChild(n);card.appendChild(t);ov.appendChild(card);
}
function osd(c,i){
  $('on').textContent=i+1;$('oname').textContent=c.name;
  var o=$('osd');o.classList.add('show');clearTimeout(osdt);osdt=setTimeout(function(){o.classList.remove('show')},3500);
}
function skeleton(){
  var ul=$('ul');ul.innerHTML='';
  for(var i=0;i<9;i++){var li=document.createElement('li');li.className='sk';li.innerHTML='<span></span><span></span><span></span>';ul.appendChild(li)}
}
function zap(d){
  if(!view.length)return;
  var p=view.indexOf(chans[cur]);
  p=p<0?(d>0?0:view.length-1):(p+d+view.length)%view.length;
  play(chans.indexOf(view[p]));
}
v.addEventListener('playing',function(){clearTimeout(tmr);clearTimeout(wtm);played=true;tsTries=0;everPlayed=true;goodMode=mode;rcn=0;hard=false;userPaused=false;var cc=chans[cur];if(cc){cc.ok=true;cc.bad=false;if(cc._dot)cc._dot.className='st ok'}$('buf').hidden=true;v.classList.add('live');var o=$('ov');if(!o.hidden){o.classList.add('out');setTimeout(function(){if(o.classList.contains('out')){o.hidden=true;o.classList.remove('out')}},400)}});
v.addEventListener('timeupdate',function(){if(!$('buf').hidden&&v.readyState>=3)$('buf').hidden=true});
v.addEventListener('waiting',function(){clearTimeout(wtm);wtm=setTimeout(function(){if(!v.paused&&v.readyState<3)showBuf('Buforowanie…')},1500)});

function fromUrl(u){
  msg('Pobieranie listy…');skeleton();
  fetch(u).then(function(r){if(!r.ok)throw new Error(r.status);return r.text()})
    .then(function(t){store(URLK,u);setList(parse(t),'Lista')})
    .catch(function(){msg('Nie udało się pobrać listy. Sprawdź adres albo wczytaj plik z dysku.');render()});
}
$('go').onclick=function(){var u=$('url').value.trim();if(u)fromUrl(u)};
$('url').onkeydown=function(e){if(e.key==='Enter')$('go').click()};
$('pick').onclick=function(){$('file').click()};
$('file').onchange=function(){
  var input=this, f=input.files&&input.files[0];
  if(!f){return}
  var name=String(f.name||'plik').toLowerCase();
  if(/\.(xml|gz)$/i.test(name)){
    if(chans.length) loadEpgs([f.name],f);
    else emsg('Najpierw wczytaj playlistę M3U.');
    input.value='';
    return;
  }
  msg('Wczytywanie pliku '+f.name+'…');
  emsg('');
  // FileReader działa też w starszych wersjach Safari, gdzie File.text() może nie być dostępne.
  var reader=new FileReader();
  reader.onerror=function(){msg('Nie udało się odczytać pliku. Spróbuj wybrać go ponownie.');input.value='';};
  reader.onload=function(){
    try{
      var text=String(reader.result||'');
      // Rozpoznaj popularne kodowania eksportów playlist na Windowsie.
      if(text.length>1 && text.charCodeAt(0)===0xFFFE){
        text=text.slice(1);
        var swapped='';
        for(var si=0;si<text.length;si++) swapped+=String.fromCharCode(text.charCodeAt(si));
        text=swapped;
      }
      text=text.replace(/^\uFEFF/,'');
      // UTF-16LE bywa odczytywane jako tekst z NUL-ami w starszych eksportach.
      if(text.indexOf('\u0000')!==-1 && text.length<50000000){
        var nulCount=(text.match(/\u0000/g)||[]).length;
        if(nulCount>text.length/5) text=text.replace(/\u0000/g,'');
      }
      var list=parse(text);
      if(!list.length){
        msg('Nie znaleziono kanałów. Sprawdź, czy to poprawna playlista M3U/M3U8, a nie plik EPG lub ZIP.');
        emsg('Plik: '+f.name+' ('+f.size+' B). Plik musi zawierać #EXTINF oraz adresy kanałów.');
        input.value='';
        return;
      }
      // Ustaw listę bez przywracania automatycznie poprzedniego kanału.
      // Błąd EPG nie może przerwać wyświetlania listy kanałów.
      setList(list,f.name);
      msg(f.name+': wczytano '+list.length+' kanałów');
      input.value='';
    }catch(err){
      console.error('Błąd wczytywania playlisty:',err);
      msg('Błąd wczytywania playlisty: '+(err && err.message ? err.message : 'nieznany błąd'));
      emsg('Spróbuj ponownie. Jeśli plik jest duży, sprawdź go na komputerze.');
      input.value='';
    }
  };
  try{reader.readAsText(f)}catch(err){
    console.error('Błąd odczytu pliku:',err);
    msg('Ta przeglądarka nie może odczytać tego pliku. Spróbuj zapisać playlistę jako zwykły tekst UTF-8.');
    input.value='';
  }
};
$('epgb').onclick=function(){var u=$('epg').value.trim();if(!u)return;store('iptv-epg',u);if(chans.length)loadEpgs(splitUrls(u));else emsg('Najpierw wczytaj listę kanałów')};
$('epg').onkeydown=function(e){if(e.key==='Enter')$('epgb').click()};
$('gb').onclick=toggleGuide;$('gx').onclick=toggleGuide;
$('chk').onclick=checkAll;
setInterval(updateInfo,30000);
$('q').oninput=function(){q=this.value;apply()};
$('nx').onclick=function(){zap(1)};$('pv').onclick=function(){zap(-1)};
function fs(){var s=document.querySelector('.screen');if(document.fullscreenElement&&document.exitFullscreen)document.exitFullscreen();else if(s.requestFullscreen)s.requestFullscreen();else if(v.webkitEnterFullscreen)v.webkitEnterFullscreen();}
$('fs').onclick=fs;v.addEventListener('dblclick',fs);
document.addEventListener('keydown',function(e){
  var t=(e.target.tagName||'').toLowerCase();if(t==='input'||t==='textarea')return;
  if(e.key==='ArrowDown'||e.key==='PageDown'){e.preventDefault();zap(1)}
  else if(e.key==='ArrowUp'||e.key==='PageUp'){e.preventDefault();zap(-1)}
  else if(e.key==='f'||e.key==='F')fs();
  else if(e.key==='g'||e.key==='G')toggleGuide();
  else if(e.key==='Escape'&&$('guide').classList.contains('open'))toggleGuide();
  else if(e.key==='m'||e.key==='M')v.muted=!v.muted;
  else if(e.key===' '){e.preventDefault();if(v.paused){userPaused=false;v.play()}else{userPaused=true;v.pause()}}
});
v.addEventListener('pause',function(){if(navigator.userActivation&&navigator.userActivation.isActive)userPaused=true});
v.addEventListener('play',function(){userPaused=false});
v.addEventListener('ended',function(){if(!userPaused&&everPlayed)reconnect('koniec strumienia')});
// Strażnik: wznawia pauzę, której nie wywołałeś, i łączy ponownie, gdy obraz stoi >12 s
setInterval(function(){
  if(cur<0||userPaused||!everPlayed||chans[cur].bad)return;
  if(v.paused&&!v.ended){var p=v.play();if(p&&p.catch)p.catch(function(){})}
  if(v.currentTime===lastT){if(++frozen>=4){frozen=0;reconnect('obraz stoi')}}else{frozen=0;lastT=v.currentTime}
},3000);
var se=store('iptv-epg');if(se)$('epg').value=se;
var saved=store(URLK);if(saved){$('url').value=saved;fromUrl(saved)}
render();
setTimeout(function(){var s=$('splash');if(!s)return;s.classList.add('out');setTimeout(function(){s.remove()},700)},1700);
})();
