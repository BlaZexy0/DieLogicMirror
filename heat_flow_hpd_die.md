# Heat-flow equations and calculation logic for a high-pressure die-casting (HPDC) die

## Source basis

This note is a transcription and consolidation of the heat-flow equations and calculation logic contained in the two supplied scanned sources:

- **Source A:** `Scan_20260822_134829.pdf`, Chapter 5, *Temperiersystem der Druckgießform* (printed pp. 295–319 in the supplied excerpt).
- **Source B:** `Scan_20260822_140034.pdf`, Chapter 12, *Heizung und Kühlung der Druckgießformen mit Temperiergeräten* (printed pp. 686–707 in the supplied excerpt).

The notation below follows the sources as closely as possible. Equation numbers in parentheses are the source equation numbers, not new numbering.

> **Important scope:** The sources use a cycle-level thermal balance and reduced/empirical heat-transfer relations. They do not present a full 3-D transient conduction PDE for the die steel. The equations below therefore give the **lumped heat-flow network and design logic** used by the sources to determine how much heat enters the die, how much leaves naturally to the surroundings, and how much must be removed through the tempering/cooling channels.

---

## 1. Core heat balance of the die

### 1.1 Total balance

The central relation is the cycle-level heat balance:

$$
Q = Q_U + Q_T
\tag{5.2 / 12.1}
$$

where

- $Q$ = heat transferred into the die from the casting during one cycle,
- $Q_U$ = heat rejected from the die to the surroundings,
- $Q_T$ = heat rejected by the die tempering system / heat-transfer fluid.

This is the primary equation for determining the required tempering heat-removal duty:

$$
\boxed{Q_T = Q - Q_U}
$$

The same logic is expressed in Source B as

$$
Q = Q_U + Q_{Ts},
\tag{12.1}
$$

where $Q_{Ts}$ is the heat removed by the tempering system.

### 1.2 Heat input from the casting

For a casting volume $V$, liquid-state density $\rho_L$, latent heat $h_f$, and mean heat capacities $c_l$ and $c_m$, the heat transferred from the casting to the die is

$$
Q
=
V\rho_L
\left[
 h_f + c_l(t_L-t_S) + c_m(t_S-t_e)
\right].
\tag{12.2}
$$

Equivalent simplified source relation:

$$
Q=qG,
\tag{5.3}
$$

where $q$ is the heat per unit mass associated with the alloy and ejection temperature, and $G$ is the mass of metal entering the shot/casting system.

The source then defines the tempering-system power requirement from the cycle heat removed through the tempering system:

$$
P_T = \frac{Q_T}{\tau_z}
     = k\frac{Q}{\tau_z}
     = k\,q\frac{G}{\tau_z}.
\tag{5.4}
$$

Here $\tau_z$ is the cycle time and $k=Q_T/Q$ is the fraction of casting heat removed by the tempering system.

---

## 2. Heat leaving the die by all non-tempering paths

Source A groups the natural/environmental heat loss as

$$
Q_U = Q_{Kon}+Q_{Pl}+Q_{Nz},
\tag{5.11}
$$

where:

- $Q_{Kon}$ = heat to ambient air by free convection + radiation,
- $Q_{Pl}$ = heat conducted through/contacting the machine platen interfaces,
- $Q_{Nz}$ = heat removed during the secondary/non-productive part of the cycle.

Source B gives a more detailed decomposition:

$$
Q_U = Q_{Kon}+Q_{Str}+Q_{Pl}+Q_{Luft}+Q_{Bl}+Q_{Spr}.
\tag{12.6}
$$

Thus, for a detailed cycle model, use:

$$
\boxed{
Q_T
=
Q-
\left(
Q_{Kon}+Q_{Str}+Q_{Pl}+Q_{Luft}+Q_{Bl}+Q_{Spr}
\right)
}
$$

The grouped form in Source A is useful when the detailed sub-processes are represented by measured/equivalent coefficients.

---

## 3. Free convection from the die outside surfaces

Source B uses Newton's heat-transfer relation:

$$
Q_{Kon}
=
\alpha_{kon}A_{fa}\tau_z(t_{fa}-t_{luft}).
\tag{12.7}
$$

For the free-convection coefficient, the source gives

