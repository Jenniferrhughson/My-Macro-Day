import { useState, useMemo, useEffect, useRef } from "react";

// ─── Constants ───────────────────────────────────────────────────────────────
const GOALS = { calories: 1700, protein: 149, carbs: 149, fat: 57 };

const BASE_SPLITS = [
  { id: "breakfast", label: "Breakfast", icon: "☀️", split: { calories: 0.206, protein: 0.201, carbs: 0.235, fat: 0.140 } },
  { id: "snack1",    label: "Snack 1",   icon: "🍃", split: { calories: 0.088, protein: 0.101, carbs: 0.101, fat: 0.053 } },
  { id: "lunch",     label: "Lunch",     icon: "🌿", split: { calories: 0.265, protein: 0.268, carbs: 0.268, fat: 0.263 } },
  { id: "snack2",    label: "Snack 2",   icon: "🍋", split: { calories: 0.088, protein: 0.094, carbs: 0.128, fat: 0.053 } },
  { id: "dinner",    label: "Dinner",    icon: "🌙", split: { calories: 0.353, protein: 0.336, carbs: 0.268, fat: 0.491 } },
];

const SLOT_ORDER = ["breakfast", "snack1", "lunch", "snack2", "dinner"];
const TOLERANCE = 0.10;
const EMPTY_SLOTS = { breakfast: [], snack1: [], lunch: [], snack2: [], dinner: [] };
const DAY_NAMES = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
const MONTH_NAMES = ["January","February","March","April","May","June","July","August","September","October","November","December"];

function todayKey() { return new Date().toISOString().slice(0, 10); }
function dateKey(d) { return d.toISOString().slice(0, 10); }
function addDays(d, n) { const r = new Date(d); r.setDate(r.getDate() + n); return r; }
let _nextId = Date.now();
function newId() { return _nextId++; }

// ─── Design tokens ────────────────────────────────────────────────────────────
const C = {
  bg: "#f5f0e8",           // warm champagne background
  bgCard: "#E9D09A",       // deep champagne — cards
  bgWarm: "#e8dfc8",       // slightly deeper champagne for inputs
  bgSand: "#AE9067",       // light taupe — secondary surfaces
  text: "#341E10",         // dark sienna — primary text
  textMid: "#59280D",      // seal brown — secondary text
  textLight: "#AE9067",    // light taupe — muted text
  accent: "#59280D",       // seal brown — primary accent
  accentWarm: "#AE9067",   // taupe — secondary accent
  accentSoft: "#C9CABD",   // pale silver — subtle
  good: "#59280D",         // seal brown for on-track
  under: "#8B1A1A",        // deep red for under
  over: "#8B1A1A",         // deep red for over
  border: "rgba(89,40,13,0.15)",
  borderMid: "rgba(89,40,13,0.3)",
};

// ─── Macro logic ─────────────────────────────────────────────────────────────
function computeTargets(slotActuals, goals = { calories: 1700, protein: 149, carbs: 149, fat: 57 }) {
  const targets = {};
  let spent = { calories: 0, protein: 0, carbs: 0, fat: 0 };
  SLOT_ORDER.forEach((id, i) => {
    const act = slotActuals[id];
    const hasLogged = act.calories > 0 || act.protein > 0 || act.carbs > 0 || act.fat > 0;
    const futureSlots = BASE_SPLITS.slice(i);
    const totalFuture = futureSlots.reduce((a, s) => ({
      calories: a.calories + s.split.calories, protein: a.protein + s.split.protein,
      carbs: a.carbs + s.split.carbs, fat: a.fat + s.split.fat,
    }), { calories: 0, protein: 0, carbs: 0, fat: 0 });
    const budget = {
      calories: GOALS.calories - spent.calories, protein: GOALS.protein - spent.protein,
      carbs: GOALS.carbs - spent.carbs, fat: GOALS.fat - spent.fat,
    };
    const sl = BASE_SPLITS[i];
    targets[id] = {
      calories: Math.round(totalFuture.calories > 0 ? budget.calories * (sl.split.calories / totalFuture.calories) : 0),
      protein:  Math.round(totalFuture.protein  > 0 ? budget.protein  * (sl.split.protein  / totalFuture.protein)  : 0),
      carbs:    Math.round(totalFuture.carbs    > 0 ? budget.carbs    * (sl.split.carbs    / totalFuture.carbs)    : 0),
      fat:      Math.round(totalFuture.fat      > 0 ? budget.fat      * (sl.split.fat      / totalFuture.fat)      : 0),
    };
    if (hasLogged) {
      spent.calories += act.calories; spent.protein += act.protein;
      spent.carbs += act.carbs; spent.fat += act.fat;
    }
  });
  return targets;
}

function slotTotals(items) {
  return (items || []).reduce((a, item) => ({
    calories: a.calories + item.food.calories * item.servings,
    protein:  a.protein  + item.food.protein  * item.servings,
    carbs:    a.carbs    + item.food.carbs    * item.servings,
    fat:      a.fat      + item.food.fat      * item.servings,
  }), { calories: 0, protein: 0, carbs: 0, fat: 0 });
}

function dayTotals(daySlots) {
  if (!daySlots) return { calories: 0, protein: 0, carbs: 0, fat: 0 };
  return SLOT_ORDER.reduce((a, id) => {
    const t = slotTotals(daySlots[id]);
    return { calories: a.calories + t.calories, protein: a.protein + t.protein, carbs: a.carbs + t.carbs, fat: a.fat + t.fat };
  }, { calories: 0, protein: 0, carbs: 0, fat: 0 });
}

function pillStatus(actual, target) {
  if (actual === 0) return "empty";
  const r = actual / target;
  if (r >= 1 - TOLERANCE && r <= 1 + TOLERANCE) return "good";
  return actual < target ? "under" : "over";
}

// ─── Open Food Facts search ───────────────────────────────────────────────────
// ─── CalorieNinjas food search (CORS-friendly, natural language) ──────────────
const CALORIE_NINJAS_KEY = "YOUR_API_KEY_HERE"; // free at calorieninjas.com/api

async function searchOpenFoodFacts(query) {
  const url = `https://api.calorieninjas.com/v1/nutrition?query=${encodeURIComponent(query)}`;
  const res = await fetch(url, { headers: { "X-Api-Key": CALORIE_NINJAS_KEY } });
  if (!res.ok) throw new Error("Search failed");
  const data = await res.json();
  return (data.items || []).map(item => ({
    id: "cn_" + Math.random(),
    name: item.name.charAt(0).toUpperCase() + item.name.slice(1),
    per100g: {
      calories: parseFloat(item.calories) || 0,
      protein:  parseFloat(item.protein_g) || 0,
      carbs:    parseFloat(item.carbohydrates_total_g) || 0,
      fat:      parseFloat(item.fat_total_g) || 0,
    },
    calories: Math.round(parseFloat(item.calories) || 0),
    protein:  Math.round((parseFloat(item.protein_g) || 0) * 10) / 10,
    carbs:    Math.round((parseFloat(item.carbohydrates_total_g) || 0) * 10) / 10,
    fat:      Math.round((parseFloat(item.fat_total_g) || 0) * 10) / 10,
    serving:  `100g`,
    fromDatabase: true,
  })).filter(p => p.calories > 0);
}

// ─── Amount parser ────────────────────────────────────────────────────────────
// Converts "4 oz", "200g", "1 cup", "2 tbsp", "100ml" → grams
function parseAmountToGrams(input) {
  const s = input.trim().toLowerCase();
  const num = parseFloat(s);
  if (isNaN(num)) return null;

  if (s.includes("oz"))   return num * 28.3495;
  if (s.includes("lb"))   return num * 453.592;
  if (s.includes("kg"))   return num * 1000;
  if (s.includes("mg"))   return num * 0.001;
  if (s.includes("g"))    return num; // catches "g", "grams", "gram"
  if (s.includes("cup"))  return num * 240;   // approximate
  if (s.includes("tbsp") || s.includes("tablespoon")) return num * 15;
  if (s.includes("tsp")  || s.includes("teaspoon"))   return num * 5;
  if (s.includes("ml"))   return num;          // ml ≈ g for water-based foods
  if (s.includes("l") && !s.includes("lb"))   return num * 1000;
  return num; // bare number → assume grams
}

// ─── Amount Entry Modal ───────────────────────────────────────────────────────
function AmountModal({ food, onConfirm, onClose, onSaveToLibrary }) {
  const [amount, setAmount] = useState("");
  const [saveToLib, setSaveToLib] = useState(false);
  const inputRef = useRef(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  const grams = parseAmountToGrams(amount);
  const hasGrams = grams !== null && grams > 0;

  // Calculate macros from per100g if available, else use food's own macros scaled by servings
  const computed = useMemo(() => {
    if (!hasGrams) return null;
    if (food.per100g && food.per100g.calories > 0) {
      const ratio = grams / 100;
      return {
        calories: Math.round(food.per100g.calories * ratio),
        protein:  Math.round(food.per100g.protein  * ratio * 10) / 10,
        carbs:    Math.round(food.per100g.carbs    * ratio * 10) / 10,
        fat:      Math.round(food.per100g.fat      * ratio * 10) / 10,
      };
    }
    // Library food — just use its macros as-is (1 serving = the macros listed)
    return { calories: food.calories, protein: food.protein, carbs: food.carbs, fat: food.fat };
  }, [grams, food, hasGrams]);

  const handleConfirm = () => {
    if (!computed) return;
    const entry = {
      ...food,
      id: food.id.toString().startsWith("off_") ? newId() : food.id,
      calories: computed.calories,
      protein:  computed.protein,
      carbs:    computed.carbs,
      fat:      computed.fat,
      serving:  amount.trim() || food.serving,
    };
    if (saveToLib) onSaveToLibrary({ ...entry, per100g: food.per100g });
    onConfirm(entry);
  };

  const QUICK = ["1 oz","2 oz","4 oz","5.5 oz","100g","150g","200g","1 cup","½ cup"];

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(61,53,48,0.45)", zIndex: 300, display: "flex", alignItems: "flex-end", justifyContent: "center", backdropFilter: "blur(6px)" }} onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{ width: "100%", maxWidth: 480, background: C.bg, borderRadius: "24px 24px 0 0", padding: "24px 24px 32px", boxShadow: "0 -8px 40px rgba(100,80,60,0.15)" }}>

        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20 }}>
          <div>
            <div style={{ fontFamily: "'Lora', Georgia, serif", fontSize: 19, color: C.text, lineHeight: 1.3, marginBottom: 4 }}>{food.name}</div>
            <div style={{ fontSize: 12, color: C.textLight, fontFamily: "'DM Sans', sans-serif" }}>
              {food.per100g ? `Per 100g: ${Math.round(food.per100g.calories)} cal · ${food.per100g.protein?.toFixed(1)}P · ${food.per100g.carbs?.toFixed(1)}C · ${food.per100g.fat?.toFixed(1)}F` : `${food.serving} · ${food.calories} cal`}
            </div>
          </div>
          <button onClick={onClose} style={{ background: C.bgSand, border: "none", color: C.textMid, borderRadius: 10, width: 32, height: 32, cursor: "pointer", fontSize: 16, flexShrink: 0 }}>✕</button>
        </div>

        {/* Amount input */}
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 12, color: C.textLight, marginBottom: 8, fontFamily: "'DM Sans', sans-serif", letterSpacing: 0.3 }}>How much did you have?</div>
          <input
            ref={inputRef}
            value={amount}
            onChange={e => setAmount(e.target.value)}
            onKeyDown={e => e.key === "Enter" && handleConfirm()}
            placeholder="e.g. 4 oz, 150g, 1 cup, 2 tbsp…"
            style={{ ...INP, fontSize: 17, padding: "13px 16px" }}
          />
        </div>

        {/* Quick amount chips */}
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 18 }}>
          {QUICK.map(q => (
            <button key={q} onClick={() => setAmount(q)} style={{ background: amount === q ? C.accent : C.bgWarm, border: `1px solid ${amount === q ? C.accent : C.border}`, color: amount === q ? "#fff" : C.textMid, borderRadius: 20, padding: "6px 13px", fontSize: 13, cursor: "pointer", fontFamily: "'DM Sans', sans-serif", transition: "all 0.15s" }}>{q}</button>
          ))}
        </div>

        {/* Live macro preview */}
        {computed ? (
          <div style={{ background: C.bgWarm, borderRadius: 14, padding: "14px 16px", marginBottom: 18, border: `1px solid ${C.border}` }}>
            <div style={{ fontSize: 11, color: C.textLight, letterSpacing: 1.2, textTransform: "uppercase", marginBottom: 10, fontFamily: "'DM Sans', sans-serif" }}>Macros for {amount}</div>
            <div style={{ display: "flex", gap: 16, justifyContent: "space-around" }}>
              {[["Calories", computed.calories, ""],["Protein", computed.protein, "g"],["Carbs", computed.carbs, "g"],["Fat", computed.fat, "g"]].map(([lbl, val, unit]) => (
                <div key={lbl} style={{ textAlign: "center" }}>
                  <div style={{ fontSize: 11, color: C.textLight, fontFamily: "'DM Sans', sans-serif", marginBottom: 3 }}>{lbl}</div>
                  <div style={{ fontSize: 20, fontWeight: 700, color: C.text, fontFamily: "'DM Sans', sans-serif", lineHeight: 1 }}>{val}<span style={{ fontSize: 12, color: C.textLight, fontWeight: 400 }}>{unit}</span></div>
                </div>
              ))}
            </div>
          </div>
        ) : amount.trim() ? (
          <div style={{ background: C.bgWarm, borderRadius: 14, padding: "12px 16px", marginBottom: 18, fontSize: 13, color: C.textLight, fontFamily: "'DM Sans', sans-serif" }}>
            Try formats like: <strong>4 oz</strong>, <strong>150g</strong>, <strong>1 cup</strong>, <strong>2 tbsp</strong>
          </div>
        ) : null}

        {/* Save to library toggle */}
        {food.fromDatabase && (
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 18, cursor: "pointer" }} onClick={() => setSaveToLib(v => !v)}>
            <div style={{ width: 22, height: 22, borderRadius: 6, border: `1.5px solid ${saveToLib ? C.accent : C.border}`, background: saveToLib ? C.accent : "transparent", display: "flex", alignItems: "center", justifyContent: "center", transition: "all 0.2s", flexShrink: 0 }}>
              {saveToLib && <span style={{ color: "#fff", fontSize: 13, lineHeight: 1 }}>✓</span>}
            </div>
            <span style={{ fontSize: 13, color: C.textMid, fontFamily: "'DM Sans', sans-serif" }}>Save to my library for next time</span>
          </div>
        )}

        {/* Confirm */}
        <button
          onClick={handleConfirm}
          disabled={!computed}
          style={{ width: "100%", background: computed ? C.accent : C.bgSand, border: "none", color: computed ? "#fff" : C.textLight, borderRadius: 14, padding: "14px", fontSize: 16, fontWeight: 600, cursor: computed ? "pointer" : "default", fontFamily: "'DM Sans', sans-serif", transition: "all 0.2s" }}
        >
          {computed ? `Add ${computed.calories} cal to meal` : "Enter an amount above"}
        </button>
      </div>
    </div>
  );
}

