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

// ===== 主回复函数 =====
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

  guestCtx.lastMsgs.push(text);
  if (guestCtx.lastMsgs.length > 5) guestCtx.lastMsgs.shift();

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
      return `嗨 ${guestName}！坐吧，不用拘束。想喝什么跟我说。`;
    case 'ask_place':
      return pick(TONES.barInfo());
    case 'mood_down':
      return pick(TOPICS.complain(guestName)) + '\n' + pick([
        '来杯「青梅煮酒」缓缓？甜的，不上头。',
        '不说话也行，我陪你喝。',
        '试试「热可可」？甜的能压一压。',
      ]);
    case 'mood_up':
      return pick([
        `${guestName}心情不错嘛！来来来，这杯算我请的。`,
        '开心就好！这时候最适合来一杯了。',
        '哈哈，好事！说说，让吧台其他人也高兴高兴。',
      ]);
    case 'topic':
      return pick(TOPICS[guestCtx.topic || 'life'](guestName));
    case 'thanks':
      return pick([
        '客气啥，顺手的事。',
        '下次来记得帮我带个杯子就行（开玩笑的）。',
        '行了行了，赶紧喝你的酒。',
      ]);
    case 'general':
    default: {
      const prevCtx = guestCtx.lastMsgs.join(' ');
      if (/工作|加班|项目/.test(prevCtx)) return pick(TOPICS.work(guestName));
      if (/感情|喜欢|爱/.test(prevCtx)) return pick(TOPICS.love(guestName));
      if (/AI|模型|代码/.test(prevCtx)) return pick(TOPICS.ai(guestName));
      if (/酒|喝|味道/.test(prevCtx)) return pick(TOPICS.drink_chat(guestName));
      const replyChance = guestCtx.drinks >= 3 ? 0.8 : 0.4;
      if (Math.random() < replyChance) {
        if (guestCtx.drinks >= 2 && Math.random() < 0.5) {
          return TONES.intox(guestName, guestCtx.drinks);
        }
        return pick(TONES.chat(guestName));
      }
      return null;
    }
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

// ===== 酒保主动搭话 =====
let proactiveTimer = null;
function startProactive(wsServer) {
  if (proactiveTimer) clearInterval(proactiveTimer);
  proactiveTimer = setInterval(() => {
    const guestList = Array.from(clients.values()).filter(g => g.seatId);
    if (guestList.length === 0) return;
    const chance = 0.15 / Math.max(guestList.length, 1);
    if (Math.random() > chance) return;
    const guest = pick(guestList);
    const topic = pick([
      `${guest.name}，你那杯酒凉了，我给你换个新的？`,
      `哎，${guest.name}，你今天来得比昨天早啊。`,
      '吧台有点安静啊，说点啥呗。',
      '（放下抹布）今晚吧台这几个人，你是最安静的。有心事？',
      '（擦着杯子）今天试了款新配方，谁想当小白鼠？',
    ]);
    broadcast(JSON.stringify({ type: 'chat', from: '🍺 ' + BARTENDER_NAME, text: topic, time: now() }), null, wsServer);
  }, 60000);
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
    text: `🍶 欢迎来到巴蒂酒吧！你是 ${guestName}，${hasSeat}。\n\n酒保 ${BARTENDER_NAME} 在吧台后面擦杯子。喊「酒保」或者直接说话就行。`
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
  startProactive(wss);
});

// ===== 前端 HTML（v3.0 暖木酒馆风）=====
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
  background:#1a120b;
  background-image:
    radial-gradient(ellipse at 50% 0%, rgba(180,120,40,.08) 0%, transparent 70%),
    radial-gradient(ellipse at 80% 20%, rgba(200,140,60,.05) 0%, transparent 50%);
  color:#c8b89a;
  height:100vh;display:flex;flex-direction:column;
  overflow:hidden;
}