$$
\alpha_{kon}
=
0.12\,\lambda_{luft}
\left[
\frac{g\,\beta_{luft}}
{\nu_{luft}^{2}}
(t_{fa}-t_{luft})
\right]^{1/3}.
\tag{12.8}
$$

Use air properties at an intermediate temperature between the die outside surface and ambient air when applying this relation.

Source A also gives the practical combined convection+radiation relation

$$
Q_{Kon}
=
\alpha_{Kon+Str}A_{Af}\tau_z(T_{Af}-T_{Luft}).
\tag{5.12}
$$

and, for the example geometry/conditions in that source,

$$
Q_{Kon}=1.8\,\tau_z\,L(B+H)\quad[\mathrm{kJ}],
\tag{5.14a}
$$

when $L$, $B$, and $H$ are entered in metres and $\tau_z$ in seconds.

---

## 4. Thermal radiation from die outside surfaces

Source B treats radiation in parallel with natural convection. The radiation heat removed is

$$
Q_{Str}
=
\alpha_{Str}A_{fl}\tau_z(t_{fa}-t_{luft}),
\tag{12.9}
$$

with an effective radiation coefficient

$$
\alpha_{Str}
=
\frac{c_{Str}\,\varepsilon}{t_{fa}-t_{luft}}
\left[
\left(\frac{t_{fa}+273}{100}\right)^4
-
\left(\frac{t_{luft}+273}{100}\right)^4
\right].
$$

The source defines $c_{Str}=5.77\ \mathrm{W/(m^2\,K^4)}$ in its adopted form and $\varepsilon$ as the emissivity.

Because convection and radiation act in parallel, their heat rates are added.

---

## 5. Heat loss through the machine platen contact

Source B gives

$$
Q_{Pl}
=
\alpha_k\tau_z
\left[
A_{k1}(t_{fa1}-t_{pl1})
+
A_{k2}(t_{fa2}-t_{pl2})
\right].
\tag{12.10}
$$

Source A writes the same mechanism in a general contact formulation:

$$
Q_{Pl}
=
\alpha_kA_{Ko}\tau_z
\left(
T_{Kf1}+T_{Kf2}-T_{Km1}-T_{Km2}
\right).
\tag{5.13}
$$

A simple lower-bound estimate of the contact coefficient is

$$
\alpha_k=\frac{\lambda_{luft}}{\delta_k},
\tag{12.11}
$$

where $\delta_k$ is the mean gap between the contact faces.

The source emphasizes that the real contact coefficient is strongly affected by geometry, contact pressure, roughness/flatness and the actual contact area, and is therefore often taken from empirical data.

A more detailed heat-balance estimate given by Source B is

$$
\alpha_k
=
(\alpha_{kon}+\alpha_{str})
\frac{A_{pl1}}{A_{k1}}
\frac{t_{pl1}-t_{luft}}{t_{fa1}-t_{pl1}}.
\tag{12.12}
$$

---

## 6. Heat carried by hot air between opened die halves

When the die opens, the air trapped between the halves is heated and then leaves with sensible energy:

$$
Q_{Luft}
=
\rho_{luft}c_{luft}V_{luft}
(t_{luft1}-t_{luft}).
\tag{12.13}
$$

With the source's simplified air-property assumptions,

$$
Q_{Luft}
=
V_{luft}(t_{luft1}-t_{luft})
\quad[\mathrm{kJ/(K\,m^3)}].
\tag{12.14}
$$

This term represents a discrete, cycle-stage loss rather than continuous heat rejection over the full cycle.

---

## 7. Forced-convection heat loss during blow-off / air blast

The heat removed from the form cavity surfaces by forced air during the blow phase is

$$
Q_{Bl}
=
\alpha_{bl}A_{fgr}\tau_{bl}
\left(
\frac{t_e+t_{f0min}}{2}-t_{luft2}
\right).
\tag{12.15}
$$

For a flat plate with turbulent air flow, the source gives

$$
\alpha_{bl}
=
0.0316\,
\frac{\lambda_{luft}}{l_f^{0.2}}
\left(\frac{w_{luft}}{\nu_{luft}}\right)^{0.8}.
\tag{12.16}
$$

The source also supplies empirical $\alpha_{bl}$ tables versus air speed and die-surface temperature.

---

## 8. Heat removed by water-miscible die-release-agent spraying

