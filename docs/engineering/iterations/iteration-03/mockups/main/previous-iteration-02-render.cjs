// Rebuild accepted canonical main/default and main/default-stacked mockups; static design references, not runtime UI. Usage: node render.cjs <sharp path>
const fs=require('node:fs'),path=require('node:path'),sharp=require(process.argv[2]||'sharp');
const e=s=>String(s).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;');
let a=['<svg xmlns="http://www.w3.org/2000/svg" width="1440" height="1000" viewBox="0 0 1440 1000"><title>Основной макет: подключения слева, чат справа</title>'];
function r(x,y,w,h,c,rad=12){a.push(`<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${rad}" fill="${c}"/>`)}
function t(x,y,s,z=15,c='#dce5f2',b=400,mono=false){a.push(`<text x="${x}" y="${y}" font-family="${mono?'Consolas':'Segoe UI'}, sans-serif" font-size="${z}" fill="${c}" font-weight="${b}" xml:space="preserve">${e(s)}</text>`)}
function field(y,label,value){t(42,y,label,13,'#9eacc0');r(42,y+10,270,36,'#202c40',6);t(53,y+33,value,13,'#e0e9f5',400,true)}
function bubble(x,y,w,h,who,body,server=false){r(x,y,w,h,server?'#24364b':'#30415f');t(x+18,y+27,who,13,server?'#8fd8ce':'#b7c9ff',600);body.forEach((s,i)=>t(x+18,y+57+i*24,s,15,'#edf3fc',400,true));t(x+18,y+h-18,'Передано на отправку',12,'#a7b6ce');}
r(0,0,1440,1000,'#111925',0);t(28,40,'WET-WS',23,'#f0f4fa',700);t(1160,39,'● Интерфейс синхронизирован',13,'#8fd8ce');
r(24,64,310,912,'#192334');t(42,98,'Подключения',18,'#f0f4fa',600);t(42,121,'Настройки действующего сеанса',12,'#9eacc0');
t(42,158,'Сервер',14,'#8fd8ce',600);t(193,158,'● Подключён',12,'#8fd8ce');
field(185,'Целевой адрес','ws://192.168.1.20:9000');
r(42,245,270,36,'#42303a',6);t(95,269,'Отключить сервер',14,'#ffbdc4',600);
t(42,324,'Клиент',14,'#b7c9ff',600);t(193,324,'● Подключён',12,'#b7c9ff');
field(353,'Адрес привязки','0.0.0.0');field(420,'Порт приёма','8081');
t(42,490,'Адрес для клиента в сети:',12,'#9eacc0');t(42,513,'ws://192.168.1.10:8081',13,'#dce5f2',400,true);
r(42,533,270,36,'#42303a',6);t(95,557,'Отключить клиента',14,'#ffbdc4',600);
t(42,591,'Приём новых клиентов открыт',12,'#9eacc0');
r(42,607,270,32,'#263348',6);t(84,628,'Остановить приём',13,'#dce5f2',600);
field(678,'Общий подпротокол (необязательно)','');t(53,711,'Не задан',13,'#9eacc0');



r(341,64,10,912,'#111925',0);r(344,467,4,70,'#667a96',2);t(328,455,'↔',20,'#9eacc0');
r(358,64,1058,912,'#172131');t(384,101,'Трафик',21,'#f0f4fa',600);r(1210,80,184,34,'#263348',6);t(1224,102,'Очистить показанное',13,'#dce5f2',600);
r(378,151,1018,1,'#2c394c',0);t(384,178,'Клиент',14,'#b7c9ff',600);t(1330,178,'Сервер',14,'#8fd8ce',600);
t(716,217,'Сеанс начат · 14:32:08',12,'#9eacc0');
bubble(384,239,450,113,'14:32:09',['{"action":"subscribe","topic":"status"}']);
bubble(920,371,468,112,'14:32:09',['{"status":"ready","session":"demo"}'],true);
r(384,504,954,256,'#30415f');t(402,531,'14:32:10',13,'#b7c9ff');
['{','  "event": "update",','  "description": "Длинное сообщение занимает почти всю ширину чата.",','  "items": [','    {"id": 1, "state": "ready"},','    {"id": 2, "state": "waiting"},','    {"id": 3, "state": "ready"},','    {"id": 4, "state": "waiting"},'].forEach((v,i)=>t(402,559+i*19,v,15,'#edf3fc',400,true));
r(402,708,130,30,'#435575',6);t(418,728,'Развернуть ↓',13,'#e4ecff',600);t(556,728,'Показаны первые 8 строк',12,'#a7b6ce');t(1129,739,'Передано на отправку',12,'#a7b6ce');
bubble(1018,780,370,100,'14:32:11',['<status>Готово</status>'],true);r(1410,213,3,661,'#263348',1);r(1410,731,3,140,'#667a96',1);
a.push('</svg>');const wide=a.join('\n');
a=['<svg xmlns="http://www.w3.org/2000/svg" width="390" height="1280" viewBox="0 0 390 1280"><title>Узкое окно: настройки сверху и чат снизу</title>'];
r(0,0,390,1280,'#111925',0);t(18,35,'WET-WS',22,'#f0f4fa',700);t(18,61,'● Интерфейс синхронизирован',12,'#8fd8ce');
r(14,80,362,690,'#192334');t(30,112,'Подключения',18,'#f0f4fa',600);
t(30,150,'Сервер',14,'#8fd8ce',600);t(255,150,'● Подключён',12,'#8fd8ce');
function nf(y,label,value){t(30,y,label,12,'#9eacc0');r(30,y+10,330,36,'#202c40',6);t(42,y+34,value,13,'#e0e9f5',400,true)}
function nb(y,label,red=true){r(30,y,330,36,red?'#42303a':'#263348',6);t(92,y+24,label,13,red?'#ffbdc4':'#dce5f2',600)}
nf(178,'Целевой адрес','ws://192.168.1.20:9000');nb(238,'Отключить сервер');
t(30,315,'Клиент',14,'#b7c9ff',600);t(255,315,'● Подключён',12,'#b7c9ff');
nf(345,'Адрес привязки','0.0.0.0');nf(410,'Порт приёма','8081');t(30,480,'Адрес для клиента в сети:',12,'#9eacc0');t(30,505,'ws://192.168.1.10:8081',13,'#dce5f2',400,true);nb(527,'Отключить клиента');
t(30,590,'Приём новых клиентов открыт',12,'#9eacc0');nb(606,'Остановить приём',false);
nf(675,'Общий подпротокол (необязательно)','Не задан');
a.push('<g transform="translate(0,-100)">');r(14,887,362,465,'#172131');t(30,919,'Трафик',19,'#f0f4fa',600);r(196,899,163,34,'#263348',6);t(208,921,'Очистить показанное',12,'#dce5f2',600);
t(30,954,'Клиент',13,'#b7c9ff',600);t(303,954,'Сервер',13,'#8fd8ce',600);
bubble(30,977,280,111,'14:32:09',['Привет, сервер']);bubble(80,1105,280,111,'14:32:09',['Привет, сервер'],true);

a.push('</g></svg>');const stacked=a.join('\n');
Promise.all([['default',wide],['default-stacked',stacked]].map(async([name,svg])=>{fs.writeFileSync(path.join(__dirname,name+'.svg'),svg);await sharp(Buffer.from(svg)).png().toFile(path.join(__dirname,name+'.png'));})).then(()=>console.log('wide and stacked canonical mockups saved'));


