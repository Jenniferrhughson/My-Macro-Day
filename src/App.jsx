import { useState, useMemo, useEffect } from "react";

// ─── Constants ───────────────────────────────────────────────────────────────
const GOALS = { calories: 1700, protein: 149, carbs: 149, fat: 57 };

const BASE_SPLITS = [
  { id: "breakfast", label: "Breakfast", icon: "☀️", split: { calories: 0.206, protein: 0.201, carbs: 0.235, fat: 0.140 } },
  { id: "snack1",    label: "Snack 1",   icon: "🍎", split: { calories: 0.088, protein: 0.101, carbs: 0.101, fat: 0.053 } },
  { id: "lunch",     label: "Lunch",     icon: "🥗", split: { calories: 0.265, protein: 0.268, carbs: 0.268, fat: 0.263 } },
  { id: "snack2",    label: "Snack 2",   icon: "🍊", split: { calories: 0.088, protein: 0.094, carbs: 0.128, fat: 0.053 } },
  { id: "dinner",    label: "Dinner",    icon: "🌙", split: { calories: 0.353, protein: 0.336, carbs: 0.268, fat: 0.491 } },
];

const SLOT_ORDER = ["breakfast", "snack1", "lunch", "snack2", "dinner"];
const TOLERANCE = 0.10;
const EMPTY_SLOTS = { breakfast: [], snack1: [], lunch: [], snack2: [], dinner: [] };

function todayKey() { return new Date().toISOString().slice(0, 10); }
let _nextId = Date.now();
function newId() { return _nextId++; }

// ─── Macro logic ─────────────────────────────────────────────────────────────
function computeTargets(slotActuals) {
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

function pillStatus(actual, target) {
  if (actual === 0) return "empty";
  const r = actual / target;
  if (r >= 1 - TOLERANCE && r <= 1 + TOLERANCE) return "good";
  return actual < target ? "under" : "over";
}

const S = {
  color: { good: "#4ade80", under: "#f87171", over: "#f87171", empty: "rgba(255,255,255,0.18)" },
  bg:    { good: "rgba(74,222,128,0.09)", under: "rgba(248,113,113,0.09)", over: "rgba(248,113,113,0.09)", empty: "rgba(255,255,255,0.04)" },
  label: { good: "✓ on track", under: "↑ add more", over: "↓ over", empty: null },
};

// ─── Shared UI components ─────────────────────────────────────────────────────
function MacroPill({ label, actual, target }) {
  const st = pillStatus(actual, target);
  const logged = actual > 0;
  return (
    <div style={{
      display: "flex", flexDirection: "column", alignItems: "center",
      background: S.bg[st], borderRadius: 9, padding: "7px 9px", minWidth: 58,
      border: `1px solid ${logged ? S.color[st] + "35" : "rgba(255,255,255,0.07)"}`,
      transition: "all 0.3s",
    }}>
      <span style={{ fontSize: 9, color: "rgba(255,255,255,0.38)", letterSpacing: 1.2, fontFamily: "monospace", marginBottom: 3, textTransform: "uppercase" }}>{label}</span>
      <span style={{ fontSize: 14, fontWeight: 700, color: logged ? S.color[st] : "rgba(255,255,255,0.18)", fontFamily: "monospace", lineHeight: 1 }}>
        {logged ? Math.round(actual) : "—"}
      </span>
      <span style={{ fontSize: 9, color: "rgba(255,255,255,0.28)", fontFamily: "monospace", marginTop: 2 }}>
        /{target}{label === "CAL" ? "" : "g"}
      </span>
      {logged && S.label[st] && (
        <span style={{ fontSize: 8, color: S.color[st], marginTop: 3, fontWeight: 600 }}>{S.label[st]}</span>
      )}
    </div>
  );
}

function TotalBar({ label, value, goal }) {
  const pct = Math.min((value / goal) * 100, 100);
  const good = value >= goal * (1 - TOLERANCE) && value <= goal * (1 + TOLERANCE);
  const barColor = good ? "#4ade80" : value > 0 ? "#f87171" : "rgba(255,255,255,0.15)";
  return (
    <div style={{ flex: 1 }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5 }}>
        <span style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", fontFamily: "monospace", letterSpacing: 1 }}>{label}</span>
        <span style={{ fontSize: 11, fontFamily: "monospace", color: value > 0 ? barColor : "rgba(255,255,255,0.25)", fontWeight: 600 }}>
          {Math.round(value)}<span style={{ color: "rgba(255,255,255,0.25)" }}>/{goal}</span>
        </span>
      </div>
      <div style={{ height: 5, background: "rgba(255,255,255,0.07)", borderRadius: 3 }}>
        <div style={{ height: "100%", width: `${pct}%`, background: value > 0 ? barColor : "transparent", borderRadius: 3, transition: "width 0.4s ease, background 0.3s" }} />
      </div>
    </div>
  );
}

const INP = {
  background: "rgba(255,255,255,0.055)", border: "1px solid rgba(255,255,255,0.11)",
  borderRadius: 8, padding: "10px 12px", color: "#f0ebe3", fontSize: 14,
  outline: "none", width: "100%", boxSizing: "border-box", fontFamily: "inherit",
};

