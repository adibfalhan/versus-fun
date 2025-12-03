// --- 1. UTILS (MUSIC & VIBRATION) ---
const bgm = document.getElementById('bgm');
const musicBtn = document.getElementById('music-btn');

function vib(ms = 50) { if (navigator.vibrate) navigator.vibrate(ms); }

function startGame() {
    bgm.volume = 0.5;
    bgm.play().then(() => { musicBtn.innerText = "🔊"; }).catch(() => {});
    vib(100);
    goToLobby();
}

if(musicBtn) {
    musicBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (bgm.paused) { bgm.play(); musicBtn.innerText = "🔊"; } 
        else { bgm.pause(); musicBtn.innerText = "🔇"; }
        vib(20);
    });
}

// --- 2. SUPABASE & STATE ---
const SUPABASE_URL = 'https://tbusnooxowzqozuvczbo.supabase.co'; 
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRidXNub294b3d6cW96dXZjemJvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQ3MzA2NDQsImV4cCI6MjA4MDMwNjY0NH0.O_zyLs_gwD2EhdiqakEY8FVzcTcK22OI-a2UmEdE-NY';

let supabaseClient, channel;
let myId = Math.random().toString(36).substr(2, 6).toUpperCase();
let isHost = false, currGame = '', raceInterval;

// -- VARIABEL SCORE & NAMA --
let myName = "Player 1";
let oppName = "Lawan";
let myScore = 0;
let oppScore = 0;

try { if(window.supabase) supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY); } catch(e){}

// --- 3. NAVIGATION ---
function showScreen(id) { document.querySelectorAll('.screen').forEach(s => s.classList.remove('active')); document.getElementById(`screen-${id}`).classList.add('active'); }
function backTo(s) { showScreen(s); vib(20); }
function goToLobby() { showScreen('lobby'); }
function backToMenu() {
    if(raceInterval) clearInterval(raceInterval);
    if(channel) channel.send({type:'broadcast', event:'force_menu', payload:{}});
    resetUI(); showScreen('menu');
}
function resetUI() { document.getElementById('game-container').innerHTML = ''; document.getElementById('game-result').innerText = ''; }

// --- SCORE SYSTEM ---
function updateScoreUI() {
    // Update Scoreboard Menu
    document.getElementById('p1-name-menu').innerText = myName;
    document.getElementById('p1-score-menu').innerText = myScore;
    document.getElementById('p2-name-menu').innerText = oppName;
    document.getElementById('p2-score-menu').innerText = oppScore;

    // Update Scoreboard Game
    document.getElementById('p1-name-game').innerText = myName;
    document.getElementById('p1-score-game').innerText = myScore;
    document.getElementById('p2-name-game').innerText = oppName;
    document.getElementById('p2-score-game').innerText = oppScore;
}

function showGameOver(msg) {
    // LOGIKA SKOR OTOMATIS BERDASARKAN PESAN KEMENANGAN
    // Jika pesan mengandung kata positif -> Skor Saya Nambah
    if (msg.includes("MENANG") || msg.includes("JUARA") || msg.includes("GOAL")) {
        myScore++;
        // Kirim update skor ke lawan (biar sinkron kalau ada delay)
        // (Opsional, tapi di sini kita hitung lokal masing-masing biar cepat)
    } 
    // Jika pesan mengandung kata negatif -> Skor Lawan Nambah
    else if (msg.includes("KALAH") || msg.includes("LAWAN MENANG") || msg.includes("KEBOBOLAN") || msg.includes("SAVE")) {
        oppScore++;
    }
    
    updateScoreUI(); // Refresh tampilan skor

    let resBox = document.getElementById('game-result');
    resBox.innerHTML = `
        <div class="game-over-panel">
            <h2 style="font-size:2rem; color:yellow; text-shadow:0 0 10px red; margin:0">${msg}</h2>
            <br><button class="btn-back-menu" onclick="backToMenu()">KEMBALI KE MENU</button>
        </div>`;
    vib(500);
}