The source treats the water-containing release agent as first being heated and then evaporating. The general form is

$$
Q_{Spr}
=
 m_1c_{ts}(t_{sd}-t_{ts})+m_2h_{ts}.
\tag{12.17}
$$

If the entire mass is assumed to evaporate,

$$
Q_{Spr}
=
 m_1\left[h_{ts}+c_{ts}(t_{sd}-t_{ts})\right].
\tag{12.18}
$$

A practical geometric/temperature-difference approximation is

$$
Q_{Spr}
=
0.5\,\rho_f c_f A_{fgr}x_0(t_{spr1}-t_{spr2}).
\tag{12.19}
$$

The source combines this with the energy required to heat/evaporate the spray to estimate the spray mass:

$$
 m_1
=
\frac{1}{2}
\frac{\rho_f c_fA_{fgr}x_0(t_{spr1}-t_{spr2})}
{h_{ts}+c_{ts}(t_{sd}-t_{ts})}.
\tag{12.20}
$$

A practical special case in Source B is

$$
 m_1
=
0.744\,A_{fgr}x_0(t_{spr1}-t_{spr2})\quad[\mathrm{kg}],
\tag{12.21}
$$

and, when the total spray mass is known,

$$
Q_{Spr}=2594\,m_1\quad[\mathrm{kJ}].
\tag{12.22}
$$

Source A also gives an empirically simplified form in its example:

$$
Q_{Spr}=2.594\,m\quad[\mathrm{kJ}],
\tag{5.17}
$$

and

$$
 m
=\frac{Q_{Nz}}{2.594}
\approx0.1(\Delta V_1+\Delta V_2)\quad[\mathrm{g}],
\tag{5.18}
$$

with the stated source-specific units/assumptions.

---

## 9. Sensible heat removed from the heated die skin during the non-productive part of the cycle

Source A models the cooling of the heated surface layers during die opening/non-productive time with

$$
Q_{Nz}
=
0.5\,c_F\rho_F(\Delta V_1+\Delta V_2)(T_E-T_F).
\tag{5.15}
$$

This is a useful correction when the cavity-surface layer is much hotter than the steady form temperature and is cooled between shots.

For one source-specific steel-property set,

$$
Q_{Nz}=0.24(\Delta V_1+\Delta V_2)\quad[\mathrm{kJ}],
\tag{5.16}
$$

when the volumes are entered in $\mathrm{cm^3}$.

---

# 10. Heat flow from the cavity surface to the tempering channels

This is the most important part for determining **where the heat must go inside the die**.

## 10.1 Conduction from cavity to a single cooling channel

Source A models heat conduction from the hot cavity surface to the cooling channel as radial conduction through the die steel:

$$
Q_{K\lambda}
=
\frac{2\pi\lambda_Fl_K\tau_z}
{\ln\left(\dfrac{4a}{d}\right)}
\left(T_{Fo}-T_F\right).
\tag{5.20}
$$

where

- $\lambda_F$ = thermal conductivity of the die steel,
- $l_K$ = effective cooling-channel length in the thermally active region,
- $a$ = distance from channel centreline to cavity surface,
- $d$ = channel diameter,
- $T_{Fo}$ = mean cavity-surface temperature during the cycle,
- $T_F$ = die/channel-wall temperature used in the model.

The average cavity-surface temperature is approximated as

$$
T_{Fo}=\frac{T_{Fomax}+T_F}{2}.
\tag{5.21}
$$

For several channel paths in series, Source A gives the corresponding conduction relation

$$
Q_{K\lambda}
=
\frac{2\pi\lambda_Fl_K\tau_z}
{\dfrac{2\pi a}{b}+\ln\left(\dfrac{b}{\pi d}\right)}
\left(T_{Fo}-T_F\right),
\tag{5.25}
$$

where $b$ is the distance between adjacent channel centrelines.

### Interpretation

The denominator represents the thermal resistance of the die steel between the cavity and the channel network. Increasing channel density (smaller $a$ and appropriate $b$) reduces this resistance and increases the heat that can reach the tempering system.

---

## 10.2 Convection from the channel wall to the heat-transfer fluid

Once heat reaches a channel wall, the source uses two equivalent descriptions.

### Wall heat-transfer relation

