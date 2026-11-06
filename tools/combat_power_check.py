# 전투력·능력치 기준표(Google 시트 20261106-claude-plan-전투력-능력치-기준표)와 같은 식을 파이썬으로 계산해 교차 확인한다.
# 시트의 입력값을 바꾸면 이 파일 맨 위 상수도 같이 바꿔서 다시 돌린다.  실행: python3 tools/combat_power_check.py
import math
BASE, SR, RR, MR = 1000, 2.2, 2.3, 0.8
CRIT, BLK, KOFF, KDEF, DEF2HP, DEFR = 2, 0.5, 20, 2.5, 10, 0.03
ASU, CRU, BRU = 0.05, 0.01, 0.01
RANKS = 'EDCBAS'
AS0 = [1.0,1.1,1.2,1.3,1.4,1.5]; CR0 = [.05,.07,.09,.11,.13,.15]; BR0 = [.10,.12,.14,.16,.18,.20]
MAS = [1.0,1.2,1.4,1.7,2.0,2.4]
RB_R = [0,0,0,1,1,2]; RB_S = [0,0,0,1,1]
# 병과: 공격비중, 공속배율, 기본사거리, 사거리성장, 추가피해율, 추가대상기대, 거리가치, 기타보정
CL = {'검사':(.5,1,1,0,0,0,1,1),'창병':(.55,.5,2,0,.5,.6,1.25,1.05),'기병':(.55,.8,1,0,.8,1,1.1,1.1),'궁수':(.7,1,3,1,0,0,2.8,1),
      '사수':(.75,.5,3,1,.7,.5,2.8,1),'마법사':(.75,.5,3,1,.6,1.5,2.8,.85),'힐러':(.4,.8,2,1,0,0,2,1),'바드':(.4,1,2,1,0,0,2,1)}
def cp(r,s): return BASE*RR**r*SR**(s-1)
def stats(c,r,s):
    o,asm,rng,g,ad,ae,dv,etc = CL[c]; K=(1+ad*ae)*dv*etc
    E=cp(r,s); AS=AS0[r]*(1+ASU*(s-1))*asm; CR=CR0[r]+CRU*(s-1); BR=BR0[r]+BRU*(s-1)
    ATK=E*o/(KOFF*AS*(1+CR*(CRIT-1))*K); HP=E*(1-o)/KDEF/(1/(1-BR*BLK)+DEFR*DEF2HP); DEF=HP*DEFR
    R=rng+(RB_R[r]+RB_S[s-1] if g else 0)
    return dict(E=E,AS=AS,CR=CR,BR=BR,ATK=ATK,HP=HP,DEF=DEF,R=R,K=K)
print('rule checks:', all(cp(r,1)>cp(r-1,2) and cp(r,1)<cp(r-1,3) for r in range(1,6)), SR>=2.1)
for r in range(6):
    print(RANKS[r], [round(cp(r,s)) for s in range(1,6)])
def mon(r,s):
    h=stats('검사',r,s); return dict(HP=h['HP']*MR,ATK=h['ATK']*MR,DEF=h['DEF']*MR,AS=MAS[r],MV=MAS[r])
print('\n검사 E', [(s, {k:round(v,2) for k,v in stats('검사',0,s).items()}) for s in (1,5)])
print('검사 S5', {k:round(v,1) for k,v in stats('검사',5,5).items()})
print('\nE검증: 행=검사 성급, 열=몬스터 성급 / 단독 처치시간(초)')
for hs in range(1,6):
    h=stats('검사',0,hs); row=[]
    for ms in range(1,6):
        m=mon(0,ms); d=h['ATK']-m['DEF']; row.append('불가' if d<=0 else round(math.ceil(m['HP']/d-1e-9)/h['AS'],2))
    print(hs, row)
print('단독 방어시간(초)')
for hs in range(1,6):
    h=stats('검사',0,hs); row=[]
    for ms in range(1,6):
        m=mon(0,ms); d=m['ATK']-h['DEF']; row.append('무한' if d<=0 else round(math.ceil(h['HP']/d-1e-9)/m['AS'],2))
    print(hs, row)
print('\n합성 체감: 같은 몬스터(성급 m) 처치시간 — 하위 2명 합동 vs 상위 1명 단독')
for s in range(1,5):
    for ms in (s, s+1):
        lo=stats('검사',0,s); hi=stats('검사',0,s+1); m=mon(0,ms)
        t=lambda h:(math.ceil(m['HP']/(h['ATK']-m['DEF'])-1e-9)/h['AS']) if h['ATK']>m['DEF'] else float('inf')
        print(f'{s}성x2 vs {s+1}성 (몬스터 {ms}성):', round(t(lo)/2,2), round(t(hi),2))
print('\n랭크 체감: E2 vs D1 vs E3 (E1 몬스터 단독 처치시간)')
m=mon(0,1)
for (r,s) in [(0,2),(1,1),(0,3)]:
    h=stats('검사',r,s); print(RANKS[r],s, round(math.ceil(m['HP']/(h['ATK']-m['DEF'])-1e-9)/h['AS'],2), 'ATK',round(h['ATK'],1),'HP',round(h['HP'],1))
print('\n병과 E1 비교')
for c in CL: s=stats(c,0,1); print(c, {k:round(v,2) for k,v in s.items()}, '검사 대비 ATK', round(s['ATK']/stats('검사',0,1)['ATK'],2))
