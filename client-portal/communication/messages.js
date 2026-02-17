/* ==========================================================================
   Meridian Wealth Advisors - Messaging System
   Two-panel layout, chat bubbles, 10s polling
   ========================================================================== */

import { requireAuth, logout } from '../assets/js/auth.js';
import { apiGet, apiPost } from '../assets/js/api-client.js';
import { escapeHtml, formatDate, showError } from '../assets/js/components.js';

const user = requireAuth();
if (!user) throw new Error('Not authenticated');

document.querySelector('.sidebar-footer a')?.addEventListener('click', (e) => {
  e.preventDefault();
  logout();
});

let conversations = [];
let activeConversationId = null;
let pollInterval = null;

// ---- Load conversations ----
async function loadConversations() {
  try {
    const res = await apiGet('/messages/conversations?limit=50');
    conversations = res.data || [];
    renderConversationList();
  } catch (err) {
    console.error('Failed to load conversations:', err);
  }
}

function renderConversationList() {
  const list = document.getElementById('conversation-list');
  if (!list) return;

  if (conversations.length === 0) {
    list.innerHTML = '<li style="padding:var(--space-6);text-align:center;color:var(--color-slate);font-size:var(--text-sm)">No conversations yet</li>';
    return;
  }

  list.innerHTML = conversations.map((conv) => {
    const lastMsg = conv.messages?.[0];
    const preview = lastMsg ? lastMsg.content.substring(0, 60) + (lastMsg.content.length > 60 ? '...' : '') : 'No messages';
    const date = lastMsg ? formatDate(lastMsg.createdAt) : '';

    return `
      <li class="conversation-item${conv.id === activeConversationId ? ' active' : ''}" data-id="${conv.id}">
        <div class="conversation-subject">${escapeHtml(conv.subject)}</div>
        <div class="conversation-preview">${escapeHtml(preview)}</div>
        <div class="conversation-meta">
          <span class="conversation-date">${date}</span>
          ${conv.unreadCount > 0 ? `<span class="unread-badge">${conv.unreadCount}</span>` : ''}
        </div>
      </li>`;
  }).join('');

  list.querySelectorAll('.conversation-item').forEach((item) => {
    item.addEventListener('click', () => {
      activeConversationId = item.dataset.id;
      openConversation(activeConversationId);
      list.querySelectorAll('.conversation-item').forEach((i) => i.classList.remove('active'));
      item.classList.add('active');
    });
  });
}

// ---- Open conversation ----
async function openConversation(id) {
  try {
    const conv = await apiGet(`/messages/conversations/${id}`);
    renderChat(conv);
    startPolling(id);
  } catch (err) {
    console.error('Failed to load conversation:', err);
    showError('chat-messages', 'Failed to load messages.');
  }
}

function renderChat(conv) {
  const header = document.getElementById('chat-header');
  const messages = document.getElementById('chat-messages');
  const compose = document.getElementById('chat-compose');

  if (header) {
    header.innerHTML = `
      <div class="chat-subject">${escapeHtml(conv.subject)}</div>
      <div class="chat-status">${conv.status}</div>`;
  }

  if (messages) {
    if (!conv.messages?.length) {
      messages.innerHTML = '<div class="chat-empty">No messages yet. Start the conversation below.</div>';
    } else {
      messages.innerHTML = conv.messages.map((msg) => {
        const type = msg.senderType === 'CLIENT' ? 'client'
          : msg.senderType === 'SYSTEM' || msg.senderType === 'AI_AGENT' ? 'system'
          : 'advisor';
        const sender = msg.sender ? `${msg.sender.firstName} ${msg.sender.lastName}` : msg.senderType;
        const time = new Date(msg.createdAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });

        return `
          <div class="message-bubble ${type}">
            ${type === 'advisor' ? `<div class="message-sender">${escapeHtml(sender)}</div>` : ''}
            <div>${escapeHtml(msg.content)}</div>
            <div class="message-time">${time}</div>
          </div>`;
      }).join('');

      messages.scrollTop = messages.scrollHeight;
    }
  }

  if (compose) {
    compose.style.display = 'flex';
  }
}

// ---- Send message ----
const composeForm = document.getElementById('chat-compose');
const messageInput = document.getElementById('message-input');

composeForm?.addEventListener('submit', async (e) => {
  e.preventDefault();
  if (!activeConversationId || !messageInput?.value.trim()) return;

  const content = messageInput.value.trim();
  messageInput.value = '';

  try {
    await apiPost('/messages', {
      conversationId: activeConversationId,
      content,
    });
    await openConversation(activeConversationId);
    await loadConversations();
  } catch (err) {
    console.error('Failed to send message:', err);
    messageInput.value = content;
  }
});

// ---- New conversation ----
const newConvBtn = document.getElementById('new-conv-btn');
const newConvModal = document.getElementById('new-conv-modal');
const cancelNewConv = document.getElementById('cancel-new-conv');
const newConvForm = document.getElementById('new-conv-form');

newConvBtn?.addEventListener('click', () => newConvModal?.classList.add('open'));
cancelNewConv?.addEventListener('click', () => newConvModal?.classList.remove('open'));
newConvModal?.addEventListener('click', (e) => { if (e.target === newConvModal) newConvModal.classList.remove('open'); });

newConvForm?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const subject = document.getElementById('new-conv-subject')?.value.trim();
  const firstMsg = document.getElementById('new-conv-message')?.value.trim();
  if (!subject) return;

  try {
    const conv = await apiPost('/messages/conversations', { subject, clientId: user.id });
    if (firstMsg) {
      await apiPost('/messages', { conversationId: conv.id, content: firstMsg });
    }
    newConvModal?.classList.remove('open');
    newConvForm.reset();
    await loadConversations();
    activeConversationId = conv.id;
    await openConversation(conv.id);
  } catch (err) {
    console.error('Failed to create conversation:', err);
  }
});

// ---- Polling (10s) ----
function startPolling(convId) {
  stopPolling();
  pollInterval = setInterval(async () => {
    if (convId === activeConversationId) {
      try {
        const conv = await apiGet(`/messages/conversations/${convId}`);
        renderChat(conv);
      } catch {
        // Silently fail on poll errors
      }
    }
  }, 10000);
}

function stopPolling() {
  if (pollInterval) {
    clearInterval(pollInterval);
    pollInterval = null;
  }
}

// ---- Init ----
loadConversations();