$$
Q_{K\alpha}
=
\alpha A_K\tau_z(T_F-T_{Fl}).
\tag{5.22}
$$

### Fluid-side energy balance

$$
Q_{K\Delta T}
=
\rho c\dot V\tau_z\Delta T.
\tag{5.23}
$$

with

$$
A_K=\pi dL_K,
\qquad
A=\frac{\pi}{4}d^2,
\qquad
\dot V=Aw,
$$

and

$$
T_{Fl}=T_V+\frac{\Delta T}{2},
\qquad
\Delta T=T_R-T_V.
$$

Here

- $A_K$ = total internal channel-wall area,
- $L_K$ = total channel length in a die half,
- $\dot V$ = volumetric flow rate,
- $w$ = mean fluid velocity,
- $T_V$ = supply/inlet temperature,
- $T_R$ = return/outlet temperature.

For the two die halves, the total extracted heat must be large enough to satisfy the die-side heat supply.

---

## 10.3 Required heat-removal conditions for both die halves

Source A states the governing sufficiency conditions as

$$
Q_{K\lambda1}+Q_{K\lambda2}\ge Q_T,
\tag{5.26a}
$$

$$
Q_{K\alpha1}+Q_{K\alpha2}\ge Q_T,
\tag{5.26b}
$$

$$
Q_{K\Delta T1}+Q_{K\Delta T2}\ge Q_T.
\tag{5.26c}
$$

These three checks correspond to the three limiting stages of the heat path:

1. heat must be able to conduct through the die steel to the channels,
2. the channel wall must be able to transfer heat to the fluid,
3. the fluid must have enough mass flow and temperature rise to carry the heat away.

In practice, all three must be satisfied.

---

# 11. Heat-transfer coefficient of the tempering fluid

For fully turbulent flow in the tempering channel, the source requires

$$
Re\ge 10^4.
\tag{5.8 / source criterion}
$$

The channel velocity required to achieve this is

$$
w=Re\frac{\nu}{d}
\ge 10000\frac{\nu}{d}.
\tag{5.8}
$$

For turbulent flow, the source uses

$$
\alpha
=
0.023\frac{\lambda}{d}Re^{0.8}Pr^{0.4}.
\tag{5.24}
$$

where $\lambda$ is the thermal conductivity of the heat-transfer fluid and $Pr$ is the Prandtl number.

This relation is the key bridge between the **fluid velocity / channel diameter** and the **wall-to-fluid heat-transfer capacity**.

---

# 12. Flow rate needed in the die halves

For circular channels,

$$
A=\frac{\pi}{4}d^2.
$$

If $n_1$ circuits are used in the moving half and $n_2$ circuits in the fixed half,

$$
\dot V_1=n_1Aw,
\qquad
\dot V_2=n_2Aw.
\tag{5.9}
$$

For a single tempering unit serving both halves,

$$
\dot V_P=\dot V_1+\dot V_2.
$$

Source A gives the corresponding power relations

$$
P_{T1}=c\rho\dot V_1(T_{R1}-T_{V1}),
$$

$$
P_{T2}=c\rho\dot V_2(T_{R2}-T_{V2}),
\tag{5.5}
$$

and, for one tempering unit,

$$
\dot V_P=\dot V_1+\dot V_2,
\qquad
P_K\ge P_T=P_{T1}+P_{T2}.
\tag{5.6}
$$

---

# 13. Pressure-loss constraint on heat-flow capacity

Heat-removal capacity cannot be specified independently of pumping power. Source A therefore couples flow rate and heat transfer to the circuit pressure loss.

For one circuit,

$$
\xi_K
=0.03\frac{L_K}{d}+\sum_{i=1}^{n}\xi_i,
$$

$$
\Delta p
=\frac{\rho}{2}\xi_Kw^2,
$$

$$
\dot V=Aw,
\qquad
A=\frac{\pi}{4}d^2.
\tag{5.27}
$$

For two parallel circuits with unequal resistance,

$$
\Delta p
=\frac{\rho}{2}\xi_{K1}w_1^2,
$$

$$
w_2
=w_1\sqrt{\frac{\xi_{K1}}{\xi_{K2}}},
$$

$$
\dot V=A(w_1+w_2).
\tag{5.28}
$$

The complete die-half pressure loss includes supply and return hose losses:

$$
\Delta p_T
=\Delta p+\Delta p_V+\Delta p_R.
\tag{5.29}
$$

A simple approximate pump-curve check from Source A is

$$
\dot V_{Pmax}\approx2\dot V_P,
$$

$$
 p_P
=p_{Pmax}\left(1-\frac{\dot V_P}{\dot V_{Pmax}}\right)
\ge\Delta p_T.
\tag{5.10}
$$

---

# 14. Warm-up / transient temperature of the die

The same heat-flow network is used by Source A for initial die warm-up.

The differential energy balance is

$$
 dQ_{K\alpha}=dQ_H+dQ_{Kon}+dQ_{Pl}.
\tag{5.31}
$$

Fluid-to-channel-wall heating input:

$$
 dQ_{K\alpha}
=\alpha A_K(T_{Fl}-T_F)\,d\tau_H.
\tag{5.32}
$$

Heating of the die mass:

$$
 dQ_H=c_Fm_F\,dT_F.
\tag{5.33}
$$

Ambient convection+radiation and machine-platen losses are

$$
 dQ_{Kon+Str}
=\alpha_{Kon+Str}A_{Af}(T_F-T_{Luft})\,d\tau_H,
$$

$$
 dQ_{Pl}
=\alpha_KA_{Ko}(T_F-T_{Luft})\,d\tau_H,
\tag{5.34}
$$

with source geometry definitions

$$
A_{Af}=2L(B+H),
\qquad
A_{Ko}=2BH.
$$

Integration yields the die temperature during warm-up:

$$
T_F
=
T_{Luft}
+
\eta(T_{Fl}-T_{Luft})
\left[1-\exp(-\psi\tau_H)\right],
\tag{5.35}
$$

where

$$
B=\alpha A_K+\alpha_{Kon+Str}A_{Af}+\alpha_KA_{Ko},
$$

$$
\eta=\frac{\alpha A_K}{B},
\qquad
\psi=\frac{B}{c_Fm_F}.
$$

The maximum asymptotic warm-up temperature and a characteristic maximum warm-up time are

$$
T_{Fmax}=T_{Luft}+\eta(T_{Fl}-T_{Luft}),
$$

$$
\tau_{Hmax}=\frac{3}{\psi}=\frac{3c_Fm_F}{B}.
\tag{5.36}
$$

The corresponding heating power estimate is

$$
P_H
=\frac{\alpha A_K}{3}(T_{Fl}-T_{Luft}).
\tag{5.37}
$$

This transient model is useful because it shows explicitly that a large heater cannot compensate for poor channel arrangement, insufficient area, low flow, or excessive external heat losses.

---

# 15. Detailed Source-B calculation sequence for one HPDC cycle

Source B provides a directly programmable algorithm. The recommended sequence is:

### Step 1 — Compute heat entering the die from the casting

Use

$$
Q
=
V\rho_L
\left[h_f+c_l(t_L-t_S)+c_m(t_S-t_e)\right].
$$

For the example in Source B, the average heat capacities are formed as

$$
c_l=0.5(c_S+c_L),
$$

and

$$
c_m
=c_{20}
+
\frac{t_S+t_e-40}{2t_S-40}(c_S-c_{20}).
$$

These are source-specific interpolation formulas for the example alloy data.

### Step 2 — Compute all non-tempering losses

Calculate, as applicable,

$$
Q_{Kon}=\alpha_{kon}A_{fa}\tau_z(t_{fa}-t_{luft}),
$$

$$
Q_{Str}=\alpha_{Str}A_{fl}\tau_z(t_{fa}-t_{luft}),
$$

$$
Q_{Pl}=\alpha_k\tau_z\left[A_{k1}(t_{fa1}-t_{pl1})+A_{k2}(t_{fa2}-t_{pl2})\right],
$$

$$
Q_{Luft}=\rho_{luft}c_{luft}V_{luft}(t_{luft1}-t_{luft}),
$$

$$
Q_{Bl}=\alpha_{bl}A_{fgr}\tau_{bl}
\left(\frac{t_e+t_{f0min}}{2}-t_{luft2}\right),
$$

$$
Q_{Spr}=2594m_1\quad[\mathrm{kJ}]
$$

(or the full spray-energy equations in Section 8).

Then sum

