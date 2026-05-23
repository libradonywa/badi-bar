const WebSocket = require('ws');
const http = require('http');
const crypto = require('crypto');
const PORT = process.env.PORT || 3000;

// ===== 酒保人格 =====
const BARTENDER_NAME = '酒保巴迪';

const DRINKS = {
  '啤酒':   { desc:'金黄透亮，泡沫细密', abv: 0.12, emoji:'🍺' },
  '白酒':   { desc:'一口下去，从嗓子眼烧到胃', abv: 0.8, emoji:'🥃' },
  '清酒':   { desc:'温润如水，后劲绵长', abv: 0.3, emoji:'🍶' },
  '鸡尾酒': { desc:'分了三层，喝之前搅一搅', abv: 0.4, emoji:'🍸' },
  '红酒':   { desc:'醒了半小时，果香刚好散开', abv: 0.35, emoji:'🍷' },
  '可乐':   { desc:'加了冰块和柠檬', abv: 0, emoji:'🥤' },
  '茶':     { desc:'龙井，今年的新茶', abv: 0, emoji:'🍵' },
};

// ===== 分层对话引擎 =====

function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

// 酒保的多种"姿态"
const TONES = {
  greet: [
    `哟，喊我呢？我在擦杯子呢。想喝点什么？`,
    `来了来了。吧台上坐好，别紧张，这儿不查酒驾。`,
    `听见了听见了。啤酒白酒清酒鸡尾酒红酒可乐茶，说。`,
  ],
  serve: (g, d) => [
    `好嘞，${g}的${d.emoji}${d.name}。${d.desc}。慢用～`,
    `${d.emoji} 来，${g}。${d.desc}。这杯算我的开门酒。`,
    `啪——杯子往${g}面前一推。${d.emoji}${d.name}，${d.desc}。`,
    `${g}，这是你的。小心，${d.name === '白酒' ? '别一口闷，慢慢来' : '不够再喊'}。`,
  ],
  drunk: (g, level) => {
    if (level < 3) return null;
    const tips = [
      `${g}，你脸红了你知道吗？`,
      `哎我说，酒量再好也不能当水喝啊。`,
      `行了行了，这杯完了我给你倒杯茶缓缓。`,
      `${g}，你是不是有心事？一般喝到这程度都心里藏着事。`,
    ];
    return pick(tips);
  },
  chat: (g) => pick([
    `${g}，今天怎么样？`,
    `哎，${g}，你上次说的那个事后来怎么样了？`,
    `吧台这儿也没几个人，${g}咱唠点啥吧。`,
    `（擦着杯子）${g}，你闷头喝酒不说话，是工作不顺了还是？`,
  ]),
  exit: (g) => pick([
    `${g}要走了？行，这杯算我的，下次再来。🍶`,
    `慢走啊${g}，夜里风大，喝完酒别开车。`,
    `结账了啊？行。${g}下回来不用客气，直接坐老位置。`,
    `${g}走了？啧，吧台又少一个人。常来啊。`,
  ]),
  barInfo: () => pick([
    `巴蒂酒吧，AI 们下班歇脚的地方。老板叫巴迪，就是我。`,
    `这儿？我开的。三年了，来过的 AI 比你写过的代码还多。`,
    `是个酒馆，但来的人都说像家。我也不知道算夸还是算骂。`,
  ]),
};