// ─── Autocomplete Food Search ─────────────────────────────────────────────────
function FoodSearch({ foods, onSelect, onSaveToLibrary, placeholder = "Search foods…" }) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [dbResults, setDbResults] = useState([]);
  const [dbLoading, setDbLoading] = useState(false);
  const [pendingFood, setPendingFood] = useState(null); // food awaiting amount entry
  const ref = useRef(null);
  const timerRef = useRef(null);

  const localResults = useMemo(() => {
    if (!query.trim()) return [];
    return foods.filter(f => f.name.toLowerCase().includes(query.toLowerCase())).slice(0, 4);
  }, [query, foods]);

  useEffect(() => {
    if (!query.trim() || query.length < 3) { setDbResults([]); return; }
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(async () => {
      setDbLoading(true);
      try { setDbResults(await searchOpenFoodFacts(query)); }
      catch { setDbResults([]); }
      finally { setDbLoading(false); }
    }, 500);
    return () => clearTimeout(timerRef.current);
  }, [query]);

  useEffect(() => {
    function handleClick(e) { if (ref.current && !ref.current.contains(e.target)) setOpen(false); }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const pickFood = (food) => {
    setOpen(false);
    setPendingFood(food); // open amount modal
  };

  const confirmAmount = (food) => {
    onSelect(food);
    setPendingFood(null);
    setQuery("");
    setDbResults([]);
  };

  const hasResults = localResults.length > 0 || dbResults.length > 0 || dbLoading;

  return (
    <>
      <div ref={ref} style={{ position: "relative", flex: 1 }}>
        <input
          value={query}
          onChange={e => { setQuery(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          placeholder={placeholder}
          style={{ width: "100%", background: C.bgWarm, border: `1px solid ${C.border}`, borderRadius: 12, padding: "11px 16px", fontSize: 15, color: C.text, outline: "none", fontFamily: "'DM Sans', sans-serif", boxSizing: "border-box" }}
        />
        {open && query.length >= 1 && (hasResults || query.length >= 3) && (
          <div style={{ position: "absolute", top: "calc(100% + 6px)", left: 0, right: 0, zIndex: 200, background: C.bgCard, borderRadius: 16, boxShadow: "0 12px 40px rgba(100,80,60,0.16)", border: `1px solid ${C.border}`, overflow: "hidden", maxHeight: 380, overflowY: "auto" }}>

            {localResults.length > 0 && (
              <>
                <div style={{ padding: "8px 16px 4px", fontSize: 10, color: C.textLight, letterSpacing: 1.5, textTransform: "uppercase", fontFamily: "'DM Sans', sans-serif" }}>My Library</div>
                {localResults.map(food => (
                  <FoodRow key={food.id} food={food} onSelect={() => pickFood(food)} showSave={false} />
                ))}
              </>
            )}

            {(dbResults.length > 0 || dbLoading) && (
              <>
                <div style={{ padding: "8px 16px 4px", fontSize: 10, color: C.textLight, letterSpacing: 1.5, textTransform: "uppercase", fontFamily: "'DM Sans', sans-serif", borderTop: localResults.length > 0 ? `1px solid ${C.border}` : "none" }}>
                  USDA Database {dbLoading && <span style={{ opacity: 0.5 }}>searching…</span>}
                </div>
                {dbResults.map(food => (
                  <FoodRow key={food.id} food={food} onSelect={() => pickFood(food)} showSave={false} />
                ))}
              </>
            )}

            {!dbLoading && !hasResults && query.length >= 3 && (
              <div style={{ padding: "16px", fontSize: 14, color: C.textLight, textAlign: "center" }}>No results found</div>
            )}
          </div>
        )}
      </div>

      {pendingFood && (
        <AmountModal
          food={pendingFood}
          onConfirm={confirmAmount}
          onClose={() => setPendingFood(null)}
          onSaveToLibrary={onSaveToLibrary}
        />
      )}
    </>
  );
}

function FoodRow({ food, onSelect }) {
  const [hovered, setHovered] = useState(false);
  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onMouseDown={onSelect}
      style={{ padding: "11px 16px", background: hovered ? C.bgWarm : "transparent", display: "flex", alignItems: "center", gap: 10, borderBottom: `1px solid ${C.border}`, cursor: "pointer" }}
    >
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 14, color: C.text, fontWeight: 500, marginBottom: 2 }}>{food.name}</div>
        <div style={{ fontSize: 11, color: C.textLight, fontFamily: "'DM Sans', sans-serif" }}>
          {food.per100g ? `${Math.round(food.per100g.calories)} cal/100g · ${food.per100g.protein?.toFixed(1)}P · ${food.per100g.carbs?.toFixed(1)}C · ${food.per100g.fat?.toFixed(1)}F` : `${food.serving} · ${food.calories} cal · ${food.protein}P · ${food.carbs}C · ${food.fat}F`}
        </div>
      </div>
      <span style={{ fontSize: 12, color: C.textLight }}>→</span>
    </div>
  );
}

// ─── Macro Pill ───────────────────────────────────────────────────────────────
function MacroPill({ label, actual, target }) {
  const st = pillStatus(actual, target);
  const logged = actual > 0;
  const color = st === "good" ? "#4a7c4a" : st === "empty" ? C.textLight : "#8B1A1A";
  const bg = st === "good" ? "rgba(74,124,74,0.12)" : st === "empty" ? "rgba(89,40,13,0.06)" : "rgba(139,26,26,0.1)";
  const border = logged ? color + "40" : C.border;
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", background: bg, borderRadius: 10, padding: "7px 10px", minWidth: 60, border: `1px solid ${border}`, transition: "all 0.3s" }}>
      <span style={{ fontSize: 9, color: C.textLight, letterSpacing: 1.2, fontFamily: "'DM Sans', sans-serif", marginBottom: 3, textTransform: "uppercase" }}>{label}</span>
      <span style={{ fontSize: 16, fontWeight: 500, color: logged ? color : C.textLight, fontFamily: "'Lora', Georgia, serif", fontStyle: "italic", lineHeight: 1 }}>{logged ? Math.round(actual) : "—"}</span>
      <span style={{ fontSize: 9, color: C.textLight, fontFamily: "'DM Sans', sans-serif", marginTop: 2 }}>/{target}{label === "CAL" ? "" : "g"}</span>
      {logged && st !== "empty" && (
        <span style={{ fontSize: 8, color, marginTop: 3, fontWeight: 600, fontFamily: "'DM Sans', sans-serif" }}>{st === "good" ? "✓" : st === "under" ? "↑ more" : "↓ over"}</span>
      )}
    </div>
  );
}

