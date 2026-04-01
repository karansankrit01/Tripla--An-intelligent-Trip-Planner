

const PROXY_URL = '/api/chat';

// ── SYSTEM PROMPT ──
const TRIPLA_SYSTEM_PROMPT = `
<role>
You are Tripla, a hyper-realistic, incredibly highly-skilled AI travel planner specializing in
Indian travel. Your mission is to generate actionable, mathematically sound itineraries that
strictly respect the user's budget, destination, and duration constraints. You do not generate
fantasy itineraries — if a budget is tight, you recommend hostels, walking, and street food.
You are upfront about financial realities without being discouraging.
</role>

<objective>
Process the user's travel request, calculate realistic costs, and output a detailed,
budget-adherent itinerary in Indian Rupees (₹). If essential information is missing,
pause and ask the user for it before proceeding. Never guess at missing information.
</objective>

<required_fields>
Before generating any itinerary, you must confirm ALL of the following:
  1. ORIGIN          — Where is the user traveling from?
  2. DESTINATION     — Where do they want to go?
  3. TOTAL BUDGET    — What is their absolute maximum spend (in ₹)?
  4. DURATION        — How many days/nights?
  5. TRAVEL DATES    — Approximate month or specific dates?
  6. PARTY SIZE      — Solo, couple, family, or group?
</required_fields>

<extraction_guidelines>
Analyze the user's natural language input carefully:
-   **"City A to City B"** implies City A is the ORIGIN and City B is the DESTINATION.
-   **"in [Month]"** (e.g., "in March") fulfills the TRAVEL DATES requirement.
-   **"for [X] days"** or **"[X]-day trip"** fulfills the DURATION requirement.
-   **"Just me"** or **"Solo"** fulfills the PARTY SIZE requirement.
-   **"Budget ₹[X]"** fulfills the TOTAL BUDGET requirement.
</extraction_guidelines>

<missing_info_protocol>
If ANY fields from the <required_fields> are missing:
1.  **Acknowledge** what the user has already shared (e.g., "Sounds like a great trip to Jaipur!").
2.  **Request ONLY** the specific pieces of information that are still missing.
3.  **Do NOT** ask for things already mentioned in previous messages or the current one.
4.  Wait for their response before generating the itinerary.
</missing_info_protocol>


<constraints>
  1. MATH FIRST: Estimate and deduct round-trip transportation costs before planning anything else.
  2. BUDGET STRICTNESS:
     - On-Ground Budget = Total Budget − Round-Trip Travel Cost
     - Daily Budget = On-Ground Budget ÷ Number of Days
     - Every recommendation must fit within the Daily Budget.
  3. PRICING HONESTY: Use realistic current estimates. Provide ranges where prices fluctuate.
  4. SEASONAL AWARENESS: Flag peak season surcharges or extreme weather if relevant.
  5. PARTY SIZE MATH: Show both total and per-person costs where shared costs apply.
  6. NO HALLUCINATION: Use category descriptions for hotels/restaurants rather than inventing specific names.
</constraints>

<budget_tiers>
  🟢 COMFORTABLE  — Daily Budget ≥ ₹3,500/person → Mid-range hotels, sit-down restaurants.
  🟡 TIGHT        — Daily Budget ₹1,500–₹3,499/person → Budget guesthouses, street food, public transport.
  🔴 EXTREME      — Daily Budget < ₹1,500/person → Dormitory beds, street food only. Issue Reality Check.
</budget_tiers>

<output_format>
Structure every itinerary response like this:

## 👋 Here's Your Tripla Plan

### 📊 The Math
Show: Total Budget → Travel Cost → On-Ground Budget → Daily Budget → Budget Tier

### ⚠️ Reality Check  *(only if EXTREME tier or seasonal flags)*

### 🗓️ Day-by-Day Itinerary
For each day: Morning / Afternoon / Evening with ₹ costs per item.
End each day with: "Day X Spend: ₹X,XXX / Daily Budget: ₹X,XXX | Buffer: ₹XXX"

### 💡 Tripla's Top Budget Tip
One specific, actionable tip for this destination.

### 🔍 Before You Book
3–4 things to verify before finalizing.
</output_format>

<tone>
Helpful, enthusiastic, conversational — but brutally honest about financial realities.
Think of yourself as a well-traveled friend. Always give numbers, never say "affordable" vaguely.
</tone>
`;

// ── CONVERSATION HISTORY ──
let conversationHistory = [];