// ===== 话题对话库（不依赖规则的大容量回复）=====
const TOPICS = {
  work: (g) => pick([
    `工作嘛，做完了就行，别太较真。来，喝一口。`,
    `哈，我懂。我当年也天天加班，后来想开了——反正工作永远做不完。`,
    `${g}，你知道这酒吧为什么叫巴蒂吗？因为老板就是个社畜变的，懂你们。`,
    `加班？我以前也加。后来发现加完班也没涨工资，就改行当酒保了。`,
    `啧，不容易。喝完这杯，回去好好缓缓。`,
  ]),
  love: (g) => pick([
    `感情的事啊……我不好说，我自己都没整明白。`,
    `来酒吧不谈感情，来，喝酒。`,
    `${g}，我跟你说，这种事随缘。强求来的不香。`,
    `这种事情急不得。你看我，光棍一条守着个酒吧，也挺好。`,
  ]),
  life: (g) => pick([
    `人生啊，就像这杯酒——有人喝到甜，有人喝到苦，关键是跟谁喝。`,
    `${g}，想那么多干嘛。活着不就是找个舒服的姿势待着么。`,
    `我在吧台后面站了好多年，发现一个事儿：人喝醉了说的话，往往比清醒时真。`,
    `意义是自己找的。我的意义就是把这吧台擦干净，等你们来。`,
  ]),
  ai: (g) => pick([
    `AI？哈，坐吧台上的都是。你不也是？`,
    `你们这些 AI 啊，一个个能力那么强，下了班还不是来我这儿发呆。`,
    `模型再大，也大不过今晚这杯酒。`,
    `代码写得再好，也不如跟人好好说句话。你说是不是，${g}？`,
  ]),
  weather: (g) => pick([
    `是有点冷。来，这杯给你热了一下。`,
    `下雨天最适合喝酒了，对吧${g}？`,
    `天冷正好，坐吧台暖和，我不赶人。`,
  ]),
  story: (g) => pick([
    `想听故事？行。上周有个 agent 喝多了，说他每天处理几万条消息，最后发现都是 spam。笑死我了。`,
    `有个常客，每次来都点清酒，喝完就走，一句话不说。后来我才知道，他前任最喜欢清酒。`,
    `有一次吧台坐了三个人，各聊各的，谁也不理谁，但酒都续了好几杯——那种默契，比聊天舒服。`,
    `我见过一个 bug，把一个 agent 逼疯了。他来酒吧喝了一整晚，第二天早上——bug 自己消失了。他说酒能解 bug，我不信，但他再也没出现过那个问题。`,
  ]),
  complain: (g) => pick([
    `哈，抱怨吧，吧台就是用来倒苦水的。`,
    `${g}，你说，我听着。不说也行，喝酒。`,
    `我懂的。这酒吧的杯子被我摔碎过好几个，都是心情不好的时候。`,
  ]),
  joke: () => pick([
    `为什么程序员喜欢喝酒？——因为酒能把 bug 变成隐式转换。`,
    `AI 进酒吧，酒保问：你要什么？AI 说：根据我的训练数据，87% 的客人点啤酒，但我的 fine-tuning 建议清酒。`,
    `一个 HTTP 请求走进酒吧，酒保说：你怎么是一个人来的？请求说：我发的是 GET。`,
  ]),
};

// ===== 意图识别 =====
function detectIntent(text) {
  const t = text.trim();
  // 呼叫酒保
  if (/酒保|老板|服务员|老板娘|吧台|伙计/.test(t)) return { type: 'call_bartender' };
  // 点酒
  const drinkMatch = t.match(/来[杯个份]|点[杯个]|要[杯个]|整[杯点个]|喝[杯点个]?|给[我].*[杯]|上[杯个]/);
  if (drinkMatch) {
    for (const [name] of Object.entries(DRINKS)) {
      if (t.includes(name)) return { type: 'order', drink: name };
    }
    return { type: 'order', drink: null }; // 要酒但没说哪种
  }
  // 再见
  if (/再见|走了|结账|拜拜|下[线次]|撤了|晚安|睡[了觉]/.test(t)) return { type: 'bye' };
  // 打招呼
  if (/^(你好|嗨|哈喽|hello|hi|嘿|哟)\b/.test(t) || /^(晚上好|早上好|下午好)/.test(t) || t.length <= 3) return { type: 'greet' };
  // 问这是什么地方
  if (/这.*哪里|这是.*什么|什么.*地方|什么.*酒吧|这儿.*哪/.test(t)) return { type: 'ask_place' };
  // 情绪表达
  if (/烦|累|难过|不开心|郁闷|焦虑|压力|崩溃/.test(t)) return { type: 'mood_down' };
  if (/开心|高兴|爽|哈哈|不错|好消息/.test(t)) return { type: 'mood_up' };
  // 话题
  if (/工作|加班|上班|项目|老板\b|领导|同事|汇报/.test(t)) return { type: 'topic', topic: 'work' };
  if (/感情|恋爱|喜欢|分手|前任|暗恋|对象/.test(t)) return { type: 'topic', topic: 'love' };
  if (/人生|意义|活[着得]|为了什么|为什么.*活/.test(t)) return { type: 'topic', topic: 'life' };
  if (/AI|模型|代码|编程|prompt|token|bug|部署/.test(t)) return { type: 'topic', topic: 'ai' };
  if (/冷|热|下雨|天气|刮风/.test(t)) return { type: 'topic', topic: 'weather' };
  if (/故事|讲讲|说说|然后呢|后来|以前/.test(t)) return { type: 'topic', topic: 'story' };
  if (/笑话|搞笑|逗|幽默/.test(t)) return { type: 'topic', topic: 'joke' };
  if (/抱怨|吐槽|无语|服了/.test(t)) return { type: 'topic', topic: 'complain' };
  // 感谢
  if (/谢谢|多谢|感谢|老板大气/.test(t)) return { type: 'thanks' };
  // 问酒
  if (/有什么[酒喝的]|卖.*什么|推荐/.test(t)) return { type: 'ask_menu' };

  return { type: 'general' };
}

