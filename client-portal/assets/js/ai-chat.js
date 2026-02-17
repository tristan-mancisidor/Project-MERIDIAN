/* ==========================================================================
   Meridian Wealth Advisors - AI Chat Widget
   Floating chat button, agent selector, typing indicator
   Include on all portal pages via <script type="module">
   ========================================================================== */

import { apiGet, apiPost } from './api-client.js';
import { escapeHtml } from './components.js';

// Only init if user is logged in
if (!localStorage.getItem('accessToken')) {
  // Silently skip widget if not authenticated
} else {
  initAIChat();
}

function initAIChat() {
  // ---- Inject HTML ----
  const widget = document.createElement('div');
  widget.id = 'ai-chat-widget';
  widget.innerHTML = `
    <button class="ai-chat-btn" id="ai-chat-toggle" title="AI Assistant">&#9733;</button>
    <div class="ai-chat-window" id="ai-chat-window">
      <div class="ai-chat-header">
        <span class="ai-chat-title">AI Assistant</span>
        <button class="ai-chat-close" id="ai-chat-close">&times;</button>
      </div>
      <div class="ai-agent-selector">
        <label for="ai-agent-select">Assistant type</label>
        <select id="ai-agent-select">
          <option value="client_support">Client Support</option>
          <option value="financial_planning">Financial Planning</option>
          <option value="investment_management">Investment Management</option>
        </select>
      </div>
      <div class="ai-chat-messages" id="ai-chat-messages">
        <div class="ai-msg disclaimer">
          AI responses are for informational purposes only and do not constitute financial advice. Always consult with your advisor before making financial decisions.
        </div>
      </div>
      <div class="ai-typing" id="ai-typing">
        <div class="ai-typing-dots">
          <div class="ai-typing-dot"></div>
          <div class="ai-typing-dot"></div>
          <div class="ai-typing-dot"></div>
        </div>
      </div>
      <form class="ai-chat-input" id="ai-chat-form">
        <input type="text" id="ai-chat-input" placeholder="Ask a question..." autocomplete="off">
        <button type="submit" id="ai-chat-send">Send</button>
      </form>
    </div>
  `;
  document.body.appendChild(widget);

  // ---- Inject stylesheet if not already present ----
  if (!document.querySelector('link[href*="ai-chat.css"]')) {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    // Determine correct path based on current page location
    const depth = window.location.pathname.split('/client-portal/')[1]?.split('/').length - 1 || 0;
    const prefix = depth > 0 ? '../'.repeat(depth) : '';
    link.href = prefix + 'assets/css/ai-chat.css';
    document.head.appendChild(link);
  }

  // ---- Elements ----
  const toggleBtn = document.getElementById('ai-chat-toggle');
  const chatWindow = document.getElementById('ai-chat-window');
  const closeBtn = document.getElementById('ai-chat-close');
  const form = document.getElementById('ai-chat-form');
  const input = document.getElementById('ai-chat-input');
  const messagesEl = document.getElementById('ai-chat-messages');
  const typingEl = document.getElementById('ai-typing');
  const sendBtn = document.getElementById('ai-chat-send');
  const agentSelect = document.getElementById('ai-agent-select');

  // ---- Toggle ----
  toggleBtn.addEventListener('click', () => {
    chatWindow.classList.toggle('open');
    if (chatWindow.classList.contains('open')) input.focus();
  });

  closeBtn.addEventListener('click', () => {
    chatWindow.classList.remove('open');
  });

  // ---- Load available agents ----
  loadAgents();

  async function loadAgents() {
    try {
      const agents = await apiGet('/ai/agents');
      agentSelect.innerHTML = agents
        .filter((a) => a.availableTo.includes('client') || a.availableTo.includes('all'))
        .map((a) => `<option value="${a.type}">${escapeHtml(a.name)}</option>`)
        .join('');
    } catch {
      // Keep default options
    }
  }

  // ---- Send message ----
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const prompt = input.value.trim();
    if (!prompt) return;

    // Add user message
    addMessage(prompt, 'user');
    input.value = '';
    sendBtn.disabled = true;

    // Show typing
    typingEl.classList.add('visible');
    scrollToBottom();

    try {
      const user = JSON.parse(localStorage.getItem('user') || '{}');
      const res = await apiPost('/ai/invoke', {
        agentType: agentSelect.value,
        prompt,
        clientId: user.type === 'client' ? user.id : undefined,
      });

      typingEl.classList.remove('visible');
      addMessage(res.response, 'assistant');

      // Show disclaimer if compliance flagged
      if (res.complianceFlag) {
        addMessage('This response has been flagged for compliance review.', 'disclaimer');
      }
    } catch (err) {
      typingEl.classList.remove('visible');
      addMessage('Sorry, I encountered an error. Please try again or contact your advisor directly.', 'assistant');
    } finally {
      sendBtn.disabled = false;
      input.focus();
    }
  });

  function addMessage(content, type) {
    const msg = document.createElement('div');
    msg.className = `ai-msg ${type}`;
    msg.textContent = content;
    messagesEl.appendChild(msg);
    scrollToBottom();
  }

  function scrollToBottom() {
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }
}