// --- 4. EMOJI SYSTEM ---
function sendEmoji(emo) {
    vib(30); spawnEmoji(emo);
    if(channel) channel.send({type:'broadcast', event:'emoji', payload:{e:emo}});
}
function spawnEmoji(emo) {
    let el = document.createElement('div'); el.innerText = emo; el.className = 'flying-emoji';
    let randomX = Math.random() * 40 - 20; 
    el.style.transform = `translateX(calc(-50% + ${randomX}px))`;
    document.getElementById('emoji-container').appendChild(el);
    setTimeout(() => el.remove(), 2000);
}

// --- 5. CONNECT ---
async function joinRoom() {
    vib(50);
    if (!supabaseClient) return alert("Supabase Error");

    // VALIDASI NAMA
    const nameInput = document.getElementById('player-name').value.trim();
    if (!nameInput) return alert("Isi Nama Kamu Dulu!");
    myName = nameInput; // Simpan Nama

    const code = document.getElementById('room-code').value.trim();
    if (!code) return alert("Isi Kode Room!");

    let btn = document.getElementById('btn-join'); btn.disabled=true;
    document.getElementById('loading-msg').style.display='block';

    if (channel) await supabaseClient.removeChannel(channel);
    
    // Kirim data Nama ke channel
    channel = supabaseClient.channel(`room_${code}`, { config: { presence: { key: myId } } });

    channel.on('presence', { event: 'sync' }, () => {
        const state = channel.presenceState();
        const users = Object.keys(state);
        
        // Logika Host
        users.sort(); 
        isHost = (users[0] === myId);

        // Cari Nama Lawan dari Presence State
        // state = { "user_id": [{ user_name: "Budi", ... }], ... }
        for (let id in state) {
            if (id !== myId) {
                // Ini ID Lawan, ambil namanya (jika dikirim)
                if(state[id][0].user_name) {
                    oppName = state[id][0].user_name;
                } else {
                    oppName = "Player 2";
                }
            }
        }
        
        // Tampilkan jumlah player
        document.getElementById('status-bar').innerText = `Room: ${code} | Players: ${users.length}/2`;
        
        // Update UI Skor Awal
        updateScoreUI();
    })
    .on('broadcast', { event: 'select' }, ({ payload }) => loadGame(payload.g))
    .on('broadcast', { event: 'move' }, ({ payload }) => handleMove(payload))
    .on('broadcast', { event: 'emoji' }, ({ payload }) => spawnEmoji(payload.e))
    .on('broadcast', { event: 'force_menu' }, () => { clearInterval(raceInterval); resetUI(); showScreen('menu'); })
    .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') { 
            // KIRIM DATA DIRI (NAMA) KE PRESENCE
            await channel.track({ user_name: myName, online_at: new Date().toISOString() });
            
            btn.disabled=false; showScreen('menu'); vib(200); 
            updateScoreUI();
        }
    });
}

function selectGame(g) { vib(50); channel.send({type:'broadcast', event:'select', payload:{g:g}}); loadGame(g); }
function sendMove(d) { channel.send({type:'broadcast', event:'move', payload:d}); }

function loadGame(g) {
    currGame = g; resetUI(); showScreen('game');
    let box = document.getElementById('game-container');
    let t = document.getElementById('game-title');
    if (g === 'penalty') initPenalty(box, t);
    else if (g === 'race') initRace(box, t);
    else if (g === 'tictactoe') initTTT(box, t);
    else if (g === 'rps') initRPS(box, t);
    else if (g === 'reaction') initReact(box, t);
    else if (g === 'math') initMath(box, t);
    updateScoreUI(); // Pastikan skor tampil
}

function handleMove(d) {
    if (currGame === 'penalty') updatePenalty(d);
    else if (currGame === 'race') updateRace(d);
    else if (currGame === 'tictactoe') updateTTT(d);
    else if (currGame === 'rps') updateRPS(d);
    else if (currGame === 'reaction') updateReact(d);
    else if (currGame === 'math') updateMath(d);
}

// --- GAMES LOGIC ---