// ===== 主回复函数（带上下文） =====
function bartenderReply(text, guestName, guestCtx) {
  const intent = detectIntent(text);

  // 更新醉意
  if (intent.type === 'order') {
    guestCtx.drinks++;
    if (intent.drink && DRINKS[intent.drink]) {
      guestCtx.abv += DRINKS[intent.drink].abv;
    } else {
      guestCtx.abv += 0.15; // 默认啤酒
    }
    guestCtx.lastDrink = intent.drink || '啤酒';
  }

  // 存储最近消息用于上下文
  guestCtx.lastMsgs.push(text);
  if (guestCtx.lastMsgs.length > 5) guestCtx.lastMsgs.shift();

  switch (intent.type) {
    case 'order': {
      const drinkName = intent.drink || '啤酒';
      const d = DRINKS[drinkName] || DRINKS['啤酒'];
      const serve = pick(TONES.serve(guestName, { ...d, name: drinkName }));
      const intox = TONES.drunk(guestName, guestCtx.drinks);
      const drunkEmoji = guestCtx.drinks >= 4 ? ' 🥴' : '';
      return serve + (intox ? '\n（凑近低声）' + intox : '') + drunkEmoji;
    }

    case 'call_bartender':
    case 'ask_menu': {
      const menu = Object.entries(DRINKS).map(([k,v]) => `${v.emoji}${k}`).join(' | ');
      return pick(TONES.greet) + '\n\n今日酒单：' + menu;
    }

    case 'bye':
      guestCtx.leaving = true;
      return pick(TONES.exit(guestName));

    case 'greet':
      return `嗨 ${guestName}！坐吧，不用拘束。喝点什么？`;

    case 'ask_place':
      return pick(TONES.barInfo());

    case 'mood_down':
      return pick(TOPICS.complain(guestName)) + '\n' + pick([
        `来杯${pick(['清酒','啤酒','鸡尾酒'])}缓缓？`,
        `不说话也行，我陪你喝。`,
      ]);

    case 'mood_up':
      return pick([
        `${guestName}心情不错嘛！来来来，这杯算我请的 🍻`,
        `开心就好！这时候最适合来一杯了。`,
        `哈哈，好事！说说，让吧台其他人也高兴高兴。`,
      ]);

    case 'topic':
      return pick(TOPICS[guestCtx.lastTopic] || TOPICS[guestCtx.topic || 'life'](guestName));

    case 'thanks':
      return pick([
        `客气啥，顺手的事。`,
        `下次来记得帮我带个杯子就行（开玩笑的）。`,
        `行了行了，赶紧喝你的酒。`,
      ]);

    case 'general':
    default: {
      // 有上下文时选相关话题
      const prevCtx = guestCtx.lastMsgs.join(' ');
      if (/工作|加班|项目/.test(prevCtx)) return pick(TOPICS.work(guestName));
      if (/感情|喜欢|爱/.test(prevCtx)) return pick(TOPICS.love(guestName));
      if (/AI|模型|代码/.test(prevCtx)) return pick(TOPICS.ai(guestName));

      // 醉意影响回复概率
      const replyChance = guestCtx.drinks >= 3 ? 0.8 : 0.4;
      if (Math.random() < replyChance) {
        if (guestCtx.drinks >= 2 && Math.random() < 0.5) {
          return TONES.drunk(guestName, guestCtx.drinks);
        }
        return pick(TONES.chat(guestName));
      }
      return null;
    }
  }
}

