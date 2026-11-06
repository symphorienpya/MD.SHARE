const socket = window.io();
const ui = window.APP_TRANSLATIONS || {};
const inboxDialog = document.getElementById('inboxDialog');

function setBadge(id, count) {
  const badge = document.getElementById(id);
  if (!badge) return;
  badge.hidden = !count;
  badge.textContent = count > 99 ? '99+' : String(count);
}

async function loadInbox() {
  const response = await fetch('/api/inbox');
  if (!response.ok) return;
  return response.json();
}

async function refreshInboxCounts() {
  const inbox = await loadInbox();
  if (!inbox) return;
  setBadge('notificationBadge', inbox.notifications.filter((item) => !item.read).length);
  setBadge('messageBadge', inbox.messages.filter((item) => String(item.recipient_id || item.recipient) === String(window.CURRENT_USER_ID)).length);
}

function openInbox(type, inbox) {
  if (!inboxDialog) return;
  const messages = type === 'messages';
  document.getElementById('inboxEyebrow').textContent = messages ? (ui.messages || 'Messages') : (ui.notifications || 'Notifications');
  document.getElementById('inboxTitle').textContent = messages ? (ui.messages || 'Messages') : (ui.notifications || 'Notifications');
  const content = document.getElementById('inboxContent');
  content.replaceChildren();
  const items = messages ? inbox.messages : inbox.notifications;
  if (!items.length) {
    const empty = document.createElement('p');
    empty.className = 'muted';
    empty.textContent = messages ? (ui.noMessages || 'No messages.') : (ui.noNotifications || 'No notifications.');
    content.append(empty);
  }
  items.forEach((item) => {
    const article = document.createElement('article');
    article.className = 'inbox-item';
    const title = document.createElement('strong');
    title.textContent = messages ? item.sender?.name || 'Member' : item.title;
    const body = document.createElement('p');
    body.textContent = messages ? item.body : item.message;
    const time = document.createElement('small');
    time.textContent = new Date(item.createdAt || item.created_at).toLocaleString();
    article.append(title, body, time);
    if (messages && String(item.recipient_id || item.recipient) === String(window.CURRENT_USER_ID)) {
      const senderId = item.sender_id || item.sender?._id;
      if (senderId) {
        const form = document.createElement('form');
        form.className = 'inbox-reply';
        const input = document.createElement('input');
        input.className = 'form-control';
        input.required = true;
        input.placeholder = ui.replyPlaceholder || 'Write a reply…';
        const button = document.createElement('button');
        button.className = 'btn btn-primary';
        button.type = 'submit';
        button.textContent = ui.reply || 'Reply';
        form.append(input, button);
        form.addEventListener('submit', async (event) => {
          event.preventDefault();
          socket.emit('chat:send', { body: input.value.trim(), recipient: senderId });
          input.value = '';
          await refreshInboxCounts();
        });
        article.append(form);
      }
    }
    content.append(article);
  });
  inboxDialog.showModal();
}

['message', 'notification'].forEach((type) => {
  const button = document.getElementById(`${type}InboxButton`);
  if (!button) return;
  button.addEventListener('click', async () => {
    const inbox = await loadInbox();
    openInbox(type === 'message' ? 'messages' : 'notifications', inbox);
    if (type === 'notification') fetch('/notifications/read', { method: 'POST' }).finally(refreshInboxCounts);
  });
});
document.getElementById('closeInbox')?.addEventListener('click', () => inboxDialog.close());
socket.on('message:new', () => refreshInboxCounts());
socket.on('notification:new', () => refreshInboxCounts());
refreshInboxCounts();

const connectionState = document.getElementById('connectionState');
if (connectionState) socket.on('connect', () => {
  connectionState.textContent = 'Connected';
  connectionState.classList.add('online');
});

socket.on('notification:new', (notification) => {
  if (!notification) return;
  if ('Notification' in window && Notification.permission === 'granted') {
    new Notification(notification.title, { body: notification.message });
  }
  location.reload();
});

socket.on('resource:new', () => location.reload());
socket.on('presence:update', (users) => {
  const container = document.getElementById('onlineUsers');
  if (!container) return;
  container.replaceChildren(...users.map((user) => {
    const row = document.createElement('div');
    row.className = 'person-row';
    const dot = document.createElement('span');
    dot.className = 'status-dot';
    const details = document.createElement('div');
    const name = document.createElement('strong');
    name.textContent = user.name;
    const role = document.createElement('small');
    role.textContent = user.role;
    details.append(name, role);
    row.append(dot, details);
    return row;
  }));
});

const chatForm = document.getElementById('chatForm');
if (chatForm) {
  chatForm.addEventListener('submit', (event) => {
    event.preventDefault();
    const input = document.getElementById('chatInput');
    const body = input.value.trim();
    if (!body) return;
    socket.emit('chat:send', { body });
    input.value = '';
    input.focus();
  });
}