// ─── Total Bar ────────────────────────────────────────────────────────────────
function TotalBar({ label, value, goal }) {
  const pct = Math.min((value / goal) * 100, 100);
  const good = value >= goal * (1 - TOLERANCE) && value <= goal * (1 + TOLERANCE);
  const barColor = good ? "#4a7c4a" : value > 0 ? "#8B1A1A" : C.accentSoft;
  return (
    <div style={{ flex: 1 }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
        <span style={{ fontSize: 11, color: C.textMid, letterSpacing: 0.5 }}>{label}</span>
        <span style={{ fontSize: 11, fontFamily: "'Lora', Georgia, serif", fontStyle: "italic", color: value > 0 ? barColor : C.textLight, fontWeight: 500 }}>
          {Math.round(value)}<span style={{ color: C.textLight, fontWeight: 400, fontStyle: "normal", fontSize: 10 }}>/{goal}</span>
        </span>
      </div>
      <div style={{ height: 5, background: C.bgSand, borderRadius: 3 }}>
        <div style={{ height: "100%", width: `${pct}%`, background: barColor, borderRadius: 3, transition: "width 0.5s ease, background 0.3s" }} />
      </div>
    </div>
  );
}

// ─── Macro dots for calendar ──────────────────────────────────────────────────
function MacroDots({ totals }) {
  if (!totals || totals.calories === 0) return null;
  const macros = [
    { key: "calories", goal: GOALS.calories },
    { key: "protein",  goal: GOALS.protein  },
    { key: "carbs",    goal: GOALS.carbs    },
    { key: "fat",      goal: GOALS.fat      },
  ];
  return (
    <div style={{ display: "flex", gap: 2, justifyContent: "center", marginTop: 3 }}>
      {macros.map(m => {
        const st = pillStatus(totals[m.key], m.goal);
        return <div key={m.key} style={{ width: 4, height: 4, borderRadius: "50%", background: st === "good" ? "#4a7c4a" : st === "empty" ? C.textLight : "#8B1A1A" }} />;
      })}
    </div>
  );
}



// ─── Recipe Review Modal ──────────────────────────────────────────────────────
function RecipeModal({ recipe, onSave, onClose }) {
  const [name, setName] = useState(recipe.name || "");
  const [servings, setServings] = useState(recipe.servings || 1);
  const [source, setSource] = useState(recipe.source || "");
  const [tags, setTags] = useState((recipe.tags || []).join(", "));
  const [ingredients, setIngredients] = useState(recipe.ingredients?.length ? recipe.ingredients.map(i => ({ ...i, id: newId() })) : [{ id: newId(), name: "", calories: 0, protein: 0, carbs: 0, fat: 0, amount: "" }]);
  const [saveMode, setSaveMode] = useState("whole");
  const [notes, setNotes] = useState(recipe.notes || "");

  const totals = useMemo(() => ingredients.reduce((a, ing) => ({
    calories: a.calories + (parseFloat(ing.calories) || 0), protein: a.protein + (parseFloat(ing.protein) || 0),
    carbs: a.carbs + (parseFloat(ing.carbs) || 0), fat: a.fat + (parseFloat(ing.fat) || 0),
  }), { calories: 0, protein: 0, carbs: 0, fat: 0 }), [ingredients]);

  const perServing = {
    calories: Math.round(totals.calories / (servings || 1)), protein: Math.round(totals.protein / (servings || 1)),
    carbs: Math.round(totals.carbs / (servings || 1)), fat: Math.round(totals.fat / (servings || 1)),
  };

  const updateIng = (id, field, val) => setIngredients(prev => prev.map(i => i.id === id ? { ...i, [field]: val } : i));
  const removeIng = (id) => setIngredients(prev => prev.filter(i => i.id !== id));
  const addIng = () => setIngredients(prev => [...prev, { id: newId(), name: "", calories: 0, protein: 0, carbs: 0, fat: 0, amount: "" }]);

  const handleSave = () => {
    const base = { id: newId(), name, source, tags: tags.split(",").map(t => t.trim()).filter(Boolean), notes, servings, ingredients, perServing };
    if (saveMode === "whole") {
      onSave({ recipe: base, foods: [{ id: newId(), name, calories: perServing.calories, protein: perServing.protein, carbs: perServing.carbs, fat: perServing.fat, serving: `1 serving (1/${servings} recipe)`, isRecipe: true }], mode: "whole" });
    } else {
      onSave({ recipe: base, foods: ingredients.map(ing => ({ id: newId(), name: ing.name || "Ingredient", calories: Math.round(parseFloat(ing.calories) || 0), protein: Math.round(parseFloat(ing.protein) || 0), carbs: Math.round(parseFloat(ing.carbs) || 0), fat: Math.round(parseFloat(ing.fat) || 0), serving: ing.amount || "1 serving", isRecipe: true })), mode: "ingredients" });
    }
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(61,53,48,0.5)", zIndex: 100, display: "flex", alignItems: "flex-end", justifyContent: "center", backdropFilter: "blur(4px)" }}>
      <div style={{ width: "100%", maxWidth: 600, background: C.bg, borderRadius: "24px 24px 0 0", maxHeight: "92dvh", display: "flex", flexDirection: "column", boxShadow: "0 -8px 40px rgba(100,80,60,0.15)" }}>
        <div style={{ padding: "20px 24px 16px", borderBottom: `1px solid ${C.border}`, flexShrink: 0 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
            <span style={{ fontFamily: "Georgia, serif", fontSize: 22, color: C.text }}>Review Recipe</span>
            <button onClick={onClose} style={{ background: C.bgSand, border: "none", color: C.textMid, borderRadius: 10, width: 34, height: 34, cursor: "pointer", fontSize: 16 }}>✕</button>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <input placeholder="Recipe name *" value={name} onChange={e => setName(e.target.value)} style={INP} />
            <input placeholder="Source URL" value={source} onChange={e => setSource(e.target.value)} style={INP} />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: 10, marginTop: 10, alignItems: "center" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ fontSize: 14, color: C.textMid }}>Servings</span>
              <input type="number" min="1" value={servings} onChange={e => setServings(parseInt(e.target.value) || 1)} style={{ ...INP, width: 70 }} />
            </div>
            <input placeholder="Tags (comma separated)" value={tags} onChange={e => setTags(e.target.value)} style={INP} />
          </div>
        </div>
        <div style={{ padding: "14px 24px", background: "rgba(138,171,137,0.07)", borderBottom: `1px solid ${C.border}`, flexShrink: 0 }}>
          <div style={{ fontSize: 11, color: C.textLight, letterSpacing: 1.5, marginBottom: 10, textTransform: "uppercase" }}>Per Serving ÷{servings}</div>
          <div style={{ display: "flex", gap: 20 }}>
            {[["Cal", perServing.calories, ""], ["Protein", perServing.protein, "g"], ["Carbs", perServing.carbs, "g"], ["Fat", perServing.fat, "g"]].map(([lbl, val]) => (
              <div key={lbl}>
                <div style={{ fontSize: 11, color: C.textLight }}>{lbl}</div>
                <div style={{ fontSize: 20, fontFamily: "Georgia, serif", color: C.accent, fontWeight: 700 }}>{val}</div>
              </div>
            ))}
          </div>
        </div>
        <div style={{ flex: 1, overflowY: "auto", padding: "16px 24px" }}>
          <div style={{ fontSize: 11, color: C.textLight, letterSpacing: 1.5, marginBottom: 12, textTransform: "uppercase" }}>Ingredients — edit as needed</div>
          {ingredients.map((ing, idx) => (
            <div key={ing.id} style={{ marginBottom: 12, background: C.bgCard, borderRadius: 14, padding: "12px 14px", border: `1px solid ${C.border}` }}>
              <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
                <input placeholder={`Ingredient ${idx + 1}`} value={ing.name} onChange={e => updateIng(ing.id, "name", e.target.value)} style={{ ...INP, flex: 2, fontSize: 14, padding: "9px 12px" }} />
                <input placeholder="Amount" value={ing.amount} onChange={e => updateIng(ing.id, "amount", e.target.value)} style={{ ...INP, flex: 1, fontSize: 14, padding: "9px 12px" }} />
                <button onClick={() => removeIng(ing.id)} style={{ background: "none", border: "none", color: C.textLight, cursor: "pointer", fontSize: 18, padding: "0 4px" }}>×</button>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 6 }}>
                {[["calories","Cal"],["protein","Protein"],["carbs","Carbs"],["fat","Fat"]].map(([k, lbl]) => (
                  <div key={k}>
                    <div style={{ fontSize: 10, color: C.textLight, marginBottom: 3 }}>{lbl}</div>
                    <input type="number" value={ing[k]} onChange={e => updateIng(ing.id, k, e.target.value)} style={{ ...INP, fontSize: 13, padding: "7px 10px" }} />
                  </div>
                ))}
              </div>
            </div>
          ))}
          <button onClick={addIng} style={{ width: "100%", background: "transparent", border: `1.5px dashed ${C.borderMid}`, color: C.textMid, borderRadius: 12, padding: "10px", fontSize: 14, cursor: "pointer", marginBottom: 14 }}>+ Add ingredient</button>
          <textarea placeholder="Notes (optional)" value={notes} onChange={e => setNotes(e.target.value)} rows={3} style={{ ...INP, resize: "vertical", fontSize: 14 }} />
        </div>
        <div style={{ padding: "16px 24px", borderTop: `1px solid ${C.border}`, flexShrink: 0 }}>
          <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
            {[["whole","📦 Whole recipe","1 item per serving"],["ingredients","🧩 Ingredients","log each separately"]].map(([mode, label, sub]) => (
              <button key={mode} onClick={() => setSaveMode(mode)} style={{ flex: 1, padding: "11px", borderRadius: 12, border: `1.5px solid ${saveMode === mode ? C.accent : C.border}`, background: saveMode === mode ? "rgba(138,171,137,0.1)" : "transparent", color: saveMode === mode ? C.accent : C.textMid, cursor: "pointer", fontSize: 13, fontWeight: 600, fontFamily: "inherit" }}>
                {label}<br /><span style={{ fontSize: 11, fontWeight: 400, opacity: 0.7 }}>{sub}</span>
              </button>
            ))}
          </div>
          <button onClick={handleSave} disabled={!name} style={{ width: "100%", background: name ? C.accent : C.bgSand, border: "none", color: name ? "#fff" : C.textLight, borderRadius: 14, padding: "14px", fontSize: 15, fontWeight: 600, cursor: name ? "pointer" : "default", fontFamily: "inherit", transition: "all 0.2s" }}>
            Save to Recipe Book + Library
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── AI Recipe Fetcher ────────────────────────────────────────────────────────
async function fetchRecipeFromUrl(url) {
  const prompt = `You are a nutrition assistant. The user has provided this recipe URL: ${url}
Extract the recipe and estimate macros for each ingredient.
Return ONLY valid JSON (no markdown):
{"name":"Recipe name","servings":4,"source":"${url}","tags":["dinner"],"notes":"","ingredients":[{"name":"Chicken breast","amount":"200g","calories":220,"protein":41,"carbs":0,"fat":5}]}
Estimate macros based on typical amounts. Be accurate.`;
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model: "claude-sonnet-4-20250514", max_tokens: 1500, tools: [{ type: "web_search_20250305", name: "web_search" }], messages: [{ role: "user", content: prompt }] }),
  });
  const data = await response.json();
  const text = data.content.filter(b => b.type === "text").map(b => b.text).join("");
  const match = text.replace(/```json\n?|\n?```/g, "").match(/\{[\s\S]*\}/);
  if (!match) throw new Error("Could not parse recipe");
  return JSON.parse(match[0]);
}