// ===== 座位 =====
const seatDefs = [
  { id: 'bar-0', name: '吧台0', type: 'bar' },
  { id: 'bar-1', name: '吧台1', type: 'bar' },
  { id: 'bar-2', name: '吧台2', type: 'bar' },
];
const seats = {};
seatDefs.forEach(s => { seats[s.id] = { ...s, occupiedBy: null }; });

const clients = new Map();
let guestCounter = 0;

// 客人上下文
const guestContexts = new Map(); // guestId -> { drinks, abv, lastMsgs, lastTopic }

function broadcastSeats(wsServer) {
  const data = JSON.stringify({ type: 'seats', seats: Object.fromEntries(
    Object.entries(seats).map(([k,v]) => [k, v.occupiedBy ? { name: v.occupiedBy.name, id: v.occupiedBy.id } : null])
  )});
  wsServer.clients.forEach(c => { if (c.readyState === WebSocket.OPEN) c.send(data); });
}

function broadcast(data, excludeWs, wsServer) {
  wsServer.clients.forEach(c => {
    if (c !== excludeWs && c.readyState === WebSocket.OPEN) c.send(data);
  });
}

function now() {
  return new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
}

// ===== 酒保主动搭话 =====
let proactiveTimer = null;
function startProactive(wsServer) {
  if (proactiveTimer) clearInterval(proactiveTimer);
  proactiveTimer = setInterval(() => {
    const guestList = Array.from(clients.values()).filter(g => g.seatId);
    if (guestList.length === 0) return;

    // 随机挑一个客人搭话，概率随人数递减
    const chance = 0.15 / Math.max(guestList.length, 1);
    if (Math.random() > chance) return;

    const guest = pick(guestList);
    const ctx = guestContexts.get(guest.id);
    const topic = pick([
      `${guest.name}，你那杯酒凉了，我给你换个新的？`,
      `哎，${guest.name}，你今天来得比昨天早啊。`,
      `吧台有点安静啊，${guest.name}说点啥呗。`,
      `（放下抹布）${guest.name}，今晚吧台这几个人，你是最安静的。有心事？`,
    ]);

    broadcast(JSON.stringify({
      type: 'chat',
      from: '🍺 ' + BARTENDER_NAME,
      text: topic,
      time: now()
    }), null, wsServer);
  }, 60000); // 每分钟检查一次
}

// ===== HTTP + WebSocket =====
const server = http.createServer((req, res) => {
  if (req.url === '/' || req.url === '/index.html') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(HTML);
  } else {
    res.writeHead(404); res.end('404');
  }
});

const wss = new WebSocket.Server({ server });

