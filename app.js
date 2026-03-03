const SUITS=["oros","copas","espadas","bastos"];
const LABEL={oros:"Oros",copas:"Copas",espadas:"Espadas",bastos:"Bastos"};
const EMOJI={oros:"🟡",copas:"🍷",espadas:"⚔️",bastos:"🪵"};
const TRACK_LEN=7;

let state=null;
let autoTimer=null;

function createDeck(){
  const values=[1,2,3,4,5,6,7,10,12];
  let deck=[];
  for(let s of SUITS){
    for(let v of values){
      deck.push({suit:s,label:`${v} de ${LABEL[s]}`});
    }
  }
  deck.sort(()=>Math.random()-0.5);
  return deck;
}

function initGame(n){
  const players=SUITS.slice(0,n);
  const deck=createDeck();
  const checkpoints=[];
  for(let i=0;i<7;i++)checkpoints.push({card:deck.pop(),revealed:false});
  const horses={};
  players.forEach(s=>horses[s]={pos:0});
  state={players,deck,checkpoints,horses,last:null,winner:null,log:[]};
  render();
}

function drawCard(){
  if(!state||state.winner)return;
  const c=state.deck.pop();
  if(!c)return;
  state.last=c;
  if(state.players.includes(c.suit)){
    state.horses[c.suit].pos++;
  }
  checkReveal();
  checkWin();
  render();
}

function checkReveal(){
  for(let i=0;i<7;i++){
    if(!state.checkpoints[i].revealed){
      const passed=state.players.every(s=>state.horses[s].pos>=i+1);
      if(passed){
        state.checkpoints[i].revealed=true;
        const suit=state.checkpoints[i].card.suit;
        if(state.players.includes(suit)){
          state.horses[suit].pos=Math.max(0,state.horses[suit].pos-1);
        }
      }
    }
  }
}

function checkWin(){
  for(let s of state.players){
    if(state.horses[s].pos>=TRACK_LEN){
      state.winner=s;
    }
  }
}

function render(){
  const board=document.getElementById("board");
  const grid=document.createElement("div");
  grid.className="boardGrid";
  grid.style.gridTemplateColumns=`140px repeat(${state.players.length},1fr)`;

  for(let row=TRACK_LEN;row>=0;row--){
    const left=document.createElement("div");
    left.className="bcell";
    if(row===0)left.textContent="Salida";
    else{
      const cp=state.checkpoints[row-1];
      const card=document.createElement("div");
      card.className="cpCard "+(cp.revealed?"revealed":"hidden");
      card.textContent=cp.revealed?cp.card.label:`Carta ${row}`;
      left.appendChild(card);
    }
    grid.appendChild(left);

    for(let s of state.players){
      const cell=document.createElement("div");
      cell.className="bcell";
      if(state.horses[s].pos===row){
        const pawn=document.createElement("div");
        pawn.className="horsePawn";
        pawn.textContent="🐎";
        cell.appendChild(pawn);
      }
      grid.appendChild(cell);
    }
  }

  board.innerHTML="";
  board.appendChild(grid);

  document.getElementById("lastCard").textContent=state.last?state.last.label:"—";
  document.getElementById("winner").textContent=state.winner?LABEL[state.winner]:"—";
  document.getElementById("remaining2").textContent=state.deck.length;
  document.getElementById("lastCardFace").textContent=state.last?state.last.label:"—";
}

document.getElementById("btnStart").onclick=()=>initGame(Number(document.getElementById("playersSelect").value));
document.getElementById("btnDraw").onclick=drawCard;