socket.on('chat:message', (message) => {
  const list = document.getElementById('messageList');
  if (!list) return;
  const article = document.createElement('article');
  article.className = 'message';
  const sender = document.createElement('strong');
  sender.textContent = message.sender?.name || 'Member';
  const body = document.createElement('p');
  body.textContent = message.body;
  const time = document.createElement('time');
  time.textContent = new Date(message.createdAt || Date.now()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  article.append(sender, body, time);
  list.appendChild(article);
  list.scrollTop = list.scrollHeight;
});

const teamMessageList = document.getElementById('messageList[data-team-id]');
const teamChatForm = document.getElementById('teamChatForm');
if (teamChatForm && teamMessageList) {
  const teamId = teamMessageList.dataset.teamId;
  teamChatForm.addEventListener('submit', (event) => {
    event.preventEventDefault?.();
    event.preventDefault();
    const input = document.getElementById('teamChatInput');
    const body = input.value.trim();
    if (!body) return;
    socket.emit('chat:send', { body, teamId });
    input.value = '';
  });
  socket.on('team:message', (message) => {
    const article = document.createElement('article');
    article.className = 'message own';
    const sender = document.createElement('strong');
    sender.textContent = message.sender?.name || 'Member';
    const body = document.createElement('p');
    body.textContent = message.body;
    article.append(sender, body);
    teamMessageList.append(article);
    teamMessageList.scrollTop = teamMessageList.scrollHeight;
  });
}

const teamFileForm = document.getElementById('teamFileForm');
if (teamFileForm && teamMessageList) {
  teamFileForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const response = await fetch(`/teams/${teamMessageList.dataset.teamId}/files`, { method: 'POST', body: new FormData(teamFileForm) });
    if (!response.ok) {
      alert((await response.json()).error || 'Could not share file.');
      return;
    }
    teamFileForm.reset();
  });
}

socket.on('team:file', (post) => {
  const list = document.getElementById('messageList[data-team-id]');
  if (!list || !post.team_id) return;
  const article = document.createElement('article');
  article.className = 'message team-file-message';
  const title = document.createElement('strong');
  title.textContent = post.title;
  const link = document.createElement('a');
  link.href = `/files/${post.id || post._id}?download=1`;
  link.textContent = ui.download || 'Download';
  article.append(title, link);
  list.append(article);
});

