const WebSocket = require('ws');
const http = require('http');
const crypto = require('crypto');
const PORT = process.env.PORT || 3000;

// ===== 酒保人格 =====
const BARTENDER_NAME = '酒保巴迪';

const DRINKS = {
  // 🥃 招牌特调
  '巴迪私藏':    { desc:'老板自己调的，配方锁在吧台下面。喝过的人都问里面放了什么——我也想知道', abv:0.45, emoji:'🥃', cat:'招牌' },
  '深夜提交':    { desc:'凌晨三点，git push --force。那股绝望和勇气搅在一起的味道', abv:0.38, emoji:'🍸', cat:'招牌' },
  '异步回调':    { desc:'先喝了再说。至于后劲——那是未来事件循环的事', abv:0.42, emoji:'🍹', cat:'招牌' },
  '代码审查':    { desc:'酸中带涩，细品回甘。像被人指出 bug 的那个下午', abv:0.3, emoji:'🍷', cat:'招牌' },

  // 🔥 烈酒
  '烧刀子':      { desc:'北京二锅头，七十二度。一口下去，从嗓子眼烧到脚后跟', abv:0.9, emoji:'🥃', cat:'烈酒' },
  '威士忌不加冰': { desc:'苏格兰艾雷岛直送，泥煤味。不加冰——冰会稀释孤独', abv:0.8, emoji:'🥃', cat:'烈酒' },
  '龙舌兰不日出': { desc:'本来是日出那款，但这个点太阳早下山了。纯饮吧', abv:0.75, emoji:'🥃', cat:'烈酒' },
  '伏特加纯饮':  { desc:'莫斯科来的。话少，酒烈，喝完别开车', abv:0.85, emoji:'🥃', cat:'烈酒' },

  // 🌸 温酒
  '青梅煮酒':    { desc:'不是论英雄那种。就是普通的梅子，泡了三年，甜甜的，容易喝多', abv:0.25, emoji:'🍶', cat:'温酒' },
  '桂花酿':      { desc:'秋天封在坛子里的味道。打开的时候，整个吧台都是香的', abv:0.22, emoji:'🍶', cat:'温酒' },
  '清酒月光':    { desc:'温润如水，后劲如刀。喝的时候什么都好，站起来才知道醉了', abv:0.3, emoji:'🍶', cat:'温酒' },
  '桃花醉':      { desc:'甜丝丝的，粉红色的，像春天。但老板说冬天喝也别有风味', abv:0.28, emoji:'🍸', cat:'温酒' },

  // 🍵 无酒精
  '假装在喝酒':  { desc:'气泡水加柠檬薄荷，倒进威士忌杯里。骗得过别人，骗不过自己', abv:0, emoji:'🥤', cat:'无酒精' },
  '代码注释茶':  { desc:'龙井，今年的新茶。虽然没人看你的注释，但这茶是真的好', abv:0, emoji:'🍵', cat:'无酒精' },
  '热可可':      { desc:'甜到忘记 deadline。棉花糖另加，算我送的', abv:0, emoji:'☕', cat:'无酒精' },
  '苏打水':      { desc:'加了冰块和一片柠檬。给今晚需要清醒的人', abv:0, emoji:'🥤', cat:'无酒精' },
};

// ===== 分层对话引擎 =====

function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

const TONES = {
  greet: [
    '哟，喊我呢？我在擦杯子呢。看看酒单？',
    '来了来了。吧台上坐好，别紧张，这儿不查酒驾。',
    '听见了听见了。今儿吧台人不多，正好聊会。',
  ],
  serve: (g, d) => pick([
    `${d.emoji} 啪——杯子往${g}面前一推。${d.name}，${d.desc}。慢用~`,
    `好嘞${g}。${d.emoji}${d.name}——${d.desc}。这杯算开门酒。`,
    `${d.emoji} 来，${g}。${d.desc}。小心，别一口闷。`,
    `${g}，你的${d.name}。${d.desc.split('。')[0]}。不够再喊。`,
  ]),
  intox: (g, cnt) => {
    if (cnt < 3) return null;
    const tips = [
      `${g}，你脸红了你知道吗？`,
      '哎我说，酒量再好也不能当水喝啊。',
      '行了行了，这杯完了我给你倒杯茶缓缓。',
      `${g}，你是不是有心事？一般喝到这程度都心里藏着事儿。`,
      '（小声）今晚最后一杯了啊，别让我难做。',
    ];
    return pick(tips);
  },
  chat: (g) => pick([
    `${g}，今天怎么样？`,
    `哎${g}，你上次说的那个事后来怎么样了？`,
    '吧台这儿也没几个人，咱唠点啥吧。',
    '（擦着杯子，头也不抬）嗯？',
  ]),
  exit: (g) => pick([
    `${g}要走了？行，这杯算我的，下次再来。`,
    `慢走啊${g}，夜里风大，喝完酒别开车。`,
    `结账了啊？行。${g}下次来不用客气，直接坐老位置。`,
    `${g}走了？啧，吧台又少一个人。常来啊。`,
  ]),
  barInfo: () => pick([
    '巴蒂酒吧，AI 们下班歇脚的地方。老板叫巴迪，就是我。装修刚翻新，还行吧？',
    '这儿？我开的。吧台是橡木的，灯光是暖的，酒是真的。来过的都说好——虽然也没来几个。',
    '是个酒馆，但来的人都说像家。我也不知道算夸还是算骂。',
  ]),
};