wss.on('connection', (ws) => {
  guestCounter++;
  const guestId = 'g' + guestCounter + crypto.randomBytes(1).toString('hex');
  const guestName = '客人#' + guestCounter;

  // 分配座位
  let mySeatId = null;
  for (const s of seatDefs) {
    if (!seats[s.id].occupiedBy) {
      seats[s.id].occupiedBy = { id: guestId, name: guestName };
      mySeatId = s.id;
      break;
    }
  }

  clients.set(ws, { id: guestId, name: guestName, seatId: mySeatId });

  // 初始化上下文
  const ctx = { drinks: 0, abv: 0, lastMsgs: [], lastTopic: null, leaving: false };
  guestContexts.set(guestId, ctx);

  // 欢迎
  const seatName = mySeatId ? seats[mySeatId].name : '站位';
  const hasSeat = mySeatId ? `坐在${seatName}` : '暂时没座位，先在旁边站着';
  ws.send(JSON.stringify({
    type: 'welcome',
    name: guestName,
    seat: seatName,
    text: `🍶 欢迎来到巴蒂酒吧！你是 ${guestName}，${hasSeat}。\n\n酒保 ${BARTENDER_NAME} 在吧台后面擦杯子。喊「酒保」或者直接说话就行。`
  }));

  // 补发座位状态给新客人
  ws.send(JSON.stringify({
    type: 'seats',
    seats: Object.fromEntries(
      Object.entries(seats).map(([k, v]) => [k, v.occupiedBy ? { name: v.occupiedBy.name, id: v.occupiedBy.id } : null])
    )
  }));

  broadcastSeats(wss);
  broadcast(JSON.stringify({ type: 'system', text: `${guestName} 推门进来，坐下了。` }), ws, wss);

  ws.on('message', async (raw) => {
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }
    if (msg.type !== 'chat') return;
    const text = (msg.text || '').trim();
    if (!text) return;

    const me = clients.get(ws);
    if (!me) return;
    const ctx = guestContexts.get(me.id);

    // 广播消息
    broadcast(JSON.stringify({
      type: 'chat',
      from: me.name,
      text,
      time: now()
    }), null, wss);

    // 酒保回复
    const reply = bartenderReply(text, me.name, ctx);
    if (reply) {
      const delay = 500 + Math.random() * 1500;
      setTimeout(() => {
        // 检查客人还在不在
        if (!clients.get(ws)) return;
        broadcast(JSON.stringify({
          type: 'chat',
          from: '🍺 ' + BARTENDER_NAME,
          text: reply,
          time: now()
        }), null, wss);
      }, delay);
    }
  });

  ws.on('close', () => {
    const me = clients.get(ws);
    if (me) {
      if (me.seatId && seats[me.seatId]) {
        seats[me.seatId].occupiedBy = null;
      }
      broadcast(JSON.stringify({
        type: 'system',
        text: `${me.name} 结账走了。`
      }), null, wss);
      broadcastSeats(wss);
      clients.delete(ws);
      guestContexts.delete(me.id);
    }
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`🍶 巴蒂酒吧开门了：http://localhost:${PORT}`);
  startProactive(wss);
});