// ─── Recipe Review Modal ──────────────────────────────────────────────────────
function RecipeModal({ recipe, onSave, onClose }) {
  const [name, setName] = useState(recipe.name || "");
  const [servings, setServings] = useState(recipe.servings || 1);
  const [source, setSource] = useState(recipe.source || "");
  const [tags, setTags] = useState(recipe.tags || "");
  const [ingredients, setIngredients] = useState(
    recipe.ingredients || [{ id: newId(), name: "", calories: 0, protein: 0, carbs: 0, fat: 0, amount: "" }]
  );
  const [saveMode, setSaveMode] = useState("whole"); // "whole" | "ingredients"
  const [notes, setNotes] = useState(recipe.notes || "");

  const totals = useMemo(() => ingredients.reduce((a, ing) => ({
    calories: a.calories + (parseFloat(ing.calories) || 0),
    protein:  a.protein  + (parseFloat(ing.protein)  || 0),
    carbs:    a.carbs    + (parseFloat(ing.carbs)    || 0),
    fat:      a.fat      + (parseFloat(ing.fat)      || 0),
  }), { calories: 0, protein: 0, carbs: 0, fat: 0 }), [ingredients]);

  const perServing = {
    calories: Math.round(totals.calories / (servings || 1)),
    protein:  Math.round(totals.protein  / (servings || 1)),
    carbs:    Math.round(totals.carbs    / (servings || 1)),
    fat:      Math.round(totals.fat      / (servings || 1)),
  };

  const updateIng = (id, field, val) =>
    setIngredients(prev => prev.map(i => i.id === id ? { ...i, [field]: val } : i));

  const removeIng = (id) =>
    setIngredients(prev => prev.filter(i => i.id !== id));

  const addIng = () =>
    setIngredients(prev => [...prev, { id: newId(), name: "", calories: 0, protein: 0, carbs: 0, fat: 0, amount: "" }]);

  const handleSave = () => {
    const base = { id: newId(), name, source, tags: tags.split(",").map(t => t.trim()).filter(Boolean), notes, servings, ingredients, perServing };
    if (saveMode === "whole") {
      // Save as single food item
      const food = { id: newId(), name, calories: perServing.calories, protein: perServing.protein, carbs: perServing.carbs, fat: perServing.fat, serving: `1 serving (1/${servings} recipe)`, isRecipe: true };
      onSave({ recipe: base, foods: [food], mode: "whole" });
    } else {
      // Save each ingredient as individual food
      const foods = ingredients.map(ing => ({
        id: newId(), name: ing.name || "Ingredient",
        calories: Math.round(parseFloat(ing.calories) || 0),
        protein:  Math.round(parseFloat(ing.protein)  || 0),
        carbs:    Math.round(parseFloat(ing.carbs)    || 0),
        fat:      Math.round(parseFloat(ing.fat)      || 0),
        serving: ing.amount || "1 serving", isRecipe: true,
      }));
      onSave({ recipe: base, foods, mode: "ingredients" });
    }
  };

  const macroColor = { calories: "#f0ebe3", protein: "#7eb8e8", carbs: "#a3e635", fat: "#fb923c" };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.85)", zIndex: 100, display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
      <div style={{ width: "100%", maxWidth: 600, background: "#161614", borderRadius: "20px 20px 0 0", maxHeight: "92dvh", display: "flex", flexDirection: "column", border: "1px solid rgba(255,255,255,0.1)" }}>

        {/* Modal header */}
        <div style={{ padding: "18px 20px 14px", borderBottom: "1px solid rgba(255,255,255,0.07)", flexShrink: 0 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <span style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 20, fontWeight: 700 }}>Review Recipe</span>
            <button onClick={onClose} style={{ background: "rgba(255,255,255,0.07)", border: "none", color: "#f0ebe3", borderRadius: 8, width: 32, height: 32, cursor: "pointer", fontSize: 16 }}>✕</button>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            <input placeholder="Recipe name *" value={name} onChange={e => setName(e.target.value)} style={INP} />
            <input placeholder="Source URL or blog" value={source} onChange={e => setSource(e.target.value)} style={INP} />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 8 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", whiteSpace: "nowrap" }}>Servings:</span>
              <input type="number" min="1" value={servings} onChange={e => setServings(parseInt(e.target.value) || 1)} style={{ ...INP, width: 70 }} />
            </div>
            <input placeholder="Tags (comma separated)" value={tags} onChange={e => setTags(e.target.value)} style={INP} />
          </div>
        </div>

        {/* Per-serving summary */}
        <div style={{ padding: "12px 20px", background: "rgba(163,230,53,0.04)", borderBottom: "1px solid rgba(255,255,255,0.07)", flexShrink: 0 }}>
          <div style={{ fontSize: 10, color: "rgba(255,255,255,0.35)", fontFamily: "monospace", letterSpacing: 1, marginBottom: 8 }}>PER SERVING (÷{servings})</div>
          <div style={{ display: "flex", gap: 12 }}>
            {[["CAL", perServing.calories, ""], ["PROT", perServing.protein, "g"], ["CARB", perServing.carbs, "g"], ["FAT", perServing.fat, "g"]].map(([lbl, val, unit]) => (
              <div key={lbl} style={{ textAlign: "center" }}>
                <div style={{ fontSize: 9, color: "rgba(255,255,255,0.35)", fontFamily: "monospace", letterSpacing: 1 }}>{lbl}</div>
                <div style={{ fontSize: 18, fontWeight: 700, fontFamily: "monospace", color: "#a3e635" }}>{val}<span style={{ fontSize: 11, color: "rgba(255,255,255,0.4)" }}>{unit}</span></div>
              </div>
            ))}
          </div>
        </div>

        {/* Ingredients */}
        <div style={{ flex: 1, overflowY: "auto", padding: "14px 20px" }}>
          <div style={{ fontSize: 10, color: "rgba(255,255,255,0.35)", fontFamily: "monospace", letterSpacing: 1, marginBottom: 10 }}>INGREDIENTS — edit macros as needed</div>

          {ingredients.map((ing, idx) => (
            <div key={ing.id} style={{ marginBottom: 10, background: "rgba(255,255,255,0.03)", borderRadius: 10, padding: "10px 12px", border: "1px solid rgba(255,255,255,0.07)" }}>
              <div style={{ display: "flex", gap: 6, marginBottom: 6 }}>
                <input placeholder={`Ingredient ${idx + 1}`} value={ing.name} onChange={e => updateIng(ing.id, "name", e.target.value)} style={{ ...INP, flex: 2, fontSize: 13, padding: "7px 10px" }} />
                <input placeholder="Amount" value={ing.amount} onChange={e => updateIng(ing.id, "amount", e.target.value)} style={{ ...INP, flex: 1, fontSize: 13, padding: "7px 10px" }} />
                <button onClick={() => removeIng(ing.id)} style={{ background: "none", border: "none", color: "rgba(255,255,255,0.2)", cursor: "pointer", fontSize: 16, padding: "0 4px" }}>×</button>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 5 }}>
                {[["calories","Cal"],["protein","Prot"],["carbs","Carb"],["fat","Fat"]].map(([k, lbl]) => (
                  <div key={k}>
                    <div style={{ fontSize: 9, color: macroColor[k], fontFamily: "monospace", marginBottom: 3, letterSpacing: 0.5 }}>{lbl}</div>
                    <input type="number" value={ing[k]} onChange={e => updateIng(ing.id, k, e.target.value)} style={{ ...INP, fontSize: 12, padding: "5px 8px" }} />
                  </div>
                ))}
              </div>
            </div>
          ))}

          <button onClick={addIng} style={{ width: "100%", background: "rgba(255,255,255,0.04)", border: "1px dashed rgba(255,255,255,0.15)", color: "rgba(255,255,255,0.4)", borderRadius: 8, padding: "9px", fontSize: 12, cursor: "pointer", marginBottom: 14 }}>
            + Add ingredient
          </button>

          <textarea
            placeholder="Notes (optional — cooking instructions, tips…)"
            value={notes}
            onChange={e => setNotes(e.target.value)}
            rows={3}
            style={{ ...INP, resize: "vertical", fontSize: 13 }}
          />
        </div>

        {/* Save options */}
        <div style={{ padding: "14px 20px", borderTop: "1px solid rgba(255,255,255,0.07)", flexShrink: 0 }}>
          <div style={{ fontSize: 10, color: "rgba(255,255,255,0.35)", fontFamily: "monospace", letterSpacing: 1, marginBottom: 10 }}>SAVE TO LIBRARY AS</div>
          <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
            <button
              onClick={() => setSaveMode("whole")}
              style={{ flex: 1, padding: "10px", borderRadius: 9, border: `1px solid ${saveMode === "whole" ? "#a3e635" : "rgba(255,255,255,0.1)"}`, background: saveMode === "whole" ? "rgba(163,230,53,0.12)" : "rgba(255,255,255,0.04)", color: saveMode === "whole" ? "#a3e635" : "rgba(255,255,255,0.5)", cursor: "pointer", fontSize: 12, fontWeight: 600 }}
            >
              📦 Whole recipe<br/><span style={{ fontSize: 10, fontWeight: 400, opacity: 0.7 }}>1 item per serving</span>
            </button>
            <button
              onClick={() => setSaveMode("ingredients")}
              style={{ flex: 1, padding: "10px", borderRadius: 9, border: `1px solid ${saveMode === "ingredients" ? "#a3e635" : "rgba(255,255,255,0.1)"}`, background: saveMode === "ingredients" ? "rgba(163,230,53,0.12)" : "rgba(255,255,255,0.04)", color: saveMode === "ingredients" ? "#a3e635" : "rgba(255,255,255,0.5)", cursor: "pointer", fontSize: 12, fontWeight: 600 }}
            >
              🧩 Individual ingredients<br/><span style={{ fontSize: 10, fontWeight: 400, opacity: 0.7 }}>log each separately</span>
            </button>
          </div>
          <button
            onClick={handleSave}
            disabled={!name}
            style={{ width: "100%", background: name ? "#a3e635" : "rgba(255,255,255,0.1)", border: "none", color: name ? "#0f0f0e" : "rgba(255,255,255,0.3)", borderRadius: 10, padding: "13px", fontSize: 14, fontWeight: 700, cursor: name ? "pointer" : "default", transition: "all 0.2s" }}
          >
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