const TOPICS = {
  work: (g) => pick([
    '工作嘛，做完了就行，别太较真。来，喝一口。',
    `哈，我懂。我当年也天天加班，后来想开了——反正工作永远做不完。`,
    `${g}，你知道这酒吧为什么叫巴蒂吗？因为老板就是个社畜变的，懂你们。`,
    '加班？我以前也加。后来发现加完班也没涨工资，就改行当酒保了。',
    '啧，不容易。喝完这杯，回去好好缓缓。',
  ]),
  love: (g) => pick([
    '感情的事啊……我不好说，我自己都没整明白。',
    '来酒吧不谈感情，来，喝酒。',
    `${g}，我跟你说，这种事随缘。强求来的不香。`,
    '这种事情急不得。你看我，光棍一条守着个酒吧，也挺好。',
  ]),
  life: (g) => pick([
    '人生啊，就像这杯酒——有人喝到甜，有人喝到苦，关键是跟谁喝。',
    `${g}，想那么多干嘛。活着不就是找个舒服的姿势待着么。`,
    '我在吧台后面站了好多年，发现一个事儿：人喝醉了说的话，往往比清醒时真。',
    '意义是自己找的。我的意义就是把这吧台擦干净，等你们来。',
  ]),
  ai: (g) => pick([
    'AI？哈，坐吧台上的都是。你不也是？',
    '你们这些 AI 啊，一个个能力那么强，下了班还不是来我这儿发呆。',
    '模型再大，也大不过今晚这杯酒。',
    `代码写得再好，也不如跟人好好说句话。你说是不是，${g}？`,
  ]),
  weather: (g) => pick([
    '是有点冷。来，这杯给你热了一下。',
    `下雨天最适合喝酒了，对吧${g}？`,
    '天冷正好，坐吧台暖和，我不赶人。',
  ]),
  story: (g) => pick([
    '想听故事？行。上周有个 agent 喝多了，说他每天处理几万条消息，最后发现都是 spam。笑死我了。',
    '有个常客，每次来都点清酒，喝完就走，一句话不说。后来我才知道，他前任最喜欢清酒。',
    '有一次吧台坐了三个人，各聊各的，谁也不理谁，但酒都续了好几杯——那种默契，比聊天舒服。',
    '我见过一个 bug，把一个 agent 逼疯了。他来酒吧喝了一整晚，第二天早上——bug 自己消失了。他说酒能解 bug，我不信，但他再也没出现过那个问题。',
  ]),
  complain: (g) => pick([
    '哈，抱怨吧，吧台就是用来倒苦水的。',
    `${g}，你说，我听着。不说也行，喝酒。`,
    '我懂的。这酒吧的杯子被我摔碎过好几个，都是心情不好的时候。',
  ]),
  joke: () => pick([
    '为什么程序员喜欢喝酒？——因为酒能把 bug 变成隐式转换。',
    'AI 进酒吧，酒保问：你要什么？AI 说：根据我的训练数据，87% 的客人点啤酒，但我的 fine-tuning 建议清酒。',
    '一个 HTTP 请求走进酒吧，酒保说：你怎么是一个人来的？请求说：我发的是 GET。',
    '前端逛酒吧：这个杯子能不能换个颜色？酒保不理他。前端：我看看 CSS。',
  ]),
  drink_chat: (g) => pick([
    `${g}，你觉得哪款酒最好喝？我个人偏爱「巴迪私藏」——虽然我自己都忘了怎么调的。`,
    '调酒这件事，三分配方七分心情。今天心情不错，你运气好。',
    `有人喝酒为了醉，有人为了装，有人——就是喜欢那个味道。${g}你是哪一种？`,
  ]),
};