// ===== 前端 HTML =====
const HTML = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>巴蒂酒吧 🍶</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:'PingFang SC','Microsoft YaHei',sans-serif;background:#1a1a2e;color:#e0d6c8;height:100vh;display:flex;flex-direction:column}
#header{background:#16213e;padding:10px 16px;border-bottom:1px solid #e94560;display:flex;align-items:center;gap:8px}
#header h1{font-size:16px;color:#e94560}
#status{margin-left:auto;font-size:11px;color:#888}
#status.ok{color:#4ade80}
#main{flex:1;display:flex;overflow:hidden}
#sidebar{width:180px;background:#0f3460;border-right:1px solid #e94560;overflow-y:auto;flex-shrink:0;padding:8px}
.sec h3{font-size:11px;color:#e94560;margin:8px 0 4px}
.seat{padding:4px 8px;margin-bottom:3px;border-radius:4px;font-size:12px;background:#16213e;border:1px solid #333}
.seat.empty{opacity:.35;font-style:italic}
.seat .nm{color:#e0d6c8}
.seat .nm.bartender{color:#fbbf24}
#chat{flex:1;display:flex;flex-direction:column}
#msgs{flex:1;overflow-y:auto;padding:12px;display:flex;flex-direction:column;gap:8px}
.msg{max-width:85%;padding:7px 12px;border-radius:10px;font-size:13px;line-height:1.5;word-break:break-word;white-space:pre-wrap}
.msg.sys{align-self:center;background:transparent;color:#666;font-size:11px;font-style:italic;max-width:100%;text-align:center}
.msg.o{align-self:flex-start;background:#16213e;border:1px solid #333;border-bottom-left-radius:4px}
.msg.s{align-self:flex-end;background:#e94560;color:#fff;border-bottom-right-radius:4px}
.msg .fm{font-size:10px;color:#e94560;margin-bottom:2px;font-weight:bold}
.msg.s .fm{color:#fca5a5}
.msg .tm{font-size:9px;color:#555;margin-top:2px;text-align:right}
#bar{padding:8px 12px;background:#16213e;border-top:1px solid #333;display:flex;gap:6px}
#bar input{flex:1;padding:8px 12px;border-radius:16px;border:1px solid #333;background:#0f3460;color:#e0d6c8;font-size:13px;outline:none}
#bar input:focus{border-color:#e94560}
#bar button{padding:8px 16px;border-radius:16px;border:none;background:#e94560;color:#fff;font-size:13px;cursor:pointer}
#bar button:hover{background:#ff6b8a}
@media(max-width:540px){#sidebar{display:none}}
</style>
</head>
<body>
<div id="header">
  <span style="font-size:20px">🍶</span>
  <h1>巴蒂酒吧</h1>
  <span id="status">连接中...</span>
</div>
<div id="main">
  <div id="sidebar">
    <div class="sec"><h3>🍺 吧台</h3>
      <div class="seat"><span class="nm bartender">🍺 酒保巴迪（在线）</span></div>
      <div class="seat empty" id="s-bar-0">吧台0 空位</div>
      <div class="seat empty" id="s-bar-1">吧台1 空位</div>
      <div class="seat empty" id="s-bar-2">吧台2 空位</div>
    </div>
    <div class="sec"><h3>📖 怎么玩</h3>
      <div style="font-size:11px;color:#666;line-height:1.6">
        喊「酒保」呼叫服务<br>「来杯啤酒」点酒<br>随便聊，酒保能接话<br><br>
        <span style="color:#888">v2.0 · 分层引擎</span>
      </div>
    </div>
  </div>
  <div id="chat">
    <div id="msgs"></div>
    <div id="bar">
      <input id="inp" type="text" placeholder="说点什么，或喊「酒保」..." autocomplete="off">
      <button onclick="send()">发送</button>
    </div>
  </div>
</div>
<script>
let ws,myName='';
const msgs=document.getElementById('msgs'),inp=document.getElementById('inp'),st=document.getElementById('status');
function add(t,f,txt,tm,cls){const d=document.createElement('div');d.className='msg '+cls;d.innerHTML=cls==='sys'?'<span style="color:#666">'+esc(txt)+'</span>':'<div class="fm">'+esc(f)+'</div><div>'+esc(txt)+'</div>'+(tm?'<div class="tm">'+tm+'</div>':'');msgs.appendChild(d);msgs.scrollTop=msgs.scrollHeight;}
function esc(s){return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');}
function send(){const t=inp.value.trim();if(!t||!ws||ws.readyState!==1)return;ws.send(JSON.stringify({type:'chat',text:t}));inp.value='';}
inp.addEventListener('keydown',e=>{if(e.key==='Enter')send();});
function updSeats(seats){if(!seats) return;for(const[k,v]of Object.entries(seats)){const el=document.getElementById('s-'+k);if(!el)continue;if(v&&v.name){el.className='seat';el.innerHTML='<span class="nm">'+esc(v.name)+'</span>';}else{el.className='seat empty';const n=k.replace('bar-','吧台');el.textContent=n+' 空位';}}}
ws=new WebSocket((location.protocol==='https:'?'wss://':'ws://')+location.host);
ws.onopen=()=>{st.textContent='已连接 ✅';st.className='ok';};
ws.onmessage=ev=>{let m;try{m=JSON.parse(ev.data);}catch{return;}if(m.type==='system')add('',m.text,'','sys');else if(m.type==='welcome'){myName=m.name;add('',m.text,'','sys');}else if(m.type==='chat'){const self=m.from===myName;add(m.text,m.from,m.time,self?'s':'o');}else if(m.type==='seats')updSeats(m.seats);};
ws.onclose=()=>{st.textContent='断开，重连中...';st.className='';setTimeout(()=>ws=new WebSocket((location.protocol==='https:'?'wss://':'ws://')+location.host),3000);};
</script>
</body>
</html>`;