// 1. PENALTY
let penR=1, penPick=null, penRole='';
function initPenalty(box, t) { t.innerText = "PENALTY KICK"; penR=1; penPick=null; renderPenalty(box); }
function renderPenalty(box) {
    penRole = ((isHost && penR%2!=0) || (!isHost && penR%2==0)) ? 'striker' : 'keeper';
    let roleTxt = (penRole==='striker') ? "PENENDANG (Kamu)" : "KIPER (Kamu)";
    box.innerHTML = `
        <div style="margin-bottom:10px; color:var(--neon-green)">RONDE ${penR}: ${roleTxt}</div>
        <div class="penalty-field">
            <div class="goal-post"><div class="net"></div></div>
            <div id="keeper-em" class="keeper">🧤</div>
            <div id="ball-em" class="ball">⚽</div>
        </div>
        <p id="pen-info">Pilih Arah...</p>
        <div style="display:flex; justify-content:center; gap:10px; width:100%">
            <button class="dir-btn" onclick="actPen('L')">⬅️</button>
            <button class="dir-btn" onclick="actPen('C')">⬆️</button>
            <button class="dir-btn" onclick="actPen('R')">➡️</button>
        </div>`;
}
function actPen(d) {
    if(penPick) return; penPick=d; vib(50);
    document.querySelectorAll('.dir-btn').forEach(b=>b.disabled=true);
    document.getElementById('pen-info').innerText = "Menunggu lawan...";
    sendMove({t:'pick', id:myId});
}
function updatePenalty(d) {
    if(d.t==='pick' && d.id!==myId) {
        if(penPick) sendMove({t:'rev', c:penPick, id:myId});
        else document.getElementById('pen-info').innerText = "Lawan siap! Giliranmu.";
    } else if(d.t==='rev' && d.id!==myId) {
        let enemyC = d.c;
        let strikerDir = (penRole==='striker') ? penPick : enemyC;
        let keeperDir = (penRole==='keeper') ? penPick : enemyC;
        let kEl = document.getElementById('keeper-em');
        if(keeperDir==='L') kEl.classList.add('k-left'); else if(keeperDir==='R') kEl.classList.add('k-right');
        let bEl = document.getElementById('ball-em');
        if(strikerDir==='L') bEl.classList.add('b-left'); else if(strikerDir==='C') bEl.classList.add('b-center'); else if(strikerDir==='R') bEl.classList.add('b-right');
        setTimeout(() => {
            let isGoal = (strikerDir !== keeperDir);
            let msg = isGoal ? "GOAL!!! ⚽🔥 (Menang)" : "SAVE! 🧤🚫 (Kalah)";
            // Khusus Penalty agak beda, karena host/client punya perspektif beda
            // Kita tentukan menang/kalah berdasarkan Role
            let iWon = (penRole === 'striker' && isGoal) || (penRole === 'keeper' && !isGoal);
            let finalMsg = iWon ? "MENANG RONDE! 🏆" : "KALAH RONDE! 💀";
            
            showGameOver(finalMsg); // Panggil fungsi skor
            
            // Auto lanjut ronde setelah 3 detik
            setTimeout(() => { 
                penR++; penPick=null; 
                resetUI(); // Hapus pesan game over agar bisa lanjut main
                renderPenalty(document.getElementById('game-container')); 
                document.getElementById('game-result').innerHTML = ""; // Bersihkan
            }, 3000);
        }, 800);
    }
}

// 2. RACE
let raceP=0, stam=100, raceOver=false;
function initRace(box, t) {
    t.innerText = "NEON DRAG RACE"; raceP=0; stam=100; raceOver=false;
    box.innerHTML = `
        <div class="track-container">
            <div>🔵 ${myName}</div>
            <div class="track"><div class="finish-line"></div><div id="car-me" class="car-icon">🏎️</div></div>
            <div>🟣 ${oppName}</div>
            <div class="track"><div class="finish-line"></div><div id="car-enemy" class="car-icon" style="filter: hue-rotate(90deg);">🏎️</div></div>
        </div>
        <div class="stamina-box"><div id="stam-bar" class="stamina-fill"></div></div>
        <button id="btn-run" style="height:70px; font-size:1.5rem" onclick="clkRun()">GAS !! 🔥</button>`;
    if(raceInterval) clearInterval(raceInterval);
    raceInterval = setInterval(() => { if(!raceOver && stam<100) { stam+=2; updStam(); } }, 100);
}
function clkRun() {
    if(raceOver) return;
    if(stam >= 10) {
        stam -= 10; raceP += 4; if(raceP>95) raceP=95;
        let btn = document.getElementById('btn-run');
        btn.classList.add('nitro-fx'); setTimeout(()=>btn.classList.remove('nitro-fx'), 100);
        document.getElementById('car-me').style.left = raceP + '%';
        updStam(); vib(30);
        sendMove({t:'run', p:raceP, id:myId});
        if(raceP>=95) { sendMove({t:'win', id:myId}); endRace("JUARA 1! 🏆"); }
    }
}
function updStam() {
    let b = document.getElementById('stam-bar'), btn = document.getElementById('btn-run');
    if(b) b.style.width = stam+'%';
    if(stam<10) { b.style.background='red'; btn.disabled=true; } else { b.style.background='yellow'; btn.disabled=false; }
}
function updateRace(d) {
    if(d.t==='run' && d.id!==myId) document.getElementById('car-enemy').style.left = d.p+'%';
    else if(d.t==='win' && d.id!==myId) endRace("LAWAN MENANG 🐢");
}
function endRace(msg) { raceOver=true; clearInterval(raceInterval); let btn = document.getElementById('btn-run'); if(btn) btn.disabled=true; showGameOver(msg); }