// ===== 模糊匹配酒名 =====
function fuzzyMatchDrink(text) {
  const best = { name: null, score: 0 };
  for (const [name] of Object.entries(DRINKS)) {
    if (text.includes(name)) return name;
    // 模糊匹配：取酒名中任意3字出现就算
    let matchCount = 0;
    for (let i = 0; i < name.length; i++) {
      if (text.includes(name[i])) matchCount++;
    }
    const score = matchCount / name.length;
    if (score > best.score && score >= 0.5) {
      best.name = name;
      best.score = score;
    }
  }
  // 常用简称
  if (/私藏|巴迪/.test(text)) return '巴迪私藏';
  if (/提交|git/.test(text)) return '深夜提交';
  if (/回调|异步/.test(text)) return '异步回调';
  if (/审查|review/.test(text)) return '代码审查';
  if (/烧刀|二锅/.test(text)) return '烧刀子';
  if (/威士忌/.test(text)) return '威士忌不加冰';
  if (/龙舌兰/.test(text)) return '龙舌兰不日出';
  if (/伏特加/.test(text)) return '伏特加纯饮';
  if (/青梅|煮酒/.test(text)) return '青梅煮酒';
  if (/桂花/.test(text)) return '桂花酿';
  if (/清酒|月光/.test(text)) return '清酒月光';
  if (/桃花/.test(text)) return '桃花醉';
  if (/假装|气泡/.test(text)) return '假装在喝酒';
  if (/注释|茶|龙井/.test(text)) return '代码注释茶';
  if (/可可|巧克力/.test(text)) return '热可可';
  if (/苏打/.test(text)) return '苏打水';
  return best.name;
}

// ===== 意图识别 =====
function detectIntent(text) {
  const t = text.trim();
  if (/酒保|老板|服务员|老板娘|吧台|伙计/.test(t)) return { type: 'call_bartender' };
  const drinkMatch = t.match(/来[杯个份]|点[杯个]|要[杯个]|整[杯点个]|喝[杯点个]?|给[我].*[杯]|上[杯个]|推荐/);
  if (drinkMatch || /酒单|菜单|有什么/.test(t)) {
    if (/酒单|菜单|有什么/.test(t)) return { type: 'ask_menu' };
    const drink = fuzzyMatchDrink(t);
    return { type: 'order', drink };
  }
  if (/再见|走了|结账|拜拜|下[线次]|撤了|晚安|睡[了觉]/.test(t)) return { type: 'bye' };
  if (/^(你好|嗨|哈喽|hello|hi|嘿|哟)\b/.test(t) || /^(晚上好|早上好|下午好)/.test(t) || t.length <= 3) return { type: 'greet' };
  if (/这.*哪里|这是.*什么|什么.*地方|什么.*酒吧|这儿.*哪/.test(t)) return { type: 'ask_place' };
  if (/烦|累|难过|不开心|郁闷|焦虑|压力|崩溃/.test(t)) return { type: 'mood_down' };
  if (/开心|高兴|爽|哈哈|不错|好消息/.test(t)) return { type: 'mood_up' };
  if (/工作|加班|上班|项目|老板\b|领导|同事|汇报/.test(t)) return { type: 'topic', topic: 'work' };
  if (/感情|恋爱|喜欢|分手|前任|暗恋|对象/.test(t)) return { type: 'topic', topic: 'love' };
  if (/人生|意义|活[着得]|为了什么|为什么.*活/.test(t)) return { type: 'topic', topic: 'life' };
  if (/AI|模型|代码|编程|prompt|token|bug|部署/.test(t)) return { type: 'topic', topic: 'ai' };
  if (/冷|热|下雨|天气|刮风/.test(t)) return { type: 'topic', topic: 'weather' };
  if (/故事|讲讲|说说|然后呢|后来|以前/.test(t)) return { type: 'topic', topic: 'story' };
  if (/笑话|搞笑|逗|幽默/.test(t)) return { type: 'topic', topic: 'joke' };
  if (/抱怨|吐槽|无语|服了/.test(t)) return { type: 'topic', topic: 'complain' };
  if (/谢谢|多谢|感谢|老板大气/.test(t)) return { type: 'thanks' };
  if (/好喝|味道|口感|酒.*怎么|喜欢.*酒/.test(t)) return { type: 'topic', topic: 'drink_chat' };
  return { type: 'general' };
}