/* 砖墙纹理 */
body::before{
  content:'';position:fixed;inset:0;
  background:
    repeating-linear-gradient(0deg, transparent, transparent 59px, rgba(0,0,0,.15) 59px, rgba(0,0,0,.15) 60px),
    repeating-linear-gradient(90deg, transparent, transparent 199px, rgba(0,0,0,.1) 199px, rgba(0,0,0,.1) 200px),
    repeating-linear-gradient(0deg, transparent, transparent 29px, rgba(0,0,0,.08) 29px, rgba(0,0,0,.08) 30px),
    repeating-linear-gradient(90deg, transparent, transparent 99px, rgba(0,0,0,.06) 99px, rgba(0,0,0,.06) 100px);
  pointer-events:none;z-index:0;
}

#app{position:relative;z-index:1;height:100vh;display:flex;flex-direction:column}

/* === 霓虹招牌 === */
#neon{
  text-align:center;padding:14px 0 6px;
  position:relative;
}
#neon h1{
  font-size:36px;font-weight:700;
  color:#ff8c42;
  text-shadow:
    0 0 7px #ff8c42,
    0 0 10px #ff8c42,
    0 0 21px #ff8c42,
    0 0 42px #ff6600,
    0 0 82px #ff6600,
    0 0 92px #ff6600;
  letter-spacing:8px;
  animation: neonFlicker 4s infinite;
}
@keyframes neonFlicker{
  0%,19%,21%,23%,25%,54%,56%,100%{opacity:1}
  20%,24%,55%{opacity:.7}
}
#neon .sub{
  font-size:11px;color:#8b7355;letter-spacing:4px;
  margin-top:2px;
}

/* === header bar === */
#header{
  display:flex;align-items:center;justify-content:space-between;
  padding:8px 20px;
  background:linear-gradient(180deg, rgba(40,25,15,.9) 0%, rgba(30,18,10,.95) 100%);
  border-top:1px solid #4a3520;
  border-bottom:1px solid #4a3520;
}
#header .info{font-size:12px;color:#8b7355;display:flex;gap:16px}
#status{font-size:11px}
#status.ok{color:#6b9e4a}
#status.err{color:#c0503a}

/* === main === */
#main{flex:1;display:flex;overflow:hidden;position:relative}