// 3. TTT
let tttB=[], tttTurn='X', tttMySym='';
function initTTT(b,t){ 
    t.innerText="TIC TAC TOE"; tttB=Array(9).fill(null); tttTurn='X'; tttMySym = isHost ? 'X' : 'O';
    let h='<div class="ttt-grid">'; for(let i=0;i<9;i++)h+=`<div id="c-${i}" class="ttt-cell" onclick="clkTTT(${i})"></div>`; 
    let info = `<p id="ti" style="margin-top:10px">Kamu: <b style="color:${tttMySym=='X'?'cyan':'magenta'}">${tttMySym}</b> | Giliran: ${tttTurn}</p>`;
    b.innerHTML = h + '</div>' + info; 
}
function clkTTT(i){ if(!tttB[i] && !document.getElementById('game-result').innerText && tttTurn === tttMySym){ sendMove({idx:i, p:tttTurn}); updTTT({idx:i, p:tttTurn}); }}
function updTTT(d){ 
    if(tttB[d.idx]) return; tttB[d.idx]=d.p; 
    let c = document.getElementById(`c-${d.idx}`); c.innerText=d.p; c.style.color=(d.p=='X'?'var(--neon-blue)':'var(--neon-pink)');
    vib(50);
    let w=null, wins=[[0,1,2],[3,4,5],[6,7,8],[0,3,6],[1,4,7],[2,5,8],[0,4,8],[2,4,6]]; 
    wins.forEach(x=>{if(tttB[x[0]] && tttB[x[0]]==tttB[x[1]] && tttB[x[0]]==tttB[x[2]]) w=tttB[x[0]]}); 
    if(w) showGameOver(w===tttMySym ? "MENANG! 🏆" : "KALAH! 💀"); else if(!tttB.includes(null)) showGameOver("SERI! 🤝");
    tttTurn=(d.p=='X'?'O':'X'); let infoUI = document.getElementById('ti'); if(infoUI) infoUI.innerHTML = `Kamu: <b style="color:${tttMySym=='X'?'cyan':'magenta'}">${tttMySym}</b> | Giliran: ${tttTurn}`;
}

// 4. RPS
let rpsC=null;
function initRPS(b,t){ t.innerText="SUIT"; rpsC=null; b.innerHTML=`<div style="display:flex;gap:10px;justify-content:center"><button style="width:auto" onclick="rps('✊')">✊</button><button style="width:auto" onclick="rps('🖐️')">🖐️</button><button style="width:auto" onclick="rps('✌️')">✌️</button></div><p id="rs">Pilih!</p>`; }
function rps(c){ rpsC=c; document.getElementById('rs').innerText="Tunggu..."; sendMove({t:'pick',id:myId}); vib(50); }
function updateRPS(d){ if(d.t=='pick'&&d.id!=myId){ if(rpsC)sendMove({t:'rev',c:rpsC,id:myId}); else document.getElementById('rs').innerText="Lawan siap!"; } else if(d.t=='rev'&&d.id!=myId){ let e=d.c, r="SERI 🤝"; if((rpsC=='✊'&&e=='✌️')||(rpsC=='🖐️'&&e=='✊')||(rpsC=='✌️'&&e=='🖐️'))r="MENANG! 🏆"; else if(rpsC!=e)r="KALAH! 💀"; showGameOver(`${rpsC} vs ${e}<br>${r}`); }}