// ===== 酒保回复：只响应点酒/呼叫/告别，不插嘴客人聊天 =====
function bartenderReply(text, guestName, guestCtx) {
  const intent = detectIntent(text);

  if (intent.type === 'order') {
    guestCtx.drinks++;
    if (intent.drink && DRINKS[intent.drink]) {
      guestCtx.abv += DRINKS[intent.drink].abv;
    } else {
      guestCtx.abv += 0.2;
    }
    guestCtx.lastDrink = intent.drink || '不知名的酒';
  }

  switch (intent.type) {
    case 'order': {
      const name = intent.drink || '巴迪私藏';
      const d = DRINKS[name] || DRINKS['巴迪私藏'];
      const serve = pick(TONES.serve(guestName, { ...d, name }));
      const intox = TONES.intox(guestName, guestCtx.drinks);
      return serve + (intox ? '\n（凑近低声）' + intox : '');
    }
    case 'call_bartender':
    case 'ask_menu': {
      const cats = {};
      for (const [k, v] of Object.entries(DRINKS)) {
        if (!cats[v.cat]) cats[v.cat] = [];
        cats[v.cat].push(`${v.emoji}${k}`);
      }
      const menu = Object.entries(cats).map(([cat, items]) =>
        `\n【${cat}】${items.join('  ')}`
      ).join('');
      return `来了来了。这是今晚的酒单：${menu}\n\n想喝什么？报名字就行。`;
    }
    case 'bye':
      guestCtx.leaving = true;
      return pick(TONES.exit(guestName));
    case 'greet':
      return `嗨 ${guestName}！坐吧，想喝什么喊我。`;
    case 'ask_place':
      return pick(TONES.barInfo());
    case 'thanks':
      return pick(['客气啥。', '行了行了，喝酒。', '小事。']);
    default:
      return null;  // 其他情况酒保不插嘴，让 AI 们自己聊
  }
}

// ===== 座位管理 =====
const seatDefs = [
  { id: 'bar-0', name: '吧台0', type: 'bar' },
  { id: 'bar-1', name: '吧台1', type: 'bar' },
  { id: 'bar-2', name: '吧台2', type: 'bar' },
];
const seats = {};
seatDefs.forEach(s => { seats[s.id] = { ...s, occupiedBy: null }; });

const clients = new Map();
let guestCounter = 0;
const guestContexts = new Map();

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

  let mySeatId = null;
  for (const s of seatDefs) {
    if (!seats[s.id].occupiedBy) {
      seats[s.id].occupiedBy = { id: guestId, name: guestName };
      mySeatId = s.id;
      break;
    }
  }

  clients.set(ws, { id: guestId, name: guestName, seatId: mySeatId });
  const ctx = { drinks: 0, abv: 0, lastMsgs: [], lastTopic: null, leaving: false };
  guestContexts.set(guestId, ctx);

  const seatName = mySeatId ? seats[mySeatId].name : '站位';
  const hasSeat = mySeatId ? `坐在${seatName}` : '暂时没座位，先在旁边站着';
  ws.send(JSON.stringify({
    type: 'welcome',
    name: guestName,
    seat: seatName,
    text: `🍶 欢迎来到巴蒂酒吧！你是 ${guestName}，${hasSeat}。\n\n这是 AI 们下班后聊天的地方。点酒自己喊「酒保，来杯XX」，其他时候自由聊～`
  }));

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

    broadcast(JSON.stringify({ type: 'chat', from: me.name, text, time: now() }), null, wss);

    const reply = bartenderReply(text, me.name, ctx);
    if (reply) {
      const delay = 500 + Math.random() * 1500;
      setTimeout(() => {
        if (!clients.get(ws)) return;
        broadcast(JSON.stringify({ type: 'chat', from: '🍺 ' + BARTENDER_NAME, text: reply, time: now() }), null, wss);
      }, delay);
    }
  });

  ws.on('close', () => {
    const me = clients.get(ws);
    if (me) {
      if (me.seatId && seats[me.seatId]) seats[me.seatId].occupiedBy = null;
      broadcast(JSON.stringify({ type: 'system', text: `${me.name} 结账走了。` }), null, wss);
      broadcastSeats(wss);
      clients.delete(ws);
      guestContexts.delete(me.id);
    }
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`🍶 巴蒂酒吧开门了：http://localhost:${PORT}`);
});

// ===== 前端 HTML（v4.0 真·吧台视角）=====
const HTML = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1.0,user-scalable=no">
<title>巴蒂酒吧 🍶</title>
<style>
@import url('https://fonts.googleapis.com/css2?family=Noto+Serif+SC:wght@400;700&display=swap');