$$
Q_U
=Q_{Kon}+Q_{Str}+Q_{Pl}+Q_{Luft}+Q_{Bl}+Q_{Spr}.
$$

### Step 3 — Determine heat the tempering system must remove

$$
\boxed{Q_T=Q-Q_U}
$$

and average thermal duty over the casting cycle:

$$
P_T=\frac{Q_T}{\tau_z}.
$$

### Step 4 — Check die-side conduction capacity

For each half/cooling-channel group evaluate $Q_{K\lambda}$ using either (5.20) or the multi-channel form (5.25), then check

$$
Q_{K\lambda1}+Q_{K\lambda2}\ge Q_T.
$$

### Step 5 — Check channel-wall convection

Compute Reynolds number and heat-transfer coefficient:

$$
Re=\frac{wd}{\nu},
$$

$$
\alpha=0.023\frac{\lambda}{d}Re^{0.8}Pr^{0.4}.
$$

Then evaluate

$$
Q_{K\alpha}=\alpha A_K\tau_z(T_F-T_{Fl})
$$

and verify

$$
Q_{K\alpha1}+Q_{K\alpha2}\ge Q_T.
$$

### Step 6 — Check fluid heat-capacity / temperature-rise capacity

Compute

$$
Q_{K\Delta T}=\rho c\dot V\tau_z\Delta T,
$$

with

$$
\Delta T=T_R-T_V,
$$

and verify

$$
Q_{K\Delta T1}+Q_{K\Delta T2}\ge Q_T.
$$

The source recommends keeping the inlet-to-return temperature difference small enough to preserve a sufficiently uniform die temperature; the stated practical design criterion is approximately

$$
\Delta T\lesssim10\ ^\circ\mathrm{C}
$$

for the tempering fluid, with the exact chosen value depending on the system and design objective.

### Step 7 — Check pressure loss and pump capability

Use

$$
\Delta p_T=\Delta p+\Delta p_V+\Delta p_R
$$

and the pump relation/curve to ensure the selected flow rate is actually achievable.

---

# 16. Compact heat-flow network

The two sources can be reduced to the following physical network for each casting cycle:

$$
\boxed{
Q_{casting}
\longrightarrow
\begin{cases}
Q_{ambient}:&\text{free convection + radiation}\\[2mm]
Q_{platen}:&\text{contact/conduction to machine}\\[2mm]
Q_{air/blow}:&\text{opened-die air + blow-off}\\[2mm]
Q_{spray}:&\text{release-agent heating + evaporation}\\[2mm]
Q_{tempering}:&\text{die conduction}\rightarrow\text{channel convection}\rightarrow\text{fluid transport}
\end{cases}
}
$$

with the governing closure

$$
Q_{casting}
=
Q_{ambient}
+Q_{platen}
+Q_{air/blow}
+Q_{spray}
+Q_{tempering}.
$$

The tempering path itself is limited by three capacities in series:

$$
\boxed{
Q_{tempering}
\le
\min
\left(
Q_{die\rightarrow channel},
Q_{wall\rightarrow fluid},
Q_{fluid\ transport}
\right)
}
$$

That is the key logic for determining the actual heat flow through an HPDC die from the supplied source material.

---

# 17. Variables most important for die thermal design

The equations show that the dominant design levers are:

- **Casting heat input:** $V$, $\rho_L$, alloy enthalpy/latent heat, $t_L$, $t_S$, $t_e$, cycle time $\tau_z$.
- **Die geometry:** channel diameter $d$, channel-to-cavity distance $a$, channel pitch $b$, effective channel length $l_K$, total area $A_K$.
- **Die material:** thermal conductivity $\lambda_F$, density $\rho_F$, heat capacity $c_F$.
- **Fluid:** density $\rho$, heat capacity $c$, conductivity $\lambda$, viscosity/kinematic viscosity $\nu$, Prandtl number $Pr$, inlet temperature $T_V$, flow speed $w$.
- **Surface losses:** $\alpha_{Kon}$, $\alpha_{Str}$, emissivity $\varepsilon$, external area, platen-contact coefficient $\alpha_k$.
- **Process timing:** $\tau_z$, blow time $\tau_{bl}$, non-productive time, spray duration and spray mass.
- **Hydraulics:** circuit resistance $\xi_K$, pressure loss $\Delta p_T$, and the pump operating point.