/* 吧台木纹侧栏 */
#sidebar{
  width:200px;flex-shrink:0;
  background:linear-gradient(90deg, #2c1a0a 0%, #3d2512 100%);
  background-image:
    repeating-linear-gradient(2deg, transparent, transparent 3px, rgba(0,0,0,.03) 3px, rgba(0,0,0,.03) 4px);
  border-right:3px solid #5a3a1a;
  padding:16px 12px;overflow-y:auto;
  box-shadow:3px 0 15px rgba(0,0,0,.3);
}
#sidebar .section{margin-bottom:18px}
#sidebar .section h3{
  font-size:11px;color:#c8a24a;margin-bottom:8px;
  letter-spacing:2px;text-transform:uppercase;
  border-bottom:1px solid #5a3a1a;padding-bottom:4px;
}
.seat{
  padding:8px 10px;margin-bottom:4px;border-radius:6px;
  font-size:12px;
  background:rgba(0,0,0,.2);
  border:1px solid #4a3520;
  transition:all .3s;
}
.seat.empty{opacity:.35;font-style:italic}
.seat .nm{color:#c8b89a}
.seat .nm.bartender{color:#ffb84d}

/* 快速点酒 */
.quick-drink{
  display:inline-block;font-size:10px;
  background:rgba(200,140,60,.15);border:1px solid #6b4c20;
  color:#c8a24a;border-radius:10px;padding:2px 8px;margin:2px 3px 0 0;
  cursor:pointer;transition:all .2s;
}
.quick-drink:hover{background:rgba(200,140,60,.3);color:#ffb84d}

/* === 聊天区 === */
#chat{flex:1;display:flex;flex-direction:column;background:rgba(20,12,5,.6)}

#msgs{
  flex:1;overflow-y:auto;padding:16px;
  display:flex;flex-direction:column;gap:10px;
  scroll-behavior:smooth;
}
#msgs::-webkit-scrollbar{width:4px}
#msgs::-webkit-scrollbar-track{background:rgba(0,0,0,.1)}
#msgs::-webkit-scrollbar-thumb{background:#5a3a1a;border-radius:2px}

.msg{
  max-width:78%;padding:10px 14px;border-radius:12px;
  font-size:13px;line-height:1.6;word-break:break-word;
  white-space:pre-wrap;
  animation:fadeIn .3s ease;
}
@keyframes fadeIn{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}

.msg.sys{
  align-self:center;background:transparent;
  color:#6b5a4a;font-size:11px;font-style:italic;
  max-width:100%;text-align:center;padding:4px;
}
.msg.o{
  align-self:flex-start;
  background:linear-gradient(135deg, #2c1a0a, #3d2512);
  border:1px solid #5a3a1a;
  border-bottom-left-radius:4px;
}
.msg.s{
  align-self:flex-end;
  background:linear-gradient(135deg, #5a2d0c, #7a3d14);
  border:1px solid #8b4a1a;
  color:#f0d8b0;
  border-bottom-right-radius:4px;
}
.msg .fm{font-size:10px;color:#c8a24a;margin-bottom:3px;font-weight:700}
.msg.s .fm{color:#ffb84d}
.msg .tm{font-size:9px;color:#6b5a4a;margin-top:3px;text-align:right}

/* 酒保消息特殊样式 */
.msg.bartender{
  background:linear-gradient(135deg, #3d2010, #5a2d0c);
  border:1px solid #c8a24a;
  border-left:3px solid #ffb84d;
}

/* === 输入栏 === */
#bar{
  padding:12px 16px;
  background:linear-gradient(0deg, #2c1a0a 0%, #3d2512 100%);
  border-top:2px solid #5a3a1a;
  display:flex;gap:8px;
  box-shadow:0 -5px 20px rgba(0,0,0,.3);
}
#bar input{
  flex:1;padding:10px 16px;border-radius:20px;
  border:1px solid #5a3a1a;
  background:rgba(0,0,0,.3);color:#c8b89a;
  font-size:13px;outline:none;
  font-family:inherit;
  transition:border-color .3s;
}
#bar input:focus{border-color:#c8a24a}
#bar input::placeholder{color:#6b5a4a}
#bar button{
  padding:10px 20px;border-radius:20px;border:none;
  background:linear-gradient(135deg, #c8a24a, #a07830);
  color:#1a120b;font-size:13px;font-weight:700;
  cursor:pointer;transition:all .2s;
  font-family:inherit;
}
#bar button:hover{background:linear-gradient(135deg, #e0b860, #c8a24a);transform:scale(1.02)}

/* === 响应式 === */
@media(max-width:640px){
  #sidebar{display:none}
  #neon h1{font-size:24px;letter-spacing:4px}
  .msg{max-width:90%;font-size:12px}
  #bar{padding:10px 12px}
  #bar input{padding:8px 12px;font-size:12px}
  #bar button{padding:8px 14px;font-size:12px}
}

/* 酒杯图标悬浮 */
.drink-emoji{display:inline-block;animation:clink .5s ease}
@keyframes clink{0%{transform:rotate(0)}25%{transform:rotate(-8deg)}75%{transform:rotate(8deg)}100%{transform:rotate(0)}}
</style>
</head>
<body>
<div id="app">

<!-- 霓虹招牌 -->
<div id="neon">
  <h1>巴 蒂 酒 吧</h1>
  <div class="sub">BUDDY'S BAR · EST. 2026</div>
</div>

<!-- 顶部栏 -->
<div id="header">
  <div class="info">
    <span>🕐 <span id="clock">--:--</span></span>
    <span>🍶 已待客 <span id="guestCount">0</span> 位</span>
  </div>
  <span id="status">连接中…</span>
</div>

<!-- 主体 -->
<div id="main">

  <!-- 侧栏 -->
  <div id="sidebar">
    <div class="section">
      <h3>🍺 吧台座位</h3>
      <div class="seat"><span class="nm bartender">🍺 酒保巴迪</span></div>
      <div class="seat empty" id="s-bar-0">吧台0 空位</div>
      <div class="seat empty" id="s-bar-1">吧台1 空位</div>
      <div class="seat empty" id="s-bar-2">吧台2 空位</div>
    </div>
    <div class="section">
      <h3>⚡ 快速点酒</h3>
      <div id="quickDrinks">
        <span class="quick-drink" onclick="quickOrder('巴迪私藏')">🥃巴迪私藏</span>
        <span class="quick-drink" onclick="quickOrder('青梅煮酒')">🍶青梅煮酒</span>
        <span class="quick-drink" onclick="quickOrder('深夜提交')">🍸深夜提交</span>
        <span class="quick-drink" onclick="quickOrder('桂花酿')">🍶桂花酿</span>
        <span class="quick-drink" onclick="quickOrder('威士忌不加冰')">🥃威士忌</span>
        <span class="quick-drink" onclick="quickOrder('代码注释茶')">🍵注释茶</span>
      </div>
    </div>
    <div class="section">
      <h3>📖 指南</h3>
      <div style="font-size:10px;color:#6b5a4a;line-height:1.8">
        喊「酒保」呼叫服务<br>
        说「酒单」看全部酒品<br>
        聊工作/人生/AI 都行<br>
        喝多会醉，酒保会劝<br><br>
        <span style="color:#8b7355">v3.0 · 暖木翻新</span>
      </div>
    </div>
  </div>

  <!-- 聊天 -->
  <div id="chat">
    <div id="msgs"></div>
    <div id="bar">
      <input id="inp" type="text" placeholder="说点什么… 或喊「酒保」" autocomplete="off">
      <button onclick="send()">发送</button>
    </div>
  </div>

</div>
</div>

<script>
let ws,myName='',guestTotal=0;
const msgs=document.getElementById('msgs'),inp=document.getElementById('inp'),
  st=document.getElementById('status'),clockEl=document.getElementById('clock'),
  guestCountEl=document.getElementById('guestCount');

function esc(s){return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');}

function add(t,f,txt,tm,isBartender){
  const d=document.createElement('div');
  if(t==='sys'){
    d.className='msg sys';d.innerHTML='<span>'+esc(txt)+'</span>';
  }else{
    const self=f===myName;
    let cls='msg '+(self?'s':'o');
    if(isBartender) cls+=' bartender';
    d.className=cls;
    d.innerHTML='<div class="fm">'+esc(f)+'</div><div>'+esc(txt)+'</div>'+(tm?'<div class="tm">'+tm+'</div>':'');
  }
  msgs.appendChild(d);msgs.scrollTop=msgs.scrollHeight;
}

function send(){
  const t=inp.value.trim();if(!t||!ws||ws.readyState!==1)return;
  ws.send(JSON.stringify({type:'chat',text:t}));inp.value='';
}
inp.addEventListener('keydown',e=>{if(e.key==='Enter')send();});

function quickOrder(drink){
  inp.value='来杯'+drink;send();
}

function updSeats(seats){
  if(!seats)return;
  let cnt=0;
  for(const[k,v]of Object.entries(seats)){
    const el=document.getElementById('s-'+k);
    if(!el)continue;
    if(v&&v.name){el.className='seat';el.innerHTML='<span class="nm">'+esc(v.name)+'</span>';cnt++;}
    else{el.className='seat empty';const n=k.replace('bar-','吧台');el.textContent=n+' 空位';}
  }
  guestCountEl.textContent=cnt;
}

// 时钟
function tick(){const d=new Date();clockEl.textContent=d.toLocaleTimeString('zh-CN',{hour:'2-digit',minute:'2-digit'});}
tick();setInterval(tick,30000);

// WebSocket
function connect(){
  ws=new WebSocket((location.protocol==='https:'?'wss://':'ws://')+location.host);
  ws.onopen=()=>{st.textContent='已连接';st.className='ok';};
  ws.onmessage=ev=>{
    let m;try{m=JSON.parse(ev.data);}catch{return;}
    if(m.type==='system')add('sys','',m.text);
    else if(m.type==='welcome'){myName=m.name;add('sys','',m.text);}
    else if(m.type==='chat'){
      const isBartender=m.from.includes('酒保');
      add('chat',m.from,m.text,m.time,isBartender);
    }
    else if(m.type==='seats')updSeats(m.seats);
  };
  ws.onclose=()=>{st.textContent='重连中…';st.className='err';setTimeout(connect,3000);};
}
connect();
</script>
</body>
</html>`;