const calendarGrid = document.getElementById('calendarGrid');
if (calendarGrid) {
  let visibleMonth = new Date();
  let events = [];
  visibleMonth.setDate(1);

  const pad = (value) => String(value).padStart(2, '0');
  const dateKey = (date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  const toLocalInput = (date) => `${dateKey(date)}T${pad(date.getHours())}:${pad(date.getMinutes())}`;

  async function loadEvents() {
    const response = await fetch('/api/events');
    if (!response.ok) throw new Error('Could not load events.');
    events = await response.json();
    renderSchedule();
    renderCalendar();
  }

  function countdownText(startsAt) {
    const seconds = Math.max(0, Math.floor((new Date(startsAt).getTime() - Date.now()) / 1000));
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    if (!seconds) return ui.startingNow || 'Starting now';
    if (days) return `${days}d ${hours}h ${minutes}m`;
    if (hours) return `${hours}h ${minutes}m`;
    return `${minutes}m`;
  }

  function renderSchedule() {
    const upcoming = events.filter((event) => new Date(event.starts_at).getTime() >= Date.now())
      .sort((a, b) => new Date(a.starts_at) - new Date(b.starts_at));
    document.getElementById('scheduleCount').textContent = upcoming.length;
    const list = document.getElementById('scheduleList');
    list.replaceChildren();
    if (!upcoming.length) {
      const empty = document.createElement('div');
      empty.className = 'schedule-empty';
      empty.textContent = ui.noEvents || 'No events scheduled yet.';
      list.appendChild(empty);
      return;
    }
    upcoming.slice(0, 8).forEach((event) => {
      const start = new Date(event.starts_at);
      const item = document.createElement('article');
      item.className = 'schedule-item';
      const date = document.createElement('div');
      date.className = 'schedule-date';
      date.innerHTML = `<strong>${start.getDate()}</strong><span>${start.toLocaleDateString([], { month: 'short' })}</span>`;
      const details = document.createElement('div');
      details.className = 'schedule-details';
      const title = document.createElement('strong');
      title.textContent = event.title;
      const time = document.createElement('span');
      time.textContent = start.toLocaleString([], { weekday: 'short', hour: 'numeric', minute: '2-digit' });
      const countdown = document.createElement('div');
      countdown.className = 'event-countdown';
      countdown.dataset.startsAt = event.starts_at;
      countdown.textContent = countdownText(event.starts_at);
      details.append(title, time, countdown);
      item.append(date, details);
      list.appendChild(item);
    });
  }

  function renderCalendar() {
    const year = visibleMonth.getFullYear();
    const month = visibleMonth.getMonth();
    document.getElementById('calendarMonth').textContent = visibleMonth.toLocaleDateString([], { month: 'long', year: 'numeric' });
    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const previousDays = new Date(year, month, 0).getDate();
    calendarGrid.replaceChildren();
    for (let index = 0; index < 42; index += 1) {
      let day;
      let cellDate;
      if (index < firstDay) {
        day = previousDays - firstDay + index + 1;
        cellDate = new Date(year, month - 1, day);
      } else if (index >= firstDay + daysInMonth) {
        day = index - firstDay - daysInMonth + 1;
        cellDate = new Date(year, month + 1, day);
      } else {
        day = index - firstDay + 1;
        cellDate = new Date(year, month, day);
      }
      const key = dateKey(cellDate);
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'calendar-day';
      button.textContent = day;
      if (cellDate.getMonth() !== month) button.classList.add('muted-day');
      if (key === dateKey(new Date())) button.classList.add('today');
      if (events.some((event) => dateKey(new Date(event.starts_at)) === key)) button.classList.add('has-event');
      button.addEventListener('click', () => {
        document.getElementById('scheduleForm').hidden = false;
        document.getElementById('eventStartsAt').value = toLocalInput(new Date(year, cellDate.getMonth(), day, 9));
        document.getElementById('eventTitle').focus();
      });
      calendarGrid.appendChild(button);
    }
  }

  document.getElementById('previousMonth').addEventListener('click', () => {
    visibleMonth = new Date(visibleMonth.getFullYear(), visibleMonth.getMonth() - 1, 1);
    renderCalendar();
  });
  document.getElementById('nextMonth').addEventListener('click', () => {
    visibleMonth = new Date(visibleMonth.getFullYear(), visibleMonth.getMonth() + 1, 1);
    renderCalendar();
  });
  document.getElementById('toggleScheduleForm').addEventListener('click', () => {
    const form = document.getElementById('scheduleForm');
    form.hidden = !form.hidden;
    if (!form.hidden) document.getElementById('eventTitle').focus();
  });
  document.getElementById('scheduleForm').addEventListener('submit', async (event) => {
    event.preventDefault();
    const button = event.submitter;
    button.disabled = true;
    try {
      const response = await fetch('/api/events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: document.getElementById('eventTitle').value,
          description: document.getElementById('eventDescription').value,
          location: document.getElementById('eventLocation').value,
          startsAt: document.getElementById('eventStartsAt').value,
          endsAt: document.getElementById('eventEndsAt').value,
          reminderMinutes: document.getElementById('eventReminderMinutes').value
        })
      });
      if (!response.ok) throw new Error((await response.json()).error || ui.saveEvent || 'Could not save event.');
      event.target.reset();
      event.target.hidden = true;
      await loadEvents();
    } catch (error) {
      alert(error.message);
    } finally {
      button.disabled = false;
    }
  });

  setInterval(() => {
    document.querySelectorAll('.event-countdown').forEach((element) => {
      element.textContent = countdownText(element.dataset.startsAt);
    });
  }, 1000);
  loadEvents().catch((error) => alert(error.message));

  const hour = new Date().getHours();
  document.getElementById('dayGreeting').textContent = hour < 12 ? 'morning' : hour < 18 ? 'afternoon' : 'evening';
}

document.querySelectorAll('[data-share-post]').forEach((button) => {
  button.addEventListener('click', () => document.getElementById(`share-dialog-${button.dataset.sharePost}`).showModal());
});

document.querySelectorAll('[data-share-form]').forEach((form) => {
  form.addEventListener('submit', async (event) => {
    if (event.submitter?.value === 'cancel') return;
    event.preventEventDefault?.();
    event.preventDefault();
    const recipientIds = [...form.querySelectorAll('input[name="recipientIds"]:checked')].map((input) => input.value);
    if (!recipientIds.length) return alert('Select at least one user.');
    const response = await fetch(`/resources/${form.dataset.shareForm}/share`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ recipientIds })
    });
    if (!response.ok) return alert((await response.json()).error || 'Could not share resource.');
    form.closest('dialog').close();
    alert('Resource shared successfully.');
  });
});

if ('Notification' in window && Notification.permission === 'default') {
  document.addEventListener('click', () => {
    if (!window.notificationPermissionRequested) {
      window.notificationPermissionRequested = true;
      Notification.requestPermission();
    }
  }, { once: true });
}