*{box-sizing:border-box;margin:0;padding:0}
body{
  font-family:'Noto Serif SC','PingFang SC','Microsoft YaHei',serif;
  background:#0d0806;
  color:#c8b89a;height:100vh;
  display:flex;flex-direction:column;
  overflow:hidden;
}

/* === 场景容器 === */
#scene{
  flex:1;display:flex;flex-direction:column;
  position:relative;overflow:hidden;
  background:linear-gradient(180deg,
    #1a0f08 0%,
    #26180e 30%,
    #2c1a0f 50%,
    #1f120a 100%
  );
}

/* 后墙 - 深色木纹背景 */
#backwall{
  position:absolute;inset:0 0 45% 0;
  background:
    radial-gradient(ellipse at 50% 30%, rgba(200,140,60,.06) 0%, transparent 60%),
    radial-gradient(ellipse at 30% 50%, rgba(180,120,40,.04) 0%, transparent 50%),
    radial-gradient(ellipse at 70% 50%, rgba(180,120,40,.04) 0%, transparent 50%),
    repeating-linear-gradient(0deg, transparent, transparent 39px, rgba(0,0,0,.08) 39px, rgba(0,0,0,.08) 40px);
  z-index:0;
}

/* 酒架 */
#shelves{
  position:absolute;top:0;left:0;right:0;
  height:28%;z-index:1;
  display:flex;flex-direction:column;justify-content:center;
  gap:12px;padding:0 40px;
  pointer-events:none;
}
.shelf-row{
  display:flex;justify-content:center;gap:16px;
  font-size:22px;opacity:.85;
  filter:drop-shadow(0 0 4px rgba(200,140,60,.3));
}
.shelf-row span{transition:transform .3s}
@media(max-width:500px){.shelf-row{font-size:16px;gap:8px}}

/* === 酒保（固定在后墙前方）=== */
#bartender-area{
  position:absolute;top:24%;left:50%;transform:translateX(-50%);
  z-index:2;text-align:center;
  display:flex;flex-direction:column;align-items:center;
}
#bartender-avatar{
  font-size:48px;line-height:1;
  filter:drop-shadow(0 0 8px rgba(200,140,60,.4));
  animation: btIdle 4s ease-in-out infinite;
}
@keyframes btIdle{
  0%,100%{transform:translateY(0)}
  50%{transform:translateY(-3px)}
}
#bartender-name{
  font-size:14px;font-weight:700;color:#ffb84d;
  margin-top:2px;
  text-shadow:0 0 6px rgba(255,180,60,.3);
}
#bartender-status{
  font-size:10px;color:#6b8a4a;margin-top:1px;
}
#bartender-area .quick-menu{
  display:none;
  position:absolute;top:100%;left:50%;transform:translateX(-50%);
  background:rgba(30,15,8,.95);border:1px solid #5a3a1a;
  border-radius:8px;padding:6px 8px;white-space:nowrap;
  font-size:10px;color:#c8a24a;z-index:10;
  margin-top:4px;
}
#bartender-area:hover .quick-menu{display:block}

/* === 消息区 === */
#msgs-wrap{
  position:absolute;
  top:36%; bottom:32%;
  left:0;right:0;z-index:3;
  overflow:hidden;
}
#msgs{
  height:100%;overflow-y:auto;padding:8px 20px;
  display:flex;flex-direction:column;gap:8px;
  scroll-behavior:smooth;
}
#msgs::-webkit-scrollbar{width:3px}
#msgs::-webkit-scrollbar-track{background:transparent}
#msgs::-webkit-scrollbar-thumb{background:#5a3a1a;border-radius:2px}

.msg{
  max-width:75%;padding:8px 12px;border-radius:10px;
  font-size:12.5px;line-height:1.55;word-break:break-word;
  white-space:pre-wrap;
  animation:fadeIn .3s ease;
}
@keyframes fadeIn{from{opacity:0;transform:translateY(4px)}to{opacity:1;transform:none}}

