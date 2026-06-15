(() => {
    "use strict";

    // ─── Constants ────────────────────────────────────────────────────────────

    const STORAGE_KEY = "lifepod-pwa-state-v1";

    const VISA_COLORS = [
        { id: "red",    name: "Red",    card: "0001", hex: "#d93649" },
        { id: "blue",   name: "Blue",   card: "0002", hex: "#2369d9" },
        { id: "green",  name: "Green",  card: "0003", hex: "#179e66" },
        { id: "yellow", name: "Yellow", card: "0004", hex: "#d79c18" }
    ];

    const CAR_TYPES = {
        economy: { id: "economy", name: "Economy Car", cost: 10000,  moveBonus: 1, lifePerTurn: 100 },
        luxury:  { id: "luxury",  name: "Luxury Car",  cost: 50000,  moveBonus: 2, lifePerTurn: 200 }
    };
    const CAR_LIST = Object.values(CAR_TYPES);

    const HOUSE_TYPES = {
        modest:   { id: "modest",   name: "Modest House",    cost: 200000  },
        midsized: { id: "midsized", name: "Mid-sized House", cost: 500000  },
        mansion:  { id: "mansion",  name: "Mansion",         cost: 1000000 }
    };
    const HOUSE_LIST = Object.values(HOUSE_TYPES);

    // Ring buttons — 11 positions clockwise from top.
    // Indices 0-10 match the physical device digit/function labels.
    const POD_BUTTONS = [
        { key: "salary",   number: "0",  label: "SALARY"   },
        { key: "lottery",  number: "1",  label: "LOTTERY"  },
        { key: "chance",   number: "2",  label: "CHANCE"   },
        { key: "marriage", number: "3",  label: "MARRIAGE" },
        { key: "digit-4",  number: "4",  label: "4"        },
        { key: "house",    number: "5",  label: "HOUSE"    },
        { key: "car",      number: "6",  label: "CAR"      },
        { key: "baby",     number: "7",  label: "BABY"     },
        { key: "volume",   number: "8",  label: "VOLUME"   },
        { key: "digit-9",  number: "9",  label: "9"        },
        { key: "years",    number: "10", label: "YEARS"    }
    ];

    // Button indices for the spinner (1-10 maps to ring button indices 1-10)
    const SPIN_INDICES   = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    // Button indices for 0/1/2 chance rolls (ring button indices 0, 1, 2)
    const CHANCE_INDICES = [0, 1, 2];

    // ─── DOM references ───────────────────────────────────────────────────────

    const dom = {
        setupView:        document.querySelector("#setupView"),
        gameView:         document.querySelector("#gameView"),
        setupForm:        document.querySelector("#setupForm"),
        playerCount:      document.querySelector("#playerCount"),
        setupYears:       document.querySelector("#setupYears"),
        playerSetupGrid:  document.querySelector("#playerSetupGrid"),
        resumeButton:     document.querySelector("#resumeButton"),
        resetButton:      document.querySelector("#resetButton"),
        saveButton:       document.querySelector("#saveButton"),
        yearsLeft:        document.querySelector("#yearsLeft"),
        activeCard:       document.querySelector("#activeCard"),
        lastSpin:         document.querySelector("#lastSpin"),
        playerList:       document.querySelector("#playerList"),
        functionRing:     document.querySelector("#functionRing"),
        cardSlot:         document.querySelector("#cardSlot"),
        screenMode:       document.querySelector("#screenMode"),
        screenValue:      document.querySelector("#screenValue"),
        screenHint:       document.querySelector("#screenHint"),
        ledger:           document.querySelector("#ledger"),
        clearLedgerButton:document.querySelector("#clearLedgerButton"),
        finalButton:      document.querySelector("#finalButton"),
        finalDialog:      document.querySelector("#finalDialog"),
        finalResults:     document.querySelector("#finalResults"),
        runFinalButton:   document.querySelector("#runFinalButton")
    };

    // ─── Module-level state ───────────────────────────────────────────────────

    let state = normalizeState(loadState());
    let ledgerFilterCleared = false;
    let isAnimating = false; // blocks all input while spinner/chance/lottery animates
    let litButtonIndex = null; // ring button currently held lit after a spin/chance land

    // ─── Audio engine (Web Audio API — no external files) ─────────────────────

    let audioCtx = null;

    function getAudioCtx() {
        if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        return audioCtx;
    }

    function tone(freq, type, startTime, duration, gain = 0.32) {
        const ctx = getAudioCtx();
        const osc = ctx.createOscillator();
        const env = ctx.createGain();
        osc.connect(env);
        env.connect(ctx.destination);
        osc.type = type;
        osc.frequency.setValueAtTime(freq, startTime);
        env.gain.setValueAtTime(0, startTime);
        env.gain.linearRampToValueAtTime(gain, startTime + 0.005);
        env.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);
        osc.start(startTime);
        osc.stop(startTime + duration + 0.01);
    }

    function sweep(freqStart, freqEnd, type, startTime, duration, gain = 0.22) {
        const ctx = getAudioCtx();
        const osc = ctx.createOscillator();
        const env = ctx.createGain();
        osc.connect(env);
        env.connect(ctx.destination);
        osc.type = type;
        osc.frequency.setValueAtTime(freqStart, startTime);
        osc.frequency.linearRampToValueAtTime(freqEnd, startTime + duration);
        env.gain.setValueAtTime(gain, startTime);
        env.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);
        osc.start(startTime);
        osc.stop(startTime + duration + 0.01);
    }

    function playSound(type) {
        try {
            const ctx = getAudioCtx();
            const t   = ctx.currentTime;
            switch (type) {
                case "tick":
                    tone(220, "triangle", t, 0.04, 0.22);
                    break;

                case "land":
                    tone(110, "triangle", t, 0.14, 0.38);
                    tone(165, "sine",     t + 0.02, 0.1, 0.18);
                    break;
                case "money-add":
                    tone(523, "sine", t,        0.09, 0.28);
                    tone(659, "sine", t + 0.09, 0.09, 0.28);
                    tone(784, "sine", t + 0.18, 0.18, 0.32);
                    break;
                case "money-sub":
                    tone(392, "sine", t,        0.09, 0.28);
                    tone(262, "sine", t + 0.09, 0.14, 0.28);
                    break;
                case "life-add":
                    tone(880, "sine",  t,      0.24, 0.28);
                    tone(1047,"sine",  t + 0.1, 0.18, 0.14);
                    break;
                case "marriage":
                    // "Here Comes the Bride" G G A G motif
                    tone(784, "sine", t,        0.22, 0.32);
                    tone(784, "sine", t + 0.26, 0.12, 0.26);
                    tone(880, "sine", t + 0.40, 0.22, 0.32);
                    tone(784, "sine", t + 0.64, 0.34, 0.36);
                    break;
                case "baby":
                    tone(523, "sine", t,        0.12, 0.26);
                    tone(659, "sine", t + 0.14, 0.18, 0.30);
                    break;
                case "twins":
                    tone(523, "sine", t,        0.1,  0.26);
                    tone(659, "sine", t + 0.12, 0.1,  0.26);
                    tone(784, "sine", t + 0.24, 0.2,  0.32);
                    break;
                case "lottery-sweep":
                    sweep(200, 900, "sawtooth", t, 1.5, 0.18);
                    break;
                case "lottery-win":
                    [523, 659, 784, 1047].forEach((f, i) => tone(f, "sine", t + i * 0.13, 0.2, 0.32));
                    tone(1047, "sine", t + 0.55, 0.5, 0.28);
                    break;
                case "error":
                    tone(440, "square", t,        0.08, 0.18);
                    tone(330, "square", t + 0.12, 0.08, 0.18);
                    break;
                case "undo":
                    sweep(440, 220, "sine", t, 0.16, 0.28);
                    break;
                case "card-insert":
                    tone(880,  "sine", t,        0.04, 0.20);
                    tone(1047, "sine", t + 0.06, 0.07, 0.15);
                    break;
                case "buy":
                    tone(659, "sine", t,       0.1,  0.26);
                    tone(784, "sine", t + 0.1, 0.15, 0.28);
                    break;
                case "sell":
                    tone(784, "sine", t,       0.1,  0.26);
                    tone(523, "sine", t + 0.1, 0.15, 0.22);
                    break;
                case "chance-win":
                    tone(659, "sine", t,       0.1,  0.28);
                    tone(880, "sine", t + 0.1, 0.16, 0.30);
                    break;
            }
        } catch (_) { /* AudioContext unavailable */ }
    }

    // ─── Generic slot-machine animation ───────────────────────────────────────
    //
    // buttonIndices : array of ring-button element indices to cycle through
    // targetPos     : index INTO buttonIndices to land on (0-based)
    // onDone        : callback after landing animation completes
    // tickSound     : which sound to play on each step

    function clearLitButtons() {
        dom.functionRing.querySelectorAll(".ring-button.is-lit")
            .forEach((b) => b.classList.remove("is-lit"));
        litButtonIndex = null;
    }

    function animateOptions(buttonIndices, targetPos, onDone, tickSound = "tick") {
        clearLitButtons(); // clear any previous result before starting
        const buttons   = dom.functionRing.querySelectorAll(".ring-button");
        const count     = buttonIndices.length;
        const minLoops  = 2;
        // How many extra steps from position 0 to reach targetPos
        const extraSteps = ((targetPos % count) + count) % count;
        const totalSteps = minLoops * count + extraSteps;

        let step     = 0;
        let pos      = 0; // current position in buttonIndices (starts before first step)
        let lastTime = performance.now();

        function currentInterval() {
            // Start ~50ms/step, slow to ~320ms/step at end
            const t = step / totalSteps;
            return 50 + (320 - 50) * (t * t);
        }

        function tick() {
            if (!isAnimating) return; // externally cancelled
            const now = performance.now();
            if (now - lastTime < currentInterval()) {
                requestAnimationFrame(tick);
                return;
            }
            lastTime = now;

            buttons[buttonIndices[pos]]?.classList.remove("is-lit");
            pos = (pos + 1) % count;
            buttons[buttonIndices[pos]]?.classList.add("is-lit");
            playSound(tickSound);

            step++;
            if (step < totalSteps) {
                requestAnimationFrame(tick);
            } else {
                // Hold on final position — keep it lit so player can see the result
                setTimeout(() => {
                    litButtonIndex = buttonIndices[pos]; // track for later clearing
                    isAnimating = false;
                    playSound("land");
                    onDone();
                }, 600);
            }
        }

        isAnimating = true;
        requestAnimationFrame(tick);
    }

    // ─── Game state ───────────────────────────────────────────────────────────

    function createGame({ years, players }) {
        return {
            version: 1,
            createdAt: Date.now(),
            yearsTotal: years,
            yearsLeft:  years,
            turnsThisYear:    0,
            activePlayerIndex: 0,
            lastSpin:     null,
            lotteryPot:   10000,
            finalRatio:   randomInt(80, 120),
            finalCalculated: false,
            input: { mode: "ready", sign: 1, buffer: "", subMode: null, index: 0 },
            screen: { mode: "Ready", value: "Insert card", hint: "Tap a Visa card then press SPIN" },
            players: players.map((p, i) => ({
                id:        cryptoId(),
                order:     i + 1,
                name:      p.name || `Player ${i + 1}`,
                color:     VISA_COLORS[i].id,
                colorName: VISA_COLORS[i].name,
                card:      VISA_COLORS[i].card,
                career:         p.career || "",
                salary:         5000,
                money:          0,
                lifePoints:     0,
                children:       0,
                babiesThisYear: 0,
                married:        false,
                degree:         false,
                phd:            false,
                cars:           [],
                houses:         []
            })),
            ledger:    [],
            undoStack: []
        };
    }

    function loadState() {
        try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || "null"); }
        catch { return null; }
    }

    function normalizeState(s) {
        if (!s) return null;
        s.input    ??= { mode: "ready", sign: 1, buffer: "", subMode: null, index: 0 };
        s.input.subMode ??= null;
        s.input.index   ??= 0;
        s.players?.forEach((p, i) => {
            p.order          ??= i + 1;
            p.cars           ??= [];
            p.houses         ??= [];
            p.children       ??= 0;
            p.babiesThisYear ??= 0;
            p.salary         ??= 5000;
            p.money          ??= 0;
            p.lifePoints     ??= 0;
            p.married        ??= false;
            p.degree         ??= false;
            p.phd            ??= false;
        });
        return s;
    }

    function saveState() {
        if (!state) { localStorage.removeItem(STORAGE_KEY); return; }
        localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    }

    function snapshot() { return JSON.parse(JSON.stringify(state)); }

    // ─── Commit / Undo ────────────────────────────────────────────────────────

    function commit(action, detail, mutator) {
        if (!state) return;
        const before       = snapshot();
        const ap           = activePlayer();
        const beforeSum    = ap ? summarizePlayer(ap) : null;
        const beforeMoney  = ap?.money      ?? 0;
        const beforeLife   = ap?.lifePoints ?? 0;

        mutator();

        const ap2 = ap ? getPlayer(ap.id) : null;
        state.ledger.unshift({
            id:       cryptoId(),
            at:       Date.now(),
            playerId: ap?.id || null,
            action, detail,
            before:   beforeSum,
            after:    ap2 ? summarizePlayer(ap2) : null
        });
        if (state.ledger.length > 60) state.ledger.length = 60;
        state.undoStack.push(before);
        if (state.undoStack.length > 50) state.undoStack.shift();
        ledgerFilterCleared = false;
        saveState();

        if (ap2) {
            const dm = ap2.money      - beforeMoney;
            const dl = ap2.lifePoints - beforeLife;
            if (dm !== 0) flashStat("money", dm > 0 ? "up" : "down");
            if (dl !== 0) flashStat("life",  dl > 0 ? "up" : "down");
        }
        render();
    }

    function flashStat(key, dir) {
        setTimeout(() => {
            const card   = dom.playerList.querySelector(".player-card.is-active");
            if (!card) return;
            const target = card.querySelector(`[data-stat="${key}"]`);
            if (!target) return;
            target.classList.remove("is-up", "is-down");
            void target.offsetWidth; // force reflow to restart animation
            target.classList.add(dir === "up" ? "is-up" : "is-down");
            setTimeout(() => target.classList.remove("is-up", "is-down"), 600);
        }, 10);
    }

    function summarizePlayer(p) {
        return {
            money:      Math.round(p.money),
            lifePoints: Math.round(p.lifePoints),
            salary:     Math.round(p.salary),
            children:   p.children,
            cars:       p.cars.length,
            houses:     p.houses.length
        };
    }

    // Cancel selection modes (car/house/baby/lottery) without undoing game state.
    // Normal undo pops the undo stack.
    function handleUndo() {
        if (!state) return;
        clearLitButtons();
        const selModes = ["car-select","house-select","car-buyorsell","house-buyorsell","baby-select","lottery-pending"];
        if (selModes.includes(state.input.mode)) {
            clearInput();
            setScreen("Ready", "Cancelled", "Press SPIN or use the ring buttons");
            renderScreen();
            return;
        }
        if (state.undoStack.length === 0) {
            setScreen("Undo", "Nothing to undo", "History is empty");
            renderScreen();
            playSound("error");
            return;
        }
        state = state.undoStack.pop();
        saveState();
        setScreen("Undo", "Restored", "Last action cancelled");
        playSound("undo");
        render();
    }

    // ─── Player helpers ───────────────────────────────────────────────────────

    function activePlayer() { return state?.players[state.activePlayerIndex] ?? null; }
    function getPlayer(id)  { return state.players.find((p) => p.id === id); }

    // ─── Formatting ───────────────────────────────────────────────────────────

    function formatMoney(n)  {
        return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(Math.round(n));
    }
    function formatNumber(n) { return new Intl.NumberFormat("en-US").format(Math.round(n)); }
    function randomInt(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }
    function cryptoId() { return window.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`; }

    // ─── Screen helpers ───────────────────────────────────────────────────────

    function setScreen(mode, value, hint = "") {
        if (!state) return;
        state.screen = { mode, value, hint };
    }

    function clearInput() {
        state.input = { mode: "ready", sign: 1, buffer: "", subMode: null, index: 0 };
    }

    function inputModeLabel() {
        return { money: "Money", life: "LIFE Points", salary: "Salary", years: "Years" }[state.input.mode] ?? "Ready";
    }

    // ─── Digit / numeric entry ────────────────────────────────────────────────

    function setInputMode(mode, sign = 1) {
        state.input = { mode, sign, buffer: "", subMode: null, index: 0 };
        setScreen(inputModeLabel(), sign < 0 ? "−" : "+", "Enter digits, then ENTER");
        renderScreen();
    }

    function appendDigit(digit) {
        if (!state) return;
        if (!["money","life","salary","years"].includes(state.input.mode)) {
            setScreen("Number", digit, "Choose $, LIFE POINTS, SALARY, or YEARS first");
            renderScreen();
            return;
        }
        if (state.input.mode === "years" && state.input.buffer.length >= 2) return;
        state.input.buffer = `${state.input.buffer}${digit}`.replace(/^0+(?=\d)/, "");
        const sign  = state.input.sign < 0 ? "−" : "+";
        const val   = state.input.buffer || "0";
        const display = (state.input.mode === "life" || state.input.mode === "years")
            ? `${sign}${formatNumber(Number(val))}`
            : `${sign}${formatMoney(Number(val))}`;
        setScreen(inputModeLabel(), display, "Press ENTER to confirm");
        renderScreen();
    }

    function backspaceDigit() {
        if (!state || !state.input.buffer) return;
        state.input.buffer = state.input.buffer.slice(0, -1);
        appendDigit("");
    }

    function confirmInput() {
        if (!state) return;
        const { mode, sign, buffer } = state.input;
        const amount = Number(buffer || 0);

        if (mode === "car-select")       { confirmCarSelect();   return; }
        if (mode === "house-select")     { confirmHouseSelect(); return; }
        if (mode === "baby-select")      { confirmBabySelect();  return; }
        if (mode === "car-buyorsell")    { playSound("error"); return; }
        if (mode === "house-buyorsell")  { playSound("error"); return; }
        if (mode === "lottery-pending")  { playSound("error"); return; }

        if (!["money","life","salary","years"].includes(mode)) {
            setScreen("Enter", "Choose action", "Press a function button first");
            renderScreen(); playSound("error"); return;
        }
        if (!amount && mode !== "years") {
            setScreen("Enter", "No amount", "Enter a value before pressing ENTER");
            renderScreen(); playSound("error"); return;
        }

        if (mode === "money") {
            commit("Money", `${sign > 0 ? "Added" : "Subtracted"} ${formatMoney(amount)}`, () => {
                activePlayer().money += amount * sign;
                clearInput();
                setScreen("Money", formatMoney(activePlayer().money), "Account updated");
            });
            playSound(sign > 0 ? "money-add" : "money-sub");
            return;
        }
        if (mode === "life") {
            commit("LIFE Points", `${sign > 0 ? "Added" : "Subtracted"} ${formatNumber(amount)} LIFE Points`, () => {
                activePlayer().lifePoints += amount * sign;
                clearInput();
                setScreen("LIFE Points", formatNumber(activePlayer().lifePoints), "Total updated");
            });
            playSound(sign > 0 ? "life-add" : "money-sub");
            return;
        }
        if (mode === "salary") {
            commit("Salary", `Set salary to ${formatMoney(amount)}`, () => {
                activePlayer().salary = amount;
                clearInput();
                setScreen("Salary", formatMoney(activePlayer().salary), "New salary starts next spin");
            });
            return;
        }
        if (mode === "years") {
            const y = Math.max(1, Math.min(99, amount));
            commit("Years", `Set years left to ${y}`, () => {
                state.yearsLeft = y;
                clearInput();
                setScreen("Years", String(y), "Game length updated");
            });
        }
    }

    // ─── Sign / scroll handler (+/−) ──────────────────────────────────────────

    function handleSign(dir) {
        if (!state || isAnimating) return;
        const mode = state.input.mode;

        if (mode === "car-buyorsell")    { beginCarSelect(dir === 1 ? "buy" : "sell");   return; }
        if (mode === "house-buyorsell")  { beginHouseSelect(dir === 1 ? "buy" : "sell"); return; }
        if (mode === "car-select")       { scrollCarSelect(dir);   return; }
        if (mode === "house-select")     { scrollHouseSelect(dir); return; }
        if (mode === "baby-select")      { scrollBabySelect(dir);  return; }
        if (mode === "lottery-pending")  {
            if (dir === 1)  awardLottery(activePlayer().id);
            else            growLottery();
            return;
        }

        // Normal: set sign for digit entry
        state.input.sign = dir;
        setScreen(inputModeLabel(), dir < 0 ? "−" : "+", "Enter digits, then ENTER");
        renderScreen();
    }

    // ─── SPIN ─────────────────────────────────────────────────────────────────
    //
    // Physical rules:
    //  - Player presses SPIN at start of turn
    //  - LIFEpod pays salary, deducts debt interest, adds recurring LIFE Points,
    //    ages assets, generates a spin number 1-10
    //  - Player STAYS active so they can do board actions (land on space, draw card, etc.)
    //  - Turn ends when the NEXT player taps their Visa card
    //  - Year counts down after all players have taken their spin in one round

    function spinTurn() {
        if (isAnimating) return;
        if (!state || state.yearsLeft <= 0) {
            setScreen("Game over", "Final scoring", "Press Final to reveal totals");
            renderScreen(); playSound("error"); return;
        }

        const baseSpin   = randomInt(1, 10);
        const targetPos  = SPIN_INDICES.indexOf(baseSpin); // index in [1..10] array

        animateOptions(SPIN_INDICES, targetPos, () => {
            commit("Spin", `Player spun ${baseSpin}`, () => {
                const p = activePlayer();

                // 1. Debt interest: 10% of abs(negative balance) deducted first
                let interest = 0;
                if (p.money < 0) {
                    interest = Math.ceil(Math.abs(p.money) * 0.1);
                    p.money -= interest;
                }

                // 2. Salary: reduced 10% per child (max 40%) AND 10% per car (no stated max)
                const childPenalty = Math.min(p.children * 0.1, 0.4);
                const carPenalty   = p.cars.length * 0.1;
                const totalPenalty = Math.min(childPenalty + carPenalty, 1.0);
                const salaryPaid   = Math.round(p.salary * (1 - totalPenalty));
                p.money += salaryPaid;

                // 3. Recurring LIFE Points: cars + houses + marriage + children
                const carLife      = p.cars.reduce((s, c) => s + CAR_TYPES[c.type].lifePerTurn, 0);
                const houseLife    = p.houses.length * 100;
                const marriageLife = p.married ? 1500 : 0;
                const childLife    = p.children * 350;
                p.lifePoints += carLife + houseLife + marriageLife + childLife;

                // 4. Age assets
                ageCars(p);
                ageHouses(p);

                // 5. Move bonus from cars
                const moveBonus = p.cars.reduce((s, c) => s + CAR_TYPES[c.type].moveBonus, 0);
                const totalMove = baseSpin + moveBonus;
                state.lastSpin  = { playerId: p.id, base: baseSpin, bonus: moveBonus, total: totalMove };

                // 6. Count turns; decrement year after all players have spun once
                state.turnsThisYear += 1;
                if (state.turnsThisYear >= state.players.length) {
                    state.turnsThisYear = 0;
                    state.yearsLeft = Math.max(0, state.yearsLeft - 1);
                    state.players.forEach((pl) => { pl.babiesThisYear = 0; });
                }
                // Player does NOT advance here — they stay active to do board actions.
                // The next player taps their own card to switch.

                const totalLife = carLife + houseLife + marriageLife + childLife;
                const hint = [
                    moveBonus ? `Roll ${baseSpin}+${moveBonus}` : `Roll ${baseSpin}`,
                    `${formatMoney(salaryPaid)} salary`,
                    interest  ? `−${formatMoney(interest)} interest` : null,
                    `+${formatNumber(totalLife)} LIFE`
                ].filter(Boolean).join(" · ");
                setScreen("SPIN", `${totalMove} spaces`, hint);
            });
            playSound("money-add");
        }, "tick");
    }

    function ageCars(p) {
        p.cars = p.cars.map((car) => {
            const next = { ...car, yearsOld: car.yearsOld + 1 };
            if (car.type === "economy") {
                next.value = Math.max(0, car.value - 1000);
                return next.yearsOld >= 10 ? null : next; // disappears after 10 years
            }
            if (car.type === "luxury") {
                if (car.yearsOld < 8)   next.value = Math.max(0, car.value - 5000);
                // years 8-14: no change (static)
                if (car.yearsOld >= 15) next.value = car.value + 5000; // classic appreciation
            }
            return next;
        }).filter(Boolean);
    }

    function ageHouses(p) {
        p.houses = p.houses.map((h) => ({
            ...h,
            value:      Math.round(h.value * 1.06),
            yearsOwned: h.yearsOwned + 1
        }));
    }

    // ─── CHANCE (ring 2) ──────────────────────────────────────────────────────
    //
    // Animates through ring buttons 0, 1, 2 and lands on the rolled result.
    // Used for: lucky break promotions, try for baby, business ventures, etc.
    // Result 0 = fail, 1 or 2 = success.

    function chance() {
        if (isAnimating) return;
        const roll      = randomInt(0, 2);
        const targetPos = CHANCE_INDICES.indexOf(roll); // 0→0, 1→1, 2→2

        animateOptions(CHANCE_INDICES, targetPos, () => {
            commit("Chance", `Rolled ${roll}`, () => {
                const label = roll === 0 ? "No lucky break" : "Success!";
                setScreen("CHANCE", String(roll), label);
            });
            playSound(roll > 0 ? "chance-win" : "error");
        }, "tick");
    }

    // ─── LOTTERY (ring 1) ─────────────────────────────────────────────────────
    //
    // Animates through spin buttons (1-10) like the main spinner.
    // After landing, enters lottery-pending mode:
    //   winner taps their card → press + to award pot
    //   no winner → press − to grow pot

    function lotterySpin() {
        if (isAnimating) return;
        const winning   = randomInt(1, 10);
        const targetPos = SPIN_INDICES.indexOf(winning);

        playSound("lottery-sweep"); // background wheel sound during animation

        animateOptions(SPIN_INDICES, targetPos, () => {
            const pot = state.lotteryPot;
            commit("Lottery", `Winning number ${winning}; pot ${formatMoney(pot)}`, () => {
                state.input = { mode: "lottery-pending", sign: 1, buffer: "", subMode: null, index: 0 };
                setScreen("Lottery", String(winning), `${formatMoney(pot)} pot · + award · − skip`);
            });
        }, "tick");
    }

    function awardLottery(playerId) {
        const winner = getPlayer(playerId);
        if (!winner) return;
        const pot = state.lotteryPot;
        commit("Lottery Win", `${winner.name} won ${formatMoney(pot)}`, () => {
            const w = getPlayer(playerId);
            w.money     += pot;
            state.lotteryPot = 10000;
            clearInput();
            setScreen("Lottery", w.name, `${formatMoney(pot)} paid!`);
        });
        playSound("lottery-win");
    }

    function growLottery() {
        commit("Lottery Pot", "No winner; pot grows by $10,000", () => {
            state.lotteryPot += 10000;
            clearInput();
            setScreen("Lottery", formatMoney(state.lotteryPot), "Spin again for next winner");
        });
    }

    // ─── MARRIAGE (ring 3) ────────────────────────────────────────────────────
    //
    // First marriage: other players each give $1,000 wedding gift; +3,000 LIFE once;
    //                 +1,500 LIFE per turn from now on (while married flag is true).
    // Already married: other players give $500 anniversary gift; +3,000 LIFE once.

    function marriage() {
        const wasMarried = activePlayer().married;
        commit("Marriage", wasMarried ? "Anniversary" : "Wedding", () => {
            const p    = activePlayer();
            const gift = wasMarried ? 500 : 1000;
            state.players.forEach((other) => { if (other.id !== p.id) other.money -= gift; });
            p.money      += gift * (state.players.length - 1);
            p.lifePoints += 3000;
            p.married     = true;
            setScreen(wasMarried ? "Anniversary" : "Marriage",
                "+3,000 LIFE", `${formatMoney(gift * (state.players.length - 1))} gifts received`);
        });
        playSound("marriage");
    }

    // ─── BABY (ring 7) ────────────────────────────────────────────────────────
    //
    // Enters a selection mode: + / − toggle between "1 Child" and "Twins", ENTER confirms.
    // Used when landing on Baby Boy, Baby Girl, or Twins spaces.
    // For "Try for Baby" spaces, player presses CHANCE (2) first, then BABY if result ≥ 1.

    function enterBabyMode() {
        state.input = { mode: "baby-select", sign: 1, buffer: "", subMode: null, index: 0 };
        showBabyOption(0);
    }

    function showBabyOption(index) {
        const options = ["1 Child  +350 LIFE", "Twins  +700 LIFE"];
        setScreen("BABY", options[index], "+/− switch · ENTER confirm · UNDO cancel");
        renderScreen();
    }

    function scrollBabySelect(dir) {
        state.input.index = (state.input.index + dir + 2) % 2;
        showBabyOption(state.input.index);
    }

    function confirmBabySelect() {
        const count = state.input.index === 1 ? 2 : 1;
        clearInput();
        addBaby(count);
    }

    function addBaby(count) {
        const p = activePlayer();
        const yearlyRemaining = 2 - (p.babiesThisYear ?? 0);
        if (yearlyRemaining <= 0) {
            setScreen("Baby", "Year limit", "Max 2 babies per year");
            renderScreen(); playSound("error"); return;
        }
        const adding = Math.min(count, 9 - p.children, yearlyRemaining);
        if (adding <= 0) {
            setScreen("Baby", "Max 9 children", "Family limit reached");
            renderScreen(); playSound("error"); return;
        }
        commit(adding === 2 ? "Twins" : "Baby", `Added ${adding} child`, () => {
            const pl = activePlayer();
            pl.children      += adding;
            pl.lifePoints    += 350 * adding;
            pl.babiesThisYear = (pl.babiesThisYear ?? 0) + adding;
            // +$500 per baby from each other player (rulebook strategy chart)
            const giftPerOther = 500 * adding;
            state.players.forEach((other) => { if (other.id !== pl.id) other.money -= giftPerOther; });
            const totalGift = giftPerOther * (state.players.length - 1);
            pl.money += totalGift;
            setScreen(adding === 2 ? "Twins" : "Baby",
                `+${350 * adding} LIFE · +${formatMoney(totalGift)}`,
                `${pl.children} children`);
        });
        playSound(adding === 2 ? "twins" : "baby");
    }

    // ─── CAR (ring 6) ─────────────────────────────────────────────────────────
    //
    // Economy: $10,000, +1 move/turn, +100 LIFE/turn, -$1,000/year, expires after 10 years.
    //          Also reduces salary by 10% per turn.
    // Luxury:  $50,000, +2 move/turn, +200 LIFE/turn, -$5,000/year for years 1-8,
    //          static years 8-15, then +$5,000/year (classic). Also -10% salary/turn.

    function enterCarMode() {
        state.input = { mode: "car-buyorsell", sign: 1, buffer: "", subMode: null, index: 0 };
        setScreen("CAR", "Buy or Sell?", "+ to buy  − to sell  UNDO to cancel");
        renderScreen();
    }

    function beginCarSelect(subMode) {
        const p    = activePlayer();
        const list = subMode === "sell"
            ? CAR_LIST.filter((c) => p.cars.some((oc) => oc.type === c.id))
            : CAR_LIST;
        if (!list.length) {
            setScreen("CAR", "No cars to sell", "You don't own any cars");
            clearInput(); renderScreen(); playSound("error"); return;
        }
        state.input = { mode: "car-select", sign: 1, buffer: "", subMode, index: 0 };
        showCarOption(subMode, 0);
    }

    function showCarOption(subMode, index) {
        const p    = activePlayer();
        const list = subMode === "sell"
            ? CAR_LIST.filter((c) => p.cars.some((oc) => oc.type === c.id))
            : CAR_LIST;
        const car   = list[index];
        if (!car) return;
        const owned = p.cars.find((oc) => oc.type === car.id);
        const value = owned ? formatMoney(owned.value) : formatMoney(car.cost);
        setScreen(`CAR ${subMode.toUpperCase()}`, car.name, `${value} · ENTER to ${subMode}`);
        renderScreen();
    }

    function scrollCarSelect(dir) {
        const p    = activePlayer();
        const { subMode } = state.input;
        const list = subMode === "sell"
            ? CAR_LIST.filter((c) => p.cars.some((oc) => oc.type === c.id))
            : CAR_LIST;
        state.input.index = ((state.input.index + dir) % list.length + list.length) % list.length;
        showCarOption(subMode, state.input.index);
    }

    function confirmCarSelect() {
        const p       = activePlayer();
        const { subMode } = state.input;
        const list    = subMode === "sell"
            ? CAR_LIST.filter((c) => p.cars.some((oc) => oc.type === c.id))
            : CAR_LIST;
        const car = list[state.input.index];
        if (!car) return;
        clearInput();
        if (subMode === "buy") {
            if (p.cars.some((oc) => oc.type === car.id)) {
                setScreen("CAR", "Already owned", `You already have the ${car.name}`);
                renderScreen(); playSound("error"); return;
            }
            commit("Buy Car", `Bought ${car.name} for ${formatMoney(car.cost)}`, () => {
                const pl = activePlayer();
                pl.money -= car.cost;
                pl.cars.push({ id: cryptoId(), type: car.id, value: car.cost, yearsOld: 0 });
                setScreen("CAR", car.name, `${formatMoney(car.cost)} charged`);
            });
            playSound("buy");
        } else {
            sellCar(car.id);
        }
    }

    function sellCar(type) {
        const p   = activePlayer();
        const car = p.cars.find((c) => c.type === type);
        if (!car) { setScreen("CAR","Not owned",""); renderScreen(); playSound("error"); return; }
        commit("Sell Car", `Sold ${CAR_TYPES[type].name} for ${formatMoney(car.value)}`, () => {
            const pl   = activePlayer();
            const sold = pl.cars.find((c) => c.type === type);
            pl.money  += sold.value;
            pl.cars    = pl.cars.filter((c) => c.type !== type);
            setScreen("CAR", formatMoney(sold.value), "Sale paid to card");
        });
        playSound("sell");
    }

    // ─── HOUSE (ring 5) ───────────────────────────────────────────────────────
    //
    // Modest $200k / Mid-sized $500k / Mansion $1M.
    // Each gives +100 LIFE/turn and appreciates 6% per year.
    // Player can own one of each type (max 3 houses).

    function enterHouseMode() {
        state.input = { mode: "house-buyorsell", sign: 1, buffer: "", subMode: null, index: 0 };
        setScreen("HOUSE", "Buy or Sell?", "+ to buy  − to sell  UNDO to cancel");
        renderScreen();
    }

    function beginHouseSelect(subMode) {
        const p    = activePlayer();
        const list = subMode === "sell"
            ? HOUSE_LIST.filter((h) => p.houses.some((oh) => oh.type === h.id))
            : HOUSE_LIST;
        if (!list.length) {
            setScreen("HOUSE", "No houses to sell", "You don't own any houses");
            clearInput(); renderScreen(); playSound("error"); return;
        }
        state.input = { mode: "house-select", sign: 1, buffer: "", subMode, index: 0 };
        showHouseOption(subMode, 0);
    }

    function showHouseOption(subMode, index) {
        const p    = activePlayer();
        const list = subMode === "sell"
            ? HOUSE_LIST.filter((h) => p.houses.some((oh) => oh.type === h.id))
            : HOUSE_LIST;
        const house = list[index];
        if (!house) return;
        const owned = p.houses.find((oh) => oh.type === house.id);
        const value = owned ? formatMoney(owned.value) : formatMoney(house.cost);
        setScreen(`HOUSE ${subMode.toUpperCase()}`, house.name, `${value} · ENTER to ${subMode}`);
        renderScreen();
    }

    function scrollHouseSelect(dir) {
        const p    = activePlayer();
        const { subMode } = state.input;
        const list = subMode === "sell"
            ? HOUSE_LIST.filter((h) => p.houses.some((oh) => oh.type === h.id))
            : HOUSE_LIST;
        state.input.index = ((state.input.index + dir) % list.length + list.length) % list.length;
        showHouseOption(subMode, state.input.index);
    }

    function confirmHouseSelect() {
        const p       = activePlayer();
        const { subMode } = state.input;
        const list    = subMode === "sell"
            ? HOUSE_LIST.filter((h) => p.houses.some((oh) => oh.type === h.id))
            : HOUSE_LIST;
        const house = list[state.input.index];
        if (!house) return;
        clearInput();
        if (subMode === "buy") {
            if (p.houses.some((oh) => oh.type === house.id)) {
                setScreen("HOUSE", "Already owned", `You already have the ${house.name}`);
                renderScreen(); playSound("error"); return;
            }
            commit("Buy House", `Bought ${house.name} for ${formatMoney(house.cost)}`, () => {
                const pl = activePlayer();
                pl.money -= house.cost;
                pl.houses.push({ id: cryptoId(), type: house.id, value: house.cost, yearsOwned: 0 });
                setScreen("HOUSE", house.name, `${formatMoney(house.cost)} charged`);
            });
            playSound("buy");
        } else {
            sellHouse(house.id);
        }
    }

    function sellHouse(type) {
        const p     = activePlayer();
        const house = p.houses.find((h) => h.type === type);
        if (!house) { setScreen("HOUSE","Not owned",""); renderScreen(); playSound("error"); return; }
        commit("Sell House", `Sold ${HOUSE_TYPES[type].name} for ${formatMoney(house.value)}`, () => {
            const pl   = activePlayer();
            const sold = pl.houses.find((h) => h.type === type);
            pl.money  += sold.value;
            pl.houses  = pl.houses.filter((h) => h.type !== type);
            setScreen("HOUSE", formatMoney(sold.value), "Sale paid to card");
        });
        playSound("sell");
    }

    // ─── Final scoring ────────────────────────────────────────────────────────
    //
    // At end of game: sell all cars and houses at current value, add to cash,
    // then convert total net worth to LIFE Points using the hidden ratio.
    // Ratio is $80-$120 per LIFE Point, randomised once per game.

    function calculateFinals() {
        if (!state) return;
        commit("Final Scoring", "All assets converted to LIFE Points", () => {
            state.players.forEach((p) => {
                const carValue   = p.cars.reduce((s, c) => s + c.value, 0);
                const houseValue = p.houses.reduce((s, h) => s + h.value, 0);
                const netWorth   = p.money + carValue + houseValue;
                const converted  = Math.round(netWorth / state.finalRatio);
                p.final = {
                    ratio:           state.finalRatio,
                    carValue, houseValue, netWorth,
                    convertedLife:   converted,
                    totalLifePoints: p.lifePoints + converted
                };
            });
            state.finalCalculated = true;
            setScreen("Final", "Totals ready", "Compare LIFE Points — most wins!");
        });
        renderFinalResults();
        playSound("lottery-win");
    }

    // ─── Ring button handler ──────────────────────────────────────────────────

    function handlePodKey(key) {
        if (!state || isAnimating) return;

        // While mid digit-entry, number keys keep appending digits
        if (["money","life","salary","years"].includes(state.input.mode)) {
            const btn = POD_BUTTONS.find((b) => b.key === key);
            if (btn && /^\d$/.test(btn.number)) { appendDigit(btn.number); return; }
        }

        if (key === "digit-4") { appendDigit("4"); return; }
        if (key === "digit-9") { appendDigit("9"); return; }

        const handlers = {
            salary:   () => setInputMode("salary", 1),
            lottery:  lotterySpin,
            chance:   chance,
            marriage: marriage,
            house:    enterHouseMode,
            car:      enterCarMode,
            baby:     enterBabyMode,
            volume:   () => { setScreen("Volume", "Silent", "No speaker on this device"); renderScreen(); },
            years:    () => setInputMode("years", 1)
        };
        handlers[key]?.();
    }

    // ─── Render ───────────────────────────────────────────────────────────────

    function render() {
        if (!state) {
            dom.setupView.classList.remove("is-hidden");
            dom.gameView.classList.add("is-hidden");
            return;
        }
        dom.setupView.classList.add("is-hidden");
        dom.gameView.classList.remove("is-hidden");
        renderStatus();
        renderPlayers();
        renderLedger();
        renderScreen();
        renderFinalResults();
    }

    function renderStatus() {
        const p = activePlayer();
        dom.yearsLeft.textContent  = state.yearsLeft;
        dom.activeCard.textContent = `${p.colorName} ${p.card}`;
        dom.cardSlot.textContent   = `${p.colorName.toUpperCase()} ${p.card}`;
        dom.cardSlot.style.setProperty("--active-card-color", VISA_COLORS.find((c) => c.id === p.color).hex);
        dom.lastSpin.textContent   = state.lastSpin
            ? `${state.lastSpin.total} (${state.lastSpin.base}+${state.lastSpin.bonus})`
            : "−";
    }

    function renderPlayers() {
        const cur = activePlayer();
        dom.playerList.innerHTML = state.players.map((p, i) => {
            const color    = VISA_COLORS.find((c) => c.id === p.color);
            const carVal   = p.cars.reduce((s, c) => s + c.value, 0);
            const houseVal = p.houses.reduce((s, h) => s + h.value, 0);
            return `
                <button class="player-card${p.id === cur.id ? " is-active" : ""}" data-player-index="${i}" style="--card-color: ${color.hex}" type="button">
                    <span class="card-band"></span>
                    <span class="player-card-head">
                        <strong>${escapeHtml(p.name)}</strong>
                        <small>${p.colorName} ${p.card}${p.career ? " · " + escapeHtml(p.career) : ""}</small>
                    </span>
                    <span class="stat-row"><span>Money</span><strong data-stat="money">${formatMoney(p.money)}</strong></span>
                    <span class="stat-row"><span>LIFE</span><strong data-stat="life">${formatNumber(p.lifePoints)}</strong></span>
                    <span class="stat-row"><span>Salary</span><strong>${formatMoney(p.salary)}</strong></span>
                    <span class="asset-line">${p.children} kids · ${p.cars.length} cars${carVal ? " " + formatMoney(carVal) : ""} · ${p.houses.length} houses${houseVal ? " " + formatMoney(houseVal) : ""}</span>
                </button>
            `;
        }).join("");
    }

    function renderScreen() {
        if (!state) return;
        dom.screenMode.textContent  = state.screen.mode;
        dom.screenValue.textContent = state.screen.value;
        dom.screenHint.textContent  = state.screen.hint;
    }

    function renderLedger() {
        if (ledgerFilterCleared) {
            dom.ledger.innerHTML = `<p class="empty-state">Ledger cleared. New actions appear here.</p>`;
            return;
        }
        if (!state.ledger.length) {
            dom.ledger.innerHTML = `<p class="empty-state">No LIFEpod actions yet.</p>`;
            return;
        }
        dom.ledger.innerHTML = state.ledger.slice(0, 60).map((entry) => {
            const p = entry.playerId ? getPlayer(entry.playerId) : null;
            return `
                <article class="ledger-entry">
                    <time>${new Date(entry.at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</time>
                    <div>
                        <strong>${escapeHtml(entry.action)}</strong>
                        <span>${p ? escapeHtml(p.name) + ": " : ""}${escapeHtml(entry.detail)}</span>
                        ${entry.before && entry.after ? `<small>${ledgerDelta(entry.before, entry.after)}</small>` : ""}
                    </div>
                </article>
            `;
        }).join("");
    }

    function ledgerDelta(b, a) {
        return [
            `Money ${formatMoney(b.money)} → ${formatMoney(a.money)}`,
            `LIFE ${formatNumber(b.lifePoints)} → ${formatNumber(a.lifePoints)}`,
            `Salary ${formatMoney(b.salary)} → ${formatMoney(a.salary)}`
        ].join(" | ");
    }

    function renderFinalResults() {
        if (!state) return;
        if (!state.finalCalculated) {
            dom.finalResults.innerHTML = `<p class="microcopy">Final scoring uses a hidden conversion ratio ($80–$120 per LIFE Point) set at game start. Press Calculate Finals after everyone has completed their last turn.</p>`;
            return;
        }
        const sorted = [...state.players].sort((a, b) => b.final.totalLifePoints - a.final.totalLifePoints);
        dom.finalResults.innerHTML = `
            <p class="microcopy">Hidden ratio this game: ${formatMoney(state.finalRatio)} per LIFE Point.</p>
            ${sorted.map((p, i) => `
                <article class="final-card${i === 0 ? " winner" : ""}">
                    <strong>${i === 0 ? "Winner: " : ""}${escapeHtml(p.name)}</strong>
                    <span>Total LIFE Points: ${formatNumber(p.final.totalLifePoints)}</span>
                    <small>Base ${formatNumber(p.lifePoints)} LIFE + ${formatNumber(p.final.convertedLife)} converted from ${formatMoney(p.final.netWorth)}</small>
                </article>
            `).join("")}
        `;
    }

    // ─── Setup UI ─────────────────────────────────────────────────────────────

    function createPlayerSetup() {
        const count = Number(dom.playerCount.value);
        dom.playerSetupGrid.innerHTML = VISA_COLORS.slice(0, count).map((color, i) => `
            <div class="setup-player" style="--card-color: ${color.hex}">
                <div class="visa-chip" aria-hidden="true"></div>
                <label>${color.name} card ${color.card}
                    <input name="playerName${i}" value="Player ${i + 1}" maxlength="24" required>
                </label>
                <label>Career label
                    <input name="career${i}" placeholder="Optional">
                </label>
            </div>
        `).join("");
    }

    function createFunctionRing() {
        dom.functionRing.innerHTML = POD_BUTTONS.map((btn, i) => `
            <button class="ring-button" data-pod-key="${btn.key}" style="--i: ${i}" type="button">
                <strong>${btn.number}</strong>
                <span>${btn.label}</span>
            </button>
        `).join("");
    }

    // ─── Event binding ────────────────────────────────────────────────────────

    function bindEvents() {
        dom.playerCount.addEventListener("change", createPlayerSetup);

        dom.setupForm.addEventListener("submit", (e) => {
            e.preventDefault();
            const count   = Number(dom.playerCount.value);
            const form    = new FormData(dom.setupForm);
            const players = Array.from({ length: count }, (_, i) => ({
                name:   form.get(`playerName${i}`),
                career: form.get(`career${i}`)
            }));
            state = createGame({
                years: Math.max(1, Math.min(99, Number(dom.setupYears.value || 10))),
                players
            });
            saveState();
            render();
        });

        dom.resumeButton.addEventListener("click", () => {
            state = normalizeState(loadState());
            render();
        });

        dom.resetButton.addEventListener("click", () => {
            if (!confirm("Reset the LIFEpod and clear the saved game?")) return;
            state = null;
            saveState();
            render();
        });

        dom.saveButton.addEventListener("click", () => {
            saveState();
            setScreen("Save", "Saved", "Game stored on this device");
            renderScreen();
        });

        // Ring buttons
        dom.functionRing.addEventListener("click", (e) => {
            const btn = e.target.closest("[data-pod-key]");
            if (btn) handlePodKey(btn.dataset.podKey);
        });

        // Global click delegation
        document.addEventListener("click", (e) => {
            const action = e.target.closest("[data-action]");
            if (action) {
                const a = action.dataset.action;
                if      (a === "sign-positive") handleSign(1);
                else if (a === "sign-negative") handleSign(-1);
                else if (a === "enter")         confirmInput();
                else if (a === "spin")          spinTurn();
                else if (a === "undo")          handleUndo();
                else if (a === "mode-money")    { if (state) setInputMode("money", 1); }
                else if (a === "mode-life")     { if (state) setInputMode("life",  1); }
                return;
            }

            // Visa card tap: switch active player (ends previous player's turn)
            const playerCard = e.target.closest("[data-player-index]");
            if (playerCard && state) {
                clearLitButtons(); // clear spin/chance result from previous player
                state.activePlayerIndex = Number(playerCard.dataset.playerIndex);
                clearInput();
                setScreen("Card", activePlayer().name, "Press SPIN to start turn");
                saveState();
                render();
                // Card-slot insertion animation
                dom.cardSlot.classList.remove("is-inserting");
                void dom.cardSlot.offsetWidth;
                dom.cardSlot.classList.add("is-inserting");
                playSound("card-insert");
            }
        });

        // Keyboard shortcuts
        document.addEventListener("keydown", (e) => {
            if (!state || isAnimating || e.target.matches("input,select,textarea")) return;
            if (/^[0-9]$/.test(e.key)) appendDigit(e.key);
            if (e.key === "Enter")     confirmInput();
            if (e.key === "Backspace") backspaceDigit();
            if (e.key === "+")         handleSign(1);
            if (e.key === "-")         handleSign(-1);
            if (e.key.toLowerCase() === "s") spinTurn();
            if (e.key.toLowerCase() === "u") handleUndo();
            if (e.key.toLowerCase() === "c") chance();
            if (e.key === "$")               setInputMode("money", 1);
            if (e.key.toLowerCase() === "l") setInputMode("life",  1);
        });

        dom.clearLedgerButton.addEventListener("click", () => {
            ledgerFilterCleared = true;
            renderLedger();
        });

        dom.finalButton.addEventListener("click", () => {
            renderFinalResults();
            dom.finalDialog.showModal();
        });
        dom.runFinalButton.addEventListener("click", calculateFinals);
    }

    // ─── Service worker ───────────────────────────────────────────────────────

    function registerServiceWorker() {
        if (!("serviceWorker" in navigator) || location.protocol === "file:") return;
        navigator.serviceWorker.register("service-worker.js").catch(() => {});
    }

    // ─── Utility ──────────────────────────────────────────────────────────────

    function escapeHtml(v) {
        return String(v)
            .replaceAll("&", "&amp;")
            .replaceAll("<", "&lt;")
            .replaceAll(">", "&gt;")
            .replaceAll('"', "&quot;")
            .replaceAll("'", "&#039;");
    }

    // ─── Boot ─────────────────────────────────────────────────────────────────

    createPlayerSetup();
    createFunctionRing();
    bindEvents();
    registerServiceWorker();
    render();

})();