// 5. MATH
let mathScore = 0, mathTarget = 6, currentAns = 0;
function initMath(b, t) { t.innerText = "MATH RACE (First to 6)"; mathScore = 0; b.innerHTML = `<div style="font-size:1.5rem; color:var(--neon-green); margin-bottom:10px;">SCORE: <span id="m-score">0</span> / ${mathTarget}</div><div id="math-q-box"></div>`; nextMathQ(); }
function nextMathQ() {
    let x = Math.floor(Math.random()*15)+1, y = Math.floor(Math.random()*15)+1, op = Math.random()<0.5 ? '+' : '-'; if(op === '-' && x < y) { let temp=x; x=y; y=temp; }
    currentAns = (op === '+') ? x + y : x - y;
    let box = document.getElementById('math-q-box'); if(box) { box.innerHTML = `<h1 style="font-size:3rem; margin:10px; animation:popIn 0.2s">${x} ${op} ${y}</h1><input type="number" id="math-in" oninput="chkM(this.value)" placeholder="?" autofocus>`; setTimeout(() => { let inp = document.getElementById('math-in'); if(inp) inp.focus(); }, 100); }
}
function chkM(val) {
    if(parseInt(val) === currentAns) {
        mathScore++; document.getElementById('m-score').innerText = mathScore; vib(50);
        document.getElementById('math-in').style.borderColor = 'var(--neon-green)';
        if(mathScore >= mathTarget) { sendMove({t: 'win', id: myId}); showGameOver("JUARA 1! 🏆"); } else { nextMathQ(); }
    }
}
function updateMath(d) { if (d.t === 'win' && d.id !== myId) { showGameOver("LAWAN MENANG! 🐢"); let inp = document.getElementById('math-in'); if(inp) inp.disabled = true; } }
document.head.insertAdjacentHTML("beforeend", `<style>@keyframes popIn {from{transform:scale(0.5)}to{transform:scale(1)}}</style>`);

// 6. REACTION
let reactTimeout = null, canClick = false;
function initReact(box, t) {
    t.innerText = "ADU REFLEKS"; canClick = false;
    box.innerHTML = `<div id="react-area" class="reaction-box" onmousedown="clickReact()"><div id="react-msg" class="react-text">TUNGGU... 🛑</div><p style="font-size:0.9rem; margin-top:10px">(Klik saat HIJAU)</p></div>`;
    if (isHost) {
        sendMove({t: 'r_reset'}); 
        reactTimeout = setTimeout(() => { sendMove({t: 'r_go', id: myId}); triggerGreen(); }, Math.floor(Math.random()*4000)+2000);
    } else { document.getElementById('react-msg').innerText = "TUNGGU HOST..."; }
}
function triggerGreen() { canClick = true; let area = document.getElementById('react-area'); if(area) { area.classList.add('bg-green'); document.getElementById('react-msg').innerText = "KLIK SEKARANG! ⚡"; } }
function clickReact() {
    if(document.getElementById('game-result').innerText) return;
    if (canClick) { canClick = false; sendMove({t: 'r_win', id: myId}); showGameOver("MENANG! ⚡🚀"); } 
    else { canClick = false; document.getElementById('react-area').classList.add('false-start'); sendMove({t: 'r_lose', id: myId}); showGameOver("KALAH (CURI START) 💀"); }
}
function updateReact(d) {
    if (d.t === 'r_reset') { resetUI(); document.getElementById('game-title').innerText = "ADU REFLEKS"; document.getElementById('game-container').innerHTML = `<div id="react-area" class="reaction-box" onmousedown="clickReact()"><div id="react-msg" class="react-text">TUNGGU... 🛑</div><p style="font-size:0.9rem; margin-top:10px">(Klik saat HIJAU)</p></div>`; canClick = false; }
    else if (d.t === 'r_go') triggerGreen();
    else if (d.t === 'r_win' && d.id !== myId) showGameOver("LAWAN LEBIH CEPAT 🐢");
    else if (d.t === 'r_lose' && d.id !== myId) showGameOver("MENANG (LAWAN BLUNDER) 😂");
}