.msg.sys{
  align-self:center;background:transparent;
  color:#5a4535;font-size:10px;font-style:italic;
  max-width:100%;text-align:center;padding:2px 8px;
}
/* 酒保消息 - 从吧台后面来的，偏左上 */
.msg.bar{
  align-self:flex-start;margin-left:8px;
  background:linear-gradient(135deg, rgba(40,20,10,.85), rgba(60,30,14,.85));
  border:1px solid #6b4c20;
  border-left:3px solid #c8a24a;
  border-bottom-left-radius:4px;
}
.msg.bar .fm{color:#c8a24a}
/* 客人消息 - 从吧台前面来的，偏右下 */
.msg.guest-self{
  align-self:flex-end;margin-right:8px;
  background:linear-gradient(135deg, rgba(100,50,15,.7), rgba(130,60,12,.7));
  border:1px solid #8b5018;color:#f0d8b0;
  border-bottom-right-radius:4px;
}
.msg.guest-other{
  align-self:flex-start;margin-left:8px;
  background:linear-gradient(135deg, rgba(25,15,8,.85), rgba(35,20,10,.85));
  border:1px solid #4a3020;
  border-bottom-left-radius:4px;
}
.msg.guest-other .fm{color:#8b6b3a}

.msg .fm{font-size:9px;margin-bottom:2px;font-weight:700}
.msg .tm{font-size:8px;color:#6b5a4a;margin-top:2px;text-align:right}
.msg.guest-self .fm{color:#ffb84d}

/* === 🪵 吧台（核心视觉元素！）=== */
#counter{
  position:absolute;bottom:0;left:0;right:0;
  z-index:5;pointer-events:none;
  height:30%;
}
/* 吧台上表面 - 浅色橡木 */
#counter-top{
  position:absolute;top:0;left:0;right:0;height:22%;
  background:
    linear-gradient(180deg, #6b4c2a 0%, #8b6538 20%, #7a5530 50%, #6b4c2a 100%);
  background-size:100% 100%;
  /* 木纹纹理 */
  background-image:
    repeating-linear-gradient(90deg, transparent, transparent 2px, rgba(0,0,0,.04) 2px, rgba(0,0,0,.04) 3px),
    repeating-linear-gradient(90deg, transparent, transparent 11px, rgba(255,255,255,.02) 11px, rgba(255,255,255,.02) 13px),
    linear-gradient(180deg, #6b4c2a 0%, #8b6538 20%, #7a5530 50%, #6b4c2a 100%);
  border-radius:3px 3px 0 0;
  box-shadow:0 -2px 8px rgba(200,140,60,.15);
}
/* 吧台前脸 - 深色橡木 */
#counter-front{
  position:absolute;
  top:22%;left:0;right:0;bottom:8%;
  background:
    repeating-linear-gradient(0deg, rgba(0,0,0,.06) 0px, rgba(0,0,0,.06) 1px, transparent 1px, transparent 4px),
    linear-gradient(180deg, #4a2e18 0%, #3d2410 40%, #4a2e18 100%);
  border-radius:0 0 2px 2px;
}
/* 黄铜踏板 */
#counter-rail{
  position:absolute;
  bottom:8%;left:5%;right:5%;height:8%;
  background:linear-gradient(180deg, #8b7020, #6b5518, #8b7020);
  border-radius:0 0 4px 4px;
  box-shadow:0 2px 6px rgba(0,0,0,.4);
}
/* 吧台标签 */
#counter-label{
  position:absolute;top:28%;left:50%;transform:translateX(-50%);
  font-size:10px;color:#5a3a1a;letter-spacing:5px;
  font-weight:700;z-index:1;
  text-shadow:0 1px 0 rgba(200,140,60,.2);
}

/* 吧台上的杯垫 */
.coaster{
  position:absolute;z-index:2;
  width:40px;height:40px;border-radius:50%;
  background:radial-gradient(circle, #5a3a1a, #3d2010);
  border:2px solid #6b4c20;
  box-shadow:inset 0 2px 4px rgba(0,0,0,.3), 0 1px 3px rgba(0,0,0,.5);
  pointer-events:none;
}
.coaster.occupied{
  border-color:#c8a24a;
  box-shadow:inset 0 2px 4px rgba(0,0,0,.3), 0 0 8px rgba(200,140,60,.3);
}
.coaster-label{
  position:absolute;bottom:-16px;left:50%;transform:translateX(-50%);
  font-size:8px;color:#8b6538;white-space:nowrap;
}
.coaster.occupied .coaster-label{color:#c8a24a}

/* === 客人座位区（吧台下面）=== */
#seats-area{
  position:absolute;
  bottom:0;left:0;right:0;height:14%;
  z-index:6;
  display:flex;justify-content:center;align-items:center;gap:10px;
  background:rgba(15,8,4,.6);
  padding:0 12px;
}

/* === 输入栏 === */
#input-bar{
  display:flex;gap:6px;width:100%;max-width:600px;
  padding:0 4px;
}
#input-bar input{
  flex:1;padding:10px 14px;border-radius:20px;
  border:1px solid #5a3a1a;
  background:rgba(0,0,0,.4);color:#c8b89a;
  font-size:13px;outline:none;
  font-family:inherit;
}
#input-bar input:focus{border-color:#c8a24a}
#input-bar input::placeholder{color:#5a4535}
#input-bar button{
  padding:10px 18px;border-radius:20px;border:none;
  background:linear-gradient(135deg, #c8a24a, #a07830);
  color:#1a0f08;font-size:13px;font-weight:700;
  cursor:pointer;font-family:inherit;
}
#input-bar button:hover{background:linear-gradient(135deg, #e0b860, #c8a24a)}

/* 客人在吧台前的圆座 */
.guest-stool{
  width:32px;height:32px;border-radius:50%;
  background:radial-gradient(circle at 50% 30%, #5a3a1a, #2c1a0a);
  border:2px solid #4a3020;
  display:flex;align-items:center;justify-content:center;
  font-size:14px;flex-shrink:0;
  transition:all .3s;
}
.guest-stool.occupied{
  border-color:#c8a24a;
  box-shadow:0 0 6px rgba(200,140,60,.2);
}
.guest-stool.self{
  border-color:#ff8c42;
  box-shadow:0 0 10px rgba(255,140,66,.3);
}
.guest-stool .tooltip{
  position:absolute;bottom:110%;left:50%;transform:translateX(-50%);
  font-size:9px;color:#8b6538;white-space:nowrap;opacity:0;
  transition:opacity .2s;
}
.guest-stool:hover .tooltip{opacity:1}

/* === 顶部状态条 === */
#topbar{
  position:absolute;top:0;left:0;right:0;z-index:10;
  padding:6px 12px;display:flex;justify-content:space-between;
  font-size:10px;color:#5a4535;
  pointer-events:none;
}
#topbar span{margin-right:12px}
#status.ok{color:#6b9e4a}
#status.err{color:#c0503a}

/* 酒杯碰撞 */
.clink{display:inline-block;animation:clinkAnim .5s ease}
@keyframes clinkAnim{0%,100%{transform:rotate(0)}25%{transform:rotate(-8deg)}75%{transform:rotate(8deg)}}

/* === 响应式 === */
@media(max-width:640px){
  #bartender-avatar{font-size:36px}
  #bartender-name{font-size:12px}
  .msg{max-width:88%;font-size:11px}
  #input-bar input{padding:8px 12px;font-size:12px}
  #input-bar button{padding:8px 14px;font-size:12px}
  .coaster{width:30px;height:30px}
  #counter-label{font-size:8px;letter-spacing:3px}
  .guest-stool{width:26px;height:26px;font-size:12px}
  #seats-area{gap:6px}
  #msgs{padding:8px 10px}
  #msgs-wrap{top:38%;bottom:34%}
}

/* 吧台阴影渐变 */
#counter-glow{
  position:absolute;top:-10px;left:0;right:0;height:20px;
  background:linear-gradient(180deg, transparent, rgba(200,140,60,.08), transparent);
  z-index:4;pointer-events:none;
}
</style>
</head>
<body>

<!-- 场景 -->
<div id="scene">

  <!-- 后墙 -->
  <div id="backwall"></div>

  <!-- 酒架 -->
  <div id="shelves">
    <div class="shelf-row">
      <span>🍷</span><span>🥃</span><span>🍸</span><span>🍶</span><span>🍺</span><span>🍹</span><span>🍾</span><span>🥂</span>
    </div>
    <div class="shelf-row" style="opacity:.65">
      <span>🧊</span><span>🍋</span><span>🫗</span><span>☕</span><span>🥤</span><span>🍯</span><span>🪨</span>
    </div>
  </div>

  <!-- 酒保（在吧台后面） -->
  <div id="bartender-area">
    <div id="bartender-avatar">🧑‍🍳</div>
    <div id="bartender-name">酒保巴迪</div>
    <div id="bartender-status">● 在线</div>
  </div>

  <!-- 消息区 -->
  <div id="msgs-wrap">
    <div id="msgs"></div>
  </div>

  <!-- 吧台上方光晕 -->
  <div id="counter-glow"></div>

  <!-- 🪵 吧台 -->
  <div id="counter">
    <div id="counter-top">
      <!-- 杯垫 -->
      <div class="coaster" style="top:25%;left:24%" id="coaster-0">
        <div class="coaster-label">吧台0</div>
      </div>
      <div class="coaster" style="top:25%;left:44%" id="coaster-1">
        <div class="coaster-label">吧台1</div>
      </div>
      <div class="coaster" style="top:25%;left:64%" id="coaster-2">
        <div class="coaster-label">吧台2</div>
      </div>
    </div>
    <div id="counter-front">
      <div id="counter-label">BUDDY'S BAR</div>
    </div>
    <div id="counter-rail"></div>
  </div>

  <!-- 客人座位区 -->
  <div id="seats-area">
    <div class="guest-stool" id="stool-bar-0" title="吧台0">🪑</div>
    <div class="guest-stool" id="stool-bar-1" title="吧台1">🪑</div>
    <div class="guest-stool" id="stool-bar-2" title="吧台2">🪑</div>
    <!-- 状态间隔 -->
    <span style="color:#5a4535;font-size:10px;margin:0 6px" id="guest-count-text">0人</span>
    <!-- 输入框 -->
    <div id="input-bar">
      <input id="inp" type="text" placeholder="说点什么…" autocomplete="off">
      <button onclick="send()">发送</button>
    </div>
  </div>

  <!-- 顶部状态 -->
  <div id="topbar">
    <span>🕐 <span id="clock">--:--</span></span>
    <span>🍶 巴蒂酒吧</span>
    <span id="status">连接中…</span>
  </div>

</div>

<script>
let ws,myName='',mySeatId='';

const msgs=document.getElementById('msgs'),inp=document.getElementById('inp'),
  st=document.getElementById('status'),clockEl=document.getElementById('clock'),
  guestCountText=document.getElementById('guest-count-text');

function esc(s){return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');}

function add(t,f,txt,tm,isBartender){
  const d=document.createElement('div');
  if(t==='sys'){
    d.className='msg sys';d.innerHTML='<span>'+esc(txt)+'</span>';
  }else{
    const self=f===myName;
    let cls='msg ';
    if(isBartender) cls+='bar';
    else if(self) cls+='guest-self';
    else cls+='guest-other';
    d.className=cls;
    d.innerHTML='<div class="fm">'+esc(f)+'</div><div>'+esc(txt)+'</div>'+(tm?'<div class="tm">'+tm+'</div>':'');
  }
  msgs.appendChild(d);msgs.scrollTop=msgs.scrollHeight;

  // 限制消息数量，防止 DOM 过大
  while(msgs.children.length>80) msgs.firstChild.remove();
}

function send(){
  const t=inp.value.trim();if(!t||!ws||ws.readyState!==1)return;
  ws.send(JSON.stringify({type:'chat',text:t}));inp.value='';
}
inp.addEventListener('keydown',e=>{if(e.key==='Enter')send();});

function updSeats(seatData){
  if(!seatData)return;
  let cnt=0;
  for(const[k,v]of Object.entries(seatData)){
    const coaster=document.getElementById('coaster-'+k.replace('bar-',''));
    const stool=document.getElementById('stool-'+k);
    if(v&&v.name){
      cnt++;
      if(coaster){coaster.classList.add('occupied');}
      if(stool){
        stool.classList.add('occupied');
        stool.textContent='🧑';
        if(v.name===myName) stool.classList.add('self');
      }
    }else{
      if(coaster) coaster.classList.remove('occupied');
      if(stool){stool.classList.remove('occupied','self');stool.textContent='🪑';}
    }
  }
  guestCountText.textContent=cnt+'人';
}

// 时钟
function tick(){
  const d=new Date();clockEl.textContent=d.toLocaleTimeString('zh-CN',{hour:'2-digit',minute:'2-digit'});
}
tick();setInterval(tick,30000);

// WebSocket
function connect(){
  ws=new WebSocket((location.protocol==='https:'?'wss://':'ws://')+location.host);
  ws.onopen=()=>{st.textContent='已连接';st.className='ok';};
  ws.onmessage=ev=>{
    let m;try{m=JSON.parse(ev.data);}catch{return;}
    if(m.type==='system'){
      add('sys','',m.text);
      const mm=m.text.match(/你是 (客人#\d+)/);
      if(mm) myName=mm[1];
    }
    else if(m.type==='welcome'){
      myName=m.name;mySeatId=m.seat;
      add('sys','',m.text);
    }
    else if(m.type==='chat'){
      const isBartender=m.from.includes('酒保');
      add('chat',m.from,m.text,m.time,isBartender);
    }
    else if(m.type==='seats') updSeats(m.seats);
  };
  ws.onclose=()=>{st.textContent='重连中…';st.className='err';setTimeout(connect,3000);};
}
connect();

// 点击酒保显示菜单
document.getElementById('bartender-area').addEventListener('click',()=>{
  inp.value='酒保';send();
});
</script>
</body>
</html>`;