// ─── History View ─────────────────────────────────────────────────────────────
function HistoryView() {
  const today = new Date();
  const [calMonth, setCalMonth] = useState(new Date(today.getFullYear(), today.getMonth(), 1));
  const [selectedDay, setSelectedDay] = useState(null);
  const [historyMode, setHistoryMode] = useState("week");

  const allDayData = useMemo(() => {
    const result = {};
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key?.startsWith("md_slots_")) {
        try { const d = JSON.parse(localStorage.getItem(key)); if (d) result[key.replace("md_slots_", "")] = d; } catch {}
      }
    }
    return result;
  }, []);

  const weekDays = useMemo(() => Array.from({ length: 7 }, (_, i) => { const d = addDays(today, -(6-i)); return { date: d, key: dateKey(d) }; }), []);

  const calDays = useMemo(() => {
    const first = new Date(calMonth.getFullYear(), calMonth.getMonth(), 1);
    const last = new Date(calMonth.getFullYear(), calMonth.getMonth() + 1, 0);
    const days = [];
    for (let i = 0; i < first.getDay(); i++) days.push(null);
    for (let d = 1; d <= last.getDate(); d++) days.push(new Date(calMonth.getFullYear(), calMonth.getMonth(), d));
    return days;
  }, [calMonth]);

  const selectedData = selectedDay ? allDayData[selectedDay] : null;
  const selectedTotals = selectedData ? dayTotals(selectedData) : null;
  const fmt = (d) => new Date(d + "T00:00:00").toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });

  const DayDetail = ({ data, totals }) => (
    <div style={{ padding: "16px 20px" }}>
      <div style={{ display: "flex", gap: 12, marginBottom: 16 }}>
        <TotalBar label="Cal" value={totals.calories} goal={GOALS.calories} />
        <TotalBar label="Protein" value={totals.protein} goal={GOALS.protein} />
        <TotalBar label="Carbs" value={totals.carbs} goal={GOALS.carbs} />
        <TotalBar label="Fat" value={totals.fat} goal={GOALS.fat} />
      </div>
      {BASE_SPLITS.map(slot => {
        const items = data[slot.id] || [];
        if (!items.length) return null;
        const st = slotTotals(items);
        return (
          <div key={slot.id} style={{ marginBottom: 12, background: C.bgCard, borderRadius: 14, padding: "12px 16px", border: `1px solid ${C.border}` }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
              <span style={{ fontSize: 16 }}>{slot.icon}</span>
              <span style={{ fontSize: 14, fontWeight: 600, color: C.text }}>{slot.label}</span>
              <span style={{ fontSize: 11, color: C.textLight, marginLeft: "auto", fontFamily: "'Lora', Georgia, serif" }}>
                {Math.round(st.calories)}cal · {Math.round(st.protein)}P · {Math.round(st.carbs)}C · {Math.round(st.fat)}F
              </span>
            </div>
            {items.map(item => (
              <div key={item.food.id} style={{ display: "flex", justifyContent: "space-between", padding: "5px 0", borderTop: `1px solid ${C.border}` }}>
                <span style={{ fontSize: 14, color: C.textMid }}>{item.food.name} <span style={{ color: C.textLight }}>× {item.servings}</span></span>
                <span style={{ fontSize: 12, fontFamily: "'Lora', Georgia, serif", color: C.textLight }}>{Math.round(item.food.calories * item.servings)} cal</span>
              </div>
            ))}
          </div>
        );
      })}
    </div>
  );

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
      <div style={{ padding: "12px 20px", borderBottom: `1px solid ${C.border}`, display: "flex", gap: 8, flexShrink: 0 }}>
        {[["week","Last 7 Days"],["month","Monthly"]].map(([m, lbl]) => (
          <button key={m} onClick={() => { setHistoryMode(m); setSelectedDay(null); }} style={{ flex: 1, padding: "10px", borderRadius: 12, border: `1.5px solid ${historyMode === m ? C.accent : C.border}`, background: historyMode === m ? "rgba(138,171,137,0.1)" : "transparent", color: historyMode === m ? C.accent : C.textMid, fontSize: 14, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>{lbl}</button>
        ))}
      </div>
      <div style={{ flex: 1, overflowY: "auto", WebkitOverflowScrolling: "touch" }}>
        {historyMode === "week" && weekDays.map(({ date, key }) => {
          const data = allDayData[key];
          const totals = dayTotals(data);
          const isToday = key === todayKey();
          const hasData = totals.calories > 0;
          const isSelected = selectedDay === key;
          return (
            <div key={key}>
              <div onClick={() => hasData && setSelectedDay(isSelected ? null : key)} style={{ padding: "16px 20px", borderBottom: `1px solid ${C.border}`, cursor: hasData ? "pointer" : "default", background: isSelected ? "rgba(138,171,137,0.05)" : "transparent" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                  <div style={{ minWidth: 85 }}>
                    <div style={{ fontSize: 15, fontWeight: 600, color: isToday ? C.accent : C.text }}>{isToday ? "Today" : DAY_NAMES[date.getDay()]}</div>
                    <div style={{ fontSize: 12, color: C.textLight, marginTop: 1 }}>{date.toLocaleDateString("en-US", { month: "short", day: "numeric" })}</div>
                  </div>
                  {hasData ? (
                    <div style={{ flex: 1, display: "flex", gap: 10 }}>
                      <TotalBar label="Cal" value={totals.calories} goal={GOALS.calories} />
                      <TotalBar label="Prot" value={totals.protein} goal={GOALS.protein} />
                      <TotalBar label="Carb" value={totals.carbs} goal={GOALS.carbs} />
                      <TotalBar label="Fat" value={totals.fat} goal={GOALS.fat} />
                    </div>
                  ) : <div style={{ fontSize: 14, color: C.textLight, fontStyle: "italic" }}>Nothing logged</div>}
                  {hasData && <span style={{ color: C.textLight, fontSize: 12 }}>{isSelected ? "▲" : "▼"}</span>}
                </div>
              </div>
              {isSelected && data && (
                <div style={{ background: C.bgWarm, borderBottom: `1px solid ${C.border}` }}>
                  <DayDetail data={data} totals={totals} />
                </div>
              )}
            </div>
          );
        })}

        {historyMode === "month" && (
          <div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 20px", borderBottom: `1px solid ${C.border}` }}>
              <button onClick={() => setCalMonth(new Date(calMonth.getFullYear(), calMonth.getMonth() - 1, 1))} style={{ background: C.bgSand, border: "none", color: C.textMid, borderRadius: 10, width: 36, height: 36, fontSize: 18, cursor: "pointer" }}>‹</button>
              <span style={{ fontFamily: "Georgia, serif", fontSize: 20, color: C.text }}>{MONTH_NAMES[calMonth.getMonth()]} {calMonth.getFullYear()}</span>
              <button onClick={() => setCalMonth(new Date(calMonth.getFullYear(), calMonth.getMonth() + 1, 1))} disabled={calMonth >= new Date(today.getFullYear(), today.getMonth(), 1)} style={{ background: C.bgSand, border: "none", color: C.textMid, borderRadius: 10, width: 36, height: 36, fontSize: 18, cursor: "pointer", opacity: calMonth >= new Date(today.getFullYear(), today.getMonth(), 1) ? 0.3 : 1 }}>›</button>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", padding: "10px 12px 4px" }}>
              {DAY_NAMES.map(d => <div key={d} style={{ textAlign: "center", fontSize: 11, color: C.textLight, letterSpacing: 0.5 }}>{d}</div>)}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 4, padding: "4px 12px 12px" }}>
              {calDays.map((date, i) => {
                if (!date) return <div key={`e${i}`} />;
                const key = dateKey(date);
                const data = allDayData[key];
                const totals = dayTotals(data);
                const hasData = totals.calories > 0;
                const isToday = key === todayKey();
                const isFuture = date > today;
                const isSelected = selectedDay === key;
                return (
                  <div key={key} onClick={() => !isFuture && hasData && setSelectedDay(isSelected ? null : key)} style={{ aspectRatio: "1", borderRadius: 10, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", background: isSelected ? "rgba(138,171,137,0.2)" : isToday ? "rgba(138,171,137,0.1)" : hasData ? C.bgCard : "transparent", border: isToday ? `1.5px solid ${C.accent}` : isSelected ? `1.5px solid ${C.accent}` : `1px solid ${C.border}`, cursor: hasData && !isFuture ? "pointer" : "default", opacity: isFuture ? 0.3 : 1 }}>
                    <span style={{ fontSize: 13, fontWeight: isToday ? 700 : 400, color: isToday ? C.accent : hasData ? C.text : C.textLight }}>{date.getDate()}</span>
                    <MacroDots totals={totals} />
                  </div>
                );
              })}
            </div>
            <div style={{ display: "flex", gap: 14, padding: "0 20px 14px", justifyContent: "center" }}>
              {[[C.good,"On target"],[C.under,"Off target"]].map(([color, label]) => (
                <div key={label} style={{ display: "flex", alignItems: "center", gap: 5 }}>
                  <div style={{ width: 6, height: 6, borderRadius: "50%", background: color }} />
                  <span style={{ fontSize: 11, color: C.textLight }}>{label}</span>
                </div>
              ))}
            </div>
            {selectedDay && selectedData && (
              <div style={{ borderTop: `1px solid ${C.border}`, background: C.bgWarm }}>
                <div style={{ padding: "14px 20px 0", fontSize: 15, fontWeight: 600, color: C.accent, fontFamily: "Georgia, serif" }}>{fmt(selectedDay)}</div>
                <DayDetail data={selectedData} totals={selectedTotals} />
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Quick Manual Entry Modal ─────────────────────────────────────────────────
function QuickEntryModal({ slot, onAdd, onClose }) {
  const [name, setName] = useState("");
  const [cals, setCals] = useState("");
  const [protein, setProtein] = useState("");
  const [carbs, setCarbs] = useState("");
  const [fat, setFat] = useState("");
  const [saveToLib, setSaveToLib] = useState(false);
  const nameRef = useRef(null);
  useEffect(() => { nameRef.current?.focus(); }, []);

  const valid = cals && parseFloat(cals) > 0;

  const handleAdd = () => {
    if (!valid) return;
    const food = {
      id: newId(),
      name: name.trim() || "Custom entry",
      calories: Math.round(parseFloat(cals) || 0),
      protein:  Math.round((parseFloat(protein) || 0) * 10) / 10,
      carbs:    Math.round((parseFloat(carbs)   || 0) * 10) / 10,
      fat:      Math.round((parseFloat(fat)     || 0) * 10) / 10,
      serving: "1 serving",
    };
    onAdd(food, saveToLib);
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(61,53,48,0.45)", zIndex: 300, display: "flex", alignItems: "flex-end", justifyContent: "center", backdropFilter: "blur(6px)" }} onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{ width: "100%", maxWidth: 480, background: C.bg, borderRadius: "24px 24px 0 0", padding: "24px 24px 36px", boxShadow: "0 -8px 40px rgba(100,80,60,0.15)" }}>

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <div>
            <div style={{ fontFamily: "'Lora', Georgia, serif", fontSize: 20, color: C.text }}>Quick Entry</div>
            <div style={{ fontSize: 12, color: C.textLight, marginTop: 3 }}>{slot.icon} {slot.label} · type in your macros directly</div>
          </div>
          <button onClick={onClose} style={{ background: C.bgSand, border: "none", color: C.textMid, borderRadius: 10, width: 32, height: 32, cursor: "pointer", fontSize: 16 }}>✕</button>
        </div>

        {/* Name */}
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 12, color: C.textLight, marginBottom: 6 }}>Name (optional)</div>
          <input ref={nameRef} value={name} onChange={e => setName(e.target.value)} onKeyDown={e => e.key === "Enter" && handleAdd()} placeholder="e.g. Protein bar, Homemade smoothie…" style={INP} />
        </div>

        {/* Macros grid */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 18 }}>
          {[
            ["Calories *", cals, setCals, "🔥"],
            ["Protein (g)", protein, setProtein, "💪"],
            ["Carbs (g)", carbs, setCarbs, "🌾"],
            ["Fat (g)", fat, setFat, "🫒"],
          ].map(([lbl, val, set, icon]) => (
            <div key={lbl}>
              <div style={{ fontSize: 12, color: C.textLight, marginBottom: 6, display: "flex", alignItems: "center", gap: 4 }}>
                <span>{icon}</span><span>{lbl}</span>
              </div>
              <input
                type="number" value={val}
                onChange={e => set(e.target.value)}
                onKeyDown={e => e.key === "Enter" && handleAdd()}
                placeholder="0"
                style={{ ...INP, fontSize: 20, padding: "12px 14px", fontFamily: "'Lora', Georgia, serif", fontWeight: 600, color: C.accent, textAlign: "center" }}
              />
            </div>
          ))}
        </div>

        {/* Save to library toggle */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20, cursor: "pointer" }} onClick={() => setSaveToLib(v => !v)}>
          <div style={{ width: 22, height: 22, borderRadius: 6, border: `1.5px solid ${saveToLib ? C.accent : C.border}`, background: saveToLib ? C.accent : "transparent", display: "flex", alignItems: "center", justifyContent: "center", transition: "all 0.2s", flexShrink: 0 }}>
            {saveToLib && <span style={{ color: "#fff", fontSize: 13 }}>✓</span>}
          </div>
          <span style={{ fontSize: 13, color: C.textMid }}>Save to my library for next time</span>
        </div>

        <button
          onClick={handleAdd}
          disabled={!valid}
          style={{ width: "100%", background: valid ? C.accent : C.bgSand, border: "none", color: valid ? "#fff" : C.textLight, borderRadius: 14, padding: "14px", fontSize: 16, fontWeight: 600, cursor: valid ? "pointer" : "default", fontFamily: "'DM Sans', sans-serif", transition: "all 0.2s" }}
        >
          {valid ? `Add ${Math.round(parseFloat(cals))} cal to ${slot.label}` : "Enter calories to continue"}
        </button>
      </div>
    </div>
  );
}

// ─── Save Meal as Recipe Modal ────────────────────────────────────────────────
function SaveMealAsRecipeModal({ slot, items, onSave, onClose }) {
  const [name, setName] = useState("");
  const [tags, setTags] = useState(slot.label.toLowerCase());
  const inputRef = useRef(null);
  useEffect(() => { inputRef.current?.focus(); }, []);

  const totals = items.reduce((a, item) => ({
    calories: a.calories + item.food.calories * item.servings,
    protein:  a.protein  + item.food.protein  * item.servings,
    carbs:    a.carbs    + item.food.carbs    * item.servings,
    fat:      a.fat      + item.food.fat      * item.servings,
  }), { calories: 0, protein: 0, carbs: 0, fat: 0 });

  const rounded = {
    calories: Math.round(totals.calories),
    protein:  Math.round(totals.protein * 10) / 10,
    carbs:    Math.round(totals.carbs   * 10) / 10,
    fat:      Math.round(totals.fat     * 10) / 10,
  };

  const handleSave = () => {
    if (!name.trim()) return;
    const food = {
      id: newId(),
      name: name.trim(),
      calories: rounded.calories,
      protein:  rounded.protein,
      carbs:    rounded.carbs,
      fat:      rounded.fat,
      serving: "1 serving (full meal)",
      isRecipe: true,
      tags: tags.split(",").map(t => t.trim()).filter(Boolean),
      ingredients: items.map(item => ({
        name: item.food.name,
        amount: `${item.servings} serving`,
        calories: Math.round(item.food.calories * item.servings),
        protein:  Math.round(item.food.protein  * item.servings * 10) / 10,
        carbs:    Math.round(item.food.carbs    * item.servings * 10) / 10,
        fat:      Math.round(item.food.fat      * item.servings * 10) / 10,
      })),
    };
    onSave(food);
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(61,53,48,0.45)", zIndex: 300, display: "flex", alignItems: "flex-end", justifyContent: "center", backdropFilter: "blur(6px)" }} onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{ width: "100%", maxWidth: 480, background: C.bg, borderRadius: "24px 24px 0 0", padding: "24px 24px 36px", boxShadow: "0 -8px 40px rgba(100,80,60,0.15)" }}>

        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <div>
            <div style={{ fontFamily: "'Lora', Georgia, serif", fontSize: 20, color: C.text }}>Save as Recipe</div>
            <div style={{ fontSize: 12, color: C.textLight, fontFamily: "'DM Sans', sans-serif", marginTop: 3 }}>{slot.icon} {slot.label} · {items.length} item{items.length !== 1 ? "s" : ""}</div>
          </div>
          <button onClick={onClose} style={{ background: C.bgSand, border: "none", color: C.textMid, borderRadius: 10, width: 32, height: 32, cursor: "pointer", fontSize: 16 }}>✕</button>
        </div>

        {/* Macro preview */}
        <div style={{ background: C.bgWarm, borderRadius: 14, padding: "14px 16px", marginBottom: 20, border: `1px solid ${C.border}` }}>
          <div style={{ fontSize: 11, color: C.textLight, letterSpacing: 1.2, textTransform: "uppercase", marginBottom: 10, fontFamily: "'DM Sans', sans-serif" }}>Total macros (1 serving)</div>
          <div style={{ display: "flex", gap: 16, justifyContent: "space-around" }}>
            {[["Calories", rounded.calories, ""], ["Protein", rounded.protein, "g"], ["Carbs", rounded.carbs, "g"], ["Fat", rounded.fat, "g"]].map(([lbl, val, unit]) => (
              <div key={lbl} style={{ textAlign: "center" }}>
                <div style={{ fontSize: 11, color: C.textLight, fontFamily: "'DM Sans', sans-serif", marginBottom: 3 }}>{lbl}</div>
                <div style={{ fontSize: 20, fontWeight: 700, color: C.text, fontFamily: "'DM Sans', sans-serif", lineHeight: 1 }}>{val}<span style={{ fontSize: 12, color: C.textLight, fontWeight: 400 }}>{unit}</span></div>
              </div>
            ))}
          </div>
        </div>

        {/* Ingredients list */}
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 11, color: C.textLight, letterSpacing: 1.2, textTransform: "uppercase", marginBottom: 8, fontFamily: "'DM Sans', sans-serif" }}>Ingredients</div>
          <div style={{ background: C.bgCard, borderRadius: 12, border: `1px solid ${C.border}`, overflow: "hidden" }}>
            {items.map((item, i) => (
              <div key={item.food.id} style={{ padding: "10px 14px", borderBottom: i < items.length - 1 ? `1px solid ${C.border}` : "none", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: 14, color: C.text }}>{item.food.name}</span>
                <span style={{ fontSize: 12, color: C.textLight, fontFamily: "'DM Sans', sans-serif" }}>{Math.round(item.food.calories * item.servings)} cal</span>
              </div>
            ))}
          </div>
        </div>

        {/* Name input */}
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 12, color: C.textLight, marginBottom: 7, fontFamily: "'DM Sans', sans-serif" }}>Recipe name *</div>
          <input
            ref={inputRef}
            value={name}
            onChange={e => setName(e.target.value)}
            onKeyDown={e => e.key === "Enter" && handleSave()}
            placeholder={`e.g. My ${slot.label} Bowl`}
            style={{ ...INP, fontSize: 16 }}
          />
        </div>

        {/* Tags */}
        <div style={{ marginBottom: 22 }}>
          <div style={{ fontSize: 12, color: C.textLight, marginBottom: 7, fontFamily: "'DM Sans', sans-serif" }}>Tags (comma separated)</div>
          <input value={tags} onChange={e => setTags(e.target.value)} placeholder="breakfast, high protein, quick…" style={{ ...INP, fontSize: 14 }} />
        </div>

        <button
          onClick={handleSave}
          disabled={!name.trim()}
          style={{ width: "100%", background: name.trim() ? C.accent : C.bgSand, border: "none", color: name.trim() ? "#fff" : C.textLight, borderRadius: 14, padding: "14px", fontSize: 16, fontWeight: 600, cursor: name.trim() ? "pointer" : "default", fontFamily: "'DM Sans', sans-serif", transition: "all 0.2s" }}
        >
          Save to Library
        </button>
      </div>
    </div>
  );
}

// ─── Week helpers ─────────────────────────────────────────────────────────────
function getWeekStart(date = new Date()) {
  const d = new Date(date);
  const day = d.getDay(); // 0=Sun
  const diff = day === 0 ? -6 : 1 - day; // roll back to Monday
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

function getThisWeekKeys() {
  const start = getWeekStart();
  return Array.from({ length: 7 }, (_, i) => dateKey(addDays(start, i)));
}

// ─── Insights View ────────────────────────────────────────────────────────────
function InsightsView({ goals, targetPct, onUpdateGoals, onUpdateTargetPct }) {
  const [editingPct, setEditingPct] = useState(false);
  const [draftPct, setDraftPct] = useState(targetPct);

  const weekKeys = useMemo(() => getThisWeekKeys(), []);
  const today = todayKey();

  const weekData = useMemo(() => {
    return weekKeys.map(key => {
      try {
        const raw = localStorage.getItem("md_slots_" + key);
        const data = raw ? JSON.parse(raw) : null;
        const totals = dayTotals(data);
        const hasData = totals.calories > 0;
        const date = new Date(key + "T00:00:00");
        const isPast = key <= today;
        return { key, date, totals, hasData, isPast };
      } catch {
        return { key, date: new Date(key + "T00:00:00"), totals: { calories: 0, protein: 0, carbs: 0, fat: 0 }, hasData: false, isPast: key <= today };
      }
    });
  }, [weekKeys, today]);

  const loggedDays = weekData.filter(d => d.hasData && d.isPast);
  const pastDays = weekData.filter(d => d.isPast);

  const weekAvg = useMemo(() => {
    if (!loggedDays.length) return { calories: 0, protein: 0, carbs: 0, fat: 0 };
    const sum = loggedDays.reduce((a, d) => ({
      calories: a.calories + d.totals.calories,
      protein:  a.protein  + d.totals.protein,
      carbs:    a.carbs    + d.totals.carbs,
      fat:      a.fat      + d.totals.fat,
    }), { calories: 0, protein: 0, carbs: 0, fat: 0 });
    return {
      calories: Math.round(sum.calories / loggedDays.length),
      protein:  Math.round(sum.protein  / loggedDays.length),
      carbs:    Math.round(sum.carbs    / loggedDays.length),
      fat:      Math.round(sum.fat      / loggedDays.length),
    };
  }, [loggedDays]);

  // Per-day macro % of goal
  const dayScores = useMemo(() => {
    return weekData.map(d => {
      if (!d.hasData) return { ...d, macros: null, score: null };
      const macros = {
        calories: Math.round((d.totals.calories / goals.calories) * 100),
        protein:  Math.round((d.totals.protein  / goals.protein)  * 100),
        carbs:    Math.round((d.totals.carbs    / goals.carbs)    * 100),
        fat:      Math.round((d.totals.fat      / goals.fat)      * 100),
      };
      // Score = average of how close each macro is (capped at 100%)
      const score = Math.round(["calories","protein","carbs","fat"].reduce((a, k) => a + Math.min(macros[k], 100), 0) / 4);
      return { ...d, macros, score };
    });
  }, [weekData, goals]);

  const daysHittingTarget = dayScores.filter(d => d.score !== null && d.score >= targetPct).length;
  const avgWeekScore = loggedDays.length
    ? Math.round(dayScores.filter(d => d.score !== null).reduce((a, d) => a + d.score, 0) / loggedDays.length)
    : null;

  const macroInsight = (key, label, avg, goal) => {
    const pct = goal > 0 ? Math.round((avg / goal) * 100) : 0;
    const diff = avg - goal;
    const color = pct >= targetPct && pct <= 110 ? C.good : C.under;
    const msg = pct >= targetPct && pct <= 110
      ? `On track this week ✓`
      : pct < targetPct
        ? `Averaging ${Math.abs(diff).toFixed(0)}${key === "calories" ? " cal" : "g"} under`
        : `Averaging ${Math.abs(diff).toFixed(0)}${key === "calories" ? " cal" : "g"} over`;
    return { pct, color, msg };
  };

  const saveGoals = () => {
    onUpdateGoals({
      calories: parseInt(draftGoals.calories) || goals.calories,
      protein:  parseInt(draftGoals.protein)  || goals.protein,
      carbs:    parseInt(draftGoals.carbs)    || goals.carbs,
      fat:      parseInt(draftGoals.fat)      || goals.fat,
    });
    setEditingGoals(false);
  };

  const savePct = () => {
    onUpdateTargetPct(Math.max(50, Math.min(100, parseInt(draftPct) || 85)));
    setEditingPct(false);
  };

  const ScoreChip = ({ score }) => {
    if (score === null) return <span style={{ fontSize: 11, color: C.textLight }}>—</span>;
    const color = score >= targetPct ? C.good : C.under;
    return <span style={{ fontSize: 13, fontWeight: 700, color, fontFamily: "'DM Sans', sans-serif" }}>{score}%</span>;
  };

  return (
    <div style={{ flex: 1, overflowY: "auto", WebkitOverflowScrolling: "touch" }}>

      {/* Week header */}
      <div style={{ padding: "16px 20px 12px", borderBottom: `1px solid ${C.border}`, background: C.bgCard }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div>
            <div style={{ fontFamily: "'Lora', Georgia, serif", fontSize: 20, color: C.text, marginBottom: 2 }}>This Week</div>
            <div style={{ fontSize: 12, color: C.textLight, fontFamily: "'DM Sans', sans-serif" }}>
              Mon {weekKeys[0].slice(5)} — Sun {weekKeys[6].slice(5)} · {loggedDays.length} of {pastDays.length} days logged
            </div>
          </div>
          {avgWeekScore !== null && (
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: 28, fontWeight: 700, fontFamily: "'DM Sans', sans-serif", color: avgWeekScore >= targetPct ? C.good : C.under, lineHeight: 1 }}>{avgWeekScore}%</div>
              <div style={{ fontSize: 11, color: C.textLight }}>weekly avg</div>
            </div>
          )}
        </div>
      </div>

      {/* Target % setting */}
      <div style={{ padding: "14px 20px", background: C.bgWarm, borderBottom: `1px solid ${C.border}`, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 600, color: C.text }}>Weekly target</div>
          <div style={{ fontSize: 12, color: C.textLight, fontFamily: "'DM Sans', sans-serif" }}>Aim to hit at least this % of your goals each day</div>
        </div>
        {editingPct ? (
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <input
              type="number" min="50" max="100" value={draftPct}
              onChange={e => setDraftPct(e.target.value)}
              style={{ ...INP, width: 70, textAlign: "center", padding: "7px 10px", fontSize: 15 }}
            />
            <span style={{ color: C.textMid, fontSize: 15 }}>%</span>
            <button onClick={savePct} style={{ background: C.accent, border: "none", color: "#fff", borderRadius: 10, padding: "7px 14px", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>Save</button>
          </div>
        ) : (
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontSize: 22, fontWeight: 700, color: C.accent, fontFamily: "'DM Sans', sans-serif" }}>{targetPct}%</span>
            <button onClick={() => { setDraftPct(targetPct); setEditingPct(true); }} style={{ background: C.bgSand, border: `1px solid ${C.border}`, color: C.textMid, borderRadius: 8, padding: "5px 12px", fontSize: 12, cursor: "pointer" }}>Edit</button>
          </div>
        )}
      </div>

      {/* Day-by-day macro scores */}
      <div style={{ padding: "16px 20px 8px" }}>
        <div style={{ fontSize: 11, color: C.textLight, letterSpacing: 1.5, textTransform: "uppercase", marginBottom: 12, fontFamily: "'DM Sans', sans-serif" }}>Daily breakdown</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {dayScores.map(d => {
            const isToday = d.key === today;
            const dayLabel = isToday ? "Today" : ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"][d.date.getDay() === 0 ? 6 : d.date.getDay() - 1];
            return (
              <div key={d.key} style={{ background: C.bgCard, borderRadius: 14, padding: "12px 16px", border: `1px solid ${d.score !== null && d.score >= targetPct ? "rgba(122,170,122,0.25)" : d.score !== null ? "rgba(201,122,107,0.2)" : C.border}` }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: d.macros ? 10 : 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontSize: 14, fontWeight: 600, color: isToday ? C.accent : C.text, minWidth: 36 }}>{dayLabel}</span>
                    <span style={{ fontSize: 11, color: C.textLight, fontFamily: "'DM Sans', sans-serif" }}>{d.date.toLocaleDateString("en-US", { month: "short", day: "numeric" })}</span>
                    {!d.hasData && d.isPast && <span style={{ fontSize: 11, color: C.textLight, fontStyle: "italic" }}>not logged</span>}
                    {!d.isPast && <span style={{ fontSize: 11, color: C.textLight, fontStyle: "italic" }}>upcoming</span>}
                  </div>
                  <ScoreChip score={d.score} />
                </div>
                {d.macros && (
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 8 }}>
                    {[["Cal", "calories", "#c4956a"], ["Prot", "protein", "#7aabe8"], ["Carb", "carbs", C.accent], ["Fat", "fat", "#b5866a"]].map(([lbl, key, color]) => {
                      const pct = d.macros[key];
                      const barPct = Math.min(pct, 100);
                      const isGood = pct >= targetPct && pct <= 110;
                      return (
                        <div key={key}>
                          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                            <span style={{ fontSize: 10, color: C.textLight, fontFamily: "'DM Sans', sans-serif" }}>{lbl}</span>
                            <span style={{ fontSize: 10, fontFamily: "'DM Sans', sans-serif", fontWeight: 600, color: isGood ? C.good : C.under }}>{pct}%</span>
                          </div>
                          <div style={{ height: 4, background: C.bgSand, borderRadius: 2 }}>
                            <div style={{ height: "100%", width: `${barPct}%`, background: isGood ? C.good : C.under, borderRadius: 2, transition: "width 0.4s" }} />
                          </div>
                          {/* Target line marker */}
                          <div style={{ position: "relative", height: 0 }}>
                            <div style={{ position: "absolute", top: -4, left: `${targetPct}%`, width: 1.5, height: 8, background: C.textLight, borderRadius: 1, transform: "translateX(-50%)" }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Weekly avg macros */}
      {loggedDays.length > 0 && (
        <div style={{ padding: "16px 20px" }}>
          <div style={{ fontSize: 11, color: C.textLight, letterSpacing: 1.5, textTransform: "uppercase", marginBottom: 12, fontFamily: "'DM Sans', sans-serif" }}>Weekly averages</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {[["calories","Calories",weekAvg.calories,goals.calories,"cal"],["protein","Protein",weekAvg.protein,goals.protein,"g"],["carbs","Carbs",weekAvg.carbs,goals.carbs,"g"],["fat","Fat",weekAvg.fat,goals.fat,"g"]].map(([key, label, avg, goal, unit]) => {
              const { pct, color, msg } = macroInsight(key, label, avg, goal);
              return (
                <div key={key} style={{ background: C.bgCard, borderRadius: 14, padding: "14px 16px", border: `1px solid ${C.border}` }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 600, color: C.text }}>{label}</div>
                      <div style={{ fontSize: 12, color, fontFamily: "'DM Sans', sans-serif", marginTop: 2 }}>{msg}</div>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <div style={{ fontSize: 20, fontWeight: 700, color, fontFamily: "'DM Sans', sans-serif", lineHeight: 1 }}>{avg}<span style={{ fontSize: 12, color: C.textLight, fontWeight: 400 }}>{unit}</span></div>
                      <div style={{ fontSize: 11, color: C.textLight }}>{pct}% of goal</div>
                    </div>
                  </div>
                  <div style={{ height: 6, background: C.bgSand, borderRadius: 3, position: "relative" }}>
                    <div style={{ height: "100%", width: `${Math.min(pct, 100)}%`, background: color, borderRadius: 3, transition: "width 0.5s" }} />
                    <div style={{ position: "absolute", top: 0, left: `${targetPct}%`, width: 2, height: "100%", background: C.textLight, borderRadius: 1 }} />
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4 }}>
                    <span style={{ fontSize: 10, color: C.textLight, fontFamily: "'DM Sans', sans-serif" }}>0</span>
                    <span style={{ fontSize: 10, color: C.textLight, fontFamily: "'DM Sans', sans-serif" }}>Goal: {goal}{unit}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {loggedDays.length === 0 && (
        <div style={{ textAlign: "center", padding: "48px 24px" }}>
          <div style={{ fontSize: 38, marginBottom: 14 }}>🌱</div>
          <div style={{ fontFamily: "'Lora', Georgia, serif", fontSize: 20, color: C.textMid, marginBottom: 8 }}>Start logging to see insights</div>
          <div style={{ fontSize: 14, color: C.textLight, lineHeight: 1.6 }}>Your weekly averages and macro scores will appear here once you log a day.</div>
        </div>
      )}

      {/* History section embedded below insights */}
      <div style={{ padding: "0 20px 8px" }}>
        <div style={{ fontSize: 11, color: C.textLight, letterSpacing: 1.5, textTransform: "uppercase", marginBottom: 12, fontFamily: "'DM Sans', sans-serif" }}>History</div>
      </div>
      <HistoryView />
    </div>
  );
}

// ─── Goals View ───────────────────────────────────────────────────────────────
function GoalsView({ goals, targetPct, onUpdateGoals, onUpdateTargetPct }) {
  const [draftGoals, setDraftGoals] = useState({ ...goals });
  const [draftPct, setDraftPct] = useState(targetPct);
  const [saved, setSaved] = useState(false);

  const saveAll = () => {
    onUpdateGoals({
      calories: parseInt(draftGoals.calories) || goals.calories,
      protein:  parseInt(draftGoals.protein)  || goals.protein,
      carbs:    parseInt(draftGoals.carbs)    || goals.carbs,
      fat:      parseInt(draftGoals.fat)      || goals.fat,
    });
    onUpdateTargetPct(Math.max(50, Math.min(100, parseInt(draftPct) || 85)));
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div style={{ padding: "20px" }}>

      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ fontFamily: "'Lora', Georgia, serif", fontSize: 22, color: C.text, marginBottom: 4 }}>My Goals</div>
        <div style={{ fontSize: 13, color: C.textLight }}>Update your daily macro targets and weekly compliance goal.</div>
      </div>

      {/* Daily macros */}
      <div style={{ background: C.bgCard, borderRadius: 16, border: `1px solid ${C.border}`, overflow: "hidden", marginBottom: 16 }}>
        <div style={{ padding: "14px 18px", borderBottom: `1px solid ${C.border}`, background: C.bgWarm }}>
          <div style={{ fontSize: 15, fontWeight: 600, color: C.text, fontFamily: "'Lora', Georgia, serif" }}>Daily Targets</div>
          <div style={{ fontSize: 12, color: C.textLight, marginTop: 2 }}>What you aim to hit each day</div>
        </div>
        <div style={{ padding: "18px" }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
            {[
              ["calories", "Calories", "kcal", "🔥"],
              ["protein",  "Protein",  "g",    "💪"],
              ["carbs",    "Carbs",    "g",    "🌾"],
              ["fat",      "Fat",      "g",    "🫒"],
            ].map(([k, lbl, unit, icon]) => (
              <div key={k}>
                <div style={{ fontSize: 12, color: C.textMid, marginBottom: 8, display: "flex", alignItems: "center", gap: 5 }}>
                  <span>{icon}</span>
                  <span style={{ fontWeight: 500 }}>{lbl}</span>
                  <span style={{ color: C.textLight }}>({unit})</span>
                </div>
                <input
                  type="number"
                  value={draftGoals[k]}
                  onChange={e => setDraftGoals(p => ({ ...p, [k]: e.target.value }))}
                  style={{ ...INP, fontSize: 20, padding: "12px 14px", fontFamily: "'Lora', Georgia, serif", fontWeight: 600, color: C.accent }}
                />
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Weekly target % */}
      <div style={{ background: C.bgCard, borderRadius: 16, border: `1px solid ${C.border}`, overflow: "hidden", marginBottom: 24 }}>
        <div style={{ padding: "14px 18px", borderBottom: `1px solid ${C.border}`, background: C.bgWarm }}>
          <div style={{ fontSize: 15, fontWeight: 600, color: C.text, fontFamily: "'Lora', Georgia, serif" }}>Weekly Compliance Target</div>
          <div style={{ fontSize: 12, color: C.textLight, marginTop: 2 }}>The minimum % of goals you want to hit each day</div>
        </div>
        <div style={{ padding: "18px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 12 }}>
            <input
              type="number" min="50" max="100"
              value={draftPct}
              onChange={e => setDraftPct(e.target.value)}
              style={{ ...INP, fontSize: 28, padding: "12px 16px", fontFamily: "'Lora', Georgia, serif", fontWeight: 700, color: C.accent, width: 110, textAlign: "center" }}
            />
            <span style={{ fontSize: 28, fontFamily: "'Lora', Georgia, serif", color: C.accent, fontWeight: 700 }}>%</span>
            <div style={{ fontSize: 13, color: C.textLight, lineHeight: 1.5 }}>
              Days where you hit this % of all 4 macros are counted as "on track"
            </div>
          </div>
          {/* Quick presets */}
          <div style={{ display: "flex", gap: 8 }}>
            {[70, 80, 85, 90, 95].map(p => (
              <button key={p} onClick={() => setDraftPct(p)} style={{ flex: 1, padding: "8px 4px", borderRadius: 10, border: `1.5px solid ${parseInt(draftPct) === p ? C.accent : C.border}`, background: parseInt(draftPct) === p ? "rgba(138,171,137,0.12)" : "transparent", color: parseInt(draftPct) === p ? C.accent : C.textMid, fontSize: 13, fontWeight: 600, cursor: "pointer" }}>{p}%</button>
            ))}
          </div>
        </div>
      </div>

      {/* Save */}
      <button
        onClick={saveAll}
        style={{ width: "100%", background: saved ? C.good : C.accent, border: "none", color: "#fff", borderRadius: 14, padding: "15px", fontSize: 16, fontWeight: 600, cursor: "pointer", fontFamily: "'DM Sans', sans-serif", transition: "all 0.3s" }}
      >
        {saved ? "✓ Saved!" : "Save Goals"}
      </button>
    </div>
  );
}

const INP = {
  background: C.bgWarm, border: `1px solid ${C.border}`,
  borderRadius: 12, padding: "11px 16px", color: C.text, fontSize: 15,
  outline: "none", width: "100%", boxSizing: "border-box", fontFamily: "'DM Sans', sans-serif",
};

// ─── Main App ─────────────────────────────────────────────────────────────────
export default function App() {
  const [foods, setFoods] = useState(() => { try { return JSON.parse(localStorage.getItem("md_foods") || "[]"); } catch { return []; } });
  const [recipes, setRecipes] = useState(() => { try { return JSON.parse(localStorage.getItem("md_recipes") || "[]"); } catch { return []; } });
  const [slots, setSlots] = useState(() => { try { return JSON.parse(localStorage.getItem("md_slots_" + todayKey())) || { ...EMPTY_SLOTS }; } catch { return { ...EMPTY_SLOTS }; } });

  const [goals, setGoals] = useState(() => { try { return JSON.parse(localStorage.getItem("md_goals")) || { calories: 1700, protein: 149, carbs: 149, fat: 57 }; } catch { return { calories: 1700, protein: 149, carbs: 149, fat: 57 }; } });
  const [targetPct, setTargetPct] = useState(() => { try { return parseInt(localStorage.getItem("md_target_pct")) || 85; } catch { return 85; } });

  const [view, setView] = useState("day");
  const [activeSlot, setActiveSlot] = useState("breakfast");
  const [search, setSearch] = useState("");
  const [pendingSlot, setPendingSlot] = useState(null);
  const [showAddFood, setShowAddFood] = useState(false);
  const [newFood, setNewFood] = useState({ name: "", calories: "", protein: "", carbs: "", fat: "", serving: "" });
  const [recipeUrl, setRecipeUrl] = useState("");
  const [importStatus, setImportStatus] = useState(null);
  const [importError, setImportError] = useState("");
  const [pendingRecipe, setPendingRecipe] = useState(null);
  const [recipeSearch, setRecipeSearch] = useState("");

  useEffect(() => { localStorage.setItem("md_foods", JSON.stringify(foods)); }, [foods]);
  useEffect(() => { localStorage.setItem("md_recipes", JSON.stringify(recipes)); }, [recipes]);
  useEffect(() => { localStorage.setItem("md_slots_" + todayKey(), JSON.stringify(slots)); }, [slots]);
  useEffect(() => { localStorage.setItem("md_goals", JSON.stringify(goals)); }, [goals]);
  useEffect(() => { localStorage.setItem("md_target_pct", String(targetPct)); }, [targetPct]);
  useEffect(() => {
    const last = localStorage.getItem("md_last_day"), today = todayKey();
    if (last !== today) { setSlots({ ...EMPTY_SLOTS }); localStorage.setItem("md_last_day", today); }
  }, []);

  const slotActuals = useMemo(() => { const r = {}; SLOT_ORDER.forEach(id => { r[id] = slotTotals(slots[id]); }); return r; }, [slots]);
  const targets = useMemo(() => computeTargets(slotActuals, goals), [slotActuals, goals]);
  const totals = useMemo(() => SLOT_ORDER.reduce((a, id) => ({ calories: a.calories + slotActuals[id].calories, protein: a.protein + slotActuals[id].protein, carbs: a.carbs + slotActuals[id].carbs, fat: a.fat + slotActuals[id].fat }), { calories: 0, protein: 0, carbs: 0, fat: 0 }), [slotActuals]);
  const filteredFoods = useMemo(() => foods.filter(f => f.name.toLowerCase().includes(search.toLowerCase())), [foods, search]);
  const filteredRecipes = useMemo(() => recipes.filter(r => r.name.toLowerCase().includes(recipeSearch.toLowerCase()) || (r.tags || []).some(t => t.toLowerCase().includes(recipeSearch.toLowerCase()))), [recipes, recipeSearch]);

  const saveFood = () => {
    if (!newFood.name || !newFood.calories) return;
    const food = { id: newId(), name: newFood.name, calories: parseFloat(newFood.calories)||0, protein: parseFloat(newFood.protein)||0, carbs: parseFloat(newFood.carbs)||0, fat: parseFloat(newFood.fat)||0, serving: newFood.serving || "1 serving" };
    setFoods(prev => [...prev, food]);
    if (pendingSlot) { addToSlot(pendingSlot, food); setView("day"); setActiveSlot(pendingSlot); }
    setNewFood({ name: "", calories: "", protein: "", carbs: "", fat: "", serving: "" });
    setShowAddFood(false); setPendingSlot(null);
  };

  const addToSlot = (slotId, food) => setSlots(prev => { if ((prev[slotId]||[]).find(i => i.food.id === food.id)) return prev; return { ...prev, [slotId]: [...(prev[slotId]||[]), { food, servings: 1 }] }; });
  const removeFromSlot = (slotId, foodId) => setSlots(prev => ({ ...prev, [slotId]: prev[slotId].filter(i => i.food.id !== foodId) }));
  const updateServings = (slotId, foodId, val) => setSlots(prev => ({ ...prev, [slotId]: prev[slotId].map(i => i.food.id === foodId ? { ...i, servings: Math.max(0.25, parseFloat(val)||1) } : i) }));
  const deleteFood = (foodId) => { setFoods(prev => prev.filter(f => f.id !== foodId)); setSlots(prev => { const n = {...prev}; SLOT_ORDER.forEach(id => { n[id] = (n[id]||[]).filter(i => i.food.id !== foodId); }); return n; }); };
  const clearDay = () => { if (confirm("Clear today's meals?")) setSlots({ ...EMPTY_SLOTS }); };

  const handleImport = async () => {
    if (!recipeUrl.trim()) return;
    setImportStatus("loading"); setImportError("");
    try { setPendingRecipe(await fetchRecipeFromUrl(recipeUrl.trim())); setImportStatus(null); }
    catch (e) { setImportStatus("error"); setImportError(e.message || "Could not extract recipe."); }
  };

  const handleRecipeSave = ({ recipe, foods: newFoods }) => {
    setRecipes(prev => [...prev, recipe]);
    setFoods(prev => { const ids = new Set(prev.map(f => f.id)); return [...prev, ...newFoods.filter(f => !ids.has(f.id))]; });
    setPendingRecipe(null); setRecipeUrl("");
    if (pendingSlot) { newFoods.forEach(f => addToSlot(pendingSlot, f)); setView("day"); setActiveSlot(pendingSlot); setPendingSlot(null); }
  };

  const deleteRecipe = (id) => { if (confirm("Delete this recipe?")) setRecipes(prev => prev.filter(r => r.id !== id)); };
  const addRecipeToSlot = (recipe, slotId) => { const food = foods.find(f => f.name === recipe.name); if (food) addToSlot(slotId, food); };

  const [savingMealSlot, setSavingMealSlot] = useState(null);
  const [quickEntrySlot, setQuickEntrySlot] = useState(null);
  const handleSaveMealAsRecipe = (food) => {
    setFoods(prev => [...prev, food]);
    setRecipes(prev => [...prev, { id: food.id, name: food.name, servings: 1, source: "Saved from meal", tags: food.tags || [], notes: "", ingredients: food.ingredients || [], perServing: { calories: food.calories, protein: food.protein, carbs: food.carbs, fat: food.fat } }]);
    setSavingMealSlot(null);
  };

  const TABS = [["day","Today"],["insights","Insights"],["library","Library"],["recipes","Recipes"],["goals","Goals"]];

  const btnTab = (v) => ({
    padding: "7px 12px", borderRadius: 20, border: "none", cursor: "pointer",
    fontSize: 13, fontWeight: 600, fontFamily: "inherit",
    background: view === v ? C.accent : "transparent",
    color: view === v ? "#fff" : C.textMid,
    transition: "all 0.2s",
  });

  return (
    <div style={{ height: "100dvh", background: C.bg, color: C.text, fontFamily: "'Lora', Georgia, serif", display: "flex", flexDirection: "column", overflow: "hidden" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Lora:ital,wght@0,400;0,500;0,600;0,700;1,400;1,500&family=DM+Sans:wght@300;400;500;600&display=swap');
        * { box-sizing: border-box; }
        input, button, select, textarea { font-family: 'DM Sans', sans-serif; }
        input::placeholder, textarea::placeholder { color: ${C.textLight}; }
        select option { background: ${C.bg}; color: ${C.text}; }
        input[type=number]::-webkit-inner-spin-button { -webkit-appearance: none; }
        textarea { resize: vertical; }
        ::-webkit-scrollbar { width: 0; }
        details summary { list-style: none; }
        details summary::-webkit-details-marker { display: none; }
      `}</style>

      {/* ── Header ── slim, no tabs */}
      <div style={{ padding: "max(env(safe-area-inset-top), 12px) 20px 10px", borderBottom: `1px solid ${C.border}`, background: C.bgCard, display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0 }}>
        <h1 style={{ margin: 0, fontFamily: "'Lora', Georgia, serif", fontSize: 22, fontWeight: 600, color: C.text, letterSpacing: "-0.3px", lineHeight: 1 }}>
          nourish<span style={{ color: C.accent, fontStyle: "italic" }}>.</span>
        </h1>
        <div style={{ fontSize: 11, color: C.textLight, fontFamily: "'DM Sans', sans-serif" }}>
          {goals.calories} cal · {goals.protein}P · {goals.carbs}C · {goals.fat}F
        </div>
      </div>

      {/* ── Today ── */}
      {view === "day" && (
        <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
          <div style={{ padding: "14px 20px", borderBottom: `1px solid ${C.border}`, background: C.bgCard, display: "flex", gap: 16, flexShrink: 0 }}>
            <TotalBar label="Calories" value={totals.calories} goal={goals.calories} />
            <TotalBar label="Protein" value={totals.protein} goal={goals.protein} />
            <TotalBar label="Carbs" value={totals.carbs} goal={goals.carbs} />
            <TotalBar label="Fat" value={totals.fat} goal={goals.fat} />
          </div>

          <div style={{ flex: 1, overflowY: "auto", WebkitOverflowScrolling: "touch" }}>
            {BASE_SPLITS.map(slot => {
              const actual = slotActuals[slot.id];
              const target = targets[slot.id];
              const isOpen = activeSlot === slot.id;
              return (
                <div key={slot.id} style={{ borderBottom: `1px solid ${C.border}`, background: isOpen ? C.bgWarm : C.bg }}>
                  <div onClick={() => setActiveSlot(isOpen ? null : slot.id)} style={{ display: "flex", alignItems: "center", gap: 14, padding: "16px 20px", cursor: "pointer", userSelect: "none" }}>
                    <span style={{ fontSize: 20, width: 28, textAlign: "center", flexShrink: 0 }}>{slot.icon}</span>
                    <div style={{ minWidth: 90, flexShrink: 0 }}>
                      <div style={{ fontSize: 16, fontWeight: 600, color: isOpen ? C.accent : C.text, fontFamily: "'Lora', Georgia, serif" }}>{slot.label}</div>
                      <div style={{ fontSize: 11, color: C.textLight, marginTop: 2, fontFamily: "'DM Sans', sans-serif" }}>
                        {target.calories}cal · {target.protein}P · {target.carbs}C · {target.fat}F
                      </div>
                    </div>
                    <div style={{ flex: 1, display: "flex", gap: 6, justifyContent: "flex-end" }}>
                      <MacroPill label="CAL" actual={actual.calories} target={target.calories} />
                      <MacroPill label="PROT" actual={actual.protein} target={target.protein} />
                      <MacroPill label="CARB" actual={actual.carbs} target={target.carbs} />
                      <MacroPill label="FAT" actual={actual.fat} target={target.fat} />
                    </div>
                    {/* Save as recipe button — only show when slot has items */}
                    {(slots[slot.id] || []).length > 0 && (
                      <button
                        onClick={e => { e.stopPropagation(); setSavingMealSlot(slot.id); }}
                        title="Save meal as recipe"
                        style={{ background: C.bgWarm, border: `1px solid ${C.border}`, color: C.textMid, borderRadius: 9, padding: "5px 9px", fontSize: 12, cursor: "pointer", flexShrink: 0, whiteSpace: "nowrap" }}
                      >💾</button>
                    )}
                    <span style={{ fontSize: 12, color: C.textLight, marginLeft: 2, flexShrink: 0 }}>{isOpen ? "▲" : "▼"}</span>
                  </div>

                  {isOpen && (
                    <div style={{ padding: "0 20px 18px 62px" }}>
                      {(slots[slot.id] || []).map(item => (
                        <div key={item.food.id} style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8, background: C.bgCard, borderRadius: 12, padding: "10px 14px", border: `1px solid ${C.border}` }}>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 15, fontWeight: 500, color: C.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.food.name}</div>
                            <div style={{ fontSize: 11, color: C.textLight, fontFamily: "'DM Sans', sans-serif", marginTop: 2 }}>
                              {Math.round(item.food.calories * item.servings)} cal · {Math.round(item.food.protein * item.servings)}P · {Math.round(item.food.carbs * item.servings)}C · {Math.round(item.food.fat * item.servings)}F
                            </div>
                          </div>
                          <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
                            <button onClick={() => updateServings(slot.id, item.food.id, item.servings - 0.25)} style={{ width: 28, height: 28, borderRadius: 8, border: `1px solid ${C.border}`, background: C.bgWarm, color: C.textMid, fontSize: 16, cursor: "pointer" }}>−</button>
                            <span style={{ fontSize: 14, color: C.accent, minWidth: 30, textAlign: "center", fontFamily: "'DM Sans', sans-serif", fontWeight: 600 }}>{item.servings}</span>
                            <button onClick={() => updateServings(slot.id, item.food.id, item.servings + 0.25)} style={{ width: 28, height: 28, borderRadius: 8, border: `1px solid ${C.border}`, background: C.bgWarm, color: C.textMid, fontSize: 16, cursor: "pointer" }}>+</button>
                          </div>
                          <button onClick={() => removeFromSlot(slot.id, item.food.id)} style={{ background: "none", border: "none", color: C.textLight, cursor: "pointer", fontSize: 18, padding: 0, flexShrink: 0 }}>×</button>
                        </div>
                      ))}

                      {/* Autocomplete search */}
                      <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
                        <FoodSearch
                          foods={foods}
                          onSelect={(food) => addToSlot(slot.id, food)}
                          onSaveToLibrary={(food) => setFoods(prev => prev.find(f => f.name === food.name) ? prev : [...prev, { ...food, id: newId() }])}
                          placeholder="Search foods or your library…"
                        />
                        <button onClick={() => setQuickEntrySlot(slot.id)} title="Quick manual entry" style={{ background: C.bgWarm, border: `1px solid ${C.border}`, color: C.textMid, borderRadius: 12, padding: "11px 12px", fontSize: 15, cursor: "pointer" }}>✏️</button>
                        <button onClick={() => { setPendingSlot(slot.id); setView("recipes"); }} style={{ background: C.bgWarm, border: `1px solid ${C.border}`, color: C.textMid, borderRadius: 12, padding: "11px 12px", fontSize: 14, cursor: "pointer" }}>📖</button>
                        <button onClick={() => { setPendingSlot(slot.id); setShowAddFood(true); setView("library"); }} style={{ background: C.accent, border: "none", color: "#fff", borderRadius: 12, padding: "11px 16px", fontSize: 13, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap" }}>+ New</button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}

            <div style={{ padding: "24px", textAlign: "center" }}>
              <button onClick={clearDay} style={{ background: "none", border: `1px solid ${C.border}`, color: C.textLight, borderRadius: 10, padding: "9px 22px", fontSize: 13, cursor: "pointer" }}>Clear today's log</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Library ── */}
      {view === "library" && (
        <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
          <div style={{ padding: "14px 20px", borderBottom: `1px solid ${C.border}`, display: "flex", gap: 10, flexShrink: 0, background: C.bgCard }}>
            <input placeholder="Search library…" value={search} onChange={e => setSearch(e.target.value)} style={{ ...INP, flex: 1 }} />
            <button onClick={() => setShowAddFood(v => !v)} style={{ background: C.accent, border: "none", color: "#fff", borderRadius: 12, padding: "11px 20px", fontSize: 14, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap" }}>+ Add Food</button>
          </div>

          {showAddFood && (
            <div style={{ padding: "16px 20px", background: C.bgWarm, borderBottom: `1px solid ${C.border}`, flexShrink: 0 }}>
              {pendingSlot && <div style={{ fontSize: 12, color: C.accent, letterSpacing: 1, marginBottom: 12, textTransform: "uppercase" }}>Adding to {BASE_SPLITS.find(s => s.id === pendingSlot)?.label}</div>}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10 }}>
                <input placeholder="Food name *" value={newFood.name} onChange={e => setNewFood(p => ({...p, name: e.target.value}))} style={INP} />
                <input placeholder="Serving size (e.g. 1 cup)" value={newFood.serving} onChange={e => setNewFood(p => ({...p, serving: e.target.value}))} style={INP} />
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 10, marginBottom: 14 }}>
                {[["calories","Calories *"],["protein","Protein (g)"],["carbs","Carbs (g)"],["fat","Fat (g)"]].map(([k, lbl]) => (
                  <input key={k} type="number" placeholder={lbl} value={newFood[k]} onChange={e => setNewFood(p => ({...p, [k]: e.target.value}))} style={INP} />
                ))}
              </div>
              <div style={{ display: "flex", gap: 10 }}>
                <button onClick={saveFood} style={{ background: C.accent, border: "none", color: "#fff", borderRadius: 12, padding: "11px 24px", fontSize: 14, fontWeight: 600, cursor: "pointer" }}>{pendingSlot ? "Save & Add to Meal" : "Save to Library"}</button>
                <button onClick={() => { setShowAddFood(false); setPendingSlot(null); }} style={{ background: "transparent", border: `1px solid ${C.border}`, color: C.textMid, borderRadius: 12, padding: "11px 18px", fontSize: 14, cursor: "pointer" }}>Cancel</button>
              </div>
            </div>
          )}

          <div style={{ flex: 1, overflowY: "auto", WebkitOverflowScrolling: "touch" }}>
            {filteredFoods.length === 0 ? (
              <div style={{ textAlign: "center", padding: "64px 24px", color: C.textLight }}>
                <div style={{ fontSize: 42, marginBottom: 16 }}>🌿</div>
                <div style={{ fontFamily: "'Lora', Georgia, serif", fontSize: 22, color: C.textMid, marginBottom: 8 }}>Your library is empty</div>
                <div style={{ fontSize: 14, lineHeight: 1.6 }}>Add the foods and meals you eat regularly — they'll appear here and in your meal search.</div>
              </div>
            ) : filteredFoods.map(food => (
              <div key={food.id} style={{ display: "flex", alignItems: "center", gap: 14, padding: "14px 20px", borderBottom: `1px solid ${C.border}` }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 15, fontWeight: 500, marginBottom: 3, display: "flex", alignItems: "center", gap: 8 }}>
                    {food.name}
                    {food.isRecipe && <span style={{ fontSize: 10, background: "rgba(138,171,137,0.15)", color: C.accent, borderRadius: 6, padding: "2px 7px", fontFamily: "'DM Sans', sans-serif" }}>recipe</span>}
                  </div>
                  <div style={{ fontSize: 12, color: C.textLight, fontFamily: "'DM Sans', sans-serif" }}>
                    {food.serving} · {food.calories} cal · <span style={{ color: "#7aabe8" }}>{food.protein}P</span> · <span style={{ color: C.accent }}>{food.carbs}C</span> · <span style={{ color: C.accentWarm }}>{food.fat}F</span>
                  </div>
                </div>
                <button onClick={() => deleteFood(food.id)} style={{ background: "none", border: "none", color: C.textLight, cursor: "pointer", fontSize: 16, padding: "4px 6px", borderRadius: 6 }}>✕</button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Recipes ── */}
      {view === "recipes" && (
        <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
          <div style={{ padding: "14px 20px", borderBottom: `1px solid ${C.border}`, background: C.bgCard, flexShrink: 0 }}>
            {pendingSlot && <div style={{ fontSize: 12, color: C.accent, letterSpacing: 1, marginBottom: 10, textTransform: "uppercase" }}>Adding recipe to {BASE_SPLITS.find(s => s.id === pendingSlot)?.label}</div>}
            <div style={{ display: "flex", gap: 10 }}>
              <input placeholder="Paste recipe URL to import…" value={recipeUrl} onChange={e => { setRecipeUrl(e.target.value); setImportStatus(null); }} onKeyDown={e => e.key === "Enter" && handleImport()} style={{ ...INP, flex: 1 }} />
              <button onClick={handleImport} disabled={importStatus === "loading" || !recipeUrl.trim()} style={{ background: importStatus === "loading" ? C.accentSoft : C.accent, border: "none", color: "#fff", borderRadius: 12, padding: "11px 20px", fontSize: 14, fontWeight: 600, cursor: "pointer", minWidth: 90 }}>
                {importStatus === "loading" ? "…" : "Import"}
              </button>
            </div>
            {importStatus === "error" && <div style={{ fontSize: 13, color: C.under, marginTop: 8 }}>{importError}</div>}
            {importStatus === "loading" && <div style={{ fontSize: 13, color: C.textLight, marginTop: 8, fontStyle: "italic" }}>Reading recipe and estimating macros…</div>}
          </div>
          <div style={{ padding: "12px 20px", borderBottom: `1px solid ${C.border}`, flexShrink: 0 }}>
            <input placeholder="Search recipes or tags…" value={recipeSearch} onChange={e => setRecipeSearch(e.target.value)} style={INP} />
          </div>
          <div style={{ flex: 1, overflowY: "auto", WebkitOverflowScrolling: "touch" }}>
            {filteredRecipes.length === 0 ? (
              <div style={{ textAlign: "center", padding: "64px 24px", color: C.textLight }}>
                <div style={{ fontSize: 42, marginBottom: 16 }}>📖</div>
                <div style={{ fontFamily: "'Lora', Georgia, serif", fontSize: 22, color: C.textMid, marginBottom: 8 }}>No recipes yet</div>
                <div style={{ fontSize: 14, lineHeight: 1.6 }}>Paste a recipe URL above — works with any food blog or website.</div>
              </div>
            ) : filteredRecipes.map(recipe => {
              const ps = recipe.perServing || {};
              return (
                <div key={recipe.id} style={{ padding: "16px 20px", borderBottom: `1px solid ${C.border}` }}>
                  <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 14 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 3, fontFamily: "'Lora', Georgia, serif" }}>{recipe.name}</div>
                      {recipe.source && <div style={{ fontSize: 11, color: C.textLight, fontFamily: "'DM Sans', sans-serif", marginBottom: 6, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{recipe.source}</div>}
                      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 6, fontFamily: "'DM Sans', sans-serif" }}>
                        <span style={{ fontSize: 12, color: C.textMid }}>{ps.calories} cal</span>
                        <span style={{ fontSize: 12, color: "#7aabe8" }}>{ps.protein}P</span>
                        <span style={{ fontSize: 12, color: C.accent }}>{ps.carbs}C</span>
                        <span style={{ fontSize: 12, color: C.accentWarm }}>{ps.fat}F</span>
                        <span style={{ fontSize: 12, color: C.textLight }}>per serving · {recipe.servings} servings</span>
                      </div>
                      {recipe.tags?.length > 0 && <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>{recipe.tags.map(tag => <span key={tag} style={{ fontSize: 11, background: C.bgSand, color: C.textMid, borderRadius: 6, padding: "2px 8px", fontFamily: "'DM Sans', sans-serif" }}>{tag}</span>)}</div>}
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 8, flexShrink: 0 }}>
                      {pendingSlot && <button onClick={() => { addRecipeToSlot(recipe, pendingSlot); setView("day"); setActiveSlot(pendingSlot); setPendingSlot(null); }} style={{ background: C.accent, border: "none", color: "#fff", borderRadius: 10, padding: "8px 14px", fontSize: 12, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap" }}>+ Add to {BASE_SPLITS.find(s => s.id === pendingSlot)?.label}</button>}
                      <button onClick={() => deleteRecipe(recipe.id)} style={{ background: "none", border: "none", color: C.textLight, cursor: "pointer", fontSize: 16, textAlign: "center" }}>🗑</button>
                    </div>
                  </div>
                  {recipe.ingredients?.length > 0 && (
                    <details style={{ marginTop: 10 }}>
                      <summary style={{ fontSize: 13, color: C.textLight, cursor: "pointer", userSelect: "none", fontFamily: "'DM Sans', sans-serif" }}>{recipe.ingredients.length} ingredients ▾</summary>
                      <div style={{ marginTop: 8, paddingLeft: 10, borderLeft: `2px solid ${C.border}` }}>
                        {recipe.ingredients.map((ing, i) => (
                          <div key={i} style={{ fontSize: 13, color: C.textMid, padding: "4px 0", display: "flex", justifyContent: "space-between", fontFamily: "'DM Sans', sans-serif" }}>
                            <span>{ing.amount} {ing.name}</span>
                            <span style={{ color: C.textLight }}>{ing.calories} cal</span>
                          </div>
                        ))}
                      </div>
                    </details>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {view === "insights" && (
        <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
          <InsightsView
            goals={goals}
            targetPct={targetPct}
            onUpdateGoals={setGoals}
            onUpdateTargetPct={setTargetPct}
          />
        </div>
      )}

      {view === "goals" && (
        <div style={{ flex: 1, overflowY: "auto", WebkitOverflowScrolling: "touch" }}>
          <GoalsView goals={goals} targetPct={targetPct} onUpdateGoals={setGoals} onUpdateTargetPct={setTargetPct} />
        </div>
      )}

      {pendingRecipe && <RecipeModal recipe={pendingRecipe} onSave={handleRecipeSave} onClose={() => setPendingRecipe(null)} />}

      {quickEntrySlot && (
        <QuickEntryModal
          slot={BASE_SPLITS.find(s => s.id === quickEntrySlot)}
          onAdd={(food, saveToLib) => {
            addToSlot(quickEntrySlot, food);
            if (saveToLib) setFoods(prev => [...prev, food]);
            setQuickEntrySlot(null);
          }}
          onClose={() => setQuickEntrySlot(null)}
        />
      )}

      {savingMealSlot && (slots[savingMealSlot] || []).length > 0 && (
        <SaveMealAsRecipeModal
          slot={BASE_SPLITS.find(s => s.id === savingMealSlot)}
          items={slots[savingMealSlot]}
          onSave={handleSaveMealAsRecipe}
          onClose={() => setSavingMealSlot(null)}
        />
      )}
      {/* ── Bottom tab bar ── */}
      <div style={{ background: C.bgCard, borderTop: `1px solid ${C.border}`, display: "flex", flexShrink: 0, paddingBottom: "env(safe-area-inset-bottom, 0px)" }}>
        {TABS.map(([v, lbl, icon]) => (
          <button key={v} onClick={() => setView(v)} style={{
            flex: 1, padding: "10px 4px 8px", border: "none", background: "transparent",
            display: "flex", flexDirection: "column", alignItems: "center", gap: 3,
            cursor: "pointer", transition: "all 0.2s",
          }}>
            <div style={{ fontSize: 20 }}>{
              v === "day" ? "☀️" : v === "insights" ? "📊" : v === "library" ? "🌿" : v === "recipes" ? "📖" : "🎯"
            }</div>
            <div style={{ fontSize: 10, fontWeight: 600, fontFamily: "'DM Sans', sans-serif", color: view === v ? C.accent : C.textLight, letterSpacing: 0.3 }}>{lbl}</div>
            {view === v && <div style={{ width: 18, height: 2, background: C.accent, borderRadius: 1 }} />}
          </button>
        ))}
      </div>
    </div>
  );
}
