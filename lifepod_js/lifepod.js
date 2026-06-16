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
        economy: { id: "economy", name: "Economy Car", cost: 10000,  moveBonus: 1, lifePerTurn: 100, icon: "car-economy" },
        luxury:  { id: "luxury",  name: "Luxury Car",  cost: 50000,  moveBonus: 2, lifePerTurn: 200, icon: "car-luxury"  }
    };
    const CAR_LIST = Object.values(CAR_TYPES);

    const HOUSE_TYPES = {
        modest:   { id: "modest",   name: "Modest House",    cost: 200000,  icon: "house-modest"   },
        midsized: { id: "midsized", name: "Mid-sized House", cost: 500000,  icon: "house-midsized" },
        mansion:  { id: "mansion",  name: "Mansion",         cost: 1000000, icon: "house-mansion"  }
    };
    const HOUSE_LIST = Object.values(HOUSE_TYPES);

    // Ring buttons — 11 positions clockwise from top.
    // Indices 0-10 match the physical device digit/function labels.
    const POD_BUTTONS = [
        { key: "salary",   number: "0",  label: "SALARY",   icon: "cash"    },
        { key: "lottery",  number: "1",  label: "LOTTERY",  icon: "lottery" },
        { key: "chance",   number: "2",  label: "CHANCE",   icon: "chance"  },
        { key: "marriage", number: "3",  label: "MARRIAGE", icon: "rings"   },
        { key: "digit-4",  number: "4",  label: "",         icon: ""        },
        { key: "house",    number: "5",  label: "HOUSE",    icon: "house"   },
        { key: "car",      number: "6",  label: "CAR",      icon: "car"     },
        { key: "baby",     number: "7",  label: "BABY",     icon: "baby"    },
        { key: "volume",   number: "8",  label: "VOLUME",   icon: "volume"  },
        { key: "digit-9",  number: "9",  label: "",         icon: ""        },
        { key: "years",    number: "10", label: "YEARS",    icon: "clock"   }
    ];

    // Button indices for the spinner (1-10 maps to ring button indices 1-10)
    const SPIN_INDICES   = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    // Button indices for 0/1/2 chance rolls (ring button indices 0, 1, 2)
    const CHANCE_INDICES = [0, 1, 2];

    // ─── DOM references ───────────────────────────────────────────────────────

    const DEFAULT_PLAYERS = [
        { name: "Player 1", career: "" },
        { name: "Player 2", career: "" },
        { name: "Player 3", career: "" },
        { name: "Player 4", career: "" }
    ];

    const dom = {
        gameView:          document.querySelector("#gameView"),
        resetButton:       document.querySelector("#resetButton"),
        saveButton:        document.querySelector("#saveButton"),
        yearsLeft:         document.querySelector("#yearsLeft"),
        activeCard:        document.querySelector("#activeCard"),
        lastSpin:          document.querySelector("#lastSpin"),
        playerList:        document.querySelector("#playerList"),
        playerSwitch:      document.querySelector("#playerSwitch"),
        functionRing:      document.querySelector("#functionRing"),
        cardSlot:          document.querySelector("#cardSlot"),
        screenMode:        document.querySelector("#screenMode"),
        screenValue:       document.querySelector("#screenValue"),
        screenHint:        document.querySelector("#screenHint"),
        lcdBanner:         document.querySelector(".lcd-banner"),
        lcdHouses:         document.querySelector("#lcdHouses"),
        lcdCars:           document.querySelector("#lcdCars"),
        lcdBabies:         document.querySelector("#lcdBabies"),
        lcdMoney:          document.querySelector("#lcdMoney"),
        lcdMarried:        document.querySelector("#lcdMarried"),
        lcdLife:           document.querySelector("#lcdLife"),
        lcdYears:          document.querySelector("#lcdYears"),
        ledger:            document.querySelector("#ledger"),
        clearLedgerButton: document.querySelector("#clearLedgerButton"),
        finalDialog:       document.querySelector("#finalDialog"),
        finalResults:      document.querySelector("#finalResults"),
        playerCountSelect: document.querySelector("#playerCountSelect"),
        confirmDialog:     document.querySelector("#confirmDialog"),
        confirmMessage:    document.querySelector("#confirmMessage"),
        confirmYes:        document.querySelector("#confirmYes"),
        confirmNo:         document.querySelector("#confirmNo")
    };

    // ─── Module-level state ───────────────────────────────────────────────────

    let state = normalizeState(loadState())
             ?? createGame({ years: 10, players: DEFAULT_PLAYERS });
    let ledgerFilterCleared = false;
    let isAnimating = false; // blocks all input while spinner/chance/lottery animates
    let litButtonIndex = null; // ring button currently held lit after a spin/chance land

    // ─── Audio engine (Web Audio API — no external files) ─────────────────────
    //
    // Every voice routes through a shared master gain → compressor → speakers.
    // The compressor keeps stacked chords from clipping; the master gain is the
    // single mute control toggled by the VOLUME ring button (persisted).

    const MUTE_KEY = "lifepod-muted-v1";
    let audioCtx   = null;
    let masterGain = null;
    let isMuted    = loadMutePref();

    function loadMutePref() {
        try { return localStorage.getItem(MUTE_KEY) === "1"; } catch { return false; }
    }
    function saveMutePref() {
        try { localStorage.setItem(MUTE_KEY, isMuted ? "1" : "0"); } catch { /* storage blocked */ }
    }

    function getAudioCtx() {
        if (!audioCtx) {
            audioCtx = new (window.AudioContext || window.webkitAudioContext)();
            masterGain = audioCtx.createGain();
            masterGain.gain.value = isMuted ? 0 : 0.9;
            const comp = audioCtx.createDynamicsCompressor();
            comp.threshold.value = -14;
            comp.ratio.value     = 6;
            comp.attack.value    = 0.003;
            comp.release.value   = 0.25;
            masterGain.connect(comp);
            comp.connect(audioCtx.destination);
        }
        // Browsers start the context suspended until a user gesture; every sound
        // here is gesture-triggered, so resuming on demand is safe.
        if (audioCtx.state === "suspended") audioCtx.resume();
        return audioCtx;
    }

    function tone(freq, type, startTime, duration, gain = 0.32) {
        const osc = audioCtx.createOscillator();
        const env = audioCtx.createGain();
        osc.connect(env);
        env.connect(masterGain);
        osc.type = type;
        osc.frequency.setValueAtTime(freq, startTime);
        env.gain.setValueAtTime(0, startTime);
        env.gain.linearRampToValueAtTime(gain, startTime + 0.008);
        env.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);
        osc.start(startTime);
        osc.stop(startTime + duration + 0.01);
    }

    function sweep(freqStart, freqEnd, type, startTime, duration, gain = 0.22) {
        const osc = audioCtx.createOscillator();
        const env = audioCtx.createGain();
        osc.connect(env);
        env.connect(masterGain);
        osc.type = type;
        osc.frequency.setValueAtTime(freqStart, startTime);
        osc.frequency.linearRampToValueAtTime(freqEnd, startTime + duration);
        env.gain.setValueAtTime(0, startTime);
        env.gain.linearRampToValueAtTime(gain, startTime + 0.01);
        env.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);
        osc.start(startTime);
        osc.stop(startTime + duration + 0.01);
    }

    function toggleMute() {
        isMuted = !isMuted;
        saveMutePref();
        if (masterGain) {
            masterGain.gain.setTargetAtTime(isMuted ? 0 : 0.9, getAudioCtx().currentTime, 0.015);
        }
        syncVolumeIcon();
        setScreen("Sound", isMuted ? "Muted" : "On",
            isMuted ? "Press VOLUME to unmute" : "Sound effects on");
        renderScreen();
        if (!isMuted) playSound("card-insert");
    }

    function syncVolumeIcon() {
        const use = dom.functionRing.querySelector('[data-pod-key="volume"] use');
        if (use) use.setAttribute("href", isMuted ? "#ic-volume-off" : "#ic-volume");
    }

    function playSound(type) {
        if (isMuted) return;
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
                    // "Here Comes the Bride" — G G A G with a closing chord shimmer
                    tone(784,  "sine", t,        0.22, 0.30);
                    tone(784,  "sine", t + 0.26, 0.12, 0.24);
                    tone(880,  "sine", t + 0.40, 0.22, 0.30);
                    tone(784,  "sine", t + 0.64, 0.40, 0.34);
                    tone(1175, "sine", t + 0.66, 0.38, 0.16);
                    tone(1568, "sine", t + 0.70, 0.34, 0.10);
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
                    [523, 659, 784, 1047].forEach((f, i) => tone(f, "sine", t + i * 0.13, 0.2, 0.30));
                    tone(262,  "triangle", t + 0.52, 0.5,  0.20);
                    tone(1047, "sine",     t + 0.55, 0.5,  0.26);
                    tone(1568, "sine",     t + 0.58, 0.45, 0.14);
                    break;
                case "error":
                    // Soft "uh-uh" — triangle instead of a buzzy square
                    tone(311, "triangle", t,        0.10, 0.20);
                    tone(233, "triangle", t + 0.11, 0.16, 0.20);
                    break;
                case "undo":
                    sweep(440, 220, "sine", t, 0.16, 0.28);
                    break;
                case "card-insert":
                    // Low "seat" thunk plus a bright confirmation click
                    tone(196,  "triangle", t,        0.10, 0.18);
                    tone(880,  "sine",     t + 0.05, 0.05, 0.18);
                    tone(1175, "sine",     t + 0.10, 0.07, 0.13);
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
                    tone(659,  "sine", t,        0.10, 0.26);
                    tone(880,  "sine", t + 0.10, 0.12, 0.28);
                    tone(1047, "sine", t + 0.22, 0.18, 0.26);
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
            lotteryStarter: null,
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
        // Preserve an explicit null (e.g. lottery awaiting a winner); only fill when missing.
        if (s.activePlayerIndex === undefined) s.activePlayerIndex = 0;
        s.turnsThisYear     ??= 0;
        s.lotteryPot        ??= 10000;
        s.lotteryStarter    ??= null;
        s.finalRatio        ??= randomInt(80, 120);
        s.finalCalculated   ??= false;
        s.input    ??= { mode: "ready", sign: 1, buffer: "", subMode: null, index: 0 };
        s.input.subMode ??= null;
        s.input.index   ??= 0;
        s.screen   ??= { mode: "Ready", value: "", hint: "Tap a Visa card then press SPIN" };
        s.ledger   ??= [];
        s.undoStack ??= [];
        s.players?.forEach((p, i) => {
            p.id             ??= cryptoId();
            p.order          ??= i + 1;
            p.color          ??= VISA_COLORS[i % 4].id;
            p.colorName      ??= VISA_COLORS[i % 4].name;
            p.card           ??= VISA_COLORS[i % 4].card;
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
            p.cars.forEach((c)   => { c.id ??= cryptoId(); c.yearsOld   ??= 0; });
            p.houses.forEach((h) => { h.id ??= cryptoId(); h.yearsOwned ??= 0; });
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

        try {
            mutator();
        } catch (err) {
            // Roll back any partial mutation so a crash never leaves corrupt state,
            // and surface the real error in the ledger instead of failing silently.
            state = before;
            ledgerLog("⚠ Crash", `${action} failed: ${err.message}`);
            saveState();
            render();
            playSound("error");
            return;
        }

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
        if (!state || isAnimating) return;
        clearLitButtons();
        const selModes = ["car-select","house-select","car-buyorsell","house-buyorsell","lottery-pending"];
        if (selModes.includes(state.input.mode)) {
            if (state.input.mode === "lottery-pending") {
                // Cancelling the lottery → hand control back to whoever started it.
                state.activePlayerIndex = (state.lotteryStarter != null && state.players[state.lotteryStarter])
                    ? state.lotteryStarter : 0;
                state.lotteryStarter = null;
                logInfo("Lottery", "Cancelled — no winner this round");
            } else if (state.activePlayerIndex == null) {
                state.activePlayerIndex = 0;
            }
            logInfo("Cancelled", `Closed "${state.input.mode}"`);
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
        state = normalizeState(state.undoStack.pop());
        saveState();
        setScreen("Undo", "Restored", "Last action cancelled");
        playSound("undo");
        render();
    }

    // ─── Player helpers ───────────────────────────────────────────────────────

    function activePlayer() {
        if (!state || state.activePlayerIndex == null) return null;
        return state.players[state.activePlayerIndex] ?? null;
    }
    function getPlayer(id)  { return state.players.find((p) => p.id === id); }

    // Single entry point for picking a player — used by both the side Visa cards
    // and the always-visible switcher chips, so switching is consistent and never
    // requires scrolling. Cancels any open menu and records the switch.
    function switchToPlayer(idx) {
        if (!state || isAnimating) return;
        if (idx == null || !state.players[idx]) { ledgerLog("⚠ Switch", `No player at slot ${idx}`); return; }

        // Lottery in progress → tapping a player claims the pot for them.
        if (state.input.mode === "lottery-pending") { awardLottery(idx); return; }

        const openMode = state.input.mode;
        if (openMode && openMode !== "ready") logInfo("Cancelled", `Closed "${openMode}" to switch players`);

        clearLitButtons();
        state.activePlayerIndex = idx;
        clearInput();
        const name = state.players[idx].name;
        setScreen("Card", name, "Press SPIN to start turn");
        logInfo("Card", `${name} is now active`);
        saveState();
        render();

        dom.cardSlot.classList.remove("is-inserting");
        void dom.cardSlot.offsetWidth;
        dom.cardSlot.classList.add("is-inserting");
        playSound("card-insert");

        // First card inserted after the last year ends → roll the finale.
        if (state.yearsLeft === 0 && !state.finalCalculated) {
            setTimeout(() => { showFinalDialog(); }, 900);
        }
    }

    // ─── Formatting ───────────────────────────────────────────────────────────

    function formatMoney(n)  {
        return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(Math.round(n));
    }
    function formatNumber(n) { return new Intl.NumberFormat("en-US").format(Math.round(n)); }
    function randomInt(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }
    function cryptoId() { return window.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`; }

    // Inline SVG icon referencing the sprite in lifepod.html. fill="currentColor"
    // lets each icon inherit the colour of its surrounding text (LCD ink, card text…).
    function svgIcon(name, cls = "") {
        return `<svg class="ic${cls ? " " + cls : ""}" fill="currentColor" aria-hidden="true"><use href="#ic-${name}"/></svg>`;
    }

    // Large labelled picture for the LCD banner (the car/house being bought or sold).
    function lcdPic(name, label) {
        return `<svg class="lcd-pic" fill="currentColor" role="img" aria-label="${escapeHtml(label || name)}"><use href="#ic-${name}"/></svg>`;
    }

    // LCD ticker: if the text in a banner field is wider than the field, scroll it
    // back and forth so the whole phrase can be read. No-op when it already fits.
    function applyMarquee(container) {
        container.classList.remove("is-marquee");
        const inner = container.querySelector(".marq");
        if (!inner) return;
        inner.style.removeProperty("--marq-shift");
        inner.style.removeProperty("--marq-dur");
        const overflow = inner.scrollWidth - container.clientWidth;
        if (overflow > 2) {
            const shift = overflow + 6;
            inner.style.setProperty("--marq-shift", `-${shift}px`);
            inner.style.setProperty("--marq-dur", `${Math.max(5, shift / 16 + 3).toFixed(1)}s`);
            container.classList.add("is-marquee");
        }
    }

    // ─── Screen helpers ───────────────────────────────────────────────────────

    function setScreen(mode, value, hint = "", icon = null) {
        if (!state) return;
        state.screen = { mode, value, hint, icon };
    }

    function clearInput() {
        state.input = { mode: "ready", sign: 1, buffer: "", subMode: null, index: 0 };
    }

    function inputModeLabel() {
        return { money: "Money", life: "LIFE Points", salary: "Salary", years: "Years" }[state.input.mode] ?? "Ready";
    }

    // ─── Digit / numeric entry ────────────────────────────────────────────────

    function setInputMode(mode, sign = 1) {
        if (!state) return;
        if (state.input.mode === "lottery-pending") {
            ledgerLog("⚠ Lottery", `Resolve the lottery before entering ${mode}`);
            renderScreen(); playSound("error"); return;
        }
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
        if (state.input.mode === "years"  && state.input.buffer.length >= 2)  return;
        if (state.input.mode === "money"  && state.input.buffer.length >= 9)  return;
        if (state.input.mode === "salary" && state.input.buffer.length >= 7)  return;
        if (state.input.mode === "life"   && state.input.buffer.length >= 8)  return;
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
        if (!state || isAnimating) return;
        const { mode, sign, buffer } = state.input;
        const amount = Number(buffer || 0);

        if (mode === "car-select")       { confirmCarSelect();   return; }
        if (mode === "house-select")     { confirmHouseSelect(); return; }
        if (mode === "car-buyorsell")    { ledgerLog("⚠ Input", "Press + to buy or − to sell car"); playSound("error"); return; }
        if (mode === "house-buyorsell")  { ledgerLog("⚠ Input", "Press + to buy or − to sell house"); playSound("error"); return; }
        if (mode === "lottery-pending")  { ledgerLog("⚠ Lottery", "Tap a card to claim — don't press ENTER"); playSound("error"); return; }

        if (!["money","life","salary","years"].includes(mode)) {
            setScreen("Enter", "Choose action", "Press a function button first");
            ledgerLog("⚠ Input", "ENTER pressed without choosing a function first");
            renderScreen(); playSound("error"); return;
        }
        if (["money","life","salary"].includes(mode) && !activePlayer()) {
            setScreen("No card", "Tap your card first", "Insert a Visa card first");
            ledgerLog("⚠ No Card", "Tried to enter value without a card");
            renderScreen(); playSound("error"); return;
        }
        if (!amount && mode !== "years") {
            setScreen("Enter", "No amount", "Enter a value before pressing ENTER");
            ledgerLog("⚠ Input", "ENTER pressed with no amount entered");
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
        if (state?.input.mode === "lottery-pending") { lotterySpin(); return; }
        // Cancel any open buy/sell selection — lets the player abandon and just spin
        if (state && ["car-select","house-select","car-buyorsell","house-buyorsell"].includes(state.input.mode)) {
            clearInput();
        }
        if (!state || state.yearsLeft <= 0) {
            setScreen("Game over", "Final scoring", "Insert any card to see final scores");
            ledgerLog("⚠ Game Over", "Tried to spin after game ended");
            renderScreen(); playSound("error"); return;
        }
        if (!activePlayer()) {
            setScreen("No card", "Tap your card first", "Insert your Visa card to spin");
            ledgerLog("⚠ No Card", "Tried to spin without inserting a card");
            renderScreen(); playSound("error"); return;
        }

        const baseSpin   = randomInt(1, 10);
        const targetPos  = SPIN_INDICES.indexOf(baseSpin); // index in [1..10] array

        animateOptions(SPIN_INDICES, targetPos, () => {
            const p = activePlayer();
            if (!p) {
                ledgerLog("⚠ Spin Error", "No active player when the spin landed — tap a card, then SPIN");
                playSound("error"); return;
            }

            // Pre-compute this turn's economics from the pre-spin state so the
            // exact breakdown can go in the ledger AND be applied consistently.
            const interest     = p.money < 0 ? Math.ceil(Math.abs(p.money) * 0.1) : 0;
            const childPenalty = Math.min(p.children * 0.1, 0.4);   // 10%/kid, cap 40%
            const carPenalty   = p.cars.length * 0.1;               // 10%/car
            const totalPenalty = Math.min(childPenalty + carPenalty, 1.0);
            const salaryPaid   = Math.round(p.salary * (1 - totalPenalty));
            const carLife      = p.cars.reduce((s, c) => s + (CAR_TYPES[c.type]?.lifePerTurn ?? 0), 0);
            const totalLife    = carLife + p.houses.length * 100 + (p.married ? 1500 : 0) + p.children * 350;
            const moveBonus    = p.cars.reduce((s, c) => s + (CAR_TYPES[c.type]?.moveBonus ?? 0), 0);
            const totalMove    = baseSpin + moveBonus;

            const detail = [
                moveBonus ? `move ${baseSpin}+${moveBonus}=${totalMove}` : `move ${baseSpin}`,
                `+${formatMoney(salaryPaid)} salary`,
                interest ? `−${formatMoney(interest)} debt interest` : null,
                `+${formatNumber(totalLife)} LIFE`
            ].filter(Boolean).join(" · ");

            commit("Spin", detail, () => {
                const pl = activePlayer();
                if (!pl) return;
                pl.money      -= interest;     // debt interest first (from pre-spin balance)
                pl.money      += salaryPaid;   // then salary
                pl.lifePoints += totalLife;    // recurring LIFE from assets/family
                ageCars(pl);
                ageHouses(pl);
                state.lastSpin = { playerId: pl.id, base: baseSpin, bonus: moveBonus, total: totalMove };

                // Count turns; decrement the year once everyone has spun this round.
                state.turnsThisYear += 1;
                if (state.turnsThisYear >= state.players.length) {
                    state.turnsThisYear = 0;
                    state.yearsLeft = Math.max(0, state.yearsLeft - 1);
                    state.players.forEach((x) => { x.babiesThisYear = 0; });
                    logInfo("Year", `Round complete — ${state.yearsLeft} year${state.yearsLeft === 1 ? "" : "s"} left`);
                }
                // Player stays active for board actions; the next player taps to switch.
                setScreen("SPIN", `${totalMove} spaces`, detail);
            });
            playSound("money-add");
            if (state.yearsLeft === 0) {
                setTimeout(() => {
                    setScreen("GAME OVER", "All rounds done", "Tap any card to see final scores");
                    renderScreen();
                }, 900);
            }
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
        if (isAnimating || !state) return;
        if (state.input.mode === "lottery-pending") {
            ledgerLog("⚠ Lottery", "Resolve the lottery before taking a chance");
            renderScreen(); playSound("error"); return;
        }
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
        if (isAnimating || !state) return;
        const reroll = state.input.mode === "lottery-pending";

        if (reroll) {
            // No winner last time → pot grows and we draw a new number.
            state.lotteryPot += 10000;
            logInfo("Lottery", `No winner — pot grows to ${formatMoney(state.lotteryPot)}, re-spinning`);
        } else {
            // Fresh lottery: remember whose turn it is so we can hand control back,
            // and abandon any half-open buy/sell menu.
            if (["car-select","house-select","car-buyorsell","house-buyorsell"].includes(state.input.mode)) {
                logInfo("Cancelled", `Closed "${state.input.mode}" to start the lottery`);
                clearInput();
            }
            state.lotteryStarter = state.activePlayerIndex;
            logInfo("Lottery", `Started by ${state.players[state.activePlayerIndex]?.name ?? "—"} · pot ${formatMoney(state.lotteryPot)}`);
        }

        const winning   = randomInt(1, 10);
        const targetPos = SPIN_INDICES.indexOf(winning);

        // Eject card display immediately so nobody holds the device during the spin
        dom.cardSlot.textContent = "LOTTERY";
        dom.cardSlot.style.removeProperty("--active-card-color");
        dom.activeCard.textContent  = "Lottery";
        dom.screenMode.textContent  = "LOTTERY";
        dom.screenValue.textContent = "Spinning…";
        dom.screenHint.textContent  = "Watch the wheel · tap the winner below";
        dom.lcdHouses.textContent = dom.lcdCars.textContent = dom.lcdBabies.textContent = "–";
        dom.lcdMoney.textContent  = dom.lcdLife.textContent = "–––––";
        dom.lcdMarried.classList.remove("is-on");

        playSound("lottery-sweep");

        animateOptions(SPIN_INDICES, targetPos, () => {
            const pot = state.lotteryPot;
            commit("Lottery", `Winning number ${winning} · pot ${formatMoney(pot)}`, () => {
                state.input = { mode: "lottery-pending", sign: 1, buffer: "", subMode: null, index: 0 };
                state.activePlayerIndex = null;
                setScreen("LOTTERY", `No. ${winning}`,
                    `${formatMoney(pot)} · tap the winning player · SPIN re-rolls · UNDO cancels`);
            });
            logInfo("Lottery", `Drew ${winning}. Tap the player who called it, or SPIN to re-roll.`);
        }, "tick");
    }

    function awardLottery(playerIndex) {
        if (!state) return;
        const winner = state.players[playerIndex];
        if (!winner) { ledgerLog("⚠ Lottery", `No player at slot ${playerIndex} to award`); return; }
        const pot     = state.lotteryPot;
        const starter = state.lotteryStarter;
        commit("Lottery Win", `${winner.name} won ${formatMoney(pot)}`, () => {
            const w = state.players[playerIndex];
            if (!w) return;
            w.money += pot;
            state.lotteryPot = 10000;
            // Hand control back to whoever's turn it was when the lottery began.
            state.activePlayerIndex = (starter != null && state.players[starter]) ? starter : playerIndex;
            state.lotteryStarter = null;
            clearInput();
            const back = state.players[state.activePlayerIndex];
            setScreen("LOTTERY", `${winner.name} won!`,
                `${formatMoney(pot)} paid${back ? ` · ${back.name}'s turn` : ""}`);
        });
        playSound("lottery-win");
    }

    // ─── MARRIAGE (ring 3) ────────────────────────────────────────────────────
    //
    // First marriage: other players each give $1,000 wedding gift; +3,000 LIFE once;
    //                 +1,500 LIFE per turn from now on (while married flag is true).
    // Already married: other players give $500 anniversary gift; +3,000 LIFE once.

    function marriage() {
        const p0 = activePlayer();
        if (!p0) return;
        const wasMarried = p0.married;
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
    // Uses the CHANCE animation (ring 0/1/2): 0 = no baby, 1 = one baby, 2 = twins.
    // Other players pay $500 per baby as a gift.

    function enterBabyMode() {
        const p = activePlayer();
        if (!p || isAnimating) return;
        const roll      = randomInt(0, 2);
        const targetPos = CHANCE_INDICES.indexOf(roll);
        animateOptions(CHANCE_INDICES, targetPos, () => {
            if (roll === 0) {
                commit("Baby", "No baby this time", () => {
                    setScreen("BABY", "0", "Better luck next time");
                });
                playSound("money-sub");
            } else {
                addBaby(roll);
            }
        }, "tick");
    }

    function addBaby(count) {
        const p = activePlayer();
        if (!p) return;
        const yearlyRemaining = 2 - (p.babiesThisYear ?? 0);
        if (yearlyRemaining <= 0) {
            setScreen("Baby", "Year limit", "Max 2 babies per year");
            ledgerLog("⚠ Baby", `${p.name}: already had ${p.babiesThisYear} babies this year`);
            renderScreen(); playSound("error"); return;
        }
        const adding = Math.min(count, 9 - p.children, yearlyRemaining);
        if (adding <= 0) {
            setScreen("Baby", "Max 9 children", "Family limit reached");
            ledgerLog("⚠ Baby", `${p.name}: already has ${p.children} children`);
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

    // Menu of items the active player may buy (only those NOT owned) or
    // sell (only those owned) — so an owned item never appears as a "buy" option
    // and an unowned item never appears as a "sell" option.
    function carMenu(p, subMode) {
        return subMode === "sell"
            ? CAR_LIST.filter((c) => p.cars.some((oc) => oc.type === c.id))
            : CAR_LIST.filter((c) => !p.cars.some((oc) => oc.type === c.id));
    }
    function houseMenu(p, subMode) {
        return subMode === "sell"
            ? HOUSE_LIST.filter((h) => p.houses.some((oh) => oh.type === h.id))
            : HOUSE_LIST.filter((h) => !p.houses.some((oh) => oh.type === h.id));
    }

    function enterCarMode() {
        const p = activePlayer();
        if (!p) return;
        state.input = { mode: "car-buyorsell", sign: 1, buffer: "", subMode: null, index: 0 };
        const canBuy  = carMenu(p, "buy").length;
        const canSell = carMenu(p, "sell").length;
        setScreen("CAR", "Buy or Sell?",
            `${canBuy ? "+ buy" : "+ (none to buy)"} · ${canSell ? "− sell" : "− (none to sell)"} · UNDO cancels`);
        logInfo("Car", `${p.name} opened car menu (${canBuy} to buy, ${canSell} to sell)`);
        renderScreen();
    }

    function beginCarSelect(subMode) {
        const p    = activePlayer();
        if (!p) return;
        const list = carMenu(p, subMode);
        if (!list.length) {
            const msg = subMode === "sell" ? "You don't own any cars" : "You already own every car";
            setScreen("CAR", subMode === "sell" ? "Nothing to sell" : "Nothing to buy",
                `${msg} · draw a LIFE card instead`);
            ledgerLog("⚠ Car", `${p.name} cannot ${subMode}: ${msg}`);
            clearInput(); renderScreen(); playSound("error"); return;
        }
        state.input = { mode: "car-select", sign: 1, buffer: "", subMode, index: 0 };
        showCarOption(subMode, 0);
    }

    function showCarOption(subMode, index) {
        const p    = activePlayer();
        if (!p) return;
        const list  = carMenu(p, subMode);
        const car   = list[index];
        if (!car) return;
        const owned = p.cars.find((oc) => oc.type === car.id);
        const value = owned ? formatMoney(owned.value) : formatMoney(car.cost);
        const scroll = list.length > 1 ? " · +/− to scroll" : "";
        setScreen(`CAR ${subMode.toUpperCase()}`, car.name,
            `${car.name} · ${value} · ENTER to ${subMode}${scroll}`, car.icon);
        renderScreen();
    }

    function scrollCarSelect(dir) {
        const p    = activePlayer();
        if (!p) return;
        const list = carMenu(p, state.input.subMode);
        if (!list.length) return;
        state.input.index = ((state.input.index + dir) % list.length + list.length) % list.length;
        showCarOption(state.input.subMode, state.input.index);
    }

    function confirmCarSelect() {
        const p           = activePlayer();
        if (!p) return;
        const { subMode } = state.input;
        const list        = carMenu(p, subMode);
        const car = list[state.input.index];
        if (!car) {
            ledgerLog("⚠ Car Select", `Invalid index ${state.input.index} of ${list.length} — menu cancelled`);
            clearInput(); renderScreen(); playSound("error"); return;
        }
        clearInput();
        if (subMode === "buy") {
            commit("Buy Car", `Bought ${car.name} for ${formatMoney(car.cost)}`, () => {
                const pl = activePlayer();
                if (!pl) return;
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
        if (!p) return;
        const car = p.cars.find((c) => c.type === type);
        if (!car) { setScreen("CAR","Not owned",""); ledgerLog("⚠ Sell Car", `Car type "${type}" not found on ${p.name}`); renderScreen(); playSound("error"); return; }
        commit("Sell Car", `Sold ${CAR_TYPES[type].name} for ${formatMoney(car.value)}`, () => {
            const pl = activePlayer();
            if (!pl) return;
            const sold = pl.cars.find((c) => c.type === type);
            if (!sold) return;
            pl.money += sold.value;
            pl.cars   = pl.cars.filter((c) => c.type !== type);
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
        const p = activePlayer();
        if (!p) return;
        state.input = { mode: "house-buyorsell", sign: 1, buffer: "", subMode: null, index: 0 };
        const canBuy  = houseMenu(p, "buy").length;
        const canSell = houseMenu(p, "sell").length;
        setScreen("HOUSE", "Buy or Sell?",
            `${canBuy ? "+ buy" : "+ (none to buy)"} · ${canSell ? "− sell" : "− (none to sell)"} · UNDO cancels`);
        logInfo("House", `${p.name} opened house menu (${canBuy} to buy, ${canSell} to sell)`);
        renderScreen();
    }

    function beginHouseSelect(subMode) {
        const p    = activePlayer();
        if (!p) return;
        const list = houseMenu(p, subMode);
        if (!list.length) {
            const msg = subMode === "sell" ? "You don't own any houses" : "You already own every house";
            setScreen("HOUSE", subMode === "sell" ? "Nothing to sell" : "Nothing to buy",
                `${msg} · draw a LIFE card instead`);
            ledgerLog("⚠ House", `${p.name} cannot ${subMode}: ${msg}`);
            clearInput(); renderScreen(); playSound("error"); return;
        }
        state.input = { mode: "house-select", sign: 1, buffer: "", subMode, index: 0 };
        showHouseOption(subMode, 0);
    }

    function showHouseOption(subMode, index) {
        const p     = activePlayer();
        if (!p) return;
        const list  = houseMenu(p, subMode);
        const house = list[index];
        if (!house) return;
        const owned = p.houses.find((oh) => oh.type === house.id);
        const value = owned ? formatMoney(owned.value) : formatMoney(house.cost);
        const scroll = list.length > 1 ? " · +/− to scroll" : "";
        setScreen(`HOUSE ${subMode.toUpperCase()}`, house.name,
            `${house.name} · ${value} · ENTER to ${subMode}${scroll}`, house.icon);
        renderScreen();
    }

    function scrollHouseSelect(dir) {
        const p    = activePlayer();
        if (!p) return;
        const list = houseMenu(p, state.input.subMode);
        if (!list.length) return;
        state.input.index = ((state.input.index + dir) % list.length + list.length) % list.length;
        showHouseOption(state.input.subMode, state.input.index);
    }

    function confirmHouseSelect() {
        const p           = activePlayer();
        if (!p) return;
        const { subMode } = state.input;
        const list        = houseMenu(p, subMode);
        const house = list[state.input.index];
        if (!house) {
            ledgerLog("⚠ House Select", `Invalid index ${state.input.index} of ${list.length} — menu cancelled`);
            clearInput(); renderScreen(); playSound("error"); return;
        }
        clearInput();
        if (subMode === "buy") {
            commit("Buy House", `Bought ${house.name} for ${formatMoney(house.cost)}`, () => {
                const pl = activePlayer();
                if (!pl) return;
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
        if (!p) return;
        const house = p.houses.find((h) => h.type === type);
        if (!house) { setScreen("HOUSE","Not owned",""); ledgerLog("⚠ Sell House", `House type "${type}" not found on ${p.name}`); renderScreen(); playSound("error"); return; }
        commit("Sell House", `Sold ${HOUSE_TYPES[type].name} for ${formatMoney(house.value)}`, () => {
            const pl = activePlayer();
            if (!pl) return;
            const sold = pl.houses.find((h) => h.type === type);
            if (!sold) return;
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
                    carValue, houseValue, netWorth,
                    convertedLife:   converted,
                    totalLifePoints: p.lifePoints + converted
                };
            });
            const ranked = [...state.players].sort((a, b) => b.final.totalLifePoints - a.final.totalLifePoints);
            ranked.forEach((p, i) => { p.final.rank = i + 1; });
            state.finalCalculated = true;
            setScreen("WINNER", ranked[0].name, `${formatNumber(ranked[0].final.totalLifePoints)} LIFE Points — Game over!`);
        });
    }

    // ─── Ring button handler ──────────────────────────────────────────────────

    function handlePodKey(key) {
        if (!state || isAnimating) return;

        // While the lottery is waiting for a winner, only LOTTERY (re-roll) is
        // allowed via the ring — anything else would clobber the pending claim.
        if (state.input.mode === "lottery-pending" && key !== "lottery") {
            setScreen("LOTTERY", "Claim first", "Tap the winning player · SPIN/LOTTERY re-rolls · UNDO cancels");
            ledgerLog("⚠ Lottery", `"${key}" ignored — resolve the lottery first`);
            renderScreen(); playSound("error"); return;
        }

        const needsPlayer = ["salary", "marriage", "house", "car", "baby"];
        if (!activePlayer() && needsPlayer.includes(key)) {
            setScreen("No card", "Tap your card first", "Insert a Visa card to use this function");
            ledgerLog("⚠ No Card", `Tried to use ${key} button without a card`);
            renderScreen(); playSound("error"); return;
        }

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
            volume:   toggleMute,
            years:    () => setInputMode("years", 1)
        };
        handlers[key]?.();
    }

    // ─── Render ───────────────────────────────────────────────────────────────

    function render() {
        if (!state) state = createGame({ years: 10, players: DEFAULT_PLAYERS });
        if (dom.playerCountSelect) dom.playerCountSelect.value = String(state.players.length);
        renderStatus();
        renderPlayerSwitch();
        renderPlayers();
        renderLedger();
        renderScreen();
        renderFinalResults();
    }

    function renderPlayerSwitch() {
        if (!dom.playerSwitch) return;
        const claiming = state.input.mode === "lottery-pending";
        dom.playerSwitch.classList.toggle("is-claiming", claiming);
        const cur = activePlayer();
        const hint = claiming
            ? `<span class="pswitch-hint">🎟 Tap the winning player</span>`
            : "";
        dom.playerSwitch.innerHTML = hint + state.players.map((p, i) => {
            const color    = VISA_COLORS.find((c) => c.id === p.color);
            const isActive = !claiming && cur && p.id === cur.id;
            const first    = escapeHtml(p.name.split(" ")[0] || p.name);
            const num      = p.name.match(/\d+/)?.[0] || (i + 1);
            return `
                <button class="pswitch${isActive ? " is-active" : ""}" data-player-index="${i}"
                        style="--card-color: ${color ? color.hex : "#888"}" type="button"
                        aria-label="Switch to ${escapeHtml(p.name)}"${isActive ? ' aria-current="true"' : ""}>
                    <span class="pswitch-dot"></span>
                    <span class="pswitch-name">P${num}</span>
                    <span class="pswitch-cash">${formatMoney(p.money)}</span>
                </button>`;
        }).join("");
    }

    function renderStatus() {
        const p = activePlayer();
        dom.yearsLeft.textContent = state.yearsLeft;
        if (p) {
            dom.activeCard.textContent = `${p.colorName} ${p.card}`;
            dom.cardSlot.textContent   = `${p.colorName.toUpperCase()} ${p.card}`;
            dom.cardSlot.style.setProperty("--active-card-color", VISA_COLORS.find((c) => c.id === p.color).hex);
        } else {
            dom.activeCard.textContent = "No card";
            dom.cardSlot.textContent   = "NO CARD";
            dom.cardSlot.style.removeProperty("--active-card-color");
        }
        dom.lastSpin.textContent = state.lastSpin
            ? `${state.lastSpin.total} (${state.lastSpin.base}+${state.lastSpin.bonus})`
            : "−";
    }

    function renderPlayers() {
        const cur = activePlayer();
        dom.playerList.innerHTML = state.players.map((p, i) => {
            const color    = VISA_COLORS.find((c) => c.id === p.color);
            if (!color) return "";
            const carVal   = p.cars.reduce((s, c) => s + c.value, 0);
            const houseVal = p.houses.reduce((s, h) => s + h.value, 0);
            const isActive = cur && p.id === cur.id;
            const isWinner = p.final?.rank === 1;
            const finalHtml = p.final
                ? `<span class="stat-row final-stat-row"><span>${isWinner ? svgIcon("trophy", "final-trophy") : ""}#${p.final.rank} Final LIFE</span><strong class="final-pts">${formatNumber(p.final.totalLifePoints)}</strong></span>`
                : "";
            return `
                <button class="player-card${isActive ? " is-active" : ""}${isWinner ? " is-winner-card" : ""}" data-player-index="${i}" style="--card-color: ${color.hex}" type="button">
                    <span class="card-band"></span>
                    <span class="player-card-head">
                        <strong>${escapeHtml(p.name)}</strong>
                        <small>${p.colorName} ${p.card}${p.career ? " · " + escapeHtml(p.career) : ""}</small>
                    </span>
                    <span class="stat-row"><span>Money</span><strong data-stat="money">${formatMoney(p.money)}</strong></span>
                    <span class="stat-row"><span>LIFE</span><strong data-stat="life">${formatNumber(p.lifePoints)}</strong></span>
                    <span class="stat-row"><span>Salary</span><strong>${formatMoney(p.salary)}</strong></span>
                    <span class="asset-line">
                        ${p.married ? `<span class="asset-chip is-married">${svgIcon("rings", "asset-ic")} Married</span>` : ""}
                        <span class="asset-chip" title="Children">${svgIcon("baby", "asset-ic")} ${p.children}</span>
                        <span class="asset-chip" title="Cars">${svgIcon("car", "asset-ic")} ${p.cars.length}${carVal ? " · " + formatMoney(carVal) : ""}</span>
                        <span class="asset-chip" title="Houses">${svgIcon("house", "asset-ic")} ${p.houses.length}${houseVal ? " · " + formatMoney(houseVal) : ""}</span>
                    </span>
                    ${finalHtml}
                </button>
            `;
        }).join("");
    }

    function renderScreen() {
        if (!state) return;
        // Banner: mode label + value (a word OR a picture) + hint.
        // Overflowing words scroll via applyMarquee so the full phrase is readable.
        dom.screenMode.textContent = state.screen.mode;
        if (state.screen.icon) {
            dom.screenValue.innerHTML = lcdPic(state.screen.icon, state.screen.value);
            dom.lcdBanner?.classList.add("has-pic");
        } else {
            dom.screenValue.innerHTML = `<span class="marq">${escapeHtml(state.screen.value ?? "")}</span>`;
            dom.lcdBanner?.classList.remove("has-pic");
        }
        dom.screenHint.innerHTML = `<span class="marq">${escapeHtml(state.screen.hint ?? "")}</span>`;
        applyMarquee(dom.screenValue);
        applyMarquee(dom.screenHint);

        // LCD stat rows — always show active player's live stats
        const p   = activePlayer();
        const inp = state.input.mode;

        if (!p) {
            // No card inserted (e.g. lottery awaiting)
            dom.lcdHouses.textContent  = "–";
            dom.lcdCars.textContent    = "–";
            dom.lcdBabies.textContent  = "–";
            dom.lcdMoney.textContent   = "–––––––";
            dom.lcdMarried.classList.remove("is-on");
            dom.lcdLife.textContent    = "–––––––";
            dom.lcdYears.textContent   = state.yearsLeft;
            return;
        }

        dom.lcdHouses.textContent  = p.houses.length;
        dom.lcdCars.textContent    = p.cars.length;
        dom.lcdBabies.textContent  = p.children;
        dom.lcdMarried.classList.toggle("is-on", p.married);
        dom.lcdYears.textContent   = state.yearsLeft;

        // During digit entry, show input buffer in the relevant slot
        if (inp === "money" || inp === "salary") {
            dom.lcdMoney.textContent = state.screen.value || formatMoney(p.money);
            dom.lcdLife.textContent  = formatNumber(p.lifePoints);
        } else if (inp === "life") {
            dom.lcdMoney.textContent = formatMoney(p.money);
            dom.lcdLife.textContent  = state.screen.value || formatNumber(p.lifePoints);
        } else {
            dom.lcdMoney.textContent = formatMoney(p.money);
            dom.lcdLife.textContent  = formatNumber(p.lifePoints);
        }
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
                <article class="ledger-entry${entry.isError ? " is-error" : ""}">
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

    // isError true → red warning row; false → a plain info/debug row.
    function ledgerLog(action, detail, isError = true) {
        if (!state) return;
        state.ledger.unshift({
            id:       cryptoId(),
            at:       Date.now(),
            playerId: activePlayer()?.id || null,
            action,
            detail,
            before:   null,
            after:    null,
            isError
        });
        if (state.ledger.length > 60) state.ledger.length = 60;
        renderLedger();
    }
    // Convenience: a non-error debug/info breadcrumb in the ledger.
    function logInfo(action, detail) { ledgerLog(action, detail, false); }

    function ledgerDelta(b, a) {
        return [
            b.money      !== a.money      ? `Money ${formatMoney(b.money)} → ${formatMoney(a.money)}`             : null,
            b.lifePoints !== a.lifePoints ? `LIFE ${formatNumber(b.lifePoints)} → ${formatNumber(a.lifePoints)}` : null,
            b.salary     !== a.salary     ? `Salary ${formatMoney(b.salary)} → ${formatMoney(a.salary)}`         : null
        ].filter(Boolean).join(" | ") || "No change";
    }

    function renderFinalResults() {
        if (!state) return;
        if (!state.finalCalculated) {
            dom.finalResults.innerHTML = `<p class="microcopy">Final scores will appear here after the last year ends.</p>`;
            return;
        }
        const sorted  = [...state.players].sort((a, b) => b.final.totalLifePoints - a.final.totalLifePoints);
        const rowStep = 0.8;        // seconds between each row within a card
        const cardGap = rowStep * 8; // 6.4s — all 7 rows finish before next card starts

        dom.finalResults.innerHTML = sorted.map((p, i) => {
            const cd       = i * cardGap;
            const carRow   = p.final.carValue > 0
                ? `<span class="final-row" style="animation-delay:${(cd + rowStep).toFixed(2)}s"><span>${svgIcon("car", "final-ic")}Cars liquidated</span><span>${formatMoney(p.final.carValue)}</span></span>`
                : "";
            const houseRow = p.final.houseValue > 0
                ? `<span class="final-row" style="animation-delay:${(cd + rowStep * 2).toFixed(2)}s"><span>${svgIcon("house", "final-ic")}Houses liquidated</span><span>${formatMoney(p.final.houseValue)}</span></span>`
                : "";
            return `
                <article class="final-card${p.final.rank === 1 ? " winner" : ""}" style="animation-delay:${cd.toFixed(2)}s">
                    <div class="final-card-head">
                        <span class="final-rank">#${p.final.rank}</span>
                        ${p.final.rank === 1 ? svgIcon("trophy", "final-trophy") : ""}
                        <strong>${escapeHtml(p.name)}</strong>
                    </div>
                    <div class="final-breakdown">
                        ${carRow}
                        ${houseRow}
                        <span class="final-row" style="animation-delay:${(cd + rowStep * 3).toFixed(2)}s"><span>${svgIcon("cash", "final-ic")}Cash</span><span>${formatMoney(p.money)}</span></span>
                        <span class="final-row" style="animation-delay:${(cd + rowStep * 4).toFixed(2)}s"><span>Net worth</span><strong>${formatMoney(p.final.netWorth)}</strong></span>
                        <span class="final-row" style="animation-delay:${(cd + rowStep * 5).toFixed(2)}s"><span>÷ ${formatMoney(state.finalRatio)}/pt</span><span>→ +${formatNumber(p.final.convertedLife)} LP</span></span>
                        <span class="final-row" style="animation-delay:${(cd + rowStep * 6).toFixed(2)}s"><span>${svgIcon("heart", "final-ic")}Game LIFE</span><span>${formatNumber(p.lifePoints)}</span></span>
                        <span class="final-row final-total" style="animation-delay:${(cd + rowStep * 7).toFixed(2)}s"><span>Total LIFE Points</span><strong>${formatNumber(p.final.totalLifePoints)}</strong></span>
                    </div>
                </article>
            `;
        }).join("");
    }

    function createFunctionRing() {
        dom.functionRing.innerHTML = POD_BUTTONS.map((btn, i) => `
            <button class="ring-button" data-pod-key="${btn.key}" style="--i: ${i}" type="button" aria-label="${btn.label || btn.number}">
                <strong>${btn.number}</strong>
                ${btn.icon ? svgIcon(btn.icon, "ring-ic") : ""}
                ${btn.label ? `<span class="ring-word">${btn.label}</span>` : ""}
            </button>
        `).join("");
    }

    // ─── Finals helper ────────────────────────────────────────────────────────

    function showFinalDialog() {
        if (state.finalCalculated) return;
        calculateFinals();
        try {
            if (!dom.finalDialog.open) dom.finalDialog.showModal();
        } catch (_) {
            dom.finalDialog.setAttribute("open", "");
        }
        // Re-render after dialog opens so CSS animations start from zero
        renderFinalResults();
        // Sell sound fires as each player's first row appears; fanfare after last player's total
        const n = state.players.length;
        for (let i = 0; i < n; i++) {
            setTimeout(() => playSound("sell"), i * 6400 + 800);
        }
        setTimeout(() => playSound("lottery-win"), n * 6400 + 400);
    }

    // ─── In-window confirm dialog ─────────────────────────────────────────────

    function showConfirm(message, onYes, onNo = () => {}) {
        dom.confirmMessage.textContent = message;
        dom.confirmDialog.showModal();
        dom.confirmYes.onclick = () => { dom.confirmDialog.close(); onYes(); };
        dom.confirmNo.onclick  = () => { dom.confirmDialog.close(); onNo(); };
    }

    // ─── Event binding ────────────────────────────────────────────────────────

    function bindEvents() {
        dom.resetButton.addEventListener("click", () => {
            if (isAnimating) return;
            const count = Math.max(2, Math.min(4, Number(dom.playerCountSelect.value) || 4));
            showConfirm(`Reset and start a new ${count}-player game?`, () => {
                state = createGame({ years: 10, players: DEFAULT_PLAYERS.slice(0, count) });
                saveState();
                render();
            });
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
                else if (a === "mode-money")    { if (state && !isAnimating) setInputMode("money", 1); }
                else if (a === "mode-life")     { if (state && !isAnimating) setInputMode("life",  1); }
                return;
            }

            // Visa card OR switcher chip tap → select that player (ends prev turn,
            // or claims the lottery). Both carry data-player-index.
            const playerCard = e.target.closest("[data-player-index]");
            if (playerCard) {
                switchToPlayer(Number(playerCard.dataset.playerIndex));
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

        dom.playerCountSelect.addEventListener("change", () => {
            if (isAnimating) { dom.playerCountSelect.value = String(state.players.length); return; }
            const count = Math.max(2, Math.min(4, Number(dom.playerCountSelect.value) || 4));
            showConfirm(`Start a new ${count}-player game? Current game will be lost.`, () => {
                state = createGame({ years: 10, players: DEFAULT_PLAYERS.slice(0, count) });
                saveState();
                render();
            }, () => {
                dom.playerCountSelect.value = String(state.players.length);
            });
        });

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

    createFunctionRing();
    syncVolumeIcon();
    bindEvents();
    saveState();
    registerServiceWorker();
    render();

})();
