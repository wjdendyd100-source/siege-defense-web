// 해상도 대응 (참조 REV01 산식 그대로): S = H/720, B = 1280×S, E = W−B, D = E/2
// 왼쪽 X = S×x0 / 중앙 X = W/2 + S×(x0−640) / 오른쪽 X = W − S×(1280−x0) / Y = S×y0
// 16:9보다 좁은 화면(4:3 태블릿 등)은 S = W/1280으로 가로를 기준으로 하고 아래쪽 요소는 하단 정렬한다.
export const BASE_W = 1280, BASE_H = 720;
export const CARD_W = 90.6, CARD_H = 135.9;

export function scaleOf(W, H) { return Math.min(H / BASE_H, W / BASE_W); }

// 카드 칸 수 (REV01 3장). V = 안전 영역 안쪽 가로폭을 720 기준으로 환산한 값
export function slotCounts(W, H, insetL = 0, insetR = 0, ui = 1) {
  const S = scaleOf(W, H) * ui;
  const V = (W - insetL - insetR) / S;
  const eps = 1e-6;
  const ctrlAvail = V - 961.4;                 // 자동 버튼 오른쪽 367.4 ~ 내려찍기 왼쪽 V−578, 양쪽 여유 8
  const ctrl = Math.max(0, Math.floor((ctrlAvail - 96) / 98.6 + eps)); // 간격 8, 소환 96 예약
  const cmdAvail = V - 284;                    // 좌우 24 + 오른쪽 소환 160·합성/판매 56·간격 20
  const cmd = Math.max(0, Math.floor((cmdAvail + 10) / 100.6 + eps)); // 간격 10
  return { S, V, ctrl, cmd, ctrlRemain: ctrlAvail - 96 - ctrl * 98.6, cmdRemain: cmdAvail - (cmd * 90.6 + (cmd - 1) * 10) };
}

// 기준 좌표(1280×720) 사각형을 실제 화면 픽셀로. anchor: 'L'|'C'|'R', vAnchor: 'T'|'B'
export function place(rect, anchor, vAnchor, env) {
  const { W, H, S, inL, inR, inT, inB } = env;
  const w = rect.w * S, h = rect.h * S;
  let x;
  if (anchor === 'L') x = inL + S * rect.x;
  else if (anchor === 'R') x = W - inR - S * (BASE_W - rect.x);
  else x = W / 2 + S * (rect.x - BASE_W / 2);
  let y;
  if (vAnchor === 'B') y = H - inB - S * (BASE_H - rect.y);
  else y = inT + S * rect.y;
  return { x, y, w, h };
}

// 조작 모드 기준 배치 (1280×720). 버튼 사이 최소 8 이상, 주요 버튼 88 이상 (S=0.5에서 44px)
export const CTRL = {
  joystick: { x: 40, y: 430, w: 240, h: 240, a: 'L', v: 'B' },
  auto: { x: 283.4, y: 600, w: 84, h: 84, a: 'L', v: 'B' },     // 오른쪽 경계 367.4
  slam: { x: 702, y: 612, w: 96, h: 96, a: 'R', v: 'B' },       // 왼쪽 경계 V−578
  thrust: { x: 806, y: 612, w: 96, h: 96, a: 'R', v: 'B' },
  whirl: { x: 910, y: 612, w: 96, h: 96, a: 'R', v: 'B' },
  attack: { x: 1072, y: 522, w: 156, h: 156, a: 'R', v: 'B' },  // 중심 (1150,600)
  run: { x: 989, y: 488, w: 88, h: 88, a: 'R', v: 'B' },        // 공격 중심 기준 원호 150°
  dodge: { x: 1071, y: 426, w: 88, h: 88, a: 'R', v: 'B' },     // 105°
  guard: { x: 1173, y: 439, w: 88, h: 88, a: 'R', v: 'B' },     // 60°
  mode: { x: 1176, y: 300, w: 88, h: 88, a: 'R', v: 'B' },
};
// 지휘 모드: 카드 줄 왼쪽 정렬(24부터), 오른쪽에 큰 소환·일괄 합성/판매 열
export const CMD = {
  summon: { x: 1096, y: 566, w: 160, h: 140, a: 'R', v: 'B' },
  merge: { x: 1020, y: 566, w: 56, h: 66, a: 'R', v: 'B' },
  sell: { x: 1020, y: 640, w: 56, h: 66, a: 'R', v: 'B' },
  mode: { x: 1176, y: 300, w: 88, h: 88, a: 'R', v: 'B' },
};
// 상단 공통
export const TOP = {
  hero: { x: 16, y: 12, w: 330, h: 92, a: 'L', v: 'T' },
  info: { x: 450, y: 10, w: 380, h: 64, a: 'C', v: 'T' },
  gold: { x: 900, y: 14, w: 150, h: 56, a: 'R', v: 'T' },
  speed: { x: 1062, y: 12, w: 96, h: 64, a: 'R', v: 'T' },
  pause: { x: 1172, y: 8, w: 88, h: 72, a: 'R', v: 'T' },
  panel: { x: 16, y: 150, w: 300, h: 330, a: 'L', v: 'T' },
  prep: { x: 440, y: 92, w: 400, h: 76, a: 'C', v: 'T' },
};