---

## 18. Practical calculation order

For implementation in a spreadsheet, Python script, 1-D thermal network, or reduced-order simulation, the source equations imply the following order:

1. **Input alloy and shot data** and compute $Q$ from the casting.
2. **Define the die geometry and cycle**.
3. **Compute natural and process-stage losses** ($Q_{Kon}$, $Q_{Str}$, $Q_{Pl}$, $Q_{Luft}$, $Q_{Bl}$, $Q_{Spr}$).
4. **Close the cycle heat balance** to obtain $Q_T$.
5. **Distribute $Q_T$ between die halves/circuits**.
6. **Check conduction capacity** from cavity to channel.
7. **Select $d$, $w$, and $\dot V$** so that $Re\ge10^4$ and $\alpha$ is sufficient.
8. **Check fluid-side heat capacity** using $Q_{K\Delta T}$.
9. **Check pressure loss / pump capability**.
10. **For start-up**, use the transient warm-up model (5.35–5.37).
11. **For steady cycling**, require the tempering heat removed to balance the net heat input so that the die reaches the desired thermal equilibrium.

---

## 19. Source-reference map

| Topic | Source equation(s) | Main location in supplied scan |
|---|---|---|
| Global heat balance | (5.2), (12.1) | Source A printed p. 295; Source B printed p. 688 |
| Casting heat input | (5.3), (12.2) | A p. 296; B p. 688 |
| Tempering duty | (5.4), (5.6), (5.7) | A pp. 296–297 |
| Turbulent flow criterion | (5.8) | A p. 297 |
| Flow rates | (5.9) | A p. 297 |
| Pump/system pressure check | (5.10), (5.27)–(5.29) | A pp. 300, 312–313 |
| Ambient-loss grouping | (5.11)–(5.14) | A pp. 301–303 |
| Skin-layer/non-productive cooling | (5.15)–(5.18) | A p. 304–305 |
| Die-to-channel conduction | (5.20)–(5.21), (5.25) | A pp. 306–308 |
| Wall-to-fluid transfer | (5.22)–(5.24) | A pp. 306–308 |
| Design sufficiency conditions | (5.26) | A p. 309 |
| Warm-up transient | (5.31)–(5.37) | A pp. 317–318 |
| Detailed convection | (12.7), (12.8) | B p. 695–696 |
| Radiation | (12.9) | B p. 696 |
| Platen contact | (12.10)–(12.12) | B pp. 698–700 |
| Open-die air | (12.13), (12.14) | B p. 701 |
| Blow cooling | (12.15), (12.16) | B pp. 701–702 |
| Spray cooling | (12.17)–(12.22) | B pp. 703–705 |

---

## 20. Main equations to implement first

For a compact engineering model, the minimum set is:

$$
Q=V\rho_L\left[h_f+c_l(t_L-t_S)+c_m(t_S-t_e)\right]
$$

$$
Q_U=Q_{Kon}+Q_{Str}+Q_{Pl}+Q_{Luft}+Q_{Bl}+Q_{Spr}
$$

$$
Q_T=Q-Q_U
$$

$$
Q_{K\lambda}
=\frac{2\pi\lambda_Fl_K\tau_z}
{\ln(4a/d)}(T_{Fo}-T_F)
$$

$$
Q_{K\alpha}=\alpha A_K\tau_z(T_F-T_{Fl})
$$

$$
Q_{K\Delta T}=\rho c\dot V\tau_z(T_R-T_V)
$$

$$
\alpha=0.023\frac{\lambda}{d}Re^{0.8}Pr^{0.4},
\qquad
Re=\frac{wd}{\nu}
$$

$$
\dot V=Aw,
\qquad
A=\frac{\pi}{4}d^2
$$

$$
\Delta p_T=\Delta p+\Delta p_V+\Delta p_R
$$

subject to

$$
Q_{K\lambda1}+Q_{K\lambda2}\ge Q_T,
$$
$$
Q_{K\alpha1}+Q_{K\alpha2}\ge Q_T,
$$
$$
Q_{K\Delta T1}+Q_{K\Delta T2}\ge Q_T.
$$

These equations form the source-supported core for calculating the heat flow and required cooling/tempering capacity of an HPDC die.