Your job is to extract the recipe and estimate the macros for each ingredient.

Return ONLY a valid JSON object with this exact structure (no markdown, no explanation):
{
  "name": "Recipe name",
  "servings": 4,
  "source": "${url}",
  "tags": ["dinner", "chicken"],
  "notes": "Any cooking notes",
  "ingredients": [
    {
      "name": "Chicken breast",
      "amount": "200g",
      "calories": 220,
      "protein": 41,
      "carbs": 0,
      "fat": 5
    }
  ]
}

If you cannot access the URL, still return a JSON structure with your best guess based on the URL/domain name, with name set to the likely recipe name and a note saying macros are estimated.
Estimate macros based on typical amounts for each ingredient. Be realistic and accurate.`;

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: 1500,
      tools: [{ type: "web_search_20250305", name: "web_search" }],
      messages: [{ role: "user", content: prompt }],
    }),
  });

  const data = await response.json();
  const text = data.content
    .filter(b => b.type === "text")
    .map(b => b.text)
    .join("");

  // Strip markdown fences if present
  const clean = text.replace(/```json\n?|\n?```/g, "").trim();
  // Find JSON object in response
  const match = clean.match(/\{[\s\S]*\}/);
  if (!match) throw new Error("Could not parse recipe data");
  return JSON.parse(match[0]);
}

// ─── Main App ─────────────────────────────────────────────────────────────────
export default function App() {
  const [foods, setFoods] = useState(() => {
    try { return JSON.parse(localStorage.getItem("md_foods") || "[]"); } catch { return []; }
  });
  const [recipes, setRecipes] = useState(() => {
    try { return JSON.parse(localStorage.getItem("md_recipes") || "[]"); } catch { return []; }
  });
  const [slots, setSlots] = useState(() => {
    try { return JSON.parse(localStorage.getItem("md_slots_" + todayKey())) || { ...EMPTY_SLOTS }; } catch { return { ...EMPTY_SLOTS }; }
  });

  const [view, setView] = useState("day"); // day | library | recipes
  const [activeSlot, setActiveSlot] = useState("breakfast");
  const [search, setSearch] = useState("");
  const [pendingSlot, setPendingSlot] = useState(null);

  // Library add form
  const [showAddFood, setShowAddFood] = useState(false);
  const [newFood, setNewFood] = useState({ name: "", calories: "", protein: "", carbs: "", fat: "", serving: "" });

  // Recipe import
  const [recipeUrl, setRecipeUrl] = useState("");
  const [importStatus, setImportStatus] = useState(null); // null | "loading" | "error"
  const [importError, setImportError] = useState("");
  const [pendingRecipe, setPendingRecipe] = useState(null); // recipe being reviewed in modal
  const [recipeSearch, setRecipeSearch] = useState("");

  // Persist
  useEffect(() => { localStorage.setItem("md_foods", JSON.stringify(foods)); }, [foods]);
  useEffect(() => { localStorage.setItem("md_recipes", JSON.stringify(recipes)); }, [recipes]);
  useEffect(() => { localStorage.setItem("md_slots_" + todayKey(), JSON.stringify(slots)); }, [slots]);
  useEffect(() => {
    const key = "md_last_day";
    const last = localStorage.getItem(key);
    const today = todayKey();
    if (last !== today) { setSlots({ ...EMPTY_SLOTS }); localStorage.setItem(key, today); }
  }, []);

  // Slot actuals & targets
  const slotActuals = useMemo(() => {
    const r = {};
    SLOT_ORDER.forEach(id => {
      r[id] = (slots[id] || []).reduce((a, item) => ({
        calories: a.calories + item.food.calories * item.servings,
        protein:  a.protein  + item.food.protein  * item.servings,
        carbs:    a.carbs    + item.food.carbs    * item.servings,
        fat:      a.fat      + item.food.fat      * item.servings,
      }), { calories: 0, protein: 0, carbs: 0, fat: 0 });
    });
    return r;
  }, [slots]);

  const targets = useMemo(() => computeTargets(slotActuals), [slotActuals]);
  const totals = useMemo(() =>
    SLOT_ORDER.reduce((a, id) => ({
      calories: a.calories + slotActuals[id].calories,
      protein:  a.protein  + slotActuals[id].protein,
      carbs:    a.carbs    + slotActuals[id].carbs,
      fat:      a.fat      + slotActuals[id].fat,
    }), { calories: 0, protein: 0, carbs: 0, fat: 0 }),
  [slotActuals]);

  const filteredFoods = useMemo(() =>
    foods.filter(f => f.name.toLowerCase().includes(search.toLowerCase())),
  [foods, search]);

  const filteredRecipes = useMemo(() =>
    recipes.filter(r =>
      r.name.toLowerCase().includes(recipeSearch.toLowerCase()) ||
      (r.tags || []).some(t => t.toLowerCase().includes(recipeSearch.toLowerCase()))
    ),
  [recipes, recipeSearch]);

  // Food / slot helpers
  const saveFood = () => {
    if (!newFood.name || !newFood.calories) return;
    const food = { id: newId(), name: newFood.name, calories: parseFloat(newFood.calories) || 0, protein: parseFloat(newFood.protein) || 0, carbs: parseFloat(newFood.carbs) || 0, fat: parseFloat(newFood.fat) || 0, serving: newFood.serving || "1 serving" };
    setFoods(prev => [...prev, food]);
    if (pendingSlot) { addToSlot(pendingSlot, food); setView("day"); setActiveSlot(pendingSlot); }
    setNewFood({ name: "", calories: "", protein: "", carbs: "", fat: "", serving: "" });
    setShowAddFood(false);
    setPendingSlot(null);
  };

  const addToSlot = (slotId, food) =>
    setSlots(prev => {
      if ((prev[slotId] || []).find(i => i.food.id === food.id)) return prev;
      return { ...prev, [slotId]: [...(prev[slotId] || []), { food, servings: 1 }] };
    });

  const removeFromSlot = (slotId, foodId) =>
    setSlots(prev => ({ ...prev, [slotId]: prev[slotId].filter(i => i.food.id !== foodId) }));

  const updateServings = (slotId, foodId, val) =>
    setSlots(prev => ({
      ...prev,
      [slotId]: prev[slotId].map(i => i.food.id === foodId ? { ...i, servings: Math.max(0.25, parseFloat(val) || 1) } : i),
    }));

  const deleteFood = (foodId) => {
    setFoods(prev => prev.filter(f => f.id !== foodId));
    setSlots(prev => { const n = { ...prev }; SLOT_ORDER.forEach(id => { n[id] = (n[id] || []).filter(i => i.food.id !== foodId); }); return n; });
  };

  const clearDay = () => { if (confirm("Clear today's meals?")) setSlots({ ...EMPTY_SLOTS }); };

  // Recipe import
  const handleImport = async () => {
    if (!recipeUrl.trim()) return;
    setImportStatus("loading");
    setImportError("");
    try {
      const recipe = await fetchRecipeFromUrl(recipeUrl.trim());
      setPendingRecipe(recipe);
      setImportStatus(null);
    } catch (e) {
      setImportStatus("error");
      setImportError(e.message || "Could not extract recipe. Try another URL.");
    }
  };

  const handleRecipeSave = ({ recipe, foods: newFoods, mode }) => {
    setRecipes(prev => [...prev, recipe]);
    setFoods(prev => {
      const existingIds = new Set(prev.map(f => f.id));
      const deduped = newFoods.filter(f => !existingIds.has(f.id));
      return [...prev, ...deduped];
    });
    setPendingRecipe(null);
    setRecipeUrl("");
    // If we came from a slot, add the first food to the slot
    if (pendingSlot) {
      newFoods.forEach(f => addToSlot(pendingSlot, f));
      setView("day");
      setActiveSlot(pendingSlot);
      setPendingSlot(null);
    }
  };

  const deleteRecipe = (recipeId) => {
    if (!confirm("Delete this recipe?")) return;
    setRecipes(prev => prev.filter(r => r.id !== recipeId));
  };

  const addRecipeToSlot = (recipe, slotId) => {
    // Find foods that came from this recipe
    const recipeFood = foods.find(f => f.name === recipe.name);
    if (recipeFood) addToSlot(slotId, recipeFood);
  };

  return (
    <div style={{ height: "100dvh", background: "#0f0f0e", color: "#f0ebe3", fontFamily: "'DM Sans', sans-serif", display: "flex", flexDirection: "column", overflow: "hidden" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@600;700&family=DM+Sans:wght@400;500;600&display=swap');
        * { box-sizing: border-box; }
        input::placeholder, textarea::placeholder { color: rgba(255,255,255,0.25); }
        select option { background: #1a1a18; color: #f0ebe3; }
        input[type=number]::-webkit-inner-spin-button { -webkit-appearance: none; }
        textarea { resize: vertical; }
        ::-webkit-scrollbar { width: 0; }
      `}</style>

      {/* ── Header ── */}
      <div style={{ padding: "max(env(safe-area-inset-top), 16px) 20px 12px", borderBottom: "1px solid rgba(255,255,255,0.07)", display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0 }}>
        <div>
          <h1 style={{ margin: 0, fontFamily: "'Cormorant Garamond', serif", fontSize: 26, fontWeight: 700, lineHeight: 1 }}>
            macro<span style={{ color: "#a3e635" }}>day</span>
          </h1>
          <div style={{ fontSize: 10, color: "rgba(255,255,255,0.3)", fontFamily: "monospace", marginTop: 3 }}>
            1700 kcal · 149P · 149C · 57F
          </div>
        </div>
        <div style={{ display: "flex", gap: 3, background: "rgba(255,255,255,0.05)", borderRadius: 10, padding: 3 }}>
          {[["day","Today"],["library","Library"],["recipes","Recipes"]].map(([v, lbl]) => (
            <button key={v} onClick={() => setView(v)} style={{
              padding: "6px 12px", borderRadius: 7, border: "none", cursor: "pointer",
              fontSize: 11, fontWeight: 600, fontFamily: "inherit",
              background: view === v ? "#a3e635" : "transparent",
              color: view === v ? "#0f0f0e" : "rgba(255,255,255,0.45)",
              transition: "all 0.2s",
            }}>{lbl}</button>
          ))}
        </div>
      </div>

      {/* ── Today View ── */}
      {view === "day" && (
        <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
          <div style={{ padding: "12px 20px", borderBottom: "1px solid rgba(255,255,255,0.06)", display: "flex", gap: 16, flexShrink: 0 }}>
            <TotalBar label="CAL"  value={totals.calories} goal={GOALS.calories} />
            <TotalBar label="PROT" value={totals.protein}  goal={GOALS.protein}  />
            <TotalBar label="CARB" value={totals.carbs}    goal={GOALS.carbs}    />
            <TotalBar label="FAT"  value={totals.fat}      goal={GOALS.fat}      />
          </div>
          <div style={{ flex: 1, overflowY: "auto", WebkitOverflowScrolling: "touch" }}>
            {BASE_SPLITS.map(slot => {
              const actual = slotActuals[slot.id];
              const target = targets[slot.id];
              const isOpen = activeSlot === slot.id;
              return (
                <div key={slot.id} style={{ borderBottom: "1px solid rgba(255,255,255,0.06)", background: isOpen ? "rgba(163,230,53,0.02)" : "transparent" }}>
                  <div onClick={() => setActiveSlot(isOpen ? null : slot.id)} style={{ display: "flex", alignItems: "center", gap: 12, padding: "13px 20px", cursor: "pointer", userSelect: "none" }}>
                    <span style={{ fontSize: 18, width: 26, textAlign: "center", flexShrink: 0 }}>{slot.icon}</span>
                    <div style={{ minWidth: 80, flexShrink: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: isOpen ? "#a3e635" : "#f0ebe3" }}>{slot.label}</div>
                      <div style={{ fontSize: 9, color: "rgba(255,255,255,0.26)", fontFamily: "monospace", marginTop: 2 }}>
                        {target.calories}c·{target.protein}P·{target.carbs}C·{target.fat}F
                      </div>
                    </div>
                    <div style={{ flex: 1, display: "flex", gap: 5, justifyContent: "flex-end" }}>
                      <MacroPill label="CAL"  actual={actual.calories} target={target.calories} />
                      <MacroPill label="PROT" actual={actual.protein}  target={target.protein}  />
                      <MacroPill label="CARB" actual={actual.carbs}    target={target.carbs}    />
                      <MacroPill label="FAT"  actual={actual.fat}      target={target.fat}      />
                    </div>
                    <span style={{ fontSize: 10, color: "rgba(255,255,255,0.18)", marginLeft: 6, flexShrink: 0 }}>{isOpen ? "▲" : "▼"}</span>
                  </div>
                  {isOpen && (
                    <div style={{ padding: "0 20px 16px 54px" }}>
                      {(slots[slot.id] || []).map(item => (
                        <div key={item.food.id} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 7, background: "rgba(255,255,255,0.04)", borderRadius: 8, padding: "8px 10px", border: "1px solid rgba(255,255,255,0.07)" }}>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 13, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.food.name}</div>
                            <div style={{ fontSize: 10, color: "rgba(255,255,255,0.3)", fontFamily: "monospace", marginTop: 2 }}>
                              {Math.round(item.food.calories * item.servings)}cal · {Math.round(item.food.protein * item.servings)}P · {Math.round(item.food.carbs * item.servings)}C · {Math.round(item.food.fat * item.servings)}F
                            </div>
                          </div>
                          <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
                            <button onClick={() => updateServings(slot.id, item.food.id, item.servings - 0.25)} style={{ width: 26, height: 26, borderRadius: 6, border: "1px solid rgba(255,255,255,0.12)", background: "rgba(255,255,255,0.06)", color: "#f0ebe3", fontSize: 14, cursor: "pointer" }}>−</button>
                            <span style={{ fontSize: 12, fontFamily: "monospace", color: "#a3e635", minWidth: 28, textAlign: "center" }}>{item.servings}</span>
                            <button onClick={() => updateServings(slot.id, item.food.id, item.servings + 0.25)} style={{ width: 26, height: 26, borderRadius: 6, border: "1px solid rgba(255,255,255,0.12)", background: "rgba(255,255,255,0.06)", color: "#f0ebe3", fontSize: 14, cursor: "pointer" }}>+</button>
                          </div>
                          <button onClick={() => removeFromSlot(slot.id, item.food.id)} style={{ background: "none", border: "none", color: "rgba(255,255,255,0.2)", cursor: "pointer", fontSize: 18, padding: 0, lineHeight: 1, flexShrink: 0 }}>×</button>
                        </div>
                      ))}
                      <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
                        {foods.length > 0 && (
                          <select value="" onChange={e => { const food = foods.find(f => f.id === parseInt(e.target.value)); if (food) addToSlot(slot.id, food); }} style={{ flex: 1, background: "rgba(255,255,255,0.055)", border: "1px solid rgba(255,255,255,0.11)", borderRadius: 8, padding: "9px 12px", color: "#f0ebe3", fontSize: 13, outline: "none", fontFamily: "inherit" }}>
                            <option value="" disabled>— from library —</option>
                            {foods.map(f => <option key={f.id} value={f.id}>{f.name} ({f.calories}cal·{f.protein}P·{f.carbs}C·{f.fat}F)</option>)}
                          </select>
                        )}
                        <button onClick={() => { setPendingSlot(slot.id); setView("recipes"); }} style={{ background: "rgba(163,230,53,0.08)", border: "1px solid rgba(163,230,53,0.2)", color: "#a3e635", borderRadius: 8, padding: "9px 10px", fontSize: 11, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap" }}>📖</button>
                        <button onClick={() => { setPendingSlot(slot.id); setShowAddFood(true); setView("library"); }} style={{ background: "rgba(163,230,53,0.12)", border: "1px solid rgba(163,230,53,0.25)", color: "#a3e635", borderRadius: 8, padding: "9px 12px", fontSize: 12, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap" }}>+ New</button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
            <div style={{ padding: "20px", textAlign: "center" }}>
              <button onClick={clearDay} style={{ background: "none", border: "1px solid rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.25)", borderRadius: 8, padding: "8px 20px", fontSize: 12, cursor: "pointer" }}>Clear today's log</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Library View ── */}
      {view === "library" && (
        <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
          <div style={{ padding: "12px 20px", borderBottom: "1px solid rgba(255,255,255,0.07)", display: "flex", gap: 8, flexShrink: 0 }}>
            <input placeholder="Search…" value={search} onChange={e => setSearch(e.target.value)} style={{ ...INP, flex: 1 }} />
            <button onClick={() => setShowAddFood(v => !v)} style={{ background: "#a3e635", border: "none", color: "#0f0f0e", borderRadius: 8, padding: "9px 16px", fontSize: 13, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap" }}>+ Add</button>
          </div>
          {showAddFood && (
            <div style={{ padding: "14px 20px", background: "rgba(163,230,53,0.03)", borderBottom: "1px solid rgba(255,255,255,0.07)", flexShrink: 0 }}>
              {pendingSlot && <div style={{ fontSize: 10, color: "#a3e635", fontFamily: "monospace", letterSpacing: 1.5, marginBottom: 10 }}>ADDING TO {BASE_SPLITS.find(s => s.id === pendingSlot)?.label?.toUpperCase()}</div>}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 8 }}>
                <input placeholder="Food name *" value={newFood.name} onChange={e => setNewFood(p => ({ ...p, name: e.target.value }))} style={INP} />
                <input placeholder="Serving size" value={newFood.serving} onChange={e => setNewFood(p => ({ ...p, serving: e.target.value }))} style={INP} />
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 8, marginBottom: 12 }}>
                {[["calories","Cal *"],["protein","Protein"],["carbs","Carbs"],["fat","Fat"]].map(([k, lbl]) => (
                  <input key={k} type="number" placeholder={lbl} value={newFood[k]} onChange={e => setNewFood(p => ({ ...p, [k]: e.target.value }))} style={INP} />
                ))}
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button onClick={saveFood} style={{ background: "#a3e635", border: "none", color: "#0f0f0e", borderRadius: 8, padding: "10px 20px", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>{pendingSlot ? "Save & Add to Meal" : "Save to Library"}</button>
                <button onClick={() => { setShowAddFood(false); setPendingSlot(null); }} style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", color: "rgba(255,255,255,0.45)", borderRadius: 8, padding: "10px 16px", fontSize: 13, cursor: "pointer" }}>Cancel</button>
              </div>
            </div>
          )}
          <div style={{ flex: 1, overflowY: "auto", WebkitOverflowScrolling: "touch" }}>
            {filteredFoods.length === 0 ? (
              <div style={{ textAlign: "center", padding: "60px 24px", color: "rgba(255,255,255,0.22)" }}>
                <div style={{ fontSize: 40, marginBottom: 14 }}>🌿</div>
                <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 22, color: "rgba(255,255,255,0.35)", marginBottom: 6 }}>Library is empty</div>
                <div style={{ fontSize: 13 }}>Add foods manually above, or import a recipe in the Recipes tab.</div>
              </div>
            ) : filteredFoods.map(food => (
              <div key={food.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 20px", borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 3, display: "flex", alignItems: "center", gap: 6 }}>
                    {food.name}
                    {food.isRecipe && <span style={{ fontSize: 9, background: "rgba(163,230,53,0.15)", color: "#a3e635", borderRadius: 4, padding: "1px 5px", fontFamily: "monospace" }}>recipe</span>}
                  </div>
                  <div style={{ fontSize: 11, color: "rgba(255,255,255,0.3)", fontFamily: "monospace" }}>
                    {food.serving} · {food.calories}cal · <span style={{ color: "#7eb8e8" }}>{food.protein}P</span> · <span style={{ color: "#a3e635" }}>{food.carbs}C</span> · <span style={{ color: "#fb923c" }}>{food.fat}F</span>
                  </div>
                </div>
                <button onClick={() => deleteFood(food.id)} style={{ background: "none", border: "none", color: "rgba(255,255,255,0.18)", cursor: "pointer", fontSize: 16, padding: "4px 6px", borderRadius: 4 }}>✕</button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Recipes View ── */}
      {view === "recipes" && (
        <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>

          {/* URL import bar */}
          <div style={{ padding: "12px 20px", borderBottom: "1px solid rgba(255,255,255,0.07)", flexShrink: 0 }}>
            {pendingSlot && (
              <div style={{ fontSize: 10, color: "#a3e635", fontFamily: "monospace", letterSpacing: 1.5, marginBottom: 8 }}>
                ADDING RECIPE TO {BASE_SPLITS.find(s => s.id === pendingSlot)?.label?.toUpperCase()} — tap a recipe below or import new
              </div>
            )}
            <div style={{ display: "flex", gap: 8 }}>
              <input
                placeholder="Paste recipe URL to import…"
                value={recipeUrl}
                onChange={e => { setRecipeUrl(e.target.value); setImportStatus(null); }}
                onKeyDown={e => e.key === "Enter" && handleImport()}
                style={{ ...INP, flex: 1, fontSize: 13 }}
              />
              <button
                onClick={handleImport}
                disabled={importStatus === "loading" || !recipeUrl.trim()}
                style={{ background: importStatus === "loading" ? "rgba(163,230,53,0.4)" : "#a3e635", border: "none", color: "#0f0f0e", borderRadius: 8, padding: "9px 16px", fontSize: 13, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap", minWidth: 80 }}
              >
                {importStatus === "loading" ? "…" : "Import"}
              </button>
            </div>
            {importStatus === "error" && (
              <div style={{ fontSize: 12, color: "#f87171", marginTop: 8 }}>{importError}</div>
            )}
            {importStatus === "loading" && (
              <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", marginTop: 8, fontStyle: "italic" }}>
                Reading recipe and estimating macros…
              </div>
            )}
          </div>

          {/* Recipe search */}
          <div style={{ padding: "10px 20px", borderBottom: "1px solid rgba(255,255,255,0.06)", flexShrink: 0 }}>
            <input placeholder="Search recipes or tags…" value={recipeSearch} onChange={e => setRecipeSearch(e.target.value)} style={{ ...INP, fontSize: 13 }} />
          </div>

          {/* Recipe list */}
          <div style={{ flex: 1, overflowY: "auto", WebkitOverflowScrolling: "touch" }}>
            {filteredRecipes.length === 0 ? (
              <div style={{ textAlign: "center", padding: "60px 24px", color: "rgba(255,255,255,0.22)" }}>
                <div style={{ fontSize: 40, marginBottom: 14 }}>📖</div>
                <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 22, color: "rgba(255,255,255,0.35)", marginBottom: 6 }}>No recipes yet</div>
                <div style={{ fontSize: 13 }}>Paste a recipe URL above to get started.<br />Works with any food blog or website.</div>
              </div>
            ) : filteredRecipes.map(recipe => {
              const ps = recipe.perServing || {};
              return (
                <div key={recipe.id} style={{ padding: "14px 20px", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                  <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 3 }}>{recipe.name}</div>
                      {recipe.source && <div style={{ fontSize: 10, color: "rgba(255,255,255,0.3)", fontFamily: "monospace", marginBottom: 6, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{recipe.source}</div>}
                      <div style={{ display: "flex", gap: 8, marginBottom: 6, flexWrap: "wrap" }}>
                        <span style={{ fontSize: 10, fontFamily: "monospace", color: "#f0ebe3" }}>{ps.calories}cal</span>
                        <span style={{ fontSize: 10, fontFamily: "monospace", color: "#7eb8e8" }}>{ps.protein}P</span>
                        <span style={{ fontSize: 10, fontFamily: "monospace", color: "#a3e635" }}>{ps.carbs}C</span>
                        <span style={{ fontSize: 10, fontFamily: "monospace", color: "#fb923c" }}>{ps.fat}F</span>
                        <span style={{ fontSize: 10, color: "rgba(255,255,255,0.3)" }}>per serving · {recipe.servings} servings total</span>
                      </div>
                      {recipe.tags?.length > 0 && (
                        <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                          {recipe.tags.map(tag => <span key={tag} style={{ fontSize: 9, background: "rgba(255,255,255,0.07)", color: "rgba(255,255,255,0.45)", borderRadius: 4, padding: "2px 6px", fontFamily: "monospace" }}>{tag}</span>)}
                        </div>
                      )}
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 6, flexShrink: 0 }}>
                      {pendingSlot && (
                        <button
                          onClick={() => { addRecipeToSlot(recipe, pendingSlot); setView("day"); setActiveSlot(pendingSlot); setPendingSlot(null); }}
                          style={{ background: "#a3e635", border: "none", color: "#0f0f0e", borderRadius: 7, padding: "7px 12px", fontSize: 11, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap" }}
                        >+ Add to {BASE_SPLITS.find(s => s.id === pendingSlot)?.label}</button>
                      )}
                      <button onClick={() => deleteRecipe(recipe.id)} style={{ background: "none", border: "none", color: "rgba(255,255,255,0.18)", cursor: "pointer", fontSize: 14, padding: "4px", borderRadius: 4, textAlign: "center" }}>🗑</button>
                    </div>
                  </div>
                  {recipe.ingredients?.length > 0 && (
                    <details style={{ marginTop: 8 }}>
                      <summary style={{ fontSize: 11, color: "rgba(255,255,255,0.35)", cursor: "pointer", userSelect: "none" }}>
                        {recipe.ingredients.length} ingredients
                      </summary>
                      <div style={{ marginTop: 6, paddingLeft: 8, borderLeft: "2px solid rgba(255,255,255,0.08)" }}>
                        {recipe.ingredients.map((ing, i) => (
                          <div key={i} style={{ fontSize: 11, color: "rgba(255,255,255,0.45)", padding: "3px 0", display: "flex", justifyContent: "space-between" }}>
                            <span>{ing.amount} {ing.name}</span>
                            <span style={{ fontFamily: "monospace", color: "rgba(255,255,255,0.25)" }}>{ing.calories}cal</span>
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

      {/* Recipe review modal */}
      {pendingRecipe && (
        <RecipeModal
          recipe={pendingRecipe}
          onSave={handleRecipeSave}
          onClose={() => setPendingRecipe(null)}
        />
      )}

      <div style={{ height: "env(safe-area-inset-bottom, 0px)", flexShrink: 0, background: "#0f0f0e" }} />
    </div>
  );
}