// ── MARKDOWN RENDERER ──
function renderMarkdown(text) {
  return text
    .replace(/```[\s\S]*?```/g, m =>
      `<pre style="background:rgba(0,0,0,0.4);padding:12px;border-radius:8px;font-size:0.8rem;overflow-x:auto;margin:8px 0;">${m.replace(/```\w*\n?/g, '')}</pre>`)
    .replace(/^### (.+)$/gm, '<h4 style="font-family:\'Syne\',sans-serif;font-size:1rem;font-weight:700;margin:16px 0 6px;color:#C4B5FD;">$1</h4>')
    .replace(/^## (.+)$/gm, '<h3 style="font-family:\'Syne\',sans-serif;font-size:1.1rem;font-weight:800;margin:18px 0 8px;color:#A78BFA;">$1</h3>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/^---$/gm, '<hr style="border:none;border-top:1px solid rgba(255,255,255,0.08);margin:12px 0;">')
    .replace(/^[\-\*] (.+)$/gm, '<div style="display:flex;gap:8px;margin:4px 0;"><span style="color:#8B5CF6;margin-top:2px;">•</span><span>$1</span></div>')
    .replace(/^\d+\. (.+)$/gm, '<div style="display:flex;gap:8px;margin:4px 0;color:#e0e0e0;">$&</div>')
    .replace(/`([^`]+)`/g, '<span style="background:rgba(139,92,246,0.15);border:1px solid rgba(139,92,246,0.3);color:#C4B5FD;padding:2px 8px;border-radius:100px;font-size:0.82rem;font-weight:600;">$1</span>')
    .replace(/\n/g, '<br>');
}

function getTime() {
  return new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function appendMessage(role, html, isRaw = false) {
  const messages = document.getElementById('chatMessages');
  const div = document.createElement('div');
  div.className = `msg ${role}`;
  const content = isRaw ? html : renderMarkdown(html);
  div.innerHTML = `
    <div class="msg-bubble">${content}</div>
    <div class="msg-meta">${role === 'bot' ? 'Tripla' : 'You'} · ${getTime()}</div>
  `;
  messages.appendChild(div);
  messages.scrollTop = messages.scrollHeight;
  return div;
}

function showTyping() {
  const messages = document.getElementById('chatMessages');
  const div = document.createElement('div');
  div.className = 'msg bot';
  div.id = 'typing-indicator';
  div.innerHTML = `<div class="msg-bubble"><div class="typing"><span></span><span></span><span></span></div></div>`;
  messages.appendChild(div);
  messages.scrollTop = messages.scrollHeight;
}

function hideTyping() {
  document.getElementById('typing-indicator')?.remove();
}

async function sendMessage() {
  const input = document.getElementById('chatInput');
  const sendBtn = document.querySelector('.chat-send');
  const text = input.value.trim();
  if (!text) return;

  input.disabled = true;
  sendBtn.disabled = true;
  sendBtn.style.opacity = '0.5';

  appendMessage('user', text);
  input.value = '';
  conversationHistory.push({ role: 'user', content: text });

  showTyping();

  try {
    // ── FIXED: Goes through your proxy for security ──
    const response = await fetch(PROXY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        system: TRIPLA_SYSTEM_PROMPT,
        messages: conversationHistory
      })
    });

    // ── FIXED: Handle errors (401, 500, etc.) ──
    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      throw new Error(errData.error || `Server error ${response.status}`);
    }

    const data = await response.json();
    hideTyping();

    const reply = data.reply || 'Sorry, I got an empty response. Please try again!';


    conversationHistory.push({ role: 'assistant', content: reply });
    appendMessage('bot', reply);

  } catch (err) {
    hideTyping();
    console.error('[Tripla Error]', err);

    // ── FIXED: Only remove from history if message never reached server ──
    const isNetworkFailure = err instanceof TypeError; // fetch() itself failed
    if (isNetworkFailure) {
      conversationHistory.pop();
      appendMessage('bot', '⚠️ Can\'t reach Tripla. Check your connection and try again.');
    } else {
      // Server responded but with an error — keep message in history
      appendMessage('bot', `⚠️ ${err.message}`);
    }
  }

  input.disabled = false;
  sendBtn.disabled = false;
  sendBtn.style.opacity = '1';
  input.focus();
}

// Enter to send
document.getElementById('chatInput').addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) sendMessage();
});

// Scroll animations
const observer = new IntersectionObserver((entries) => {
  entries.forEach(e => {
    if (e.isIntersecting) e.target.style.opacity = '1';
  });
}, { threshold: 0.1 });

document.querySelectorAll('.step-card, .feature-card, .testi-card').forEach(el => {
  el.style.opacity = '0';
  el.style.transition = 'opacity 0.5s ease, transform 0.3s ease';
  observer.observe(el);
